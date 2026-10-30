import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createClassroomServer} from '../server/index.mjs';
import {hashPassword} from '../server/security.mjs';
import {studentTestSession} from './student-login.mjs';
import {storeOperation} from '../storage/classroom-store.js';
import {handleAttachment,FILE_MAX_BYTES,feedbackFileType} from '../storage/attachment-store.js';
import {readAttachment} from '../server/attachments.mjs';
const native=new DatabaseSync(':memory:');for(const f of ['0000_classroom.sql','0001_audio.sql'])native.exec(readFileSync(new URL('../storage/'+f,import.meta.url),'utf8'));
const db={prepare(sql){const s=native.prepare(sql);let args=[];return {bind(...v){args=v;return this;},async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){return s.run(...args);}};},async batch(ss){native.exec('BEGIN');try{const out=[];for(const s of ss)out.push(await s.run());native.exec('COMMIT');return out;}catch(e){native.exec('ROLLBACK');throw e;}}};
const objects=new Map();let outage=false;
const bucket={async put(key,body,{sha256}){if(outage)throw Error('Outage');const bytes=Buffer.from(await new Response(body).arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),Buffer.from(sha256).toString('hex'));objects.set(key,bytes);return {size:bytes.length};},async get(key){const bytes=objects.get(key);return bytes?{body:new Response(bytes).body}:null;},async delete(key){objects.delete(key);}};
const config={appOrigin:'https://teacher.test',allowedOrigins:['https://student.test'],passwordHash:await hashPassword('test-feedback-files-password'),sessionSecret:'test-attachment-secret'.repeat(4),encryptionKey:'bc'.repeat(32),storeUrl:'https://store.test',storeKey:'test-store-secret',siteToken:'test-only',store:(op,p)=>storeOperation(db,op,p),attachmentFetch:(url,init)=>handleAttachment(new Request(url,init),{DB:db,BUCKET:bucket,STORE_API_KEY:'test-store-secret'},new URL(url).pathname.split('/').at(-1))};
const server=createClassroomServer(config);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let cookie='';
const request=async(path,{method='GET',data,bytes,code,teacher=false,origin='https://teacher.test'}={})=>{const r=await fetch(base+path,{method,headers:{Origin:origin,...(teacher?{Cookie:cookie}:{}),...(code?{Authorization:'Bearer '+await studentTestSession(base,code)}:{}),...(data?{'Content-Type':'application/json'}:bytes?{'Content-Type':'application/octet-stream'}:{})},body:data?JSON.stringify(data):bytes});return {status:r.status,headers:r.headers,value:method==='HEAD'?null:r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer())};};
try{
 const login=await request('/api/teacher/login',{method:'POST',data:{password:'test-feedback-files-password'}});cookie=login.headers.get('set-cookie').split(';')[0];await request('/api/teacher/students',{teacher:true,method:'POST',data:{names:['A','B']}});const [a,b]=(await request('/api/teacher/students',{teacher:true})).value.students;
 const work=(await request('/api/student/submissions',{code:a.code,method:'POST',data:{entry:{id:randomUUID(),kind:'speaking',notes:'My original notes.'}}})).value.submission.id;
 const other=(await request('/api/student/submissions',{code:b.code,method:'POST',data:{entry:{id:randomUUID(),kind:'speaking',notes:'Other learner.'}}})).value.submission.id;
 const teacherPath='/api/teacher/submissions/'+work+'/feedback-files',studentPath='/api/student/submissions/'+work+'/feedback-files',pdf=Buffer.from('%PDF-1.4\nTest feedback\n%%EOF');
 assert.equal((await request(teacherPath,{method:'POST',bytes:pdf})).status,401);assert.equal((await request(teacherPath,{method:'POST',bytes:pdf,code:a.code})).status,401);
 assert.equal((await request(teacherPath+'?filename=x.pdf',{teacher:true,method:'POST',bytes:pdf,origin:'https://student.test'})).status,403);
 assert.equal((await request(teacherPath+'?filename=x.pdf',{teacher:true,method:'POST',bytes:Buffer.from('<html>wrong</html>')})).status,415);assert.equal(objects.size,0);
 outage=true;assert.equal((await request(teacherPath+'?filename=x.pdf',{teacher:true,method:'POST',bytes:pdf})).status,503);outage=false;assert.equal(objects.size,0);
 const uploaded=await request(teacherPath+'?filename='+encodeURIComponent('Сайн feedback.pdf'),{teacher:true,method:'POST',bytes:pdf});assert.equal(uploaded.status,201);const first=uploaded.value.id;
 const teacherDetail=(await request('/api/teacher/submissions/'+work,{teacher:true})).value.submission;assert.equal(teacherDetail.attachments.length,1);assert.equal(teacherDetail.attachments[0].published,0);assert.ok(!JSON.stringify(teacherDetail.attachments).includes('object_key'));
 assert.equal((await request(studentPath,{code:a.code})).value.attachments.length,0);assert.equal((await request(studentPath,{code:b.code})).status,404);
 const studentFile='/api/student/feedback-files/'+first;assert.equal((await request(studentFile,{code:a.code})).status,404);assert.equal((await request(studentFile,{code:a.code,method:'HEAD'})).status,404);
 const downloaded=await request('/api/teacher/feedback-files/'+first,{teacher:true});assert.equal(downloaded.status,200);assert.deepEqual(downloaded.value,pdf);assert.match(downloaded.headers.get('content-disposition'),/^attachment/);assert.match(downloaded.headers.get('cache-control'),/no-store/);assert.equal(downloaded.headers.get('x-content-type-options'),'nosniff');
 const review=data=>request('/api/teacher/submissions/'+work,{teacher:true,method:'PATCH',data:{feedback:'Teacher feedback pasted from ChatGPT.\nKeep your own ideas.',teacherScore:'Band 5',...data}});
 await review({reviewed:false,attachmentIds:[first]});assert.equal((await request(studentPath,{code:a.code})).value.attachments.length,0);
 await review({reviewed:true,attachmentIds:[first]});assert.equal((await request(studentPath,{code:a.code})).value.attachments.length,1);assert.deepEqual((await request(studentFile,{code:a.code})).value,pdf);assert.equal((await request(studentFile,{code:b.code})).status,404);assert.equal((await request(studentFile)).status,401);
 const list=(await request('/api/student/submissions',{code:a.code})).value.submissions.find(s=>s.id===work);assert.equal(list.feedback_file_count,1);assert.match(list.feedback,/pasted from ChatGPT/);
 const second=(await request(teacherPath+'?filename=tips.txt',{teacher:true,method:'POST',bytes:Buffer.from('Use a clear topic sentence.')})).value.id;
 assert.equal((await request('/api/student/feedback-files/'+second,{code:a.code})).status,404,'Adding a file to published feedback never publishes the new upload.');assert.equal((await request(studentPath,{code:a.code})).value.attachments.length,1);
 await review({reviewed:true,attachmentIds:[first]});assert.equal((await request('/api/student/feedback-files/'+second,{code:a.code})).status,404,'A publish action only publishes its selected file snapshot.');
 const foreign=(await request('/api/teacher/submissions/'+other+'/feedback-files?filename=other.txt',{teacher:true,method:'POST',bytes:Buffer.from('Other feedback')})).value.id;assert.equal((await review({reviewed:true,attachmentIds:[foreign]})).status,400);
 await review({reviewed:false,attachmentIds:[first,second]});assert.equal((await request(studentFile,{code:a.code})).status,404,'Unpublishing revokes file downloads.');assert.equal((await request('/api/student/submissions/'+work,{code:a.code})).value.submission.attachments.length,0);
 await review({feedback:'',reviewed:true,attachmentIds:[first,second]});assert.equal((await request(studentPath,{code:a.code})).value.attachments.length,2,'Files can be published without a text comment.');
 assert.equal((await request('/api/student/feedback-files/'+first,{code:a.code,method:'DELETE',data:{}})).status,404,'Students cannot delete teacher files.');
 await request('/api/teacher/feedback-files/'+first,{teacher:true,method:'DELETE',data:{}});assert.equal((await request(studentFile,{code:a.code})).status,404,'Removed files are immediately revoked.');assert.equal((await request('/api/teacher/feedback-files/'+first,{teacher:true})).status,404);
 for(let n=0;n<9;n++)assert.equal((await request(teacherPath+'?filename=file'+n+'.txt',{teacher:true,method:'POST',bytes:Buffer.from('A useful tip.')})).status,201);
 assert.equal((await request(teacherPath+'?filename=extra.txt',{teacher:true,method:'POST',bytes:Buffer.from('Too many.')})).status,409);
 assert.equal((await request('/api/teacher/submissions/'+work,{teacher:true})).value.submission.attachments.length,10);
 await assert.rejects(readAttachment({headers:{'content-length':String(FILE_MAX_BYTES+1)}},new URL('https://test/?filename=x.pdf')),/10 MB/);
 assert.equal(feedbackFileType(Buffer.from('<script>bad</script>'),'x.html'),null);assert.equal(feedbackFileType(Buffer.from('Hello'),'x.txt'),'text/plain');assert.equal(feedbackFileType(Buffer.from([0,65]),'x.txt'),null);
 const raw=await handleAttachment(new Request('https://store.test/api/feedback-files/'+randomUUID()),{DB:db,BUCKET:bucket,STORE_API_KEY:'test-store-secret'},randomUUID());assert.equal(raw.status,401,'Private object storage requires server authorization.');
 console.log('Passed feedback files: private uploads, file validation and limits, interrupted uploads, teacher downloads, edited text, explicit publication, file-only feedback, new-file privacy, snapshot publication, unpublish/removal revocation, student isolation, authentication and private object storage.');
}finally{await new Promise(r=>server.close(r));native.close();}

