import {studentTestSession,fixturePassword} from './student-login.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {guidedLessonIndex,guidedLesson} from '../server/lessons.mjs';
import {findMaterial} from '../server/materials.mjs';
import {createClassroomServer} from '../server/index.mjs';
import {hashPassword} from '../server/security.mjs';
import {storeOperation} from '../storage/classroom-store.js';
import {teacherLocation} from '../dist/navigation.js';

const studentIndex=guidedLessonIndex(),teacherIndex=guidedLessonIndex('teacher');
assert.equal(studentIndex.weeks.length,8);assert.equal(teacherIndex.weeks.reduce((n,w)=>n+w.resources.slides,0),76);
assert.ok(studentIndex.weeks.every(w=>w.resources.slides===0&&w.resources.books>0&&w.resources.audio>0));
for(let week=1;week<=8;week++){
 const lesson=guidedLesson(week),teacher=guidedLesson(week,'teacher');
 assert.equal(lesson.phases.length,7);assert.equal(lesson.minutes,90);assert.equal(lesson.phases.reduce((n,p)=>n+p.minutes,0),90);
 assert.equal(lesson.phases.find(p=>p.id==='vocabulary').vocabulary.length,5);
 assert.equal(lesson.followUp.length,3);assert.equal(new Set(lesson.phases.map(p=>p.id)).size,7);
 if([2,4,6].includes(week))assert.equal(lesson.phases.find(p=>p.id==='writing').table.rows.length,4,'Guided table-writing tasks include their actual data.');
 const files=lesson.resources.lessons.flatMap(l=>l.files),all=teacher.resources.lessons.flatMap(l=>l.files);
 assert.ok(lesson.resources.lessons.every(l=>lesson.days.includes(l.day)),'Only this week’s uploaded lessons are included.');
 assert.ok(files.every(f=>findMaterial(f.id)?.visibility==='student'));
 assert.ok(all.some(f=>f.kind==='slides'));assert.ok(teacher.phases.every(p=>p.teacherNotes.length));
 const publicText=JSON.stringify(lesson);for(const secret of ['"teacherNotes"','.pptx','"answer-key"','"sha256"','"key":','"answer":','"sourceAnswerKey"'])assert.ok(!publicText.includes(secret),'The student lesson omits '+secret);
 for(const phase of lesson.phases){assert.ok(phase.questions.length>=3);assert.ok(phase.frames.length>=2);for(const id of phase.resourceIds)assert.ok(files.some(f=>f.id===id));}
 const audio=lesson.phases.find(p=>p.id==='listening').resourceIds.map(findMaterial).find(f=>f.kind==='audio');
 assert.ok(audio&&audio.filename.endsWith('.mp3'),'Guided listening uses an uploaded original MP3.');
 assert.ok(!audio.id.startsWith('practice-test-'),'Short skill practice is separate from the full timed mock.');
 assert.equal(teacherLocation('#lessons/week-'+week),'#teacher/lessons/week-'+week);
}
assert.equal(guidedLesson(9),null);assert.equal(guidedLesson('constructor'),null);
assert.equal(guidedLesson(1,'student',{'week1-writing-hw':{published:false}}).followUp.length,2);

