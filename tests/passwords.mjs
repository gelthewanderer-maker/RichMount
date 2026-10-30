import {automaticFeedbackHTML,automaticFeedbackCard,automaticSettingsHTML,automaticDraftHTML,feedbackDraftText,chatGPTReviewPrompt} from '../dist/automatic-feedback.js';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createClassroomServer} from '../server/index.mjs';
import {hashPassword,verifyPassword,codeHash,makeCode,encryptCode,readStudentSession,makeStudentSession,digest} from '../server/security.mjs';
import {storeOperation} from '../storage/classroom-store.js';
import {createStudentSync} from '../dist/classroom.js';
const native=new DatabaseSync(':memory:');for(const file of ['0000_classroom.sql','0001_audio.sql'])native.exec(readFileSync(new URL('../storage/'+file,import.meta.url),'utf8'));
const db={prepare(sql){const statement=native.prepare(sql);let args=[];return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){return statement.run(...args);}};},async batch(ss){native.exec('BEGIN');try{const out=[];for(const item of ss)out.push(await item.run());native.exec('COMMIT');return out;}catch(e){native.exec('ROLLBACK');throw e;}}};
const teacherPassword='Test-only-teacher-password-1',secret='Password-test-session-secret-'.repeat(3),key='af'.repeat(32);
const config={appOrigin:'https://teacher.test',allowedOrigins:['https://student.test'],passwordHash:await hashPassword(teacherPassword),sessionSecret:secret,encryptionKey:key,store:(op,p)=>storeOperation(db,op,p)};
const a={id:randomUUID(),name:'Password learner A',code:makeCode()},b={id:randomUUID(),name:'Password learner B',code:makeCode()};
for(const learner of [a,b])await storeOperation(db,'students:add',{id:learner.id,name:learner.name,codeHash:codeHash(learner.code,key),encryptedCode:encryptCode(learner.code,key),createdAt:new Date().toISOString()});
const server=createClassroomServer(config);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
async function request(path,{method='GET',data,token='',cookie='',origin='https://student.test'}={}){const response=await fetch(base+path,{method,headers:{Origin:origin,...(data!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})},body:data!==undefined?JSON.stringify(data):undefined});return {status:response.status,value:await response.json(),response};}
const login=(learner,password)=>request('/api/student/login',{method:'POST',data:{studentCode:learner.code,password}});
const change=(token,currentPassword,newPassword,confirmPassword=newPassword)=>request('/api/student/password',{method:'POST',token,data:{currentPassword,newPassword,confirmPassword}});
const password='My chosen classroom password!',nextPassword='My second classroom password!';
try{
 assert.equal((await request('/api/student/me',{token:a.code})).status,401,'A raw code cannot bypass password sign-in.');
 const wrong=await login(a,'wrong');assert.equal(wrong.status,401);const missing=await login({code:makeCode()},'wrong');assert.equal(missing.status,401);assert.equal(missing.value.error,wrong.value.error);
 const initial=await login(a,a.code);assert.equal(initial.status,200);assert.equal(initial.value.student.passwordChangeRequired,true);assert.ok(initial.value.token.startsWith('RMS.'));assert.ok(!initial.value.token.includes(a.code));const temporary=initial.value.token;
 assert.equal((await request('/api/student/submissions',{token:temporary})).status,403,'Temporary sessions must set a password before accessing class work.');
 assert.equal((await request('/api/student/password',{method:'POST',token:b.code,data:{currentPassword:a.code,newPassword:password,confirmPassword:password}})).status,401);
 assert.equal((await change(temporary,'wrong',password)).status,400);assert.equal((await change(temporary,a.code,'short')).status,400);assert.equal((await change(temporary,a.code,password,'different password')).status,400);
 const changed=await change(temporary,a.code,password);assert.equal(changed.status,200);assert.equal(changed.value.student.passwordChangeRequired,false);const personal=changed.value.token;
 assert.equal((await request('/api/student/me',{token:temporary})).status,401,'Initial sessions are invalid after password setup.');assert.equal((await request('/api/student/submissions',{token:personal})).status,200);
 assert.equal((await login(a,a.code)).status,401,'The code stops working as a password after setup.');assert.equal((await login(a,password)).status,200);
 const row=native.prepare('SELECT * FROM classroom_student_passwords WHERE student_id=?').get(a.id);assert.match(row.password_hash,/^scrypt-v2\$/);assert.ok(!row.password_hash.includes(password));assert.equal(await verifyPassword(password,row.password_hash),true);
 assert.equal((await change(personal,a.code,nextPassword)).status,400,'Later changes require the personal password.');
 const forged=personal.slice(0,-1)+(personal.endsWith('a')?'b':'a');assert.equal((await request('/api/student/me',{token:forged})).status,401);assert.equal(readStudentSession(makeStudentSession(a.id,row.session_version,secret,false,Date.now()-8*86400000),secret),null);assert.equal((await request('/api/student/me',{token:makeStudentSession(randomUUID(),row.session_version,secret)})).status,401);
 await storeOperation(db,'submissions:save',{id:randomUUID(),studentId:a.id,clientId:randomUUID(),kind:'speaking',title:'Retained work',payload:'{}',createdAt:new Date().toISOString()});
 const access=await request('/api/student/materials/day01-book/access',{token:personal});assert.equal(access.status,200);const fileURL=new URL(access.value.url),resetPath='/api/teacher/students/'+a.id+'/reset-password';
 assert.equal((await request(resetPath,{method:'POST',data:{},token:personal,origin:config.appOrigin})).status,401,'Only teachers can reset passwords.');
 const teacher=await request('/api/teacher/login',{method:'POST',origin:config.appOrigin,data:{password:teacherPassword}}),cookie=teacher.response.headers.get('set-cookie').split(';')[0];
 assert.equal((await request(resetPath,{method:'POST',data:{},cookie,origin:'https://evil.test'})).status,403);const reset=await request(resetPath,{method:'POST',data:{},cookie,origin:config.appOrigin});assert.equal(reset.status,200);assert.equal(reset.value.reset,true);
 assert.equal((await request('/api/student/me',{token:personal})).status,401,'Reset invalidates all old sessions.');assert.equal((await request(fileURL.pathname+fileURL.search)).status,401,'Reset invalidates existing material tickets.');assert.equal((await login(a,password)).status,401);
 const afterReset=await login(a,a.code);assert.equal(afterReset.status,200);assert.equal(afterReset.value.student.passwordChangeRequired,true);const resetChange=await change(afterReset.value.token,a.code,nextPassword);assert.equal(resetChange.status,200);assert.equal((await request('/api/student/submissions',{token:resetChange.value.token})).value.total,1,'Reset preserves work.');assert.equal((await login(a,nextPassword)).status,200);
 const current=native.prepare('SELECT * FROM classroom_student_passwords WHERE student_id=?').get(a.id),stale=await storeOperation(db,'students:password-set',{id:a.id,passwordHash:row.password_hash,version:digest(randomUUID()),expectedVersion:row.session_version,updatedAt:new Date().toISOString()});assert.equal(stale.saved,false,'A delayed change cannot overwrite a reset.');assert.equal(native.prepare('SELECT session_version FROM classroom_student_passwords WHERE student_id=?').get(a.id).session_version,current.session_version);
 const bInitial=await login(b,b.code);assert.equal(bInitial.status,200);assert.notEqual(bInitial.value.student.id,a.id);assert.equal((await request('/api/teacher/students',{token:resetChange.value.token})).status,401);
 const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};memory.set('richmount-classroom-v1',JSON.stringify({student:a,code:a.code,outbox:[{studentId:a.id,entry:{id:'saved-draft'}}],sent:{},records:[{id:'old-record'}]}));const upgraded=createStudentSync({storage,fetcher:fetch,apiBase:base});assert.equal(upgraded.info().student,null);assert.equal(JSON.parse(memory.get('richmount-classroom-v1')).outbox.length,1,'Upgrade keeps pending work.');
 memory.clear();const client=createStudentSync({storage,fetcher:fetch,apiBase:base});await client.join(a.code,nextPassword);assert.equal(client.info().student.id,a.id);assert.ok(!memory.get('richmount-classroom-v1').includes(nextPassword),'Browser storage contains no password.');assert.ok(!memory.get('richmount-classroom-v1').includes(a.code),'Browser storage contains no raw code credential.');const restarted=createStudentSync({storage,fetcher:fetch,apiBase:base});await restarted.verify();assert.equal(restarted.info().student.id,a.id);client.leave();assert.equal(JSON.parse(memory.get('richmount-classroom-v1')).code,'');
 native.prepare('UPDATE classroom_students SET active=0 WHERE id=?').run(b.id);assert.equal((await request('/api/student/me',{token:bInitial.value.token})).status,401);let limited=false;for(let i=0;i<20;i++)if((await login(b,'wrong')).status===429){limited=true;break;}assert.equal(limited,true);
 console.log('Passed student passwords: code setup, current-password checks, hashing, login, teacher reset, session/ticket revocation, preserved work, atomic updates, isolation, client migration and guess limits.');
}finally{await new Promise(resolve=>server.close(resolve));native.close();}

