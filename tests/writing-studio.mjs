import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID,webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {createClassroomServer} from '../server/index.mjs';
import {storeOperation} from '../storage/classroom-store.js';
import {hashPassword} from '../server/security.mjs';
import {studentTestSession} from './student-login.mjs';
import {inferWritingFormat} from '../dist/writing-studio.js';

assert.equal(inferWritingFormat({table:{},prompt:'Compare the data.'}),'data');
assert.equal(inferWritingFormat({type:'Task 1',prompt:'The maps show changes.'}),'maps');
assert.equal(inferWritingFormat({kind:'academic-writing-task1',prompt:'The process shows stages.'}),'process');
assert.equal(inferWritingFormat({prompt:'Discuss both views and give your opinion.'}),'discussion');
assert.equal(inferWritingFormat({prompt:'Do the advantages outweigh the disadvantages?'}),'advantages');
assert.equal(inferWritingFormat({prompt:'What are the causes? Suggest solutions.'}),'problems');
assert.equal(inferWritingFormat({type:'General Training letter'}),'letter');

const native=new DatabaseSync(':memory:');
for(const file of ['0000_classroom.sql','0001_audio.sql','0002_writing_drafts.sql'])native.exec(readFileSync(new URL('../storage/'+file,import.meta.url),'utf8'));
const db={prepare(sql){const s=native.prepare(sql);let args=[];return {bind(...v){args=v;return this;},async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){return s.run(...args);}};},async batch(ss){return Promise.all(ss.map(s=>s.run()));}};
const config={appOrigin:'https://teacher.test',passwordHash:await hashPassword('test-only-draft-password'),sessionSecret:'test-only-drafts-session'.repeat(4),encryptionKey:'de'.repeat(32),store:(op,p)=>storeOperation(db,op,p)};
const server=createClassroomServer(config);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const login=await fetch(base+'/api/teacher/login',{method:'POST',headers:{Origin:config.appOrigin,'Content-Type':'application/json'},body:JSON.stringify({password:'test-only-draft-password'})}),cookie=login.headers.get('set-cookie').split(';')[0];
await fetch(base+'/api/teacher/students',{method:'POST',headers:{Origin:config.appOrigin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({names:['Draft A','Draft B']})});
const roster=await(await fetch(base+'/api/teacher/students',{headers:{Cookie:cookie}})).json();
const [a,b]=roster.students,tokens=await Promise.all([a,b].map(s=>studentTestSession(base,s.code)));
const request=async(path,{method='GET',data,who=0}={})=>{const r=await fetch(base+path,{method,headers:{...(who===null?{}:{Authorization:'Bearer '+tokens[who]}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,value:await r.json()};};
try{
 const key='homework:week1-writing-hw@2026-10-05_s1_w1',deviceId=randomUUID(),draft={key,deviceId,revision:100,text:'My own first paragraph.',plan:{focus:'My position',point1:'Reason → example',check0:true}};
 assert.equal((await request('/api/student/writing-drafts',{method:'POST',data:draft,who:null})).status,401);
 assert.equal((await request('/api/student/writing-drafts',{method:'POST',data:{...draft,studentId:b.id}})).status,200,'The server uses the authenticated owner, never a supplied student ID.');
 assert.equal((await request('/api/student/writing-drafts?key='+encodeURIComponent(key),{who:1})).value.drafts.length,0,'A second learner cannot retrieve the first learner’s draft.');
 assert.equal((await request('/api/student/writing-drafts',{method:'POST',data:draft})).status,200,'The same save can be retried without duplicating or rejecting it.');
 assert.equal((await request('/api/student/writing-drafts',{method:'POST',data:{...draft,text:'Conflicting same revision'}})).status,409);
 assert.equal((await request('/api/student/writing-drafts',{method:'POST',data:{...draft,revision:101,text:'My improved paragraph.'}})).status,200);
 assert.equal((await request('/api/student/writing-drafts',{method:'POST',data:{...draft,revision:99,text:'Delayed older request'}})).status,409,'An out-of-order request cannot overwrite newer writing.');
 let list=(await request('/api/student/writing-drafts?key='+encodeURIComponent(key))).value.drafts;
 assert.equal(list[0].text,'My improved paragraph.');assert.equal(list[0].previous.text,draft.text);assert.equal(list[0].plan.point1,'Reason → example');
 assert.equal((await request('/api/student/writing-drafts',{method:'POST',data:{...draft,deviceId:randomUUID(),revision:1,text:'A separate device copy'}})).status,200);
 list=(await request('/api/student/writing-drafts?key='+encodeURIComponent(key))).value.drafts;assert.equal(list.length,2,'Device copies are retained independently.');
 assert.equal((await request('/api/student/writing-drafts',{method:'POST',data:{...draft,key:"' OR 1=1 --"}})).status,400);
 assert.equal((await request('/api/student/writing-drafts',{method:'POST',data:{...draft,plan:{point1:'x'.repeat(2001)}}})).status,400);
 assert.equal((await request('/api/student/writing-drafts',{method:'POST',data:{...draft,plan:{unknown:'injected'}}})).status,400);
 assert.equal((await request('/api/student/writing-drafts',{method:'POST',data:{...draft,text:'x'.repeat(30001)}})).status,400);
 assert.equal((await request('/api/student/writing-drafts?key=practice:transport')).value.drafts.length,0,'Another activity stays separate.');
 assert.equal(native.prepare('SELECT COUNT(*) AS n FROM classroom_submissions').get().n,0,'Autosave never creates or submits assessed homework.');
}finally{await new Promise(r=>server.close(r));native.close();}

function browser(memory=new Map()){
 const listeners={},windowListeners={},inputs=new Map(),toasts=[];let user='learner-a',failStorage=false,offline=true,cloudSaves=0;
 const storage={getItem:k=>memory.get(k)||null,setItem(k,v){if(failStorage)throw new Error('Quota');memory.set(k,v);}};
 const doc={hidden:false,addEventListener(type,fn){(listeners[type]??=[]).push(fn);},querySelectorAll(selector){if(selector==='[data-writing-draft-key]')return [...inputs.values()];return [];},getElementById:id=>inputs.get(id),createElement:()=>({click(){}})};
 const context={console,crypto:webcrypto,Date,Map,Set,JSON,URL,Blob,Event,setTimeout:()=>0,clearTimeout(){},setInterval(){},document:doc,window:{addEventListener(type,fn){(windowListeners[type]??=[]).push(fn);}},globalThis:{}};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('../dist/writing-studio.js',import.meta.url),'utf8').replace(/^export /gm,'')+'\nglobalThis.test={savedWritingText,captureWritingDraft,writingGuideHTML,draftToolsHTML,initWritingStudio,flush,read,save,statuses:()=>statuses,recoveries:()=>recoveries};',context);
 const t=context.globalThis.test;
 t.initWritingStudio({studentId:()=>user,storage,toast:m=>toasts.push(m),render(){},request:async(path,init)=>{if(offline)throw new Error('Offline');if(init){cloudSaves++;const r=JSON.parse(init.body);return {revision:r.revision,saved:true};}return {drafts:[]};}});
 const emit=async(type,e)=>{for(const fn of listeners[type]||[])await fn(e);};
 const input=(id,key)=>{const n={id,value:'',dataset:{writingDraftKey:key},matches:()=>true,dispatchEvent(){void emit('input',{target:n});}};inputs.set(id,n);return n;};
 return {t,emit,input,memory,storage,toasts,context,windowListeners,user:v=>{user=v;},quota:v=>{failStorage=v;},offline:v=>{offline=v;},cloudSaves:()=>cloudSaves};
}
const one=browser(),key='practice:pollution',input=one.input('essay',key);input.value='My original writing.';
await one.emit('input',{target:input});assert.equal(one.t.savedWritingText(key),'My original writing.','Keystrokes save immediately before navigation.');
one.t.writingGuideHTML({min:180,max:220,prompt:'Discuss both views.'},{key,inputId:'essay',text:input.value});
await one.emit('input',{target:{dataset:{writingKey:key,writingPlan:'point1'},value:'Reason → explanation → example'}});
assert.equal(one.t.read(key).text,input.value,'Planning does not erase an existing response.');assert.equal(one.t.read(key).plan.point1,'Reason → explanation → example');
await one.t.flush();assert.ok(one.t.statuses().get(key).cloudError);assert.equal(one.t.savedWritingText(key),input.value,'A failed network save retains device writing.');
const refreshed=browser(one.memory);assert.equal(refreshed.t.savedWritingText(key,'an older legacy draft'),input.value,'A refresh or app update restores the new draft.');assert.equal(refreshed.t.read(key).plan.point1,'Reason → explanation → example');
refreshed.user('learner-b');assert.equal(refreshed.t.savedWritingText(key,'B own fallback'),'B own fallback');refreshed.user('learner-a');assert.equal(refreshed.t.savedWritingText(key),input.value,'Account switches retain private per-learner drafts.');
refreshed.offline(false);await refreshed.t.flush();assert.equal(refreshed.cloudSaves(),1,'An unsynced draft retries after reopening without requiring another edit.');
one.t.save(key,'My second version.',undefined,true);assert.equal(one.t.read(key).snapshots[0].text,'My original writing.');
input.value='My latest work before restoring.';await one.emit('input',{target:input});
const button={dataset:{writingAction:'recover',writingKey:key,writingInput:'essay'}};await one.emit('click',{target:{closest:()=>button}});assert.ok(one.t.recoveries().get(key).length>=2);
button.dataset.writingAction='restore';button.dataset.writingCopy='1';await one.emit('click',{target:{closest:()=>button}});assert.ok(one.t.read(key).snapshots.some(s=>s.text==='My latest work before restoring.'),'Restoring preserves the writing that was replaced.');
const markup=one.t.writingGuideHTML({min:180,max:220,prompt:'Discuss both views.'},{key:'practice:empty',inputId:'safe',text:'<script>alert(1)</script>'});assert.match(markup,/180–220/);assert.match(markup,/250 words/);assert.match(markup,/Official IELTS/);assert.ok(!markup.includes('<script>'));
const textOnly=one.t.savedWritingText('practice:empty');assert.equal(textOnly,'<script>alert(1)</script>','Autosave keeps exact text while HTML escapes display content.');
for(const [type,event] of [['paste',{}],['drop',{}],['beforeinput',{inputType:'insertFromPaste'}],['beforeinput',{inputType:'insertFromPasteAsQuotation'}],['beforeinput',{inputType:'insertFromDrop'}],['keydown',{key:'v',ctrlKey:true}],['keydown',{key:'V',metaKey:true}],['keydown',{key:'Insert',shiftKey:true}]]){let prevented=false;await one.emit(type,{target:input,...event,preventDefault(){prevented=true;}});assert.equal(prevented,true,type+' blocks clipboard/drag insertion in response boxes.');}
let prevented=false;await one.emit('beforeinput',{target:input,inputType:'insertCompositionText',preventDefault(){prevented=true;}});assert.equal(prevented,false,'Normal IME typing remains available.');
await one.emit('paste',{target:{matches:()=>false},preventDefault(){prevented=true;}});assert.equal(prevented,false,'Clipboard controls leave unrelated fields usable.');
const teacherEditor={id:'teacherFeedback',matches:()=>true,dataset:{}};
for(const [type,event] of [['paste',{}],['copy',{}],['cut',{}],['beforeinput',{inputType:'insertFromPaste'}],['keydown',{key:'v',ctrlKey:true}],['keydown',{key:'V',metaKey:true}],['keydown',{key:'Insert',shiftKey:true}],['keydown',{key:'c',ctrlKey:true}],['keydown',{key:'x',metaKey:true}]]){let blocked=false;await one.emit(type,{target:teacherEditor,...event,preventDefault(){blocked=true;}});assert.equal(blocked,false,'Teacher editor permits '+type+' and keyboard clipboard shortcuts.');}
one.quota(true);input.value='Latest unsaved browser change';await one.emit('input',{target:input});assert.equal(one.t.statuses().get(key).local,false,'Storage failure is visible rather than reported as saved.');assert.equal(one.t.savedWritingText(key),input.value,'Current text stays in memory for downloading or cloud retry.');
assert.ok(!readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8').includes('skipWaiting('),'Updates do not force reload while writing.');
console.log('Passed writing studio: task matching, assigned homework lengths, exact text and plan saves, refresh recovery, private account/device backups, retry idempotency, stale-save protection, safe restores, outage/quota handling, clipboard/drop guards and IME typing.');
