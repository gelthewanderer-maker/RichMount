import {automaticFeedbackHTML,automaticFeedbackCard,automaticSettingsHTML,automaticDraftHTML,feedbackDraftText,chatGPTReviewPrompt} from '../dist/automatic-feedback.js';
import {studentTestSession,fixturePassword} from './student-login.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createClassroomServer} from '../server/index.mjs';
import {codeHash,hashPassword} from '../server/security.mjs';
import {findMaterial,studentMaterialView,materialCatalog,makeMaterialTicket,readMaterialTicket} from '../server/materials.mjs';
import {lessonMaterials} from '../dist/materials-data.js';
import {bookReaderHTML} from '../dist/book-reader.js';
import {materialsPage,studentDocumentHTML} from '../dist/materials.js';
import {teacherPages,teacherTabs,teacherCourseViews,teacherLocation} from '../dist/navigation.js';
import {createStudentSync} from '../dist/classroom.js';

const teacherCatalog=materialCatalog('teacher'),studentCatalog=materialCatalog('student');
assert.deepEqual(studentCatalog,lessonMaterials,'The student catalogue matches the server permissions.');
const all=teacherCatalog.lessons.flatMap(lesson=>lesson.files),studentFiles=studentCatalog.lessons.flatMap(lesson=>lesson.files);
assert.equal(all.length,251);assert.equal(new Set(all.map(file=>file.id)).size,251);assert.equal(studentFiles.length,165);
assert.equal(studentFiles.filter(file=>file.kind==='audio').length,82);
assert.ok(!studentFiles.some(file=>['slides','answer-key'].includes(file.kind)||file.filename.endsWith('.pptx')));
assert.ok(!readFileSync(new URL('../dist/materials-data.js',import.meta.url),'utf8').includes('TG.pptx'));
assert.ok(!studentCatalog.lessons.some(lesson=>lesson.skill==='listening'&&[7,16,36].includes(lesson.day)),'Only uploaded days are offered.');
assert.ok(studentCatalog.lessons.find(lesson=>lesson.day===20).files.some(file=>file.id==='practice-test-4-audio'));
assert.ok(studentCatalog.lessons.find(lesson=>lesson.day===21).files.some(file=>file.id==='lesson17-lp01'));
assert.equal(all.filter(f=>f.kind==='answer-key').length,10);assert.equal(studentCatalog.lessons.filter(l=>l.type==='exam').length,4);
assert.ok(materialsPage({isConnected:false}).includes('Join your class'));
assert.ok(materialsPage({isConnected:true}).includes('Open audio player'));
const listeningCatalog={...lessonMaterials,lessons:lessonMaterials.lessons.filter(l=>l.skill==='listening'&&['practice','exam'].includes(l.type))};
const listeningPage=materialsPage({catalog:listeningCatalog,isConnected:true,listeningOnly:true});
assert.ok(listeningPage.includes('Your listening tests, ready to play.'));
assert.equal(listeningCatalog.lessons.length,10);
assert.ok(listeningPage.includes('Practice Test 8.mp3'));assert.ok(listeningPage.includes('Diagnostic Exam'));assert.ok(!listeningPage.includes('lesson17-lp01'));
assert.ok(!materialsPage({isConnected:true}).includes('Teacher slides'));
assert.ok(materialsPage({isConnected:true}).includes('materialSkill'),'Learners can select Reading or Listening.');
assert.ok(!listeningPage.includes('reading-day'),'Listening keeps only its matching course papers.');
assert.ok(materialsPage({role:'teacher',catalog:teacherCatalog}).includes('Teacher only'));
assert.ok(materialsPage({role:'teacher',catalog:teacherCatalog}).includes('Download ↓'));
assert.ok(!materialsPage({role:'teacher',catalog:teacherCatalog}).includes('Student access'),'Per-file access controls are removed.');
assert.ok(!materialsPage({isConnected:true}).includes('data-material-open="download"'),'Students have viewing and playback actions only.');
assert.ok(materialsPage({isConnected:true}).includes('Read document'));
assert.ok(materialsPage({catalog:{lessons:[{day:1,title:'<img src=x onerror=alert(1)>',files:[]}],version:'test'}}).includes('&lt;img'));

