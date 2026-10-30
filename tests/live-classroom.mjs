import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID,webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {createClassroomServer} from '../server/index.mjs';
import {hashPassword} from '../server/security.mjs';
import {storeOperation} from '../storage/classroom-store.js';
import {studentTestSession} from './student-login.mjs';
import {createActivityReporter,liveRosterHTML,livePreviewHTML} from '../dist/live-classroom.js';
import {teacherTabs,teacherLocation,studentPages} from '../dist/navigation.js';

const database=new DatabaseSync(':memory:');
for(const name of ['0000_classroom.sql','0001_audio.sql','0002_writing_drafts.sql','0003_answer_drafts.sql'])database.exec(readFileSync(new URL('../storage/'+name,import.meta.url),'utf8'));
const db={prepare(sql){const statement=database.prepare(sql);let args=[];return {bind(...v){args=v;return this;},async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){return statement.run(...args);}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}};
let now=Date.now();const password='live-classroom-test-password',config={appOrigin:'https://teacher.test',passwordHash:await hashPassword(password),sessionSecret:'live-classroom-test-session'.repeat(4),encryptionKey:'b6'.repeat(32),now:()=>now,store:(op,p)=>storeOperation(db,op,p)};
const server=createClassroomServer(config);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const login=await fetch(base+'/api/teacher/login',{method:'POST',headers:{Origin:config.appOrigin,'Content-Type':'application/json'},body:JSON.stringify({password})}),cookie=login.headers.get('set-cookie').split(';')[0];
await fetch(base+'/api/teacher/students',{method:'POST',headers:{Origin:config.appOrigin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({names:['Live learner A','Live learner B']})});
const {students}=await(await fetch(base+'/api/teacher/students',{headers:{Cookie:cookie}})).json(),tokens=await Promise.all(students.map(s=>studentTestSession(base,s.code)));
async function request(path,{data,who='teacher'}={}){
 const headers={...(who==='teacher'?{Cookie:cookie,Origin:config.appOrigin}:Number.isInteger(who)?{Authorization:'Bearer '+tokens[who]}:{}),...(data?{'Content-Type':'application/json'}:{})};
 const response=await fetch(base+path,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined});return {status:response.status,value:await response.json(),response};
}
try{
 assert.equal((await request('/api/teacher/live',{who:null})).status,401);
 assert.equal((await request('/api/teacher/live',{who:0})).status,401,'Student sessions cannot list class activity.');
 assert.equal((await request('/api/teacher/live/'+students[0].id,{who:1})).status,401,'Students cannot preview classmates or their own drafts through teacher endpoints.');
 assert.equal((await request('/api/teacher/live/not-a-student')).status,404);
 assert.equal((await request('/api/teacher/live')).value.students.length,2);
 const deviceId=randomUUID(),attemptId=randomUUID(),activity={deviceId,revision:10,page:'course',activityId:'week-1-mock',weeklyKey:'2026-10-26_s1_w1',attemptId,stage:1,phase:'paused',answered:2,visible:true};
 assert.equal((await request('/api/student/activity',{data:activity,who:null})).status,401);
 assert.equal((await request('/api/student/activity',{data:{...activity,page:'https://outside-richmount.test'},who:0})).status,400);
 assert.equal((await request('/api/student/activity',{data:{...activity,studentId:students[1].id},who:0})).status,200);
 let overview=(await request('/api/teacher/live')).value,learner=overview.students.find(s=>s.id===students[0].id);
 assert.equal(learner.status,'paused');assert.equal(learner.activity.section,'reading');assert.equal(learner.activity.answered,2);assert.equal(learner.activity.total,40);
 assert.equal(overview.students.find(s=>s.id===students[1].id).status,'unknown','Presence ownership comes only from the authenticated learner.');
 const draft={key:'course:week-1-mock@2026-10-26_s1_w1',deviceId:randomUUID(),revision:100,value:{id:attemptId,type:'mock',stage:1,responses:{listening:{1:'My listening answer'},reading:{1:'My reading answer'},task1:'My first writing response. <script>alert(1)</script>',task2:'My second writing response.',speaking:{notes:'Миний санаа'}}}};
 assert.equal((await request('/api/student/answer-drafts',{data:draft,who:0})).status,200);
 let detail=(await request('/api/teacher/live/'+students[0].id)).value;
 assert.equal(detail.preview.sections.find(s=>s.id==='reading').answers[0].response,'My reading answer');
 assert.equal(detail.preview.sections.find(s=>s.id==='task1').text,draft.value.responses.task1);
 assert.equal(detail.preview.sections.find(s=>s.id==='speaking').text,'Миний санаа');
 assert.ok(detail.preview.savedAt);assert.equal(detail.preview.sections.length,5);
 assert.ok(!JSON.stringify(detail).includes('gradingGroups'));assert.ok(!JSON.stringify(detail).includes('"evidence":'),'Preview is a view of saved responses, not premature marking.');
 assert.equal(database.prepare('SELECT COUNT(*) AS n FROM classroom_submissions').get().n,0,'Activity updates and previews never submit or grade homework.');
 assert.match((await request('/api/teacher/live')).response.headers.get('cache-control'),/no-store/);
 const nextAttempt=randomUUID();now+=1000;
 await request('/api/student/activity',{data:{...activity,revision:11,attemptId:nextAttempt,stage:2},who:0});
 detail=(await request('/api/teacher/live/'+students[0].id)).value;assert.equal(detail.preview.sections.length,0,'A newly started attempt must not display answers from an earlier attempt.');
 const old=await request('/api/student/activity',{data:{...activity,revision:9,stage:0},who:0});assert.equal(old.value.accepted,false);assert.equal((await request('/api/teacher/live')).value.students[0].activity.section,'writing','Delayed heartbeats cannot move the learner backwards.');
 await request('/api/student/answer-drafts',{data:{...draft,revision:101,value:{...draft.value,id:nextAttempt}},who:0});
 now+=1000;await request('/api/student/activity',{data:{...activity,deviceId:randomUUID(),revision:1,visible:false},who:0});
 assert.equal((await request('/api/teacher/live')).value.students[0].status,'paused','An away tab cannot hide another recently visible Richmount tab.');
 await request('/api/student/activity',{data:{...activity,revision:12,attemptId:nextAttempt,visible:false},who:0});assert.equal((await request('/api/teacher/live')).value.students[0].status,'away');
 now+=61000;assert.equal((await request('/api/teacher/live')).value.students[0].status,'offline','Stale connections are never presented as currently working.');
 assert.ok((await request('/api/teacher/live/'+students[0].id)).value.preview.savedAt,'Saved work remains available after a connection goes stale.');
 // Writing practice uses its own backup table and stays visible while unsubmitted.
 await request('/api/student/writing-drafts',{data:{key:'practice:pollution',deviceId:randomUUID(),revision:1,text:'My own writing draft.',plan:{}},who:1});
 await request('/api/student/activity',{data:{deviceId:randomUUID(),revision:1,page:'writing',taskId:'pollution',visible:true,phase:'working',words:5},who:1});
 const writing=(await request('/api/teacher/live/'+students[1].id)).value;assert.equal(writing.preview.sections[0].text,'My own writing draft.');
 assert.equal((await request('/api/student/activity',{data:{...activity,revision:13,page:'home',activityId:'',visible:true},who:0})).status,200);
 assert.ok((await request('/api/teacher/live/'+students[0].id)).value.preview.sections.length,'When no task is open the teacher can still view the latest saved draft, clearly labelled.');
}finally{await new Promise(r=>server.close(r));database.close();}