// The displayed account controls use password fields and escape roster names.
const context={teacherPages:{},CLASSROOM_API:'',location:{origin:'https://student.test'},Date,URL,AbortController,AbortSignal,setTimeout,clearTimeout};Object.assign(context,{automaticFeedbackHTML,automaticFeedbackCard,automaticSettingsHTML,automaticDraftHTML,feedbackDraftText,chatGPTReviewPrompt});vm.createContext(context);
const source=readFileSync(new URL('../dist/classroom.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');vm.runInContext(source+'\nglobalThis.account={classroomPage,studentPasswordHTML,rosterHTML,setRoster:students=>teacher.students=students};',context);
assert.match(context.account.classroomPage(),/id="studentLoginPassword"[^>]*type="password"/);
assert.match(context.account.studentPasswordHTML(true),/Current password \(your student code\)/);
assert.match(context.account.studentPasswordHTML(false),/autocomplete="current-password"/);
context.account.setRoster([{id:a.id,name:'Learner <img src=x>',code:a.code}]);const roster=context.account.rosterHTML();assert.match(roster,/data-cloud-action="reset-student-password"/);assert.ok(!roster.includes('<img'));assert.ok(roster.includes('Reset password'));
console.log('Passed account controls: student login, first/current password form, confirmation fields and teacher reset button.');
