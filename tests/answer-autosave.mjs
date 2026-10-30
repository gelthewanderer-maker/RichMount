import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createAnswerAutosave} from '../dist/answer-autosave.js';
import {createClassroomServer} from '../server/index.mjs';
import {storeOperation} from '../storage/classroom-store.js';
import {hashPassword} from '../server/security.mjs';
import {studentTestSession} from './student-login.mjs';

const folder=mkdtempSync(join(tmpdir(),'richmount-answers-')),file=join(folder,'answers.sqlite');
let database=new DatabaseSync(file),server,base;
for(const name of ['0000_classroom.sql','0001_audio.sql','0002_writing_drafts.sql','0003_answer_drafts.sql'])database.exec(readFileSync(new URL('../storage/'+name,import.meta.url),'utf8'));
const db={prepare(sql){const statement=database.prepare(sql);let args=[];return {bind(...v){args=v;return this;},async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){return statement.run(...args);}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}};
const password='answer-tests-only-password',config={appOrigin:'https://teacher.test',passwordHash:await hashPassword(password),sessionSecret:'answer-test-session-key'.repeat(4),encryptionKey:'ae'.repeat(32),store:(op,p)=>storeOperation(db,op,p)};
async function start(){server=createClassroomServer(config);await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;}
await start();
const login=await fetch(base+'/api/teacher/login',{method:'POST',headers:{Origin:config.appOrigin,'Content-Type':'application/json'},body:JSON.stringify({password})}),cookie=login.headers.get('set-cookie').split(';')[0];
await fetch(base+'/api/teacher/students',{method:'POST',headers:{Origin:config.appOrigin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({names:['Answers A','Answers B']})});
const {students}=await(await fetch(base+'/api/teacher/students',{headers:{Cookie:cookie}})).json(),tokens=await Promise.all(students.map(s=>studentTestSession(base,s.code)));
async function request(key,{data,who=0}={}){const r=await fetch(base+'/api/student/answer-drafts'+(data?'':'?key='+encodeURIComponent(key)),{method:data?'POST':'GET',headers:{...(who===null?{}:{Authorization:'Bearer '+tokens[who]}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,value:await r.json()};}
try{
 const key='course:week-1-mock@2026-10-26_s1_w1',draft={key,deviceId:randomUUID(),revision:10,value:{id:randomUUID(),responses:{reading:{q1:'FALSE'},listening:{q1:'8:30'},task1:'My original response.',speaking:{notes:'Mиний санаа'}}}};
 assert.equal((await request(key,{data:draft,who:null})).status,401);
 assert.equal((await request(key,{data:{...draft,studentId:students[1].id}})).status,200);
 assert.equal((await request(key,{who:1})).value.drafts.length,0);
 assert.equal((await request(key,{data:draft})).status,200,'Retries are idempotent.');
 assert.equal((await request(key,{data:{...draft,value:{text:'conflicting'}}})).status,409);
 const newer={...draft,revision:11,value:{...draft.value,notes:'An improved answer'}};
 assert.equal((await request(key,{data:newer})).status,200);
 assert.equal((await request(key,{data:{...draft,revision:9}})).status,409,'A delayed request cannot overwrite newer answers.');
 let list=(await request(key)).value.drafts;
 assert.deepEqual(list[0].value,newer.value);assert.deepEqual(list[0].previous,draft.value);
 assert.equal((await request(key,{data:{...draft,deviceId:randomUUID(),revision:1}})).status,200,'Separate device copies are retained.');
 assert.equal((await request('course:week-1-mock@2026-11-02_s1_w2')).value.drafts.length,0);
 assert.equal((await request(key,{data:{...draft,key:"' OR 1=1 --"}})).status,400);
 assert.equal((await request(key,{data:{...draft,revision:12,value:{text:'x'.repeat(150001)}}})).status,400);
 assert.equal(database.prepare('SELECT COUNT(*) AS n FROM classroom_submissions').get().n,0,'Drafts do not submit or grade student work.');
 await new Promise(r=>server.close(r));database.close();database=new DatabaseSync(file);await start();
 assert.equal((await request(key)).value.drafts.length,2,'Answers survive a complete server restart.');
 assert.equal((await request(key,{data:{...newer,revision:12,value:null}})).status,200,'An explicit new attempt can keep a blank draft without resurrecting earlier work.');
}finally{await new Promise(r=>server.close(r));database.close();rmSync(folder,{recursive:true});}

const cloud=new Map();let user='student-a',offline=false,failStorage=false,blockRead=null;
const memory=new Map(),storage={getItem:key=>memory.get(key)||null,setItem(key,value){if(failStorage)throw Error('Quota');memory.set(key,value);}};
const fetcher=async(path,init)=>{const requestOwner=user;if(offline)throw Error('Offline');const key=init?JSON.parse(init.body).key:decodeURIComponent(path.split('key=')[1]),slot=requestOwner+':'+key;if(!init){const captured=cloud.get(slot);if(blockRead)await blockRead;return {drafts:captured?[captured]:[]};}const data=JSON.parse(init.body),saved={...data,updatedAt:new Date().toISOString()};cloud.set(slot,saved);return {saved:true,revision:saved.revision,updatedAt:saved.updatedAt};};
function make(store=storage){return createAnswerAutosave({storage:store,studentId:()=>user,request:fetcher,schedule:()=>1,cancel(){}});}
let sync=make();sync.open('practice:reading',undefined);await sync.ready('practice:reading');offline=true;sync.capture('practice:reading',{answers:{0:'TRUE'}});await sync.flush();assert.match(sync.status(),/Waiting for connection/);
sync=make();assert.equal(sync.open('practice:reading',undefined).answers[0],'TRUE','Refresh restores pending answers immediately.');await sync.ready('practice:reading');offline=false;await sync.flush();assert.match(sync.status(),/saved to your account/);
const freshMemory=new Map(),freshStorage={getItem:key=>freshMemory.get(key)||null,setItem:(key,value)=>freshMemory.set(key,value)};let restored;
const another=make(freshStorage);another.open('practice:reading',undefined,value=>{restored=value;});await another.ready('practice:reading');assert.equal(restored.answers[0],'TRUE','A new device restores the account backup automatically.');
let release;blockRead=new Promise(r=>{release=r;});const racing=make(freshStorage);racing.open('practice:listening',undefined,()=>assert.fail('A delayed cloud read must not overwrite current typing.'));racing.capture('practice:listening',{answers:{1:'my new answer'}});release();await racing.ready('practice:listening');blockRead=null;await racing.flush();assert.equal(cloud.get('student-a:practice:listening').value.answers[1],'my new answer');
user='student-b';assert.equal(sync.open('practice:reading',undefined),undefined);await sync.ready('practice:reading');assert.ok(!cloud.has('student-b:practice:reading'),'Switching students never uploads another learner’s drafts.');
user='student-a';assert.equal(sync.open('practice:reading',undefined).answers[0],'TRUE');await sync.ready('practice:reading');
failStorage=true;sync.capture('practice:reading',{answers:{0:'FALSE'}});assert.match(sync.status(),/Browser save unavailable/);await sync.flush();assert.equal(cloud.get('student-a:practice:reading').value.answers[0],'FALSE','Online backup still works when browser storage is full.');
console.log('Passed answer autosave: private student accounts, all response types, per-week drafts, offline retry, refresh/new-device recovery, delayed reads/writes, idempotency, recovery copies, quota errors and server restarts.');
