import {studentTestSession,fixturePassword} from './student-login.mjs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createClassroomServer} from '../server/index.mjs';
import {hashPassword} from '../server/security.mjs';
import {makeAudioTicket,readAudioTicket,readAudioUpload} from '../server/audio.mjs';
import {storeOperation} from '../storage/classroom-store.js';
import {handleAudio} from '../storage/audio-store.js';
import {teacherAudioHTML,teacherLibraryHTML,speakingAudioHTML,initClassAudio} from '../dist/audio.js';

const database=new DatabaseSync(':memory:');
for(const file of ['0000_classroom.sql','0001_audio.sql'])database.exec(readFileSync(new URL('../storage/'+file,import.meta.url),'utf8'));
const db={prepare(sql){const statement=database.prepare(sql);let args=[];return {bind(...v){args=v;return this;},async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){return statement.run(...args);}};},async batch(statements){const results=[];for(const statement of statements)results.push(await statement.run());return results;}};
const objects=new Map(),key='private-audio-unit-test-key';let failUpload=false;
const bucket={async put(key,body,{sha256}){if(failUpload)throw new Error('Upload interrupted');const value=Buffer.from(await new Response(body).arrayBuffer());assert.equal(createHash('sha256').update(value).digest('hex'),Buffer.from(sha256).toString('hex'));objects.set(key,value);return {size:value.length};},async delete(key){objects.delete(key);},async head(key){const value=objects.get(key);return value?{size:value.length,httpEtag:'"'+createHash('sha256').update(value).digest('hex')+'"'}:null;},async get(key,{range}={}){const value=objects.get(key);return value?{body:new Response(range?value.subarray(range.offset,range.offset+range.length):value).body}:null;}};
const config={appOrigin:'https://teacher.test',allowedOrigins:['https://students.test'],passwordHash:await hashPassword('Only-a-test-teacher-password'),sessionSecret:'unit-test-audio-session-secret'.repeat(3),encryptionKey:'ab'.repeat(32),storeUrl:'https://store.test',storeKey:key,siteToken:'test-only',store:(op,p)=>storeOperation(db,op,p),audioFetch:async(url,init)=>handleAudio(new Request(url,init),{DB:db,BUCKET:bucket,STORE_API_KEY:key},new URL(url).pathname.split('/').at(-1))};
const server=createClassroomServer(config);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
let cookie='';
const wave=Buffer.alloc(64);wave.write('RIFF',0);wave.writeUInt32LE(56,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(8000,24);wave.writeUInt32LE(16000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(20,40);
async function request(path,{method='GET',code,json,bytes,origin='https://teacher.test',headers={}}={}){
  const response=await fetch(base+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(code?{Authorization:'Bearer '+await studentTestSession(base,code)}:{}),...(json?{'Content-Type':'application/json'}:bytes?{'Content-Type':'audio/wav'}:{}),...headers},body:json?JSON.stringify(json):bytes});
  return {response,status:response.status,value:method==='HEAD'?null:response.headers.get('content-type')?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer())};
}
try{
  assert.equal((await request('/api/teacher/audio-library')).status,401);
  const login=await request('/api/teacher/login',{method:'POST',json:{password:'Only-a-test-teacher-password'}});cookie=login.response.headers.get('set-cookie').split(';')[0];
  await request('/api/teacher/students',{method:'POST',json:{names:['Student A','Student B']}});
  const [a,b]=(await request('/api/teacher/students')).value.students;
  const saved=await request('/api/student/submissions',{method:'POST',code:a.code,json:{entry:{id:randomUUID(),kind:'speaking',notes:'Talk about a skill.'}}});const id=saved.value.submission.id;
  const path='/api/student/submissions/'+id+'/audio';
  assert.equal((await request(path,{code:b.code})).status,404);
  assert.equal((await request(path,{method:'POST',code:a.code,bytes:Buffer.from('<html>invalid recording</html>')})).status,415);
  assert.equal((await request(path,{code:a.code})).value.attemptsUsed,0);
  failUpload=true;assert.equal((await request(path,{method:'POST',code:a.code,bytes:wave})).status,503);failUpload=false;
  assert.equal((await request(path,{code:a.code})).value.attemptsUsed,0,'Failed uploads do not use an attempt.');
  let upload=await request(path+'?filename=Student%20A.wav',{method:'POST',code:a.code,bytes:wave});assert.equal(upload.status,201);const first=upload.value.id;
  let state=(await request(path,{code:a.code})).value;assert.equal(state.attemptsUsed,1);assert.equal(state.audio[0].id,first);assert.ok(!JSON.stringify(state).includes('object_key'));
  let access=(await request('/api/student/audio/'+first+'/access',{code:a.code})).value;const playback=new URL(access.url).pathname+new URL(access.url).search;
  assert.ok(!access.url.includes(a.code));assert.equal((await request(playback,{headers:{Range:'bytes=10-19'}})).value.length,10);assert.equal((await request(playback,{headers:{Range:'bytes=500-'}})).status,416);
  const inlineAudio=await request(playback);assert.match(inlineAudio.response.headers.get('content-disposition'),/^inline/);
  assert.equal((await request(playback+'&download=1')).status,403,'Student playback tickets cannot request a download.');
  assert.equal((await request(playback+'&download=1',{method:'HEAD'})).status,403);
  assert.equal((await request('/api/student/audio/'+first+'/access',{code:b.code})).status,404);
  assert.equal((await request(path+'/'+first,{method:'DELETE',code:b.code,json:{}})).status,404);
  assert.equal((await request(path+'/'+first,{method:'DELETE',code:a.code,json:{}})).status,200);
  assert.equal((await request(playback)).status,404,'Deleted recordings cannot be accessed through earlier tickets.');
  assert.equal((await request(path,{code:a.code})).value.attemptsUsed,1,'Deleting does not reset the attempt count.');
  upload=await request(path,{method:'POST',code:a.code,bytes:wave});const second=upload.value.id;assert.equal(upload.value.attempt,2);
  upload=await request(path,{method:'POST',code:a.code,bytes:wave});const third=upload.value.id;assert.equal(upload.value.attempt,3);assert.equal((await request('/api/student/audio/'+second+'/access',{code:a.code})).status,404,'A redo retires the previous audio.');
  assert.equal((await request(path,{method:'POST',code:a.code,bytes:wave})).status,409);
  await request(path+'/'+third,{method:'DELETE',code:a.code,json:{}});assert.equal((await request(path,{method:'POST',code:a.code,bytes:wave})).status,409,'Deleting the third attempt cannot grant a fourth.');
  assert.equal(objects.size,0,'Retired and deleted student files are removed.');

  const feedbackPath='/api/teacher/submissions/'+id+'/audio';
  let teacherUpload=await request(feedbackPath+'?filename=feedback.wav&title='+encodeURIComponent('Сайн ажил!'),{method:'POST',bytes:wave});assert.equal(teacherUpload.status,201);const teacherAudio=teacherUpload.value.id;
  teacherUpload=await request(feedbackPath+'?filename=second.wav',{method:'POST',bytes:wave});assert.equal(teacherUpload.status,201);
  let detail=(await request('/api/student/submissions/'+id,{code:a.code})).value.submission;assert.equal(detail.audio.filter(x=>x.role==='teacher').length,2);assert.equal(detail.audio[0].title,'Сайн ажил!');
  assert.equal((await request('/api/student/audio/'+teacherAudio+'/access',{code:a.code})).status,200);assert.equal((await request('/api/student/audio/'+teacherAudio+'/access',{code:b.code})).status,404);
  assert.equal((await request(path+'/'+teacherAudio,{method:'DELETE',code:a.code,json:{}})).status,404,'Students cannot delete teacher audio.');
  assert.equal((await request('/api/teacher/audio/'+teacherAudio,{method:'PUT',bytes:wave,origin:'https://students.test'})).status,403);
  assert.equal((await request('/api/teacher/audio/'+teacherAudio+'?filename=revised.wav',{method:'PUT',bytes:wave})).status,200);
  detail=(await request('/api/teacher/submissions/'+id)).value.submission;assert.equal(detail.audio.find(x=>x.id===teacherAudio).filename,'revised.wav');
  assert.equal((await request('/api/teacher/audio/'+teacherAudio,{method:'DELETE',json:{}})).status,200);assert.equal((await request('/api/student/audio/'+teacherAudio+'/access',{code:a.code})).status,404);
  for(let n=0;n<49;n++)assert.equal((await request(feedbackPath,{method:'POST',bytes:wave})).status,201);
  assert.equal((await request(feedbackPath,{method:'POST',bytes:wave})).status,409,'Teacher feedback supports fifty attachments, with a bounded limit.');
  assert.equal((await request('/api/teacher/submissions/'+id)).value.submission.audio.length,50);
  const shared=await request('/api/teacher/audio-library?category=speaking&filename=model.wav',{method:'POST',bytes:wave});assert.equal(shared.status,201);
  assert.equal((await request('/api/student/audio-library',{code:b.code})).value.audio.length,1);
  assert.equal((await request('/api/student/audio/'+shared.value.id+'/access',{code:b.code})).status,200,'Shared teacher library audio is available to all enrolled learners.');
  const sharedAccess=(await request('/api/student/audio/'+shared.value.id+'/access',{code:b.code})).value,sharedUrl=new URL(sharedAccess.url),sharedPlayback=sharedUrl.pathname+sharedUrl.search;
  assert.equal((await request(sharedPlayback)).status,200);assert.equal((await request(sharedPlayback+'&download=1')).status,403,'All class audio is playable but has no student download route.');
  assert.equal((await request('/api/teacher/audio/'+shared.value.id,{method:'PUT',bytes:wave})).status,200);
  assert.equal((await request('/api/teacher/audio/'+shared.value.id,{method:'DELETE',json:{}})).status,200);assert.equal((await request('/api/student/audio-library',{code:a.code})).value.audio.length,0);
  const token=makeAudioTicket({id:third,role:'student',subject:a.id,secret:config.sessionSecret,now:1000000}).ticket;assert.equal(readAudioTicket(token,third,config.sessionSecret,1000000).sub,a.id);assert.equal(readAudioTicket(token+'x',third,config.sessionSecret,1000000),null);assert.equal(readAudioTicket(token,third,config.sessionSecret,12000000),null);
  await assert.rejects(readAudioUpload({headers:{'content-length':String(25*1024*1024+1)}},new URL('https://test/')),/25 MB/);
  assert.match(teacherAudioHTML(detail),/multiple/);assert.match(teacherLibraryHTML(),/200 files/);assert.match(speakingAudioHTML('',false),/Join your class/);
  const untrusted={...detail,audio:[{id:randomUUID(),role:'teacher',title:'<img onerror=alert(1)>',filename:'x.wav',size:64}]};assert.ok(!teacherAudioHTML(untrusted).includes('<img onerror'));
  console.log('Passed: three durable speaking attempts, deletion without reset, failed-upload recovery, redo cleanup, student isolation, private playback and byte ranges, multiple teacher attachments, replacement/deletion, shared library, limits, UTF-8 titles, expiry and UI escaping.');
}finally{await new Promise(resolve=>server.close(resolve));database.close();}

const uiListeners={},uiPlayer={innerHTML:'',querySelector:()=>({play:()=>Promise.resolve()})},previousDocument=globalThis.document;
try{
  globalThis.document={querySelector:()=>({addEventListener:(type,handler)=>uiListeners[type]=handler}),querySelectorAll:()=>[],getElementById:()=>uiPlayer};
  initClassAudio({studentId:()=> 'learner',studentRequest:async()=>({url:'https://teacher.test/api/audio/file/test?ticket=student'}),teacherRequest:async()=>({url:'https://teacher.test/api/audio/file/test?ticket=teacher'})});
  for(const role of ['student','teacher']){
    await uiListeners.click({target:{closest:()=>({dataset:{audioAction:'play',role,id:'test'}})}});
    assert.equal(uiPlayer.innerHTML.includes('controlslist="nodownload"'),role==='student');
  }
}finally{globalThis.document=previousDocument;}
