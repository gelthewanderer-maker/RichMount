import {CLASSROOM_API} from './classroom-config.js';
import {materialsPage} from './materials.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>new Date(s).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const STORE='richmount-classroom-v1';
let client=null,options={},teacher={loggedIn:false,loading:false,view:'inbox',students:[],submissions:[],summary:{},total:0,offset:0,filters:{student:'',kind:'',reviewed:''},detail:null,error:'',reviewDrafts:{},bulkDraft:'',materials:null};
const action=(label,name,extra='',style='')=>`<button class="button ${style}" data-cloud-action="${name}" ${extra}>${label}</button>`;

// Outbox entries carry a student ID, so work awaiting a retry cannot be sent as
// a different student after someone switches class codes on a shared device.
export function createStudentSync({storage,fetcher,apiBase,onChange=()=>{},onJoined=()=>{}}){
  let data={student:null,code:'',outbox:[],sent:{},records:[]};try{data={...data,...JSON.parse(storage.getItem(STORE)||'{}')};}catch{}
  let sending=false,error='',flight=null,joinGeneration=0;
  function changed(){onChange();}
  function persist(){try{storage.setItem(STORE,JSON.stringify(data));return true;}catch{error='Your device could not save the sending queue. Keep this tab open and download a report as a backup.';return false;}}
  async function request(path,init={},code=data.code){
    if(!apiBase)throw new Error('Your teacher is finishing the classroom connection. You can continue practising here.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{const response=await fetcher(apiBase+path,{...init,credentials:'omit',headers:{'Content-Type':'application/json','Authorization':'Bearer '+code,...init.headers},signal:controller.signal});let value;try{value=await response.json();}catch{throw new Error('The classroom could not be reached. Your work remains saved on this device.');}if(!response.ok)throw new Error(value.error||'Please try again.');return value;}
    finally{clearTimeout(timer);}
  }
  const status=id=>!data.student?'':data.sent[data.student.id+':'+id]?'sent':data.outbox.some(x=>x.studentId===data.student.id&&x.entry.id===id)?'pending':'';
  function flush(){
    if(flight)return flight;
    if(!data.student||!data.code)return Promise.resolve();
    const owner=data.student.id,code=data.code;sending=true;error='';
    flight=Promise.resolve().then(async()=>{
      try{while(data.student?.id===owner&&data.code===code){
        const item=data.outbox.find(x=>x.studentId===owner);if(!item)break;
        const result=await request('/api/student/submissions',{method:'POST',body:JSON.stringify({entry:item.entry})},code);
        data.sent[owner+':'+item.entry.id]=result.submission.id;data.outbox=data.outbox.filter(x=>x!==item);if(data.student?.id===owner)data.records=[result.submission,...data.records.filter(r=>r.id!==result.submission.id)].slice(0,100);persist();changed();
      }}catch(e){error=e.name==='AbortError'?'The classroom took too long to respond. Your work is waiting safely; choose Send pending work to retry.':e.message;}
    }).finally(()=>{sending=false;flight=null;changed();if(!error&&data.student?.id!==owner&&data.outbox.some(x=>x.studentId===data.student?.id))void flush();});
    changed();return flight;
  }

  function queue(entry){
    if(!data.student)return false;const current=status(entry.id);if(current)return true;
    if(data.outbox.length>=100){error='The sending queue is full. Send pending work before adding another report.';changed();return false;}
    data.outbox.push({studentId:data.student.id,entry:JSON.parse(JSON.stringify(entry))});persist();changed();void flush();return true;
  }
  async function join(code){
    const generation=++joinGeneration,joinCode=String(code).trim().toUpperCase();error='';
    try{const result=await request('/api/student/me',{},joinCode);if(generation!==joinGeneration)return;data.code=joinCode;data.student=result.student;data.records=[];persist();onJoined(result.student.name);changed();await refresh();void flush();}
    catch(e){if(generation===joinGeneration){error=e.message;changed();}throw e;}
  }
  async function refresh(){if(!data.student)return;const owner=data.student.id,code=data.code;try{const result=await request('/api/student/submissions',{},code);if(data.student?.id!==owner||data.code!==code)return;data.records=result.submissions;persist();error='';changed();}catch(e){if(data.student?.id===owner&&data.code===code){error=e.message;changed();}}}
  function leave(){joinGeneration++;data.student=null;data.code='';data.records=[];error='';persist();changed();}
  return {join,leave,queue,flush,refresh,status,fileAccess:id=>request('/api/student/materials/'+encodeURIComponent(id)+'/access'),info:()=>({student:data.student,records:data.records,error,sending,pending:data.student?data.outbox.filter(x=>x.studentId===data.student.id).length:0,apiBase}),verify:async()=>{if(data.code)await join(data.code);}};
}
function notice(){const d=client?.info();return d?.error?`<div class="notice warm" role="alert">${esc(d.error)}</div>`:'';}
export function cloudHistoryLabel(id){
  const status=client?.status(id);return status==='sent'?'<span class="pill cloud-sent">✓ Sent to teacher</span>':status==='pending'?'<span class="pill">Waiting to send</span>':client?.info().student?action('Send to teacher','send-entry',`data-entry="${esc(id)}"`,'soft'):'';
}
export function queueSubmission(entry){client?.queue(entry);}
export function isClassConnected(){return !!client?.info().student;}
export function classroomOrigin(){return apiBase();}
export async function studentMaterialAccess(id){if(!isClassConnected())throw new Error('Join your class to open lesson materials.');return client.fileAccess(id);}
export async function teacherMaterialAccess(id){try{return await teacherRequest('/api/teacher/materials/'+encodeURIComponent(id)+'/access');}catch(error){if(!teacher.loggedIn)options.onChange?.();throw error;}}
export function studentName(){return client?.info().student?.name||'';}
export function progressCloudHTML(){
  const d=client?.info();return `<section class="card class-progress"><div class="section-head"><h3>Work shared with Teacher Angelo</h3><a href="#class">Your class →</a></div>${notice()}${d?.student?`${d.pending?`<p>${d.pending} ${d.pending===1?'activity is':'activities are'} waiting to send.</p>${action('Send pending work','retry')}`:''}${feedbackCards(d.records)}`:`<p>Join your class to send completed work and receive your teacher’s feedback.</p><a class="button soft" href="#class">Join your class →</a>`}</section>`;
}
function feedbackCards(records){return records?.length?`<div class="cloud-records">${records.map(r=>`<article class="cloud-feedback"><div><span class="pill">${esc(r.kind)} · ${r.reviewed?'Reviewed':'Awaiting review'}</span><h4>${esc(r.title)}</h4><p class="small muted">${date(r.created_at)}${r.score!=null?' · '+r.score+'/'+r.total+' practice marks':''}</p></div>${r.reviewed?`<div class="teacher-comment"><strong>Teacher Angelo’s feedback${r.teacher_score?' · '+esc(r.teacher_score):''}</strong><p class="preserve-lines">${esc(r.feedback||'Reviewed by your teacher.')}</p></div>`:'<p class="small muted">Sent successfully. Your teacher will review this activity.</p>'}</article>`).join('')}</div>`:'<p class="small muted">Complete an activity, then submit it to see your shared work here.</p>';}
export function classroomPage(){
  const d=client?.info()||{};
  return `<div class="page-head"><div class="eyebrow">LEARN TOGETHER. KEEP GROWING.</div><h1>Your Richmount class.</h1><p>Send completed work to Teacher Angelo and read his feedback here.</p></div>${notice()}${d.student?`<section class="card class-member"><span class="pill cloud-sent">✓ Connected to your teacher</span><h2>${esc(d.student.name)}</h2><p>Newly completed activities are sent to your teacher. Drafts stay on this device. If your connection drops, completed work waits here until you send it again.</p><div class="button-row">${action(d.sending?'Sending…':'Send pending work'+(d.pending?' · '+d.pending:''),'retry',d.sending?'disabled':'')}${action('Refresh teacher feedback','student-refresh','','secondary')}${action('Leave class on this device','leave','','secondary')}</div></section><section class="card" style="margin-top:20px"><h3>Earlier work on this device</h3><p class="small muted">You can choose to send reports completed before joining. Send only your own work, especially on a shared computer.</p>${action('Choose saved activities','choose-saved','','soft')}</section><section class="card" style="margin-top:20px"><h3>Your teacher’s feedback</h3>${feedbackCards(d.records)}</section>`:`<section class="card class-join"><div class="class-join-icon">↗</div><h2>Join your learning space.</h2><p>Ask Teacher Angelo for your individual class code. It links your submitted work to your name.</p><form id="classJoinForm"><label for="classCode">Your individual class code</label><input id="classCode" required autocomplete="off" spellcheck="false" maxlength="40" placeholder="RM-…"><p class="small muted">By joining, you choose to share completed essays, answers, practice scores and speaking notes with your teacher. Your code gives access to your own feedback; keep it private.</p><button class="button" ${!d.apiBase?'disabled':''}>Join class →</button>${!d.apiBase?'<p class="small muted">The classroom connection is being set up. Your practice activities are available now.</p>':''}</form></section>`}`;
}
const apiBase=()=>client?.info().apiBase||'';
async function teacherRequest(path,init={}){const response=await fetch(apiBase()+path,{...init,credentials:'include',headers:{'Content-Type':'application/json',...init.headers}});let value;try{value=await response.json();}catch{throw new Error('The teacher dashboard could not be reached. Please try again.');}if(response.status===401)teacher.loggedIn=false;if(!response.ok)throw new Error(value.error||'Please try again.');return value;}
async function refreshTeacher(){
  teacher.loading=true;teacher.error='';options.onChange?.();
  try{
    const query=new URLSearchParams({...teacher.filters,offset:String(teacher.offset)});
    const [summary,students,list]=await Promise.all([teacherRequest('/api/teacher/summary'),teacherRequest('/api/teacher/students'),teacherRequest('/api/teacher/submissions?'+query)]);
    teacher.summary=summary;teacher.students=students.students;teacher.submissions=list.submissions;teacher.total=list.total;
  }catch(e){teacher.error=e.message;}finally{teacher.loading=false;options.onChange?.();}
}
function detailHTML(row){
  const p=row.payload,draft=teacher.reviewDrafts[row.id]||{feedback:row.feedback,teacherScore:row.teacher_score,reviewed:!!row.reviewed};
  let work=p.kind==='writing'?`<section class="card"><div class="eyebrow">${p.result.wordCount} WORDS · ${p.context==='mock'?'MOCK TEST':'WRITING PRACTICE'}</div><h3>${esc(p.title)}</h3><p class="small muted">${esc(p.prompt)}</p><h4>Original student response</h4><div class="corrected-text">${esc(p.text||'(No response)')}</div><details><summary>Common-error grammar feedback</summary><p class="small muted">Rule-based checks; no automatic IELTS band.</p><div class="corrected-text">${esc(p.result.corrected)}</div>${p.result.issues.map(i=>`<p class="small"><del>${esc(i.original)}</del> → ${esc(i.replacement)}<br>${esc(i.message)}</p>`).join('')}</details></section>`:p.details?`<section class="card"><h3>${p.score}/${p.total} practice marks</h3><p class="small muted">Marks recalculated from the submitted answers. These original activities are not calibrated to IELTS bands.</p>${p.details.map((q,i)=>`<div class="question"><strong>${i+1}. ${esc(q.text)}</strong><p>Your answer: ${esc(q.given||'(blank)')}</p><div class="feedback ${q.correct?'correct':''}"><strong>${q.correct?'✓ Correct':'Review this answer'}</strong> · Expected: ${esc(Array.isArray(q.answer)?q.answer[0]:q.answer)}<small>${esc(q.evidence)}</small></div></div>`).join('')}</section>`:`<section class="card"><h3>Speaking preparation and self-review</h3><div class="corrected-text">${esc(p.notes||'No preparation notes saved.')}</div><p class="small muted">Speaking recordings are downloaded on the student’s device. This submission shares preparation notes, not audio or an automatic Speaking band.</p></section>`;
  return `<div class="section-head"><div><span class="pill">${esc(row.student_name)}</span><h2>${esc(row.title)}</h2><p class="small muted">${date(row.created_at)} · ${row.reviewed?'Reviewed':'Awaiting review'}</p></div>${action('Back to inbox','back-inbox','','secondary')}</div><div class="teacher-review-grid">${work}<aside class="card teacher-review"><h3>Your feedback</h3><form id="reviewForm"><label for="teacherFeedback">Feedback for this student</label><textarea id="teacherFeedback" rows="9" maxlength="10000" placeholder="What worked well? What should they practise next?">${esc(draft.feedback)}</textarea><label for="teacherMark">Teacher mark (optional)</label><input id="teacherMark" maxlength="30" value="${esc(draft.teacherScore||'')}" placeholder="e.g. 15/20 or a teacher assessment"><label class="check-item"><input id="reviewed" type="checkbox" ${draft.reviewed?'checked':''}>Mark as reviewed</label><p class="small muted">The student can read your saved feedback in My progress.</p><button class="button">Save feedback →</button></form><div style="margin-top:16px">${action('Download this work','download-work','','secondary')}</div></aside></div>`;
}
function inboxHTML(){return `<div class="class-filters"><label>Student<select id="teacherStudent"><option value="">All students</option>${teacher.students.map(s=>`<option value="${s.id}" ${teacher.filters.student===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label>Skill<select id="teacherKind"><option value="">All skills</option>${['writing','reading','listening','speaking'].map(k=>`<option ${teacher.filters.kind===k?'selected':''}>${k}</option>`).join('')}</select></label><label>Status<select id="teacherReviewed"><option value="">All submissions</option><option value="0" ${teacher.filters.reviewed==='0'?'selected':''}>Awaiting review</option><option value="1" ${teacher.filters.reviewed==='1'?'selected':''}>Reviewed</option></select></label></div><section class="card">${teacher.submissions.length?`<div class="table-wrap"><table class="inbox-table"><thead><tr><th>Student & activity</th><th>Result</th><th>Status</th><th></th></tr></thead><tbody>${teacher.submissions.map(s=>`<tr><td><strong>${esc(s.student_name)}</strong><div>${esc(s.title)}</div><small>${date(s.created_at)}</small></td><td>${s.total?s.score+'/'+s.total+' marks':s.words!=null?s.words+' words':'Speaking notes'}</td><td><span class="pill ${s.reviewed?'cloud-sent':''}">${s.reviewed?'Reviewed':'To review'}</span></td><td>${action('Open work ↗','open-work',`data-id="${s.id}"`,'soft')}</td></tr>`).join('')}</tbody></table></div><div class="class-pagination"><span>${teacher.offset+1}–${Math.min(teacher.offset+50,teacher.total)} of ${teacher.total}</span><div class="button-row">${action('Previous','previous',teacher.offset===0?'disabled':'','secondary')}${action('Next','next',teacher.offset+50>=teacher.total?'disabled':'','secondary')}</div></div>`:'<div class="empty"><h3>Your inbox is ready.</h3><p>Add your students, give each their own code, and ask them to join the class before submitting an activity.</p></div>'}</section>`;}
function rosterHTML(){return `<div class="teacher-roster-grid"><section class="card"><h3>Your students</h3><p class="small muted">Give each student their own code and the usual Richmount student link. A code opens only that student’s feedback.</p>${teacher.students.length?teacher.students.map(s=>`<article class="roster-row"><form data-rename="${s.id}" class="roster-name"><label class="sr-only" for="name-${s.id}">Student name</label><input id="name-${s.id}" name="name" maxlength="60" required value="${esc(s.name)}"><button class="button soft">Save name</button></form><div class="class-code"><code>${esc(s.code)}</code>${action('Copy code','copy-code',`data-code="${esc(s.code)}"`,'secondary')}</div></article>`).join(''):'<p>No students added yet.</p>'}</section><section class="card"><h3>Add students</h3><form id="addStudentsForm"><label for="studentNames">One student name per line</label><textarea id="studentNames" rows="10" placeholder="Anu Batbold\nTemuulen Enkh" required>${esc(teacher.bulkDraft)}</textarea><p class="small muted">Add your 10 learners together. You can add up to 20 at a time.</p><button class="button">Create individual class codes →</button></form></section></div>`;}
export function teacherPage(){
  const base=apiBase();
  if(base&&base!==location.origin)return `<div class="page-head"><div class="eyebrow">FOR TEACHER ANGELO</div><h1>Your private teacher dashboard.</h1><p>Review submitted work and leave feedback in your teacher space.</p></div><section class="card"><a class="button" href="${esc(base+'/#teacher')}">Open teacher dashboard ↗</a><p class="small muted">Your teacher password is required. Students can continue using this studio.</p></section>`;
  if(!teacher.loggedIn)return `<div class="page-head"><div class="eyebrow">YOUR CLASS, IN ONE PLACE</div><h1>Teacher dashboard.</h1><p>Sign in to review your students’ submitted work.</p></div><section class="card teacher-login"><h2>Welcome, Teacher Angelo.</h2>${teacher.error?`<div class="notice warm" role="alert">${esc(teacher.error)}</div>`:''}<form id="teacherLoginForm"><label for="teacherPassword">Teacher password</label><input id="teacherPassword" type="password" required autocomplete="current-password"><button class="button" ${!base?'disabled':''}>Sign in →</button></form><p class="small muted">Students use their own individual class codes. This password is for you only.</p></section>`;
  return `<div class="page-head"><div class="eyebrow">RICHMOUNT · TEACHER ANGELO</div><h1>Your students. Their next steps.</h1><p>Original responses, practice marks and your feedback, together.</p></div><div class="stats class-stats"><div class="stat"><strong>${teacher.summary.students??'—'}</strong><small>Students</small></div><div class="stat"><strong>${teacher.summary.submissions??'—'}</strong><small>Submitted activities</small></div><div class="stat"><strong>${teacher.summary.awaitingReview??'—'}</strong><small>Awaiting your review</small></div></div><div class="section-head"><div class="tabs">${['inbox','students','resources','settings'].map(v=>action(v==='inbox'?'Submission inbox':v==='students'?'Students & class codes':v==='resources'?'Lesson resources':'Password','teacher-view',`data-view="${v}"`,'tab '+(teacher.view===v?'active':''))).join('')}</div><div class="button-row">${action(teacher.loading?'Refreshing…':'Refresh','teacher-refresh',teacher.loading?'disabled':'','secondary')}${action('Sign out','teacher-logout','','secondary')}</div></div>${teacher.error?`<div class="notice warm" role="alert">${esc(teacher.error)}</div>`:''}${teacher.detail?detailHTML(teacher.detail):teacher.view==='students'?rosterHTML():teacher.view==='resources'?materialsPage({role:'teacher',catalog:teacher.materials}):teacher.view==='settings'?`<section class="card teacher-login"><h3>Change your teacher password</h3><form id="teacherPasswordForm"><label for="currentPassword">Current password</label><input id="currentPassword" type="password" autocomplete="current-password" required><label for="newTeacherPassword">New password (at least 12 characters)</label><input id="newTeacherPassword" type="password" autocomplete="new-password" minlength="12" maxlength="200" required><label for="confirmTeacherPassword">Confirm new password</label><input id="confirmTeacherPassword" type="password" autocomplete="new-password" minlength="12" required><button class="button">Save new password</button></form><p class="small muted">Changing your password signs out your other teacher sessions. Class codes and submitted work stay available.</p></section>`:inboxHTML()}`;
}
function download(name,text){const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function initClassroom(callbacks){
  options=callbacks;client=createStudentSync({storage:localStorage,fetcher:fetch.bind(globalThis),apiBase:CLASSROOM_API.replace(/\/$/,''),onJoined:callbacks.onJoined,onChange:()=>{const d=client.info(),badge=document.querySelector('#classroomBadge');if(badge)badge.textContent=d.student?(d.pending?'Waiting to send · '+d.pending:'✓ Teacher connected'):'Join your class';callbacks.onChange?.();}});
  window.addEventListener('online',()=>{void client.flush();});
  void client.verify().catch(()=>{});
  if(apiBase()===location.origin)void teacherRequest('/api/teacher/session').then(()=>{teacher.loggedIn=true;return refreshTeacher();}).catch(()=>{});
  document.querySelector('#app').addEventListener('submit',async e=>{
    const form=e.target;if(!['classJoinForm','teacherLoginForm','addStudentsForm','reviewForm','teacherPasswordForm'].includes(form.id)&&!form.dataset.rename)return;
    e.preventDefault();const button=form.querySelector('button');if(button)button.disabled=true;
    try{
      if(form.id==='classJoinForm'){await client.join(form.querySelector('#classCode').value);callbacks.toast?.('You are connected to Teacher Angelo.');}
      else if(form.id==='teacherLoginForm'){await teacherRequest('/api/teacher/login',{method:'POST',body:JSON.stringify({password:form.querySelector('#teacherPassword').value})});teacher.loggedIn=true;await refreshTeacher();}
      else if(form.id==='addStudentsForm'){await teacherRequest('/api/teacher/students',{method:'POST',body:JSON.stringify({names:form.querySelector('#studentNames').value.split('\n').map(n=>n.trim()).filter(Boolean)})});teacher.bulkDraft='';await refreshTeacher();callbacks.toast?.('Your student codes are ready.');}
      else if(form.dataset.rename){await teacherRequest('/api/teacher/students/'+form.dataset.rename,{method:'PATCH',body:JSON.stringify({name:form.querySelector('input').value})});await refreshTeacher();callbacks.toast?.('Student name saved.');}
      else if(form.id==='reviewForm'){await teacherRequest('/api/teacher/submissions/'+teacher.detail.id,{method:'PATCH',body:JSON.stringify({feedback:form.querySelector('#teacherFeedback').value,teacherScore:form.querySelector('#teacherMark').value,reviewed:form.querySelector('#reviewed').checked})});delete teacher.reviewDrafts[teacher.detail.id];teacher.detail=(await teacherRequest('/api/teacher/submissions/'+teacher.detail.id)).submission;await refreshTeacher();callbacks.toast?.('Your feedback is saved for the student.');}
      else if(form.id==='teacherPasswordForm'){const next=form.querySelector('#newTeacherPassword').value;if(next!==form.querySelector('#confirmTeacherPassword').value)throw new Error('The new passwords do not match.');await teacherRequest('/api/teacher/password',{method:'POST',body:JSON.stringify({currentPassword:form.querySelector('#currentPassword').value,newPassword:next})});callbacks.onChange?.();callbacks.toast?.('Your teacher password has been changed.');}
    }catch(err){if(form.id!=='classJoinForm'){teacher.error=err.message;callbacks.onChange?.();}callbacks.toast?.(err.message);}finally{if(button)button.disabled=false;}
  });
  function keepTeacherDraft(e){
    if(e.target.id==='studentNames')teacher.bulkDraft=e.target.value;
    if(teacher.detail&&['teacherFeedback','teacherMark','reviewed'].includes(e.target.id)){
      const form=document.querySelector('#reviewForm');if(form)teacher.reviewDrafts[teacher.detail.id]={feedback:form.querySelector('#teacherFeedback').value,teacherScore:form.querySelector('#teacherMark').value,reviewed:form.querySelector('#reviewed').checked};
    }
  }
  document.querySelector('#app').addEventListener('input',keepTeacherDraft);
  document.querySelector('#app').addEventListener('change',e=>{
    keepTeacherDraft(e);
    const filters={teacherStudent:'student',teacherKind:'kind',teacherReviewed:'reviewed'};if(filters[e.target.id]){teacher.filters[filters[e.target.id]]=e.target.value;teacher.offset=0;void refreshTeacher();}
  });
  document.querySelector('#app').addEventListener('click',async e=>{
    const b=e.target.closest('[data-cloud-action]');if(!b)return;const a=b.dataset.cloudAction;
    try{
      if(a==='retry')await client.flush();
      else if(a==='student-refresh')await client.refresh();
      else if(a==='leave'){if(confirm('Leave this class on this device? Your online submissions stay with your teacher. Pending work remains here until you reconnect with the same code.'))client.leave();}
      else if(a==='choose-saved')location.hash='progress';
      else if(a==='send-entry'){const entry=callbacks.history().find(h=>h.id===b.dataset.entry);if(entry&&confirm('Send this completed activity as '+client.info().student.name+'? Send only your own work.')){client.queue(entry);callbacks.toast?.('Your activity is queued for your teacher.');}}
      else if(a==='teacher-refresh')await refreshTeacher();
      else if(a==='teacher-view'){teacher.view=b.dataset.view;teacher.detail=null;teacher.error='';callbacks.onChange?.();if(teacher.view==='resources'&&!teacher.materials){teacher.materials=await teacherRequest('/api/teacher/materials');callbacks.onChange?.();}}
      else if(a==='teacher-logout'){await teacherRequest('/api/teacher/logout',{method:'POST',body:'{}'});teacher.loggedIn=false;teacher.detail=null;teacher.students=[];teacher.submissions=[];teacher.reviewDrafts={};teacher.bulkDraft='';teacher.materials=null;teacher.error='';callbacks.onChange?.();}
      else if(a==='open-work'){teacher.detail=(await teacherRequest('/api/teacher/submissions/'+b.dataset.id)).submission;teacher.error='';callbacks.onChange?.();window.scrollTo(0,0);}
      else if(a==='back-inbox'){teacher.detail=null;callbacks.onChange?.();}
      else if(a==='next'||a==='previous'){teacher.offset=Math.max(0,teacher.offset+(a==='next'?50:-50));await refreshTeacher();}
      else if(a==='copy-code'){try{await navigator.clipboard.writeText(b.dataset.code);callbacks.toast?.('Class code copied.');}catch{callbacks.toast?.('Select and copy the class code shown beside this button.');}}
      else if(a==='download-work'){const d=teacher.detail;download('Richmount_Student_Work.txt',`RICHMOUNT IELTS · STUDENT WORK\nStudent: ${d.student_name}\nActivity: ${d.title}\nSubmitted: ${date(d.created_at)}\n\n`+(d.payload.kind==='writing'?d.payload.text:d.payload.details?d.payload.details.map((q,i)=>`${i+1}. ${q.text}\nStudent answer: ${q.given||'(blank)'}\nExpected: ${q.answer}\n${q.correct?'Correct':'Incorrect'}`).join('\n\n'):d.payload.notes)+`\n\nTEACHER FEEDBACK\n${d.feedback||'Not reviewed yet.'}\n${d.teacher_score||''}`);}
    }catch(err){teacher.error=err.message;callbacks.onChange?.();callbacks.toast?.(err.message);}
  });
}
