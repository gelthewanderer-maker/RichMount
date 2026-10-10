import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createClassroomServer} from '../server/index.mjs';
import {hashPassword} from '../server/security.mjs';
import {storeOperation,handleStore} from '../storage/classroom-store.js';
import {createStudentSync} from '../dist/classroom.js';
import {readings,writingTasks} from '../dist/data.js';

const temp=mkdtempSync(path.join(tmpdir(),'richmount-test-')),file=path.join(temp,'class.sqlite');
let database=new DatabaseSync(file),server,base;
database.exec(readFileSync(new URL('../storage/0000_classroom.sql',import.meta.url),'utf8'));
const db={async batch(statements){database.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());database.exec('COMMIT');return result;}catch(e){database.exec('ROLLBACK');throw e;}},prepare(sql){const statement=database.prepare(sql);let args=[];return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){return statement.run(...args);}};}};
const initialPassword='This-is-only-a-test-password-1',nextPassword='This-is-only-a-test-password-2';
const config={appOrigin:'https://teacher.test',allowedOrigins:['https://richmount-ielts.onrender.com'],passwordHash:await hashPassword(initialPassword),sessionSecret:'test-session-secret-'.repeat(4),encryptionKey:'ab'.repeat(32),store:(op,p)=>storeOperation(db,op,p)};
let teacherCookie='';
async function start(){server=createClassroomServer(config);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;}
async function request(route,{method='GET',json,code,cookie=teacherCookie,origin='https://teacher.test'}={}){
  const headers={Origin:origin};if(json!==undefined)headers['Content-Type']='application/json';if(cookie)headers.Cookie=cookie;if(code)headers.Authorization='Bearer '+code;
  const response=await fetch(base+route,{method,headers,body:json!==undefined?JSON.stringify(json):undefined});const value=await response.json();return {status:response.status,value,response};
}
try{
  await start();
  assert.equal((await request('/health')).status,200);
  assert.equal((await request('/api/teacher/students')).status,401,'Teacher records require an authenticated session.');
  assert.equal((await request('/api/teacher/login',{method:'POST',json:{password:initialPassword},origin:'https://evil.test'})).status,403,'Unapproved origins cannot log in or mutate records.');
  let login=await request('/api/teacher/login',{method:'POST',json:{password:initialPassword}});assert.equal(login.status,200);
  const cookie=login.response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Secure/);teacherCookie=cookie.split(';')[0];
  assert.equal((await request('/api/teacher/students',{method:'POST',json:{names:['Learner A','Learner B','Тэмүүлэн Энх']}})).status,201);
  let roster=(await request('/api/teacher/students')).value.students;assert.equal(roster.length,3);assert.equal(roster[2].name,'Тэмүүлэн Энх');assert.notEqual(roster[0].code,roster[1].code);assert.match(roster[0].code,/^RM-[A-F0-9]{24}$/);
  const [a,b]=roster;
  assert.equal((await request('/api/student/me',{code:a.code,cookie:''})).value.student.name,'Learner A');
  assert.equal((await request('/api/teacher/students',{code:a.code,cookie:''})).status,401,'A class code cannot access teacher data.');
  const entry={id:randomUUID(),kind:'writing',taskId:writingTasks[1].id,title:writingTasks[1].title,text:'People is using cars. The goverment should improves transport.',name:'A different person',result:{wordCount:99999}};
  const saved=await request('/api/student/submissions',{method:'POST',json:{entry},code:a.code,cookie:''});assert.equal(saved.status,201);const submissionId=saved.value.submission.id;
  assert.equal((await request('/api/student/submissions',{method:'POST',json:{entry},code:a.code,cookie:''})).value.submission.id,submissionId,'Retrying an activity is idempotent.');
  let detail=(await request('/api/teacher/submissions/'+submissionId)).value.submission;assert.equal(detail.student_name,'Learner A');assert.equal(detail.payload.name,'Learner A');assert.notEqual(detail.words,99999);assert.match(detail.payload.result.corrected,/government should improve/);
  assert.equal((await request('/api/student/submissions/'+submissionId,{code:b.code,cookie:''})).status,404,'A student cannot open another student’s work.');
  assert.equal((await request('/api/student/submissions',{code:b.code,cookie:''})).value.total,0);
  const reading={id:randomUUID(),kind:'reading',score:40,total:40,answers:{0:readings[0].questions[0].answer,1:'an incorrect response'}};
  const readSave=await request('/api/student/submissions',{method:'POST',json:{entry:reading},code:a.code,cookie:''});assert.equal(readSave.status,201);
  const readDetail=(await request('/api/teacher/submissions/'+readSave.value.submission.id)).value.submission;assert.equal(readDetail.score,1,'Practice marks are recomputed server-side, not trusted from the browser.');assert.equal(readDetail.payload.details.length,40);
  assert.equal((await request('/api/teacher/submissions')).value.total,2,'The duplicate retry did not create an extra record.');
  const review={feedback:'Clear idea. Add an example in your second paragraph.\nТэмдэглэл',teacherScore:'15/20',reviewed:true};
  assert.equal((await request('/api/teacher/submissions/'+submissionId,{method:'PATCH',json:review,origin:'https://evil.test'})).status,403);
  assert.equal((await request('/api/teacher/submissions/'+submissionId,{method:'PATCH',json:review})).status,200);
  const feedback=(await request('/api/student/submissions',{code:a.code,cookie:''})).value.submissions.find(s=>s.id===submissionId);assert.equal(feedback.feedback,review.feedback);assert.equal(feedback.reviewed,1);assert.equal(feedback.teacher_score,'15/20');
  assert.equal((await request('/api/student/submissions',{method:'POST',json:{entry:{...entry,id:randomUUID(),text:'x'.repeat(30001)}},code:a.code,cookie:''})).status,400);
  const injection="Robert'); DROP TABLE classroom_students; --";assert.equal((await request('/api/teacher/students/'+b.id,{method:'PATCH',json:{name:injection}})).status,200);assert.equal((await request('/api/teacher/students')).value.students.length,3,'Names are SQL parameters.');
  assert.equal((await request('/api/teacher/password',{method:'POST',json:{currentPassword:initialPassword,newPassword:nextPassword}})).status,200);
  assert.equal((await request('/api/teacher/session')).status,401,'Changing the password invalidates earlier sessions.');
  login=await request('/api/teacher/login',{method:'POST',json:{password:nextPassword},cookie:''});assert.equal(login.status,200);teacherCookie=login.response.headers.get('set-cookie').split(';')[0];
  await new Promise(resolve=>server.close(resolve));database.close();database=new DatabaseSync(file);await start();
  assert.equal((await request('/api/teacher/session')).status,200,'Private sessions remain verifiable after a server restart.');
  assert.equal((await request('/api/teacher/submissions')).value.total,2,'Online work survives a server restart.');
  assert.equal((await request('/api/student/submissions',{code:a.code,cookie:''})).value.submissions.find(s=>s.id===submissionId).feedback,review.feedback);
  const wrong=await handleStore(new Request('https://private-store.test/api/classroom',{method:'POST',headers:{Authorization:'Bearer wrong'},body:'{}'}),{DB:db,STORE_API_KEY:'unit-test-private-key'});assert.equal(wrong.status,401,'The datastore bridge rejects an incorrect service key.');
  const right=await handleStore(new Request('https://private-store.test/api/classroom',{method:'POST',headers:{Authorization:'Bearer unit-test-private-key'},body:JSON.stringify({op:'health'})}),{DB:db,STORE_API_KEY:'unit-test-private-key'});assert.equal(right.status,200);

  // Real client outbox code: network failure, retry and switching identities.
  const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
  let offline=false;
  const fetcher=async(url,init)=>{if(offline)throw new Error('Offline for this test');return fetch(url,init);};
  const sync=createStudentSync({storage,fetcher,apiBase:base});await sync.join(a.code);offline=true;
  const queued={...entry,id:randomUUID()};sync.queue(queued);await new Promise(resolve=>setTimeout(resolve,10));assert.equal(sync.info().pending,1);assert.equal(sync.status(queued.id),'pending');
  offline=false;await sync.join(b.code);assert.equal(sync.info().pending,0,'Another learner cannot send an earlier learner’s queued work.');
  assert.equal((await request('/api/student/submissions',{code:b.code,cookie:''})).value.total,0);
  await sync.join(a.code);await sync.flush();assert.equal(sync.status(queued.id),'sent');assert.equal(sync.info().pending,0);
  const restored=createStudentSync({storage,fetcher,apiBase:base});await restored.verify();assert.equal(restored.status(queued.id),'sent','Acknowledged work survives a browser storage reload.');
  assert.equal((await request('/api/student/submissions',{code:a.code,cookie:''})).value.total,3);
  const batch=Array.from({length:5},()=>({...entry,id:randomUUID(),context:'mock',mockId:'test-mock'}));for(const part of batch)restored.queue(part);await restored.flush();assert.equal(restored.info().pending,0,'All sections queued together are flushed.');assert.ok(batch.every(part=>restored.status(part.id)==='sent'));
  assert.equal((await request('/api/student/submissions',{code:a.code,cookie:''})).value.total,8);
  let release=null,delayOldStudent=false;
  const delayedFetcher=async(url,init)=>{const response=await fetch(url,init);if(delayOldStudent&&url.endsWith('/api/student/submissions')&&!init.method&&init.headers.Authorization==='Bearer '+a.code)await new Promise(resolve=>{release=resolve;});return response;};
  const separate=new Map(),raceClient=createStudentSync({storage:{getItem:k=>separate.get(k)||null,setItem:(k,v)=>separate.set(k,v)},fetcher:delayedFetcher,apiBase:base});
  await raceClient.join(a.code);delayOldStudent=true;const olderResponse=raceClient.refresh();for(let i=0;i<100&&!release;i++)await new Promise(resolve=>setTimeout(resolve,1));assert.ok(release);
  await raceClient.join(b.code);release();await olderResponse;assert.equal(raceClient.info().student.id,b.id);assert.equal(raceClient.info().records.length,0,'A delayed response cannot expose the previous student’s feedback after switching codes.');
  console.log('Passed: private teacher access, independent class codes, student isolation, server-side marking, idempotent submissions, feedback visibility, UTF-8 names, SQL parameters, password changes, persistent records, private datastore access, offline retries and identity-safe outboxes.');
}finally{if(server?.listening)await new Promise(resolve=>server.close(resolve));database.close();rmSync(temp,{recursive:true,force:true});}