assert.equal(teacherLocation('#teacher/live'),'#teacher/live');assert.ok(teacherTabs.includes('live'));assert.ok(!Object.hasOwn(studentPages,'live'));
const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},calls=[];let user='student-a',connected=true,visible=true;
const reporter=createActivityReporter({storage,studentId:()=>user,connected:()=>connected,visible:()=>visible,context:()=>({page:'course',activityId:'week-1-mock',stage:1}),request:async(path,init)=>{calls.push({path,packet:JSON.parse(init.body)});},now:()=>1000});
await reporter.send();visible=false;await reporter.send({away:true});assert.equal(calls[1].packet.visible,false);assert.ok(calls[1].packet.revision>calls[0].packet.revision);assert.equal(calls[0].packet.deviceId,calls[1].packet.deviceId);
connected=false;await reporter.send();assert.equal(calls.length,2);connected=true;user='';await reporter.send();assert.equal(calls.length,2,'Guests and signed-out students send no activity.');
assert.ok(!JSON.stringify(calls).includes('responses'));assert.ok(!JSON.stringify(calls).includes('studentId'),'Presence carries only the current Richmount context; saved-answer previews use the protected backup API.');
const unsafe=livePreviewHTML({student:{name:'<script>name</script>',activity:null,lastSeenAt:null},preview:{message:'Saved',savedAt:null,sections:[{id:'writing',type:'text',title:'Writing',text:'<script>answer</script>',words:1}]}});
assert.ok(!unsafe.includes('<script>'));assert.match(unsafe,/&lt;script&gt;/);assert.match(liveRosterHTML([{id:randomUUID(),name:'<b>name</b>',status:'unknown'}]),/&lt;b&gt;/);

