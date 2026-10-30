const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=value=>value?new Date(value).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Asia/Ulaanbaatar'}):'—';
const labels={working:'Working',paused:'Working · timer paused',viewing:'Viewing',finished:'Finished on device',away:'Away from Richmount',offline:'No recent connection',unknown:'No activity shared yet'};
const title=value=>value?value[0].toUpperCase()+value.slice(1):'';

// Reports only the activity inside Richmount, with no page contents, browsing
// history, clipboard, camera, microphone or screen capture.
export function createActivityReporter({storage,studentId,connected,request,context,visible=()=>true,now=Date.now}){
 let deviceId='',revision=0,busy=false;
 try{deviceId=storage?.getItem('richmount-live-session-v1')||crypto.randomUUID();storage?.setItem('richmount-live-session-v1',deviceId);revision=Number(storage?.getItem('richmount-live-revision-v1'))||0;}catch{deviceId=crypto.randomUUID();}
 return {async send({away=false,keepalive=false}={}){
  if(!studentId()||!connected()||busy&&!away)return false;
  revision=Math.max(now()*1000,revision+1);try{storage?.setItem('richmount-live-revision-v1',String(revision));}catch{}
  const packet={...context(),deviceId,revision,visible:!away&&visible()};busy=true;
  try{await request('/api/student/activity',{method:'POST',keepalive,body:JSON.stringify(packet)});return true;}catch{return false;}finally{busy=false;}
 }};
}