const database=new DatabaseSync(':memory:');database.exec(readFileSync(new URL('../storage/0000_classroom.sql',import.meta.url),'utf8'));database.exec(readFileSync(new URL('../storage/0001_audio.sql',import.meta.url),'utf8'));
const db={async batch(statements){database.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());database.exec('COMMIT');return result;}catch(error){database.exec('ROLLBACK');throw error;}},prepare(sql){const statement=database.prepare(sql);let args=[];return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){return statement.run(...args);}};}};
const password='Testing-only-guided-lessons-password-1',config={appOrigin:'https://teacher.test',allowedOrigins:['https://richmount-ielts.onrender.com'],passwordHash:await hashPassword(password),sessionSecret:'test-guided-lesson-session-key-'.repeat(3),encryptionKey:'bc'.repeat(32),store:(op,params)=>storeOperation(db,op,params)};
const server=createClassroomServer(config);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;let cookie='';
async function request(path,{code='',teacher=false,method='GET',json}={}){const response=await fetch(base+path,{method,headers:{Origin:config.appOrigin,...(teacher?{Cookie:cookie}:{}),...(code?{Authorization:'Bearer '+await studentTestSession(base,code)}:{}),...(json?{'Content-Type':'application/json'}:{})},body:json?JSON.stringify(json):undefined});return {status:response.status,value:await response.json(),response};}
try{
 const login=await request('/api/teacher/login',{method:'POST',json:{password}});assert.equal(login.status,200);cookie=login.response.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/api/teacher/students',{teacher:true,method:'POST',json:{names:['Guided learner A','Guided learner B']}})).status,201);
 const [a,b]=(await request('/api/teacher/students',{teacher:true})).value.students;
 assert.equal((await request('/api/student/lessons')).status,401);assert.equal((await request('/api/teacher/lessons',{code:a.code})).status,401);
 const index=await request('/api/student/lessons',{code:a.code});assert.equal(index.status,200);assert.equal(index.value.weeks.length,8);
 const shared=await request('/api/student/lessons/week-1',{code:a.code});assert.equal(shared.status,200);assert.ok(!JSON.stringify(shared.value).includes('teacherNotes'));
 assert.deepEqual((await request('/api/student/lessons/week-1',{code:b.code})).value,shared.value,'Classmates receive the same public discussion plan, without private student work.');
 const privateLesson=await request('/api/teacher/lessons/week-1',{teacher:true});assert.equal(privateLesson.status,200);assert.ok(privateLesson.value.phases[0].teacherNotes.length);
 const slide=privateLesson.value.resources.lessons.flatMap(l=>l.files).find(f=>f.kind==='slides');assert.equal((await request('/api/student/materials/'+slide.id+'/access',{code:a.code})).status,404,'A lesson cannot grant students access to a teacher PowerPoint.');
 await request('/api/teacher/course/week1-writing-hw',{teacher:true,method:'PATCH',json:{published:false,dueDate:'',message:''}});
 assert.equal((await request('/api/student/lessons/week-1',{code:a.code})).value.followUp.length,2,'Student follow-up links respect the existing homework sharing setting.');
 assert.equal((await request('/api/teacher/lessons/week-1',{teacher:true})).value.followUp.length,3);
 assert.equal((await request('/api/student/lessons/week-9',{code:a.code})).status,404);
 database.prepare('UPDATE classroom_students SET active=0 WHERE id=?').run(a.id);assert.equal((await request('/api/student/lessons/week-1',{code:a.code})).status,401,'An inactive class code cannot open guided lessons.');
 await request('/api/teacher/logout',{teacher:true,method:'POST',json:{}});cookie='';assert.equal((await request('/api/teacher/lessons/week-1',{teacher:true})).status,401);
}finally{await new Promise(resolve=>server.close(resolve));database.close();}