// The view must discard delayed data after logout or a different student selection.
const nodes=new Map(),listeners={};let signedIn=true,releaseRoster;
const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',scrollTop:0,querySelectorAll:()=>[]});return nodes.get(key);};
const context={console,crypto:webcrypto,Date,Map,Set,JSON,encodeURIComponent,setTimeout:()=>0,clearTimeout(){},setInterval(){},location:{hash:'#teacher/live'},window:{sessionStorage:storage,addEventListener(){}},document:{hidden:false,activeElement:null,querySelector:node,addEventListener(type,fn){listeners[type]=fn;}},globalThis:{}};
vm.createContext(context);vm.runInContext(readFileSync(new URL('../dist/live-classroom.js',import.meta.url),'utf8').replace(/^export /gm,'')+'\nglobalThis.liveTest={loadRoster,loadPreview,preview:()=>preview};',context);
context.initLiveClassroom({session:()=>({teacher:true,connected:signedIn}),studentId:()=>'',studentConnected:()=>false,studentRequest(){},context:()=>({page:'home'}),teacherRequest:()=>new Promise(resolve=>releaseRoster=resolve)});
const stale=context.globalThis.liveTest.loadRoster();signedIn=false;context.liveConnectionChanged();releaseRoster({serverTime:new Date().toISOString(),students:[{id:randomUUID(),name:'Private delayed name',status:'working'}]});await stale;assert.ok(!context.liveTeacherHTML().includes('Private delayed name'),'A delayed activity response cannot reappear after teacher logout.');
let releaseA;const a=randomUUID(),b=randomUUID();signedIn=true;context.liveConnectionChanged();
const detail=id=>({student:{id,name:id===a?'Learner A':'Learner B',activity:null},preview:{savedAt:null,message:'Saved',sections:[]}});
context.initLiveClassroom({session:()=>({teacher:true,connected:signedIn}),studentId:()=>'',studentConnected:()=>false,studentRequest(){},context:()=>({page:'home'}),teacherRequest:path=>path==='/api/teacher/live'?Promise.resolve({serverTime:new Date().toISOString(),students:[{id:a,name:'Learner A',status:'working'},{id:b,name:'Learner B',status:'working'}]}):path.endsWith(a)?new Promise(resolve=>releaseA=resolve):Promise.resolve(detail(b))});
await context.globalThis.liveTest.loadRoster();await listeners.click({target:{closest:selector=>selector==='[data-live-student]'?{dataset:{liveStudent:b}}:null}});await Promise.resolve();await Promise.resolve();releaseA(detail(a));await Promise.resolve();await Promise.resolve();assert.equal(context.globalThis.liveTest.preview().student.id,b,'A slower preview for the first selected student cannot overwrite the second selection.');
console.log('Passed live classroom: teacher-only previews, authenticated ownership, all saved mock sections and writing drafts, attempt isolation, stale/away states, multiple tabs, monotonic heartbeats, no partial submissions, safe rendering, guest/logout isolation and stale-response protection.');