// Exercise the real delegated UI handlers without opening a preview server.
const listeners={},player={innerHTML:''},status={textContent:'',replaceChildren(){}},row={isConnected:true,querySelector:selector=>selector==='[data-material-player]'?player:status};
const app={addEventListener:(event,handler)=>listeners[event]=handler,querySelectorAll:()=>[]};
const opened=[],links=[],requests=[];
const context={bookReaderHTML,mountBookReader(){},destroyBookReader(){},resizeBookReader(){},stopBookReaders(){},openFloatingAudio:()=>false,floatingAudioOwner:()=>"",moveFloatingAudioHome(){},placeFloatingAudio(){},stopSlideReaders(){},destroySlideReader(){},mountSlideReader(){},slidesDocumentHTML:()=>'',lessonMaterials,URL,console,document:{querySelector:selector=>selector==='#app'?app:null,querySelectorAll:()=>[],createElement:()=>{const link={click(){links.push({...this});}};return link;}},window:{open(){const tab={opener:'parent',document:{body:{}},location:{replace:url=>opened.push(url)},close(){this.closed=true;}};return tab;}}};
vm.createContext(context);
const ui=readFileSync(new URL('../dist/materials.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
vm.runInContext(ui+'\nglobalThis.ui={initMaterials,stopMaterialsMedia};',context);
let sourceOrigin='https://richmount-ielts-classroom.onrender.com';
context.ui.initMaterials({isConnected:()=>true,apiBase:()=> 'https://richmount-ielts-classroom.onrender.com',studentAccess:async id=>{requests.push(id);return {url:sourceOrigin+'/api/materials/file/'+id+'?ticket=test-file-ticket',kind:id.includes('video')?'video':'audio',title:'Lesson recording',filename:'recording.mp3'};},teacherAccess:()=>{throw new Error('Unexpected teacher access');}});
function uiButton(mode,id,role='student'){return {textContent:'Open',disabled:false,dataset:{materialOpen:mode,materialId:id,materialRole:role},closest:()=>row};}
const playButton=uiButton('play','lesson02-lp01');await listeners.click({target:{closest:()=>playButton}});
assert.ok(player.innerHTML.includes('<audio controls preload="metadata"'));
assert.ok(player.innerHTML.includes('controlslist="nodownload"'));
assert.ok(!player.innerHTML.includes('autoplay'));assert.equal(playButton.hidden,true);assert.equal(requests[0],'lesson02-lp01');
const downloadButton=uiButton('download','lesson02-lp01');await listeners.click({target:{closest:()=>downloadButton}});
assert.equal(links.length,0,'Even a stale student download button cannot start a download.');
await listeners.click({target:{closest:()=>uiButton('view','day01-book')}});assert.equal(opened.length,0);assert.match(player.innerHTML,/<canvas/);assert.match(player.innerHTML,/data-book-action="zoom-in"/);assert.ok(!player.innerHTML.includes('<iframe'));assert.doesNotMatch(player.innerHTML,/data-book-(?:answers|choice|hotspots)/,'Lesson books do not render a test panel.');assert.ok(!player.innerHTML.includes('<a '),'Student PDF viewing stays in the page without a download or raw-file link.');
assert.match(player.innerHTML,/<dialog open/);assert.match(player.innerHTML,/Full-page view/);assert.match(player.innerHTML,/Minimize/);
const bookMarkup=studentDocumentHTML({url:'https://teacher.test/api/materials/file/book?ticket=view',title:'<img src=x onerror=alert(1)>'});assert.match(bookMarkup,/&lt;img/);assert.ok(!bookMarkup.includes('<img'),'Book titles cannot inject markup.');
// Resize the same reader, including the native dialog's Escape action. The PDF
// iframe and access ticket must survive every size change without another request.
{
const frame={src:'https://teacher.test/api/materials/file/book?ticket=view',page:12},body={hidden:false,frame},attributes={},focus=[];
const reader={dataset:{materialReaderView:'inline'},open:true,modal:false,removed:false,matches:s=>s==='.materials-reader',setAttribute:(key,value)=>{attributes[key]=value;},close(){this.open=false;this.modal=false;},show(){assert.equal(this.open,false);this.open=true;},showModal(){assert.equal(this.open,false);this.open=true;this.modal=true;},remove(){this.removed=true;},closest:s=>s==='[data-material-file]'?{querySelector:()=>({focus:()=>focus.push('source')})}:null};
const controls=Object.fromEntries(['minimize','expand'].map(action=>[action,{dataset:{materialReaderAction:action},textContent:'',attributes:{},setAttribute(key,value){this.attributes[key]=value;},closest:()=>reader,focus:()=>focus.push(action)}]));
reader.querySelector=s=>s==='[data-material-reader-body]'?body:s.includes('minimize')?controls.minimize:controls.expand;
const beforeResize=requests.length;
async function readerAction(action){const control=controls[action];await listeners.click({target:{closest:s=>s==='[data-material-reader-action]'?control:null}});}
await readerAction('minimize');assert.equal(body.hidden,true);assert.equal(controls.minimize.textContent,'Restore book');assert.equal(controls.minimize.attributes['aria-expanded'],'false');
await readerAction('minimize');assert.equal(body.hidden,false);assert.equal(reader.dataset.materialReaderView,'inline');
await readerAction('expand');assert.equal(reader.modal,true);assert.equal(attributes['aria-modal'],'true');assert.equal(controls.expand.textContent,'Smaller view');assert.equal(controls.expand.attributes['aria-pressed'],'true');
await readerAction('expand');assert.equal(reader.modal,false);assert.equal(reader.open,true);assert.equal(reader.dataset.materialReaderView,'inline');
await readerAction('expand');let escapePrevented=false;listeners.cancel({target:reader,preventDefault(){escapePrevented=true;}});assert.equal(escapePrevented,true);assert.equal(reader.open,true);assert.equal(reader.modal,false);assert.equal(reader.dataset.materialReaderView,'inline');assert.equal(focus.at(-1),'expand');
await readerAction('expand');await readerAction('minimize');assert.equal(reader.modal,false);assert.equal(body.hidden,true);assert.equal(reader.open,true);
await readerAction('expand');assert.equal(body.hidden,false);assert.equal(reader.modal,true,'A minimized book can open directly in full-page view.');
assert.equal(body.frame,frame);assert.equal(frame.page,12);assert.equal(requests.length,beforeResize,'Book size changes neither reload the PDF nor request a new ticket.');
listeners.cancel({target:{matches:()=>false},preventDefault(){throw new Error('Other dialogs must keep their own Escape behavior.');}});
const closeControl={hasAttribute:s=>s==='data-material-reader-close',closest:()=>reader};await listeners.click({target:{closest:s=>s==='[data-material-reader-close]'?closeControl:null}});assert.equal(reader.removed,true);assert.equal(reader.open,false);assert.equal(focus.at(-1),'source','Closing the book returns focus to its open button.');
}
player.innerHTML='';sourceOrigin='https://evil.test';await listeners.click({target:{closest:()=>uiButton('play','lesson02-lp01')}});assert.equal(player.innerHTML,'');assert.match(status.textContent,/could not be opened/,'The UI refuses media links to an unexpected origin.');

// Restore teacher sessions and open private materials directly, without joining
// a student class. Exercise the real dashboard, including refresh and retries.
const teacherListeners={},teacherRequests=[],teacherMemory=new Map();
let authenticated=true,failCatalog=false,holdCatalog=false,releaseCatalog;
const teacherHost='https://teacher.test';
const dashboard={addEventListener:(event,handler)=>teacherListeners[event]=handler};
const teacherContext={bookGradesHTML:()=>'<section>Grading sheets</section>',resetBookGrades(){},resetGuidedLessons(){},refreshGuidedLessons:async()=>{},teacherPages,teacherTabs,teacherCourseViews,teacherLocation,loadTeacherPreview:async()=>{},CLASSROOM_API:teacherHost,materialsPage,initClassAudio(){},resetTeacherCourse(){},loadTeacherCourse:async()=>{},teacherCourseHTML:()=>'',teacherLibraryHTML:()=>'',studentAudioHTML:()=>'',studentLibraryHTML:()=>'',AbortSignal,URLSearchParams,console,location:{origin:teacherHost,hash:'#teacher/resources'},localStorage:{getItem:k=>teacherMemory.get(k)||null,setItem:(k,v)=>teacherMemory.set(k,v)},window:{addEventListener(){},scrollTo(){}},document:{querySelector:selector=>selector==='#app'?dashboard:null},fetch:async(url,init)=>{
  const path=new URL(url).pathname;teacherRequests.push({path,credentials:init.credentials,authorization:init.headers?.Authorization});
  if(path.startsWith('/api/teacher/')&&path!=='/api/teacher/login'&&!authenticated)return new Response(JSON.stringify({error:'Teacher sign-in required.'}),{status:401});
  if(path==='/api/teacher/login'){authenticated=true;return Response.json({signedIn:true});}
  if(path==='/api/teacher/logout'){authenticated=false;return Response.json({signedOut:true});}
  if(path==='/api/teacher/session')return Response.json({signedIn:true});
  if(path==='/api/teacher/summary')return Response.json({students:0,submissions:0,awaitingReview:0});
  if(path==='/api/teacher/students')return Response.json({students:[]});
  if(path==='/api/teacher/submissions')return Response.json({submissions:[],total:0});
  if(path==='/api/teacher/materials'){
    if(holdCatalog)await new Promise(resolve=>{releaseCatalog=resolve;});
    return failCatalog?new Response(JSON.stringify({error:'Temporary materials connection error.'}),{status:503}):Response.json(teacherCatalog);
  }
  const fileAccess=path.match(/^\/api\/teacher\/materials\/([^/]+)\/access$/);
  if(fileAccess){const file=findMaterial(fileAccess[1]);return Response.json({...file,url:teacherHost+'/api/materials/file/'+file.id+'?ticket=teacher-session-file'});}
  throw new Error('Unexpected dashboard request: '+path);
}};
Object.assign(teacherContext,{automaticFeedbackHTML,automaticFeedbackCard,automaticSettingsHTML,automaticDraftHTML,feedbackDraftText,chatGPTReviewPrompt});vm.createContext(teacherContext);
const classroomUI=readFileSync(new URL('../dist/classroom.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
vm.runInContext(classroomUI+'\nglobalThis.dashboard={initClassroom,teacherPage,isTeacherSite,teacherMaterialAccess,materialsFlight:()=>materialsFlight};',teacherContext);
const teacherUI=teacherContext.dashboard;
teacherUI.initClassroom({teacherContent:view=>'Private teacher '+view,onChange:()=>{dashboard.innerHTML=teacherUI.teacherPage();}});
for(let i=0;i<100&&!teacherUI.materialsFlight();i++)await new Promise(resolve=>setTimeout(resolve,1));
await teacherUI.materialsFlight();
assert.ok(teacherUI.isTeacherSite());
assert.match(dashboard.innerHTML,/Learning Materials/);assert.match(dashboard.innerHTML,/Teacher only/);assert.match(dashboard.innerHTML,/data-material-role="teacher"/);
assert.ok(!dashboard.innerHTML.includes('Join your class'),'Teacher materials never request a student code.');
assert.ok(teacherRequests.every(r=>r.credentials==='include'&&!r.authorization),'Teacher requests use their session, not a student code.');
async function teacherAction(action,extra={}){await teacherListeners.click({target:{closest:()=>({dataset:{cloudAction:action,...extra}})}});}
await teacherAction('teacher-view',{view:'listening'});
assert.equal(teacherContext.location.hash,'teacher/listening');
dashboard.innerHTML=teacherUI.teacherPage();
assert.match(dashboard.innerHTML,/Listening Lab/);assert.match(dashboard.innerHTML,/Your listening tests, ready to play/);
assert.match(dashboard.innerHTML,/Practice Test 1.mp3/);assert.match(dashboard.innerHTML,/Practice Test 8.mp3/);assert.match(dashboard.innerHTML,/Diagnostic Exam/);assert.match(dashboard.innerHTML,/Final Exam/);
assert.match(dashboard.innerHTML,/data-material-role="teacher"/);assert.ok(!dashboard.innerHTML.includes('Join your class'));assert.ok(!dashboard.innerHTML.includes('reading-day'));
player.innerHTML='';
context.ui.initMaterials({isConnected:()=>false,apiBase:()=>teacherHost,teacherAccess:teacherUI.teacherMaterialAccess,studentAccess:()=>{throw new Error('Teachers must never request a student class code.');}});
await listeners.click({target:{closest:()=>uiButton('play','practice-test-1-audio','teacher')}});
assert.match(player.innerHTML,/<audio controls/);assert.match(player.innerHTML,/teacher-session-file/);
await listeners.click({target:{closest:()=>uiButton('view','day05-book','teacher')}});assert.equal(opened.length,0);assert.match(player.innerHTML,/<canvas/,'Teacher books also stay inside the app.');
const inlineTeacherBook=uiButton('view','day05-book','teacher');inlineTeacherBook.dataset.materialInline='true';const beforeInline=opened.length;await listeners.click({target:{closest:()=>inlineTeacherBook}});assert.equal(opened.length,beforeInline);assert.match(player.innerHTML,/<dialog open/);assert.match(player.innerHTML,/<canvas/,'Guided teacher books stay in the discussion page with signed-in teacher access.');
await listeners.click({target:{closest:()=>uiButton('download','day05-book','teacher')}});assert.equal(new URL(links[0].href).searchParams.get('download'),'1');assert.equal(links[0].download,findMaterial('day05-book').filename);
assert.ok(teacherRequests.some(r=>r.path==='/api/teacher/materials/practice-test-1-audio/access'&&r.credentials==='include'&&!r.authorization));
const initialLoads=teacherRequests.filter(r=>r.path==='/api/teacher/materials').length;
await teacherAction('teacher-refresh');assert.equal(teacherRequests.filter(r=>r.path==='/api/teacher/materials').length,initialLoads+1,'Dashboard refresh reloads teaching materials.');
for(const view of Object.keys(teacherPages)){
  teacherContext.location.hash='#teacher/'+view;dashboard.innerHTML=teacherUI.teacherPage();
  assert.ok(!dashboard.innerHTML.includes('Join your class'),view+' has teacher access without a class code');
  if(['lessons','writing','speaking','guides','vocabulary','overview'].includes(view))assert.ok(dashboard.innerHTML.includes('Private teacher '+view));
}
teacherContext.location.hash='#teacher/reading';dashboard.innerHTML=teacherUI.teacherPage();assert.match(dashboard.innerHTML,/reading-day01-teacher-slides/);assert.ok(!dashboard.innerHTML.includes('practice-test-1-audio'),'Reading uses its teacher resource catalog.');
await teacherAction('teacher-logout');assert.match(dashboard.innerHTML,/teacherLoginForm/);assert.ok(!dashboard.innerHTML.includes('Teacher only'));
for(const view of Object.keys(teacherPages)){teacherContext.location.hash='#teacher/'+view;const page=teacherUI.teacherPage();assert.match(page,/teacherLoginForm/);assert.ok(!page.includes('Private teacher '+view),'Signed-out teachers cannot bypass sign-in through '+view);}
teacherContext.location.hash='#teacher/listening';
failCatalog=true;
await teacherListeners.submit({preventDefault(){},target:{id:'teacherLoginForm',querySelector:selector=>selector==='button'?{disabled:false}:{value:'testing-only-dashboard-password'},dataset:{}}});
await teacherUI.materialsFlight();assert.match(dashboard.innerHTML,/Try again/);assert.match(dashboard.innerHTML,/Temporary materials connection error/);assert.ok(!dashboard.innerHTML.includes('Opening your lesson resources'),'A failed load shows a retry, not an endless loading message.');
failCatalog=false;await teacherAction('teacher-materials-retry');assert.match(dashboard.innerHTML,/Teacher only/);
holdCatalog=true;const delayed=teacherAction('teacher-materials-retry');
for(let i=0;i<100&&!releaseCatalog;i++)await new Promise(resolve=>setTimeout(resolve,1));assert.ok(releaseCatalog);
await teacherAction('teacher-logout');releaseCatalog();await delayed;
assert.match(dashboard.innerHTML,/teacherLoginForm/);assert.ok(!dashboard.innerHTML.includes('Teacher only'),'A delayed load cannot restore private files after sign-out.');
teacherContext.location.hash='#teacher/listening';teacherContext.location.origin='https://student.test';
assert.ok(!teacherUI.isTeacherSite());assert.ok(teacherUI.teacherPage().includes(teacherHost+'/#teacher/listening'),'Student-host links keep the requested teacher Listening Lab destination.');
for(const view of Object.keys(teacherPages)){
  teacherContext.location.hash='#teacher/'+view;const page=teacherUI.teacherPage();assert.ok(page.includes(teacherHost+'/#teacher/'+view));assert.ok(!page.includes('Private teacher '+view),'Student-host visits cannot render a teacher section.');
}
teacherContext.location.hash='#teacher/resources';assert.ok(teacherUI.teacherPage().includes(teacherHost+'/#teacher/resources'),'Student-host links keep the requested teacher materials destination.');

const password='Testing-only-materials-password-1',nextPassword='Testing-only-materials-password-2',hash=await hashPassword(password);
const student={id:randomUUID(),name:'Media learner',active:1},code='RM-'+('CD'.repeat(12)),settings=new Map();
const config={appOrigin:'https://teacher.test',allowedOrigins:['https://richmount-ielts.onrender.com'],passwordHash:hash,sessionSecret:'only-a-test-session-secret-'.repeat(3),encryptionKey:'af'.repeat(32),storeUrl:'https://private-store.test',siteToken:'only-a-test-sites-token',storeKey:'only-a-test-store-key'};
const book=findMaterial('day01-book'),slide=findMaterial('day01-teacher-slides');
settings.set('materials:'+book.id,JSON.stringify({mode:'private',studentIds:[]}));
settings.set('materials:'+slide.id,JSON.stringify({mode:'class',studentIds:[]}));
let upstreamMode='normal',bridgeCalls=0,credentials=null;student.code_hash=codeHash(code,config.encryptionKey);
config.store=async(op,params={})=>{
  if(op==='students:credentials')return {credentials};
  if(op==='students:password-set'){credentials={password_hash:params.passwordHash,session_version:params.version};return {saved:true};}
  if(op==='settings:get')return {setting:settings.has(params.key)?{value:settings.get(params.key)}:null};
  if(op==='settings:set'){settings.set(params.key,params.value);return {saved:true};}
  if(op==='students:by-code')return {student:params.codeHash===codeHash(code,config.encryptionKey)&&student.active===1?student:null};
  if(op==='students:by-id')return {student:params.id===student.id?student:null};
  throw new Error('Unexpected test datastore operation');
};
config.materialFetch=async(url,init)=>{
  bridgeCalls++;
  assert.ok(url.startsWith('https://private-store.test/api/materials/'));
  assert.equal(init.headers.Authorization,'Bearer '+config.storeKey);
  assert.equal(init.headers['OAI-Sites-Authorization'],'Bearer '+config.siteToken);
  assert.equal(init.redirect,'error');
  const file=findMaterial(url.split('/').pop());assert.ok(file);
  if(upstreamMode==='missing')return new Response(null,{status:404});
  if(init.headers.Range==='bytes=999999999-')return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+file.size}});
  const headers={'Content-Type':file.mime,'Content-Length':String(file.size),'X-Material-SHA256':upstreamMode==='corrupt'?'bad-checksum':file.sha256,ETag:'"test-media"'};
  if(init.method==='HEAD')return new Response(null,{headers});
  const bytes=Buffer.alloc(file.size,37);
  if(init.headers.Range==='bytes=10-19'){headers['Content-Length']='10';headers['Content-Range']=`bytes 10-19/${file.size}`;return new Response(bytes.subarray(10,20),{status:206,headers});}
  return new Response(bytes,{headers});
};

const ticket=makeMaterialTicket({id:book.id,role:'student',subject:student.id,secret:config.sessionSecret,now:1000000}).ticket;
assert.ok(readMaterialTicket(ticket,book.id,config.sessionSecret,1000000));
assert.equal(readMaterialTicket(ticket,slide.id,config.sessionSecret,1000000),null,'Tickets are bound to a single file.');
assert.equal(readMaterialTicket(ticket,book.id,config.sessionSecret,1000000+3*60*60*1000),null,'Expired tickets are rejected.');
const [body,sig]=ticket.split('.'),forged=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(body,'base64url')),role:'teacher'})).toString('base64url')+'.'+sig;
assert.equal(readMaterialTicket(forged,book.id,config.sessionSecret,1000000),null,'Changing a ticket role invalidates the signature.');
assert.throws(()=>makeMaterialTicket({id:slide.id,role:'student',subject:student.id,secret:config.sessionSecret}),/not found/);

