import {createAnswerAutosave} from '../dist/answer-autosave.js';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {readings,listenings,writingTasks,guides,speaking} from '../dist/data.js';
import {lessonMaterials} from '../dist/materials-data.js';
import {checkGrammar,words} from '../dist/grammar.js';
import {studentPages,teacherPages,teacherLocation,teacherLink,teacherView,teacherNav} from '../dist/navigation.js';

assert.equal(readings.flatMap(r=>r.questions).length,40);
assert.equal(listenings.flatMap(r=>r.questions).length,40);
const readWords=readings.reduce((n,r)=>n+words(r.paragraphs.join(' ')),0);
assert.ok(readWords>=2150&&readWords<=2750,'Reading passages match the official total length range.');
for(const q of [...readings,...listenings].flatMap(r=>r.questions)){
 assert.ok(q.answer&&q.evidence);
 if(q.options)assert.ok(q.options.includes(q.answer));
 if(q.limit)assert.ok(String(q.answer).split(/\s+/).length<=q.limit);
}
const grammar=checkGrammar('People is using cars. They has many problem. The goverment should improves transport.');
assert.equal(grammar.corrected,'People are using cars. They have many problems. The government should improve transport.');
assert.equal(checkGrammar('The government should reduce pollution. Students are learning.').issues.length,0);
assert.equal(checkGrammar('He should goes home.').corrected,'He should go home.');
assert.equal(checkGrammar('An university is a useful place.').corrected,'A university is a useful place.');
assert.equal(checkGrammar('').wordCount,0);