// Run the actual teacher upload/download/remove handlers and preserve pasted text.
const {default:vm}=await import('node:vm');const auto=await import('../dist/automatic-feedback.js');const navigation=await import('../dist/navigation.js');
const handlers={},editor={value:'Pasted feedback from ChatGPT.\nKeep this teacher edit.'},mark={value:'Band 5'},button={disabled:false},downloads=[],patches=[],toasts=[];let releaseUpload;
const row={id:randomUUID(),student_name:'Learner',title:'Writing review',created_at:new Date().toISOString(),feedback:'',reviewed:0,attachments:[],payload:{kind:'speaking',notes:'Original notes.'}};
const form={id:'reviewForm',dataset:{},querySelector:s=>s==='#teacherFeedback'?editor:s==='#teacherMark'?mark:button},app={addEventListener:(type,fn)=>(handlers[type]??=[]).push(fn)};
const context={...auto,...navigation,CLASSROOM_API:'https://teacher.test',URL,URLSearchParams,Date,AbortSignal,setTimeout:()=>1,clearTimeout(){},location:{origin:'https://teacher.test',hash:'#teacher/inbox'},localStorage:{getItem:()=>null,setItem(){}},window:{addEventListener(){}},confirm:()=>true,document:{querySelector:s=>s==='#app'?app:s==='#reviewForm'?form:null,createElement:()=>({click(){downloads.push({href:this.href,filename:this.download});}})},initClassAudio(){},teacherAudioHTML:()=>'',resetTeacherCourse(){},resetGuidedLessons(){},fetch:async(url,init={})=>{
 const path=new URL(url).pathname;if(path==='/api/teacher/session')return new Promise(()=>{});
 if(path.endsWith('/submissions/'+row.id+'/feedback-files')&&init.method==='POST'){assert.equal(init.credentials,'include');await new Promise(r=>releaseUpload=r);row.attachments.push({id:randomUUID(),filename:'feedback.txt',mime:'text/plain',size:17,published:0});return Response.json({saved:true});}
 if(path==='/api/teacher/submissions/'+row.id){if(init.method==='PATCH'){patches.push(JSON.parse(init.body));return Response.json({saved:true});}return Response.json({submission:row});}
 if(path.startsWith('/api/teacher/feedback-files/')){if(init.method==='DELETE'){row.attachments=[];return Response.json({deleted:true});}return new Response('Your feedback file',{headers:{'Content-Type':'text/plain'}});}
 if(path==='/api/teacher/summary')return Response.json({students:1,submissions:1});if(path==='/api/teacher/students')return Response.json({students:[]});if(path==='/api/teacher/submissions')return Response.json({submissions:[],total:0});throw Error(path);
}};
vm.createContext(context);vm.runInContext(readFileSync(new URL('../dist/classroom.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'')+'\nglobalThis.ui={initClassroom,teacher,teacherFeedbackFilesHTML,detailHTML,studentFeedbackFilesHTML};',context);
const ui=context.ui;ui.initClassroom({onChange(){editor.value=ui.teacher.reviewDrafts[row.id]?.feedback??editor.value;},toast:t=>toasts.push(t)});Object.assign(ui.teacher,{loggedIn:true,detail:row});
const emit=async(type,event)=>{for(const fn of handlers[type]||[])await fn(event);};
assert.match(ui.detailHTML(row),/Copy and paste are enabled here/);assert.match(ui.detailHTML(row),/Attach feedback files/);assert.equal(ui.studentFeedbackFilesHTML({reviewed:0,feedback_file_count:1}),'');
const file=new File(['A useful comment.'],'feedback.txt',{type:'text/plain'}),upload=emit('change',{target:{dataset:{feedbackUpload:row.id},files:[file]}});while(!releaseUpload)await Promise.resolve();assert.equal(ui.teacher.fileBusy,true);
await emit('submit',{target:form,submitter:{value:'publish'},preventDefault(){}});assert.equal(patches.length,0,'Publication waits for the upload to finish.');
releaseUpload();await upload;assert.equal(ui.teacher.fileBusy,false);assert.equal(editor.value,'Pasted feedback from ChatGPT.\nKeep this teacher edit.');assert.equal(ui.teacher.detail.attachments.length,1);
await emit('submit',{target:form,submitter:{value:'publish'},preventDefault(){}});assert.equal(patches.at(-1).feedback,editor.value);assert.equal(patches.at(-1).attachmentIds.length,1);
const f=ui.teacher.detail.attachments[0];await emit('click',{target:{closest:()=>({dataset:{cloudAction:'download-feedback-file',role:'teacher',id:f.id,filename:f.filename}})}});assert.equal(downloads.length,1);assert.equal(downloads[0].filename,'feedback.txt');assert.match(downloads[0].href,/^blob:/);URL.revokeObjectURL(downloads[0].href);
assert.ok(!ui.teacherFeedbackFilesHTML({...row,attachments:[{...f,filename:'<img onerror=bad>.txt'}]}).includes('<img onerror'));
await emit('click',{target:{closest:()=>({dataset:{cloudAction:'remove-feedback-file',id:f.id}})}});assert.equal(ui.teacher.detail.attachments.length,0);assert.equal(editor.value,'Pasted feedback from ChatGPT.\nKeep this teacher edit.');
console.log('Passed dashboard file interactions: upload, retained pasted feedback, upload/publication guard, attachment snapshot, authenticated download, removal and escaped filenames.');