let options={},reporter=null,sessionKey='',generation=0,notifyTimer=null;
let roster=null,rosterError='',rosterBusy=false,selected='',preview=null,previewError='',previewBusy='',previewSequence=0;
let rosterReceived=0,openSections=new Set(),opened=false;
const teacherReady=()=>{const s=options.session?.();return !!s?.teacher&&s.connected&&!s.busy;};
const onLivePage=()=>teacherReady()&&location.hash==='#teacher/live'&&!document.hidden;
function currentStatus(student){const now=roster?.serverTime?Date.parse(roster.serverTime)+(Date.now()-rosterReceived):Date.now();return student.lastSeenAt&&now-Date.parse(student.lastSeenAt)>60000?'offline':student.status;}
function progress(activity){if(!activity)return '';if(activity.total)return activity.answered+' / '+activity.total+' answers entered';return ['writing','speaking'].includes(activity.section)?activity.words+' words entered':'';}
export function liveRosterHTML(students=[]){
 if(!students.length)return '<p class="small muted">No active students are on the roster yet.</p>';
 return students.map(student=>{const status=currentStatus(student),activity=student.activity;return `<button type="button" class="live-student ${selected===student.id?'live-selected':''}" data-live-student="${esc(student.id)}" aria-pressed="${selected===student.id}"><span class="live-student-heading"><strong>${esc(student.name)}</strong><span class="live-badge live-${esc(status)}">${esc(labels[status]||labels.unknown)}</span></span><span>${esc(activity?.title||'Waiting for a Richmount activity update')}</span>${activity?.section?`<span class="small">Section: ${esc(title(activity.section))}${progress(activity)?' · '+esc(progress(activity)):''}</span>`:''}<span class="small muted">Last activity update: ${esc(time(student.lastSeenAt))}</span><span class="live-preview-link">Preview saved answers →</span></button>`;}).join('');
}
export function livePreviewHTML(value){
 if(!value)return '<section class="card"><h3>Choose a student</h3><p>Select a student to preview their latest saved answers.</p></section>';
 const {student,preview:work}=value,activity=work.activity||student.activity;
 const current=student.activity?.section;
 if(!opened){for(const section of work.sections||[])if(section.id===current||current==='writing'&&['task1','task2'].includes(section.id)||work.sections.length===1)openSections.add(section.id);opened=true;}
 return `<section class="card live-preview-intro"><span class="eyebrow">STUDENT WORK PREVIEW</span><h2>${esc(student.name)}</h2><h3>${esc(activity?.title||'Latest saved work')}</h3><p class="small">Last reported activity: ${esc(student.activity?.title||'No activity shared yet')}${student.activity?.section?' · '+esc(title(student.activity.section)):''}</p><p class="small muted">Activity update: ${esc(time(student.lastSeenAt))} · Answers saved: ${esc(time(work.savedAt))}</p><p class="small">${esc(work.message)}</p>${activity?.activityId?`<a class="small" href="#teacher/course/${esc(activity.activityId)}">Open test materials →</a>`:''}</section>${(work.sections||[]).map(section=>`<details class="card live-answer-section" data-live-section="${esc(section.id)}" ${openSections.has(section.id)?'open':''}><summary>${esc(section.title)}${section.type==='text'?' · '+section.words+' words':''}</summary>${section.prompt?`<p class="small preserve-lines">${esc(section.prompt)}</p>`:''}${section.type==='text'?`<div class="live-response preserve-lines">${esc(section.text||'No response has been saved yet.')}</div>`:`<div class="live-answer-table"><table><thead><tr><th>Question</th><th>Student’s answer</th></tr></thead><tbody>${section.answers.map(answer=>`<tr><td><strong>${esc(answer.id)}.</strong> ${esc(answer.prompt)}</td><td class="preserve-lines">${esc(answer.response||'—')}</td></tr>`).join('')}</tbody></table></div>`}</details>`).join('')}`;
}
export function liveTeacherHTML(){return `<section class="card live-classroom-intro"><div><span class="eyebrow">TEACHER VIEW</span><h2>Live classroom</h2><p>See what students are working on in Richmount and preview their latest saved answers. Updates about every 10 seconds while this tab is open.</p><p class="small muted">Offline changes appear after a successful account save. This preview is for teaching and support; progress counts are not exam scores.</p></div><button type="button" class="button secondary" data-live-refresh>Refresh now</button></section><p class="small" role="status" data-live-status>${esc(rosterError||'Checking student activity…')}</p><div class="live-classroom-grid"><section class="card live-roster"><h3>Students</h3><div data-live-roster>${liveRosterHTML(roster?.students)}</div></section><div data-live-preview>${livePreviewHTML(preview)}</div></div>`;}
function paint(){
 if(!onLivePage())return;
 const status=document.querySelector('[data-live-status]');if(status)status.textContent=rosterError?'Activity could not refresh. Last received updates are shown. '+rosterError:roster?'Last refreshed '+time(roster.serverTime)+' · '+roster.students.filter(s=>['working','paused','viewing','finished'].includes(currentStatus(s))).length+' recently active.':'Checking student activity…';
 const list=document.querySelector('[data-live-roster]');if(list){const focus=document.activeElement?.dataset.liveStudent;list.innerHTML=liveRosterHTML(roster?.students);if(focus)[...list.querySelectorAll('[data-live-student]')].find(node=>node.dataset.liveStudent===focus)?.focus?.({preventScroll:true});}
 const pane=document.querySelector('[data-live-preview]');if(pane){const scroll=pane.scrollTop;pane.innerHTML=(previewError?`<p class="notice warm" role="alert">${esc(previewError)} The last received preview is kept below.</p>`:'')+(previewBusy&&!preview?'<section class="card" role="status">Opening the student’s saved answers…</section>':livePreviewHTML(preview));pane.scrollTop=scroll;}
}
async function loadPreview(){
 if(!onLivePage()||!selected||previewBusy===selected)return;
 const student=selected,version=generation,sequence=++previewSequence;previewBusy=student;
 try{const value=await options.teacherRequest('/api/teacher/live/'+encodeURIComponent(student));if(teacherReady()&&version===generation&&student===selected&&sequence===previewSequence){preview=value;previewError='';}}
 catch(error){if(version===generation&&student===selected&&sequence===previewSequence)previewError=error.message;}
 finally{if(version===generation&&sequence===previewSequence){previewBusy='';paint();}}
}
async function loadRoster(){
 if(!onLivePage()||rosterBusy)return;const version=generation;rosterBusy=true;
 try{const value=await options.teacherRequest('/api/teacher/live');if(!teacherReady()||version!==generation)return;roster=value;rosterReceived=Date.now();rosterError='';if(!value.students.some(s=>s.id===selected)){selected=(value.students.find(s=>['working','paused'].includes(s.status))||value.students[0])?.id||'';preview=null;openSections=new Set();opened=false;}void loadPreview();}
 catch(error){if(version===generation)rosterError=error.message;}
 finally{if(version===generation){rosterBusy=false;paint();}}
}
export function liveConnectionChanged(){
 const s=options.session?.(),next=s?.teacher?(teacherReady()?'teacher:in':'teacher:out'):'student:'+(options.studentId?.()||'');
 if(next===sessionKey)return;sessionKey=next;generation++;clearTimeout(notifyTimer);roster=null;rosterError='';rosterBusy=false;selected='';preview=null;previewError='';previewBusy='';previewSequence++;openSections=new Set();opened=false;
}
export function notifyLiveActivity(){if(!reporter||options.session?.().teacher)return;clearTimeout(notifyTimer);notifyTimer=setTimeout(()=>void reporter.send(),300);}
export function endStudentLiveActivity(){return reporter?.send({away:true,keepalive:true});}
export function mountLiveTeacher(){liveConnectionChanged();if(onLivePage()&&!roster&&!rosterError)void loadRoster();}
export function initLiveClassroom(callbacks){
 options=callbacks;let storage;try{storage=window.sessionStorage;}catch{}
 reporter=createActivityReporter({storage,studentId:callbacks.studentId,connected:callbacks.studentConnected,request:callbacks.studentRequest,context:callbacks.context,visible:()=>!document.hidden});liveConnectionChanged();
 document.addEventListener('click',event=>{
  const student=event.target.closest('[data-live-student]');if(student&&teacherReady()){selected=student.dataset.liveStudent;preview=null;previewError='';openSections=new Set();opened=false;void loadPreview();paint();}
  if(event.target.closest('[data-live-refresh]')&&teacherReady()){void loadRoster();void loadPreview();}
 });
 document.addEventListener('toggle',event=>{const node=event.target;if(node.dataset?.liveSection&&node.isConnected){if(node.open)openSections.add(node.dataset.liveSection);else openSections.delete(node.dataset.liveSection);}},true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)void endStudentLiveActivity();else{notifyLiveActivity();void loadRoster();}});
 window.addEventListener('pagehide',()=>void endStudentLiveActivity());window.addEventListener('online',notifyLiveActivity);
 setInterval(()=>{if(!document.hidden)void reporter.send();},15000);setInterval(()=>{if(onLivePage()){void loadRoster();void loadPreview();}},10000);
}