// Execute application state transitions without a browser or preview server.
const nodes=new Map(),listeners={},storage=new Map();
function node(key){if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',dataset:{},checked:true,classList:{toggle(){},add(){},remove(){}},addEventListener(type,fn){listeners[key+':'+type]=fn;},showModal(){},close(){},click(){},value:''});return nodes.get(key);}
const context={initLiveClassroom(){},liveTeacherHTML:()=> 'Live classroom '.repeat(30),mountLiveTeacher(){},notifyLiveActivity(){},liveConnectionChanged(){},endStudentLiveActivity(){},liveCourseContext:()=>null,createAnswerAutosave,flushWritingDrafts:async()=>{},initWritingStudio(){},writingGuideHTML:()=>'Writing guide',draftToolsHTML:()=>'Draft tools',savedWritingText:(key,text)=>text,initBookGrades(){},initBookActivities(){},refreshBookReaders:()=>0,queueBookSubmission(){},initAttendance(){},attendancePage:()=>"Attendance ".repeat(30),mountAttendance(){},attendanceConnectionChanged(){},studentDailyLearningHTML:()=>"",initFloatingAudio(){},moveFloatingAudioHome(){},syncFloatingAudioOwner(){},closeFloatingAudio(){},closeFloatingAudioSource(){},pauseFloatingAudio(){},pauseCourseForAudio(){},initWeekly(){},studentDeliverablesHTML:()=>"Weekly deliverables ".repeat(30),teacherDeliverablesHTML:()=>"Teacher deliverables ".repeat(30),weeklyStandingHTML:()=>"",weeklyConnectionChanged(){},initStudentNotifications:()=>({refresh(){}}),studentNotificationState:()=>({}),classroomSessionState:()=>({connected:false,busy:false}),logoutClassroom:async()=>true,refreshWritingProgress(){},initCoaching(){},coachHTML:()=>'',coachReportId:()=>null,finalWritingConfirmation:()=>'',writingFeedbackHTML:()=>'',basicWritingReport:()=>({}),studentTaskBarHTML:()=>'',refreshStudentTasks(){},coachingConnectionChanged(){},initGuidedLessons(){},guidedLessonPage:()=> 'Guided lessons '.repeat(30),mountGuidedLessons(){},guidedConnectionChanged(){},lessonMaterials,initCourse(){},coursePage:()=>"Weekly course ".repeat(30),mountCourse(){},courseConnectionChanged(){},activeCourseMock:()=>"",stopCourseMedia(){},studentCourseRequest(){},teacherCourseRequest(){},courseSubmissionResult(){},courseSubmissionStatus(){},queueCourseSubmission(){},flushCourseSubmissions(){},teacherCourseStudents(){},openCourseInbox(){},speakingAudioHTML:()=>'Speaking audio',studentLibraryHTML:()=>'Teacher library',studentAudioHTML:()=>'',uploadSpeakingRecording(){},stopClassAudio(){},ensureSpeakingSubmission(){},speakingSubmissionId:()=>'',vocabularyPage:()=>"Vocabulary ".repeat(30),initVocabulary(){},studentId:()=>"",studentMaterialsPage:()=>"Lesson materials ".repeat(30),initMaterials(){},mountMaterials(){},refreshMaterialsConnection(){},stopMaterialsMedia(){},isClassConnected:()=>false,isTeacherSite:()=>false,studentMaterialAccess(){},teacherMaterialAccess(){},classroomOrigin:()=>'',materialsPage:()=>"Lesson materials ".repeat(30),initClassroom(){},classroomPage:()=>"Classroom ".repeat(30),teacherPage:()=>"Teacher ".repeat(30),queueSubmission(){},cloudHistoryLabel:()=>"",progressCloudHTML:()=>"",studentName:()=>"",readings,listenings,writingTasks,guides,speaking,checkGrammar,words,console,crypto:webcrypto,Date,Blob,URL,setTimeout:()=>1,clearTimeout(){},setInterval(){},confirm:()=>true,location:{hash:'#home',reload(){}},navigator:{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{hidden:false,addEventListener(){},querySelector:s=>s==='#teacherAudio'?null:node(s),querySelectorAll:()=>[],createElement:()=>node('download')},window:{addEventListener(type,fn){listeners['window:'+type]=fn;},scrollTo(){},print(){}}};
Object.assign(context,{studentPages,teacherPages,teacherLocation,teacherLink,teacherView,teacherNav,teacherCourseHTML:()=> 'Teacher course '.repeat(30)});
let currentHash='#home';Object.defineProperty(context.location,'hash',{get:()=>currentHash,set:value=>{currentHash=value.startsWith('#')?value:'#'+value;}});
vm.createContext(context);
const appSource=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),classSource=readFileSync(new URL('../dist/classroom.js',import.meta.url),'utf8');
const specifier=(text,name)=>[...text.matchAll(/from ['"]([^'"]+)['"]/g)].map(m=>m[1]).find(path=>path.startsWith('./'+name+'.js'));
for(const shared of ['course','materials','coaching']){const path=specifier(appSource,shared);assert.ok(path);assert.equal(path,specifier(classSource,shared),'Student and teacher views share one '+shared+' state module.');}
const source=appSource.replace(/^import .*;\n/gm,'');
vm.runInContext(source+'\nglobalThis.test={state,render,grade,isCorrect,beginMock,mockNext,finishMock,processExpiry,submitWriting,submitSet,report,setTask:i=>taskIndex=i};',context);
const t=context.test;
const logoutNode=node('#logoutBtn'),originalNodes=context.document.querySelectorAll;let connected=true,logoutCalls=0;context.document.querySelectorAll=s=>s==='[data-session-logout]'?[logoutNode]:originalNodes(s);context.classroomSessionState=()=>({connected,busy:false});context.logoutClassroom=async()=>{logoutCalls++;connected=false;};t.render();assert.equal(logoutNode.hidden,false);await listeners['#logoutBtn:click']();t.render();assert.equal(logoutCalls,1);assert.equal(logoutNode.hidden,true,'The header logout control hides when no session is active.');context.document.querySelectorAll=originalNodes;context.classroomSessionState=()=>({connected:false,busy:false});
context.isTeacherSite=()=>true;
context.location.hash='#materials';t.render();assert.equal(context.location.hash,'#teacher/resources');assert.match(node('#app').innerHTML,/Teacher/);assert.equal(node('#crumb').textContent,'Teacher dashboard / Learning Materials');
const listeningNav={dataset:{nav:'listening'},classList:{toggle:(name,active)=>{listeningNav.active=active;}}};
context.document.querySelectorAll=selector=>selector==='[data-nav]'?[listeningNav]:[];
context.location.hash='#listening';t.render();assert.equal(context.location.hash,'#teacher/listening');assert.match(node('#app').innerHTML,/Teacher/);assert.equal(node('#crumb').textContent,'Teacher dashboard / Listening Lab');assert.equal(listeningNav.href,'#teacher/listening');assert.ok(listeningNav.active);
const originalLock=context.activeCourseMock;context.activeCourseMock=()=>{throw new Error('Teacher pages must not enter student mock state.');};
for(const path of Object.keys(studentPages)){
  context.location.hash='#'+path;t.render();assert.equal(context.location.hash,teacherLocation('#'+path),path+' remains in teacher mode');assert.match(node('#app').innerHTML,/Teacher/);assert.match(node('#crumb').textContent,/^Teacher dashboard/);assert.equal(node('#classroomBadge').href,'#teacher/inbox');assert.ok(node('#profileBtn').hidden);
}
context.location.hash='#course/week-1-mock';t.render();assert.equal(context.location.hash,'#teacher/course/week-1-mock');
assert.equal(teacherLink('#homework/week-2-writing'),'#teacher/homework/week-2-writing');assert.equal(teacherLink('https://example.test'),'https://example.test');assert.equal(teacherLink('#courseTeacherPreview'),'#courseTeacherPreview');
assert.equal(teacherLocation('#constructor'),'#teacher/overview');assert.equal(teacherLocation('#teacher/__proto__'),'#teacher/inbox');
context.activeCourseMock=originalLock;
context.isTeacherSite=()=>false;
context.location.hash='#materials';t.render();assert.equal(context.location.hash,'#materials');assert.match(node('#app').innerHTML,/Lesson materials/,'Student materials keep their existing access flow.');
context.location.hash='#listening';t.render();assert.equal(context.location.hash,'#listening');assert.equal(listeningNav.href,'#listening');assert.ok(!node('#profileBtn').hidden);assert.equal(node('#classroomBadge').href,'#class');
for(const path of ['home','lessons','writing','reading','listening','speaking','mock','guides','official','progress','materials','vocabulary','course','homework']){context.location.hash='#'+path;t.render();assert.ok(node('#app').innerHTML.length>200,path+' renders');assert.ok(!node('#app').innerHTML.includes('undefined'),path+' contains no undefined values');assert.ok(!node('#crumb').textContent.includes('undefined'),path+' has a page title');}
const correctRead=Object.fromEntries(readings.flatMap(r=>r.questions).map((q,i)=>[i,q.answer]));
const correctListen=Object.fromEntries(listenings.flatMap(r=>r.questions).map((q,i)=>[i,q.answer]));
assert.equal(t.grade('reading',correctRead).score,40);
assert.equal(t.grade('listening',correctListen).score,40);
assert.equal(t.grade('reading',{}).score,0);
assert.ok(t.isCorrect(listenings[0].questions[1],'14th'));
assert.ok(!t.isCorrect(readings[0].questions[5],'the correct answer is sedum'),'Word limits are enforced.');
t.state.reading.answers=correctRead;context.location.hash='#reading';t.submitSet('reading');assert.equal(t.state.reading.result.score,40);assert.equal(t.state.history[0].total,40);
t.setTask(1);t.state.drafts.pollution='People is using cars. The goverment should improves transport.';context.location.hash='#writing';t.submitWriting();assert.ok(t.state.writeResults.pollution.result.corrected.includes('government should improve'));assert.ok(t.report(t.state.history[0]).includes('ORIGINAL RESPONSE'));
t.state.drafts.education='An important idea.';t.state.timers['write-education']={end:Date.now()-1000};t.processExpiry();assert.ok(t.state.writeResults.education,'Timer expiry submits a draft.');
// New mock starts use the uploaded weekly course; an older saved attempt remains recoverable.
context.location.hash='#mock';t.render();assert.ok(node('#app').innerHTML.includes('Weekly course'));
t.beginMock();assert.equal(context.location.hash,'#course');assert.equal(t.state.mock,null,'No new synthetic-audio attempt is created.');
t.state.mock={stage:0,listening:correctListen,reading:correctRead,writing:{transport:writingTasks[0].model,pollution:writingTasks[1].model},plays:{},writeTask:0,started:Date.now()};
context.isTeacherSite=()=>true;context.location.hash='#materials';t.render();assert.equal(context.location.hash,'#teacher/resources','Saved practice does not block the teacher materials dashboard.');assert.ok(!t.state.mock.done,'Opening teacher materials preserves the saved student practice.');
context.activeCourseMock=()=> 'week-1-mock';context.location.hash='#listening';t.render();assert.equal(context.location.hash,'#teacher/listening','Saved student mocks do not block the teacher Listening Lab.');assert.ok(!t.state.mock.done);context.activeCourseMock=()=>'';
context.isTeacherSite=()=>false;context.location.hash='#teacher';t.render();assert.equal(context.location.hash,'#teacher','An earlier unfinished practice no longer traps the student on the mock page.');
context.activeCourseMock=()=> 'week-1-mock';context.location.hash='#homework';t.render();assert.equal(context.location.hash,'#homework','A weekly mock does not block homework navigation.');context.location.hash='#reading';t.render();assert.equal(context.location.hash,'#reading','A weekly mock does not block other student sections.');context.activeCourseMock=()=>'';
t.state.timers['mock-0']={end:Date.now()-1000};context.location.hash='#mock';t.render();t.processExpiry();
assert.equal(t.state.mock.stage,0,'An older saved attempt is not advanced or overwritten during migration.');
assert.ok(node('#app').innerHTML.includes('Your answers are still saved.'));
t.finishMock(true);assert.ok(t.state.mock.done);assert.ok(t.state.mock.endedEarly);assert.equal(t.state.mock.results.reading.score,40);assert.equal(t.state.mock.results.listening.score,40);assert.ok(!node('#app').innerHTML.includes('Suggested corrected draft'));
assert.ok(storage.get('richmount-ielts-v1').includes('results'),'Completed earlier mock persists.');
assert.ok(!/speechSynthesis|SpeechSynthesisUtterance/.test(source),'Student routes never synthesize listening audio.');
t.state.name='<img src=x onerror=alert(1)>';context.location.hash='#home';t.render();assert.ok(!node('#app').innerHTML.includes('<img src=x'),'Learner-controlled text is escaped.');
console.log('Passed: content completeness, grammar rules, all route renderers, 40/40 marking, answer limits, saved submissions, timer expiry, uploaded mock navigation, saved-attempt migration, report generation and text escaping.');
console.log(`Reading: ${readWords} words · 40 questions. Listening: 40 questions.`);