// Exercise the real lesson UI, separate teacher/student caches, agenda controls,
// retries, and delayed responses crossing a class-code change or teacher sign-out.
const listeners={},app={addEventListener:(name,handler)=>{listeners[name]=handler;}};
let learner='learner-a',renders=0,failStudent=false,holdStudent=false,holdTeacher=false,releaseStudent,releaseTeacher;
const calls=[],media={paused:false,pause(){this.paused=true;}},stage={innerHTML:'',querySelectorAll:()=>[media],focus(){this.focused=true;},scrollIntoView(){this.scrolled=true;}};
const agenda=Array.from({length:7},(_,i)=>({dataset:{index:String(i)},attributes:{},classList:{toggle(){}},setAttribute(key,value){this.attributes[key]=value;}}));
const root={dataset:{guidedRole:'student',guidedWeek:'week-1'},querySelector:()=>stage,querySelectorAll:()=>agenda};
const context={stopMaterialsMedia:root=>root.querySelectorAll('audio,video').forEach(m=>m.pause()),console,URL,Map,Set,Promise,Number,location:{hash:'#lessons/week-1'},navigator:{clipboard:{writeText:async()=>{}}},document:{querySelector:selector=>selector==='#app'?app:selector==='#guidedLessons'?root:null}};
vm.createContext(context);vm.runInContext(readFileSync(new URL('../dist/lessons.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'')+'\nglobalThis.testing={load,state:()=>state};',context);
context.initGuidedLessons({studentId:()=>learner,render(){renders++;},studentRequest:async path=>{calls.push(path);if(holdStudent&&path.endsWith('week-2'))return new Promise(resolve=>{releaseStudent=resolve;});if(failStudent)throw new Error('Temporary guided lesson error.');return path.endsWith('/lessons')?guidedLessonIndex():guidedLesson(Number(path.at(-1)));},teacherRequest:async path=>{calls.push(path);if(holdTeacher&&path.endsWith('week-3'))return new Promise(resolve=>{releaseTeacher=resolve;});return path.endsWith('/lessons')?guidedLessonIndex('teacher'):guidedLesson(Number(path.at(-1)),'teacher');},toast(){}});
const t=context.testing;await t.load('student');await t.load('student','week-1');
const studentPage=context.guidedLessonPage();assert.match(studentPage,/Discussion order/);assert.match(studentPage,/All resources for this week/);assert.ok(!studentPage.includes('.pptx'));assert.ok(!studentPage.includes('data-material-open="download"'));
const beforeStage=renders;await listeners.click({target:{closest:()=>({dataset:{guidedAction:'stage',index:'3'},closest:()=>root})}});assert.equal(renders,beforeStage,'Changing a discussion stage does not replace the whole page.');assert.equal(media.paused,true);assert.match(stage.innerHTML,/lesson02-lp01/);assert.equal(agenda[3].attributes['aria-pressed'],'true');assert.ok(stage.focused&&stage.scrolled);
await t.load('teacher');await t.load('teacher','week-1');context.location.hash='#teacher/lessons/week-1';
const teacherPage=context.guidedLessonPage('teacher');assert.match(teacherPage,/Teacher discussion notes/);assert.match(teacherPage,/Open slides/);assert.match(teacherPage,/data-material-inline="true"/);assert.match(teacherPage,/Copy student lesson link/);
assert.ok(!studentPage.includes('Teacher discussion notes'),'Teacher content cannot enter the cached student view.');
context.location.hash='#lessons/week-4';failStudent=true;await t.load('student','week-4');assert.match(context.guidedLessonPage(),/Try again/);const beforeRetry=calls.length;await t.load('student','week-4');assert.equal(calls.length,beforeRetry,'A failed lesson waits for an explicit retry.');failStudent=false;await t.load('student','week-4',true);assert.match(context.guidedLessonPage(),/Technology and independent study/);
holdStudent=true;const lateStudent=t.load('student','week-2');await Promise.resolve();learner='learner-b';context.guidedConnectionChanged();releaseStudent(guidedLesson(2));await lateStudent;assert.equal(t.state().student.details.size,0,'A delayed lesson cannot populate another learner’s cache.');
holdTeacher=true;const lateTeacher=t.load('teacher','week-3');await Promise.resolve();context.resetGuidedLessons();releaseTeacher(guidedLesson(3,'teacher'));await lateTeacher;assert.equal(t.state().teacher.details.size,0,'Teacher sign-out discards delayed private resource responses.');
learner='';context.location.hash='#lessons';assert.match(context.guidedLessonPage(),/Join your class/);
console.log('Passed: eight guided lessons, 56 discussion stages, original paired audio and books, 76 private PPT guides, role-specific resources, published follow-up links, inline readers, agenda navigation, retries and stale-response isolation.');