const server=createClassroomServer(config);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
async function request(route,{method='GET',code:classCode,cookie='',range,json,origin='https://richmount-ielts.onrender.com'}={}){
  const headers={Origin:origin};if(classCode)headers.Authorization='Bearer '+await studentTestSession(base,classCode);if(cookie)headers.Cookie=cookie;if(range)headers.Range=range;if(json!==undefined)headers['Content-Type']='application/json';
  return fetch(base+route,{method,headers,body:json===undefined?undefined:JSON.stringify(json)});
}
const path=url=>{const parsed=new URL(url);assert.equal(parsed.origin,config.appOrigin);return parsed.pathname+parsed.search;};
try{
  assert.equal((await request('/api/student/materials/'+book.id+'/access')).status,401);
  assert.equal((await request('/api/student/materials/'+slide.id+'/access',{code})).status,404,'Student codes cannot mint links to slides.');
  assert.equal((await request('/api/teacher/materials',{code})).status,401);
  assert.equal((await request('/api/materials/file/'+book.id)).status,401);
  const catalogue=await request('/api/student/materials',{code});assert.equal(catalogue.status,200);assert.deepEqual(await catalogue.json(),lessonMaterials);
  for(const file of studentFiles){const view=studentMaterialView(file.id);assert.doesNotThrow(()=>makeMaterialTicket({id:view.id,role:'student',subject:student.id,secret:config.sessionSecret}),file.id+' supports student viewing');}
  for(const file of studentFiles.filter((f,i)=>i%13===0||f.filename.endsWith('.docx')||f.kind==='video')){
    const response=await request('/api/student/materials/'+file.id+'/access',{code});assert.equal(response.status,200,file.id+' is automatically available');
    const view=await response.json();
    if(file.filename.endsWith('.docx')){assert.equal(findMaterial(view.id).mime,'application/pdf');assert.notEqual(view.id,file.id,'Editable documents use their existing PDF copy.');}
  }
  const accessResponse=await request('/api/student/materials/'+book.id+'/access',{code});assert.equal(accessResponse.status,200);const access=await accessResponse.json();
  assert.ok(!JSON.stringify(access).includes(code));assert.ok(!JSON.stringify(access).includes('private-store'));
  const full=await request(path(access.url));assert.equal(full.status,200);assert.equal((await full.arrayBuffer()).byteLength,book.size);assert.equal(full.headers.get('content-type'),'application/pdf');
  assert.match(full.headers.get('content-disposition'),/^inline/);assert.match(full.headers.get('cache-control'),/no-store/);
  assert.equal(full.headers.get('x-frame-options'),null);assert.match(full.headers.get('content-security-policy'),/frame-ancestors https:\/\/teacher.test https:\/\/richmount-ielts.onrender.com/,'PDFs can be read inside the trusted classroom pages.');
  const range=await request(path(access.url),{range:'bytes=10-19'});assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),`bytes 10-19/${book.size}`);assert.deepEqual(Buffer.from(await range.arrayBuffer()),Buffer.alloc(10,37));
  const head=await request(path(access.url),{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(book.size));assert.equal(await head.text(),'');
  const invalid=await request(path(access.url),{range:'bytes=999999999-'});assert.equal(invalid.status,416);assert.equal(invalid.headers.get('content-range'),'bytes */'+book.size);
  const beforeDownload=bridgeCalls;
  for(const method of ['GET','HEAD'])assert.equal((await request(path(access.url)+'&download=1',{method})).status,403,'Student download requests are rejected.');
  assert.equal(bridgeCalls,beforeDownload,'Blocked downloads never reach private storage.');
  const mismatch=await request(path(access.url).replace('/'+book.id+'?','/'+slide.id+'?'));assert.equal(mismatch.status,401);
  const before=bridgeCalls;student.active=0;assert.equal((await request(path(access.url))).status,401);assert.equal(bridgeCalls,before,'An archived student cannot keep using a file ticket.');student.active=1;

  const login=await request('/api/teacher/login',{method:'POST',origin:config.appOrigin,json:{password}});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const teacherList=await request('/api/teacher/materials',{cookie,origin:config.appOrigin});assert.equal(teacherList.status,200);assert.equal((await teacherList.json()).lessons.flatMap(lesson=>lesson.files).filter(file=>file.kind==='slides').length,76);
  const teacherAccess=await request('/api/teacher/materials/'+slide.id+'/access',{cookie,origin:config.appOrigin});assert.equal(teacherAccess.status,200);const teacherFile=await teacherAccess.json();
  assert.equal((await request(path(teacherFile.url),{origin:config.appOrigin})).status,401,'Teacher file links also require the signed-in teacher session.');
  const teacherHead=await request(path(teacherFile.url),{method:'HEAD',cookie,origin:config.appOrigin});assert.equal(teacherHead.status,200);assert.match(teacherHead.headers.get('content-disposition'),/^attachment/);
  const teacherBook=await (await request('/api/teacher/materials/'+book.id+'/access',{cookie,origin:config.appOrigin})).json();
  const teacherBookHead=await request(path(teacherBook.url),{method:'HEAD',cookie,origin:config.appOrigin});
  assert.equal(teacherBookHead.status,200);
  assert.equal(teacherBookHead.headers.get('x-frame-options'),null,'A signed-in teacher can read a student book inside the guided lesson.');
  assert.equal(teacherBookHead.headers.get('content-security-policy'),'frame-ancestors '+config.appOrigin+';','Teacher documents embed only in the teacher dashboard.');
  const teacherBookRange=await request(path(teacherBook.url),{range:'bytes=10-19',cookie,origin:config.appOrigin});
  assert.equal(teacherBookRange.status,206);assert.equal(teacherBookRange.headers.get('x-frame-options'),null);assert.equal((await teacherBookRange.arrayBuffer()).byteLength,10);
  const key=all.find(file=>file.kind==='answer-key'&&file.mime==='application/pdf');
  const teacherKey=await (await request('/api/teacher/materials/'+key.id+'/access',{cookie,origin:config.appOrigin})).json();
  const teacherKeyHead=await request(path(teacherKey.url),{method:'HEAD',cookie,origin:config.appOrigin});
  assert.equal(teacherKeyHead.status,200);assert.equal(teacherKeyHead.headers.get('x-frame-options'),null);assert.equal(teacherKeyHead.headers.get('content-security-policy'),'frame-ancestors '+config.appOrigin+';');
  const signedOutBook=await request(path(teacherBook.url),{method:'HEAD',origin:config.appOrigin});
  assert.equal(signedOutBook.status,401);assert.equal(signedOutBook.headers.get('x-frame-options'),'DENY','Embedding support never bypasses teacher sign-in.');
  const teacherDownload=await request(path(teacherBook.url)+'&download=1',{method:'HEAD',cookie,origin:config.appOrigin});assert.equal(teacherDownload.status,200);assert.match(teacherDownload.headers.get('content-disposition'),/^attachment/);
  assert.equal(teacherDownload.headers.get('x-frame-options'),'DENY','Downloads keep the default frame restriction.');
  assert.equal((await request('/api/teacher/materials/'+book.id+'/sharing',{method:'PATCH',cookie,origin:config.appOrigin,json:{mode:'private',studentIds:[]}})).status,404,'Removed access controls are no longer available through the API.');
  const audio=findMaterial('practice-test-1-audio');
  const teacherAudio=await request('/api/teacher/materials/'+audio.id+'/access',{cookie,origin:config.appOrigin});assert.equal(teacherAudio.status,200);const audioFile=await teacherAudio.json();
  const audioRange=await request(path(audioFile.url),{range:'bytes=10-19',cookie,origin:config.appOrigin});assert.equal(audioRange.status,206);assert.equal(audioRange.headers.get('content-type'),'audio/mpeg');assert.equal(audioRange.headers.get('content-range'),`bytes 10-19/${audio.size}`);assert.equal((await audioRange.arrayBuffer()).byteLength,10);
  assert.equal((await request(path(audioFile.url),{origin:config.appOrigin})).status,401,'Listening playback requires the teacher session, not a student code.');
  const studentAudio=await (await request('/api/student/materials/'+audio.id+'/access',{code})).json();
  const studentAudioRange=await request(path(studentAudio.url),{range:'bytes=10-19'});assert.equal(studentAudioRange.status,206);assert.match(studentAudioRange.headers.get('content-disposition'),/^inline/);await studentAudioRange.body.cancel();
  assert.equal((await request(path(studentAudio.url)+'&download=1')).status,403,'Class recording downloads are rejected for students.');
  const change=await request('/api/teacher/password',{method:'POST',cookie,origin:config.appOrigin,json:{currentPassword:password,newPassword:nextPassword}});assert.equal(change.status,200);
  assert.equal((await request(path(teacherFile.url),{origin:config.appOrigin})).status,401,'Changing the teacher password invalidates earlier teacher file links.');

  upstreamMode='missing';assert.equal((await request(path(access.url))).status,404);upstreamMode='corrupt';assert.equal((await request(path(access.url))).status,503);upstreamMode='normal';
  const memory=new Map(),client=createStudentSync({storage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)},apiBase:base,fetcher:fetch});
  await client.join(code,fixturePassword);assert.equal((await client.fileAccess(book.id)).id,book.id,'The student client uses its class code to request file access.');
  const preflight=await request('/api/materials/file/'+book.id,{method:'OPTIONS'});assert.equal(preflight.status,204);assert.match(preflight.headers.get('access-control-allow-headers'),/Range/);assert.match(preflight.headers.get('access-control-allow-methods'),/HEAD/);
  console.log('Passed: all 251 files, automatic access to 165 student resources, inline PDF copies, student download blocking, teacher downloads and Listening Lab, private guides, byte-range playback, expiry and inactive class codes.');
}finally{await new Promise(resolve=>server.close(resolve));}
