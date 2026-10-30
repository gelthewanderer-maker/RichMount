import {writingGuideHTML,draftToolsHTML,savedWritingText} from './writing-studio.js?v=20261030-save1';
import {openFloatingAudio,floatingAudioOwner,closeFloatingAudioSource,pauseFloatingAudio} from './floating-audio.js?v=20261015-books1';
import {coachHTML,coachRevision,coachReportId,finalWritingConfirmation,writingFeedbackHTML,basicWritingReport} from './coaching.js?v=20261030-save1';
import {words} from './grammar.js';
import {studentDocumentHTML} from './materials.js?v=20261015-books1';
import {mountBookReader,stopBookReaders} from './book-reader.js?v=20261015-books1';
import {studentAudioHTML,uploadSpeakingRecording} from './audio.js?v=20261015-books1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stages=[{id:'listening',title:'Listening',minutes:40},{id:'reading',title:'Reading',minutes:60},{id:'writing',title:'Writing',minutes:60},{id:'speaking',title:'Speaking',minutes:14}];
const button=(text,action,extra='',style='')=>`<button class="button ${style}" data-course-action="${action}" ${extra}>${text}</button>`;
let savedAnswerKeys=new Set();
let options={},scope='',drafts={},index=null,indexLoading=false,indexError='',details=new Map(),loading=new Set(),errors=new Map(),generation=0;
let passageTab=0,writingTab='task1',resultCache=new Map(),resultLoading=new Set(),draftAudio=null,draftUrl='',audioOwner='',audioActivity='',recorder=null,stream=null,audioBusy=false,audioVersion=0;
let teacherIndex=null,teacherLoading=false,teacherError='',teacherGeneration=0,teacherDrafts={},teacherPreview=null,teacherPreviewId='',teacherPreviewFlight=null,teacherPreviewError='';
const currentId=()=>{const p=location.hash.slice(1).split('/');return p[0]==='course'?p[1]||'':'';};
const active=()=>details.get(currentId())?.activity;
const requestedWeekKey=()=>{const key=location.hash.slice(1).split('/')[2]||'';return /^\d{4}-\d{2}-\d{2}_s[1-8]_w\d{1,5}$/.test(key)?key:'';};
const draftKey=id=>id+(details.get(id)?.weeklyKey?'@'+details.get(id).weeklyKey:'');
const homeworkCoachKey=id=>'homework:'+draftKey(id);
const activityHref=(id,key='')=>'#course/'+id+(key?'/'+key:'');
const listedWeekKey=activity=>{const window=index?.weekly?.window;return window&&activity?window.key.replace(/_w\d+$/,'_w'+(window.sequence+(activity.week-window.week+8)%8)):'';};

const rerender=()=>options.render?.();
const list=items=>items?.length?`<ul>${items.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`:'';
const due=s=>s?.dueDate?`<span class="pill">Due ${esc(s.dueDate)}</span>`:'';
function clearAudio(){audioVersion++;if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop());stream=null;recorder=null;if(draftUrl){closeFloatingAudioSource(draftUrl);URL.revokeObjectURL(draftUrl);}draftAudio=null;draftUrl='';audioOwner='';audioActivity='';}
function syncScope(){
 const next=options.studentId?.()||'';if(scope===next)return;
 if(scope){let changed=false;for(const d of Object.values(drafts))changed=pauseDraft(d,'Your class session changed.')||changed;if(changed)save();}
 generation++;scope=next;savedAnswerKeys=new Set();index=null;indexLoading=false;indexError='';details=new Map();loading=new Set();errors=new Map();resultCache=new Map();resultLoading=new Set();drafts={};clearAudio();passageTab=0;writingTab='task1';
 if(scope)try{drafts=JSON.parse(options.storage.getItem('richmount-course-v1:'+scope)||'{}');}catch{}
 let restored=false;for(const d of Object.values(drafts)){if(!unfinishedMock(d))continue;const limit=stageTime(d),oldRemaining=d.end-Date.now();d.remainingMs=d.clockVersion===2&&Number.isFinite(d.remainingMs)?Math.max(0,Math.min(limit,d.remainingMs)):Number.isFinite(oldRemaining)&&oldRemaining>0?Math.min(limit,oldRemaining):limit;d.clockVersion=2;d.paused=true;d.end=null;d.pauseReason='Your saved mock is paused. Resume the timer when you are ready.';restored=true;}if(restored)save();
}
function save(){if(scope&&scope===options.studentId?.()&&options.answerSync){for(const [key,value] of Object.entries(drafts)){options.answerSync.capture('course:'+key,value);savedAnswerKeys.add(key);}for(const key of savedAnswerKeys)if(!Object.hasOwn(drafts,key))options.answerSync.capture('course:'+key,null);}if(scope)try{options.storage.setItem('richmount-course-v1:'+scope,JSON.stringify(drafts));}catch{options.toast?.('Your device could not save this draft. Keep this tab open until you submit.');}}
function completedRows(id){const detail=details.get(id);if(detail)return detail.completed.filter(s=>s.activity_id===id);const rows=(index?.submissions||[]).filter(s=>s.activity_id===id),window=index?.weekly?.window,activity=index?.activities.find(a=>a.id===id);if(!window||!activity)return rows;const key=window.key.replace(/_w\d+$/,'_w'+(window.sequence+(activity.week-window.week+8)%8));return rows.filter(row=>row.weekly_key?row.weekly_key===key:activity.week===window.week&&row.created_at>=window.startsAt&&row.created_at<window.endsAt);}
function completion(a,rows){if(!rows.length)return 'Not submitted';if(a.kind==='speaking'&&!rows.some(s=>s.recordings>0))return 'Audio needed';return rows.some(s=>s.reviewed)?'Reviewed':'Submitted';}
export function coursePage(mode='course'){
 syncScope();const homework=mode==='homework',mockOnly=mode==='mock',id=currentId();
 const head=`<div class="page-head"><div class="eyebrow">RICHMOUNT · YOUR EIGHT-WEEK COURSE</div><h1>${homework?'Homework that moves you forward.':mockOnly?'Your mocks. Your class recordings.':'A new challenge, every week.'}</h1><p>${homework?'Write, record, and share your work with Teacher Angelo.':mockOnly?'Eight full mocks using your teacher’s uploaded Practice Test 1–8 recordings and their matching question papers.':'Your lesson materials, eight full Academic practice mocks, and weekly homework in one place.'}</p></div>`;
 if(!scope)return head+`<section class="card"><h2>Join your class to begin.</h2><p>Use your individual class code to open weekly tests and share homework with your teacher.</p><a class="button" href="#class">Join your class →</a></section>`;
 if(id)return activityPage(id);
 if(!index)return head+`<section class="card" aria-live="polite">${indexError?`<p class="notice warm">${esc(indexError)}</p>${button('Try again','refresh')}`:'<h3>Opening your weekly course…</h3>'}</section>`;
 const saved=Object.entries(drafts).filter(([,d])=>unfinishedMock(d));
 return head+(saved.length?`<section class="card course-saved-mocks"><h2>Continue your saved mock.</h2><p class="small muted">Your answers and remaining time are saved automatically. Open your attempt, then resume the timer when you are ready.</p><div class="button-row">${saved.map(([id,d])=>`<a class="button soft" href="${esc(activityHref(d.activityId||id.split('@')[0],d.weeklyKey))}">${esc(index.activities.find(a=>a.id===(d.activityId||id.split('@')[0]))?.title||id)} · ${timerText(d)} remaining →</a>`).join('')}</div></section>`:'')+`<div class="section-head"><p class="small muted">Connected as ${esc(options.studentName())}. Answers save automatically on this device and back up to your account. Submitted work is shared with your teacher.</p>${button('Refresh activities & feedback','refresh','','secondary')}</div><div class="course-week-grid">${index.weeks.filter(w=>!homework||!index.weekly||w.week===index.weekly.window.week).map(w=>{
  const activities=index.activities.filter(a=>a.week===w.week&&(!homework||a.type==='homework')&&(!mockOnly||a.type==='mock'));
  return `<section class="card course-week"><div class="course-week-title"><span class="course-number">${String(w.week).padStart(2,'0')}</span><div><div class="eyebrow">WEEK ${w.week}</div><h2>${esc(w.title)}</h2></div></div><p class="small muted">Lesson days ${w.days[0]}–${w.days.at(-1)}</p>${!homework?list(w.study):''}<div class="course-activities">${activities.map(a=>`<a class="course-activity" href="${esc(activityHref(a.id,listedWeekKey(a)))}"><div><span class="eyebrow">${a.type==='mock'?'FULL PRACTICE MOCK':esc(a.kind)+' HOMEWORK'}</span><h3>${esc(a.title)}</h3><p class="small muted">${a.minutes} minutes${a.min?' · '+a.min+' minimum words':''}</p>${due(a)}</div><span class="pill">${completion(a,completedRows(a.id))} ↗</span></a>`).join('')||'<p class="small muted">Your teacher will share activities here.</p>'}</div><div class="button-row"><a class="button soft" href="#lessons/week-${w.week}">Open guided lesson →</a><a class="small" href="#materials">Open lesson books & recordings →</a></div></section>`;
 }).join('')}</div>`;
}
async function loadIndex(force=false){
 syncScope();if(!scope||indexLoading||(!force&&(index||indexError)))return;const owner=scope,version=generation;indexLoading=true;indexError='';
 try{const value=await options.studentRequest('/api/student/course');if(scope===owner&&generation===version)index=value;}
 catch(e){if(scope===owner&&generation===version)indexError=e.message;}
 finally{if(scope===owner&&generation===version){indexLoading=false;rerender();}}
}
async function loadDetail(id){
 const key=requestedWeekKey()||listedWeekKey(index?.activities.find(a=>a.id===id));if(!id||loading.has(id)||details.has(id)&&(!key||details.get(id).weeklyKey===key)||errors.has(id)||!scope)return;const owner=scope,version=generation;loading.add(id);
 try{const value=await options.studentRequest('/api/student/course/'+encodeURIComponent(id)+(key?'?key='+encodeURIComponent(key):''));if(scope===owner&&generation===version){
   const savedKey=id+(value.weeklyKey?'@'+value.weeklyKey:'');
   if(options.answerSync){
    const apply=restored=>{if(scope!==owner||generation!==version)return;if(restored){drafts[savedKey]=restored;if(unfinishedMock(restored)){pauseDraft(restored,'Your saved mock is paused. Resume when you are ready.');restored.paused=true;restored.end=null;}}else delete drafts[savedKey];try{options.storage.setItem('richmount-course-v1:'+scope,JSON.stringify(drafts));}catch{}};
    const restored=options.answerSync.open('course:'+savedKey,drafts[savedKey]||drafts[id],apply);if(restored!==undefined)apply(restored);savedAnswerKeys.add(savedKey);await options.answerSync.ready('course:'+savedKey);
    if(scope!==owner||generation!==version)return;
   }
   if(details.get(id)?.weeklyKey!==value.weeklyKey){resultCache.delete(id);resultLoading.delete(id);clearAudio();}details.set(id,value);if(value.weeklyKey&&drafts[id]&&!drafts[draftKey(id)]){if(!drafts[id].finished||value.completed.length)drafts[draftKey(id)]={...drafts[id],activityId:id,weeklyKey:value.weeklyKey};else drafts[id+'@legacy']={...drafts[id],activityId:id};delete drafts[id];save();}if(value.weeklyKey&&!requestedWeekKey()&&currentId()===id)location.hash=activityHref(id,value.weeklyKey);}}
 catch(e){if(scope===owner&&generation===version)errors.set(id,e.message);}
 finally{if(scope===owner&&generation===version){loading.delete(id);rerender();}}
}
export function mountCourse(){if(!['course','homework','mock'].includes(location.hash.slice(1).split('/')[0]))return;syncScope();void loadIndex();if(currentId())void loadDetail(currentId());processCourseExpiry();updateCourseTimer();}
export function courseConnectionChanged(weeklyKey){syncScope();if(weeklyKey&&index?.weekly?.window.key!==weeklyKey){index=null;indexError='';}}
export function liveCourseContext(){
 syncScope();const id=currentId(),detail=details.get(id);if(!id||!detail)return null;
 const d=drafts[draftKey(id)],a=detail.activity,section=a.type==='mock'?stages[d?.stage||0].id:a.kind;
 const responses=a.type==='mock'?d?.responses||{}:d||{},answers=responses[section]||{};
 const text=section==='writing'?(a.type==='mock'?[responses.task1,responses.task2].join(' '):d?.text||''):section==='speaking'?(a.type==='mock'?responses.speaking?.notes:d?.notes)||'':'';
 return {activityId:id,weeklyKey:d?.weeklyKey||detail.weeklyKey||'',attemptId:d?.id||'',stage:d?.stage,phase:!d?'viewing':d.finished?'finished':a.type==='mock'&&d.paused?'paused':'working',answered:['reading','listening'].includes(section)?Object.values(answers).filter(value=>String(value||'').trim()).length:0,words:words(text)};
}
export function activeCourseMock(){syncScope();return Object.entries(drafts).find(([,d])=>d.type==='mock'&&d.startedAt&&!d.finished)?.[0]||'';}
export function pauseCourseForAudio(){pauseMock();}
export function stopCourseMedia(){document.querySelectorAll('[data-course-media]').forEach(m=>m.pause());}
function tableHTML(t){return t?`<figure class="course-task-table"><figcaption><strong>${esc(t.title)}</strong><p class="small muted">${esc(t.units)}</p></figcaption><div class="table-wrap"><table><thead><tr>${t.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="small muted">${esc(t.note||'')} Fictional data for this original Richmount practice task.</p></figure>`:'';}
function activityPage(id){
 const entry=details.get(id);if(!entry)return `<a class="small" href="#course">← Weekly course</a><section class="card" aria-live="polite">${errors.has(id)?`<p class="notice warm">${esc(errors.get(id))}</p>${button('Try again','refresh')}`:'<h2>Opening your activity…</h2>'}</section>`;
 if(requestedWeekKey()&&entry.weeklyKey!==requestedWeekKey())return '<section class="card" role="status">Opening this week’s saved activity…</section>';
 const a=entry.activity,d=drafts[draftKey(id)],rows=completedRows(id);
 const head=`<div class="page-head"><div class="eyebrow">WEEK ${a.week} · ${a.type==='mock'?'ACADEMIC PRACTICE MOCK':esc(a.kind)+' HOMEWORK'}</div><h1>${esc(a.title)}</h1><p>${esc(a.description||a.prompt)}</p>${due(entry.setting)}</div>${entry.setting.message?`<div class="notice"><strong>Teacher Angelo’s instruction</strong><p class="preserve-lines">${esc(entry.setting.message)}</p></div>`:''}`;
 if(d?.finished||a.type==='homework'&&rows.length)return head+resultHTML(a,d,rows);
 if(a.type==='mock'){
  if(!d?.startedAt)return head+`<section class="card"><h2>Four skills. One complete attempt.</h2><div class="course-stage-list">${stages.map(s=>`<div><strong>${s.title}</strong><span>${s.minutes} minutes</span></div>`).join('')}</div><p>Listening uses your teacher’s uploaded Practice Test ${a.week} recording and its matching question paper. Open the paper and check your sound before you start. Listening includes 10 minutes to check and transfer answers.</p><p class="small muted">Start with Listening, then continue through the sections. Before submitting, you can return to any section you have already opened. You can pause and leave at any time. Answering, typing, playing audio or leaving this page pauses the timer. Resume it whenever you are ready. Answers and grammar suggestions appear after the whole mock is submitted. This is classroom practice; no automatic IELTS band is assigned.</p><div class="button-row">${button('Read listening paper','paper',`data-file="${esc(a.listening.paperId)}"`,'secondary')}${button('Check uploaded recording','load-audio',`data-file="${esc(a.listening.audioId)}"`,'soft')}${button('Start weekly mock →','start')}</div><div id="courseListeningPlayer" aria-live="polite"></div><div id="courseListeningPaper"></div>${rows.length?button('View previous submitted work','previous','','soft'):''}<p><a class="small" href="#course">← Weekly course</a></p></section>`;
  const stage=stages[d.stage];return head+`<div class="course-session"><strong>Section ${d.stage+1}/4 · ${stage.title}</strong><div class="course-clock-controls"><span class="timer" data-course-timer aria-label="Time remaining">${timerText(d)}</span>${button(d.paused?'Resume timer ▶':'Pause timer ⏸','toggle-timer','','secondary')}</div></div><p class="course-clock-status" data-course-clock-status role="status">${clockStatus(d)}</p><div class="course-stage-pills">${stages.map((s,i)=>button((i+1)+'. '+s.title,'section',`data-stage="${i}" ${i>furthestSection(d)?'disabled':''} ${i===d.stage?'aria-current="step"':''} aria-label="${i===d.stage?'Current section: ':'Open section: '}${s.title}"`,'secondary pill '+(i===d.stage?'cloud-sent':''))).join('')}</div>${stage.id==='listening'?listeningHTML(a,d):stage.id==='reading'?readingHTML(a,d):stage.id==='writing'?writingHTML(a,d):speakingHTML(a,d)}<section class="card course-next"><p class="small muted">Your answers save automatically. Use Back or the section buttons to review and change earlier answers before submitting the full mock. Each section keeps its remaining time; use Resume timer when you are ready.</p><div class="button-row">${d.stage>0?button('← Back to '+stages[d.stage-1].title,'back','','secondary'):''}${button('Pause & save for later','save-later','','secondary')}${button(d.stage===3?'Finish & send mock to teacher →':'Continue to next section →','next')}</div></section>`;
 }
 const draft=d||ensureHomework(a);if(a.kind==='writing')draft.text=savedWritingText(homeworkCoachKey(a.id),draft.text||'');return head+`<section class="card"><h2>Your task</h2><p class="preserve-lines">${esc(a.prompt)}</p>${list(a.instructions)}${tableHTML(a.data)}${a.kind==='writing'?`<p class="small muted">Aim for ${a.min}${a.max?'–'+a.max:''} words. Suggested time: ${a.minutes} minutes.</p>${writingGuideHTML(a,{key:homeworkCoachKey(a.id),inputId:'courseHomework',text:draft.text||''})}<label for="courseHomework">Your response</label><p class="small muted">Type your own response. Pasting and dragging text into this box are disabled.</p><textarea id="courseHomework" data-course-text="text" data-writing-draft-key="${esc(homeworkCoachKey(a.id))}" rows="16" maxlength="15000" placeholder="Plan your ideas, then write your response…">${esc(draft.text||'')}</textarea><p class="small muted" data-course-word-count>${words(draft.text||'')} words</p>`:`<p class="small muted">Aim for ${a.recordingSeconds?.minimum||60}–${a.recordingSeconds?.maximum||120} seconds.</p><label for="courseNotes">Preparation notes (optional)</label><textarea id="courseNotes" data-course-text="notes" rows="5" maxlength="8000">${esc(draft.notes||'')}</textarea>${recordingHTML(id)}`}${a.kind==='writing'?draftToolsHTML({key:homeworkCoachKey(a.id),inputId:'courseHomework'})+coachHTML(homeworkCoachKey(a.id),{activityId:a.id},draft.text||'','courseHomework')+finalWritingConfirmation():''}<details><summary>Plan and check your work</summary>${list(a.planningFrames)}<h3>Before you submit</h3>${list(a.selfCheck)}</details><div class="button-row course-submit">${button(a.kind==='speaking'?'Save homework & upload recording →':'Submit it now →','submit-homework')}<a class="button secondary" href="#homework">Back to homework</a></div><p class="small muted">${a.kind==='speaking'?'You may delete and redo your uploaded recording, up to three successful uploads for this homework.':'Review and revise before submitting. Your teacher can send you further feedback.'}</p></section>`;
}
function ensureHomework(a){return drafts[draftKey(a.id)]??=(a.kind==='writing'?{id:crypto.randomUUID(),activityId:a.id,weeklyKey:details.get(a.id)?.weeklyKey,type:'homework',text:''}:{id:crypto.randomUUID(),activityId:a.id,weeklyKey:details.get(a.id)?.weeklyKey,type:'homework',notes:'',checklist:[]});}
function questionHTML(q,value){
 const choices=q.options||(['truefalse','tfng'].includes(q.type)?['TRUE','FALSE','NOT GIVEN'].map(v=>({value:v,label:v})):null);
 return `<div class="course-question"><label for="course-answer-${q.id}"><strong>${q.id}.</strong> ${esc(q.text)}</label>${choices?`<select id="course-answer-${q.id}" data-course-answer="${q.id}"><option value="">Choose an answer</option>${choices.map(c=>`<option value="${esc(c.value??c)}" ${value===(c.value??c)?'selected':''}>${esc(c.label??c)}</option>`).join('')}</select>`:`<input id="course-answer-${q.id}" data-course-answer="${q.id}" maxlength="120" autocomplete="off" spellcheck="false" value="${esc(value||'')}" aria-label="Answer ${q.id}">`}${q.limit?`<small>Maximum ${q.limit} ${q.limit===1?'word':'words'}${q.numberAllowed?' and/or a number':''}.</small>`:''}</div>`;
}
function listeningHTML(a,d){return `<section class="card"><h2>Listening · Practice test ${a.week}</h2><p>Listen to your teacher’s uploaded <strong>Practice Test ${a.week}.mp3</strong>. Use the questions, maps, and tables in its matching paper, then enter all 40 answers below.</p><div class="button-row">${button('Read question paper','paper',`data-file="${esc(a.listening.paperId)}"`,'secondary')}${button('Open uploaded audio player','load-audio',`data-file="${esc(a.listening.audioId)}"`,'soft')}</div><div id="courseListeningPlayer" aria-live="polite"></div><div id="courseListeningPaper"></div><p class="small muted">Play the recording once for a realistic practice attempt. Follow each question’s word limit.</p><div class="course-answer-grid">${a.listening.questions.map(q=>questionHTML(q,d.responses.listening[q.id])).join('')}</div></section>`;}
function readingHTML(a,d){
 const p=a.reading.passages[Math.min(passageTab,2)],qs=a.reading.questions.filter(q=>q.passageId===p.id);
 return `<div class="tabs">${a.reading.passages.map((p,i)=>button('Passage '+(i+1),'passage',`data-index="${i}"`,'tab '+(i===passageTab?'active':''))).join('')}</div><div class="course-reading-grid"><article class="card course-passage"><div class="eyebrow">ORIGINAL RICHMOUNT READING</div><h2>${esc(p.title)}</h2>${p.paragraphs.map((para,i)=>`<p><strong class="course-paragraph-label">${esc(p.labels?.[i]||String.fromCharCode(65+i))}</strong> ${esc(typeof para==='string'?para:para.text)}</p>`).join('')}</article><section class="card"><h2>Questions ${qs[0]?.id}–${qs.at(-1)?.id}</h2>${list(p.instructions)}${qs.map(q=>questionHTML(q,d.responses.reading[q.id])).join('')}</section></div>`;
}
function writingHTML(a,d){const t=a.writing[writingTab],key='mock:'+draftKey(a.id)+':'+d.id+':'+writingTab;d.responses[writingTab]=savedWritingText(key,d.responses[writingTab]||'');return `<div class="tabs">${['task1','task2'].map((key,i)=>button('Task '+(i+1),'writing-tab',`data-task="${key}"`,'tab '+(key===writingTab?'active':''))).join('')}</div><section class="card"><div class="eyebrow">${t.min} MINIMUM WORDS · ABOUT ${t.minutes} MINUTES</div><h2>${esc(t.title)}</h2><p class="preserve-lines">${esc(t.prompt)}</p>${tableHTML(t.table)}${list(t.instructions)}<label for="courseWriting">Your response</label><p class="small muted">Type your own response. Pasting and dragging text into this box are disabled.</p><textarea id="courseWriting" data-course-text="${writingTab}" data-writing-draft-key="${esc(key)}" rows="18" maxlength="15000" spellcheck="false">${esc(d.responses[writingTab])}</textarea><p class="small muted" data-course-word-count>${words(d.responses[writingTab])} / ${t.min} minimum words</p>${draftToolsHTML({key,inputId:'courseWriting'})}</section>`;}
function speakingPromptHTML(s){return `<h3>Part 1 · Familiar topics</h3>${list(s.part1.questions)}<h3>Part 2 · Your long turn</h3><p><strong>${esc(s.part2.cueCard.topic)}</strong></p>${list(s.part2.cueCard.bullets)}<p class="small muted">Prepare for one minute, then speak for one to two minutes.</p><h3>Part 3 · Discussion</h3>${list(s.part3.questions)}`;}
function speakingHTML(a,d){return `<section class="card"><h2>Speaking · Three-part practice</h2><p class="small muted">Practise with a partner acting as examiner, or respond aloud. Record all parts in one file for your teacher.</p>${speakingPromptHTML(a.speaking)}<label for="courseNotes">Preparation notes (optional)</label><textarea id="courseNotes" data-course-text="notes" rows="5" maxlength="8000">${esc(d.responses.speaking.notes)}</textarea>${recordingHTML(a.id)}<p class="small muted">Your recording stays on this device until you finish the mock and choose Upload recording. Then you may delete and redo it, up to three successful uploads.</p></section>`;}
function recordingHTML(id){
 const own=audioOwner===scope&&audioActivity===id;return `<div class="course-recording"><h3>Your speaking recording</h3><div class="button-row">${button(recorder&&own?'Stop recording':'Record with microphone',recorder&&own?'stop-recording':'record','','soft')}<label class="button secondary">Choose audio<input class="sr-only" id="courseAudioFile" type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm,.flac"></label></div><p class="small muted">Audio up to 25 MB. Choosing or deleting an unsent draft does not use an upload attempt.</p>${own&&draftUrl?`<audio controls controlslist="nodownload" data-course-media src="${esc(draftUrl)}"></audio><p class="small">${esc(draftAudio?.name||'Microphone recording')} · ${Math.ceil((draftAudio?.size||0)/1024)} KB</p><div class="button-row">${button('Delete draft & redo','delete-draft','','secondary')}</div>`:''}</div>`;
}
function resultHTML(a,d,rows){
 const cached=d?options.submissionResult(d.id):null,review=resultCache.get(a.id)||cached?.review,records=cached?.submissions||rows,status=d&&!d.previous?options.submissionStatus(d.id):'sent';
 return `<section class="card"><span class="pill ${status==='sent'?'cloud-sent':''}">${status==='sent'?'✓ Shared with Teacher Angelo':'Waiting to send'}</span><h2>${a.type==='mock'?'Your mock is finished.':'Your homework is saved.'}</h2>${status!=='sent'?`<p>Your completed work is in the sending queue on this device. Keep this browser’s data until it reaches your teacher.</p>${button('Send pending work','retry')}`:'<p>Your teacher can open your original work and leave feedback.</p>'}<div class="button-row"><a class="button secondary" href="#class">Teacher feedback →</a><a class="button secondary" href="${a.type==='mock'?'#course':'#homework'}">Weekly course →</a>${records.length?button('Refresh saved responses & feedback','load-results','','soft'):''}${a.type==='mock'?button('Start another practice attempt','new-attempt','','secondary'):''}</div></section>${review?review.map(r=>{
  const p=r.payload,row=r.feedback!==undefined?r:records.find(s=>s.id===r.id)||r,feedback=row.reviewed&&row.feedback?`<div class="teacher-comment"><strong>Teacher feedback${row.teacher_score?' · '+esc(row.teacher_score):''}</strong><p class="preserve-lines">${esc(row.feedback)}</p></div>`:'';
  if(p.kind==='writing')return `<section class="card"><div class="eyebrow">${p.result.wordCount} WORDS</div><h2>${esc(p.title)}</h2><div class="notice"><strong>Fantastic effort! You’ve finished your writing activity.</strong></div><details><summary>Your submitted response & revision practice</summary><div class="corrected-text">${esc(p.text||'(No response)')}</div>${p.coach?writingFeedbackHTML(p.coach,p.text):writingFeedbackHTML(basicWritingReport(p.text),p.text)}<label for="postMock-${r.id}">Practise a new revision (your test response stays saved)</label><textarea id="postMock-${r.id}" data-coach-revision="submitted:${r.id}" data-writing-draft-key="submitted:${r.id}" rows="10" maxlength="30000">${esc(coachRevision('submitted:'+r.id,p.text||''))}</textarea>${writingGuideHTML(a.type==='homework'?a:{...a.writing[p.min===250?'task2':'task1']},{key:'submitted:'+r.id,inputId:'postMock-'+r.id,text:coachRevision('submitted:'+r.id,p.text||''),revision:true})}${draftToolsHTML({key:'submitted:'+r.id,inputId:'postMock-'+r.id})}${coachHTML('submitted:'+r.id,{submissionId:r.id},p.text||'','postMock-'+r.id)}</details>${feedback}</section>`;

  if(p.details)return `<section class="card"><h2>${esc(p.title)} · ${p.score}/${p.total}</h2><details><summary>Review your answers</summary>${p.details.map(q=>`<div class="course-answer-review"><strong>${q.id}. ${esc(q.text)}</strong><p>Your answer: ${esc(q.given||'(blank)')}</p><p class="${q.correct?'course-correct':''}">${q.correct?'✓ Correct':'Review'} · Accepted: ${esc(Array.isArray(q.answer)?q.answer.join(' / '):q.answer)}</p><small>${esc(q.evidence)}</small></div>`).join('')}</details>${feedback}</section>`;
  return `<section class="card"><h2>${esc(p.title)}</h2><p class="preserve-lines">${esc(p.notes||'No preparation notes saved.')}</p>${feedback}${recordingHTML(a.id)}${audioOwner===scope&&audioActivity===a.id&&draftAudio?button(audioBusy?'Uploading…':'Upload draft recording','upload',audioBusy?'disabled':'','soft'):''}${studentAudioHTML(r.id,'speaking')}</section>`;
 }).join(''):records.some(r=>r.kind==='speaking')?`<section class="card"><h2>Speaking recording</h2>${recordingHTML(a.id)}${audioOwner===scope&&audioActivity===a.id&&draftAudio?button('Upload draft recording','upload','','soft'):''}${studentAudioHTML(records.find(r=>r.kind==='speaking').id,'speaking')}</section>`:''}`;
}
function unfinishedMock(d){return d?.type==='mock'&&!!d.startedAt&&!d.finished;}
function stageTime(d){return (stages[d.stage]?.minutes||40)*60000;}
function remainingTime(d,now=Date.now()){return Math.max(0,d.paused?(Number.isFinite(d.remainingMs)?d.remainingMs:stageTime(d)):(Number.isFinite(d.end)?d.end-now:stageTime(d)));}
function timerText(d){const s=Math.ceil(remainingTime(d)/1000);return Math.floor(s/60).toString().padStart(2,'0')+':'+(s%60).toString().padStart(2,'0');}
function clockStatus(d){return d.paused?'Timer paused · You can keep working. Resume the timer when you are ready.':'Timer running · Answering, typing, playing audio or leaving this page pauses it.';}
function updateCourseTimer(){const d=drafts[draftKey(currentId())];if(!unfinishedMock(d))return;document.querySelectorAll('[data-course-timer]').forEach(n=>{n.textContent=timerText(d);n.classList.toggle('warning',!d.paused&&remainingTime(d)<60000);});const b=document.querySelector('[data-course-action="toggle-timer"]');if(b){b.textContent=d.paused?'Resume timer ▶':'Pause timer ⏸';b.setAttribute('aria-label',d.paused?'Resume mock test timer':'Pause mock test timer');}const status=document.querySelector('[data-course-clock-status]');if(status&&status.textContent!==clockStatus(d))status.textContent=clockStatus(d);}
function pauseDraft(d,reason){if(!unfinishedMock(d)||d.paused)return false;d.remainingMs=remainingTime(d);d.end=null;d.paused=true;d.clockVersion=2;d.pauseReason=reason;return true;}
function pauseMock(id=currentId(),reason='You paused the timer.'){const d=drafts[draftKey(id)];if(pauseDraft(d,reason)){save();updateCourseTimer();}}
function resumeMock(id=currentId()){const d=drafts[draftKey(id)];if(!unfinishedMock(d)||!d.paused||id!==currentId()||document.hidden)return;d.end=Date.now()+remainingTime(d);d.paused=false;d.pauseReason='';d.clockVersion=2;save();updateCourseTimer();}
function pauseAwayMocks(all=false,reason='You left the mock test page.'){let changed=false;for(const [id,d] of Object.entries(drafts))if(all||document.hidden||draftKey(currentId())!==id)changed=pauseDraft(d,reason)||changed;if(changed){save();updateCourseTimer();}}
function startMock(a){clearAudio();passageTab=0;writingTab='task1';const now=Date.now();drafts[draftKey(a.id)]={id:crypto.randomUUID(),activityId:a.id,weeklyKey:details.get(a.id)?.weeklyKey,type:'mock',stage:0,furthestStage:0,sectionRemainingMs:{0:stages[0].minutes*60000},clockVersion:2,paused:false,remainingMs:stages[0].minutes*60000,end:now+stages[0].minutes*60000,startedAt:now,responses:{listening:{},reading:{},task1:'',task2:'',speaking:{notes:'',checklist:[]}}};save();rerender();}
function finish(a,d){if(d.finished)return;d.finished=true;d.finishedAt=Date.now();save();if(options.queueSubmission(a.id,JSON.parse(JSON.stringify(d)))){d.queued=true;save();}rerender();}
function furthestSection(d){return Math.min(stages.length-1,Math.max(d.stage,Number.isInteger(d.furthestStage)?d.furthestStage:d.stage));}
function openSection(d,target,{advance=false,expired=false}={}){
 if(!unfinishedMock(d)||!Number.isInteger(target)||target<0||target>=stages.length||target===d.stage)return false;
 const furthest=furthestSection(d);if(target>furthest&&(!advance||target!==d.stage+1))return false;
 stopCourseMedia();if(recorder?.state==='recording')recorder.stop();
 const times={...d.sectionRemainingMs,[d.stage]:Math.min(stageTime(d),remainingTime(d))};
 // Older attempts did not record time for sections already left. Keep those
 // sections available for review without granting them a fresh countdown.
 const limit=stages[target].minutes*60000,remaining=Number.isFinite(times[target])?Math.max(0,Math.min(limit,times[target])):target<=furthest?0:limit;
 d.stage=target;d.furthestStage=Math.max(furthest,target);d.sectionRemainingMs={...times,[target]:remaining};d.remainingMs=remaining;d.end=null;d.paused=true;d.clockVersion=2;
 d.pauseReason=expired?'The previous section ended. Resume this section when you are ready.':target>furthest?'Your next section is ready.':'Your saved section is open. Resume the timer when you are ready.';
 save();rerender();return true;
}
function next(a,d,expired=false){if(!unfinishedMock(d))return;if(d.stage===3){stopCourseMedia();if(recorder?.state==='recording')recorder.stop();finish(a,d);return;}openSection(d,d.stage+1,{advance:true,expired});}
export function processCourseExpiry(){syncScope();pauseAwayMocks();let changed=false;for(const [id,d] of Object.entries(drafts)){if(!unfinishedMock(d)||d.paused)continue;const a=details.get(id.split('@')[0])?.activity;if(!a)continue;if(remainingTime(d)===0){next(a,d,true);continue;}d.remainingMs=remainingTime(d);changed=true;}if(changed)save();}
async function loadResults(a){
 const cached=options.submissionResult(drafts[draftKey(a.id)]?.id),rows=cached?.submissions||completedRows(a.id),owner=scope,version=generation,period=details.get(a.id)?.weeklyKey;if(!rows.length||resultLoading.has(a.id))return;resultLoading.add(a.id);
 try{const attempt=rows[0].attempt_id,selected=a.type==='mock'?rows.filter(r=>r.attempt_id===attempt):rows.slice(0,1);const review=await Promise.all(selected.map(async r=>(await options.studentRequest('/api/student/submissions/'+r.id)).submission));if(scope===owner&&generation===version&&details.get(a.id)?.weeklyKey===period)resultCache.set(a.id,review);}
 catch(e){options.toast?.(e.message);}finally{if(scope===owner&&generation===version){resultLoading.delete(a.id);rerender();}}
}
async function record(id){
 pauseFloatingAudio();
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('Use a voice recorder on your device, then choose the audio file here.');
 clearAudio();const owner=scope,version=generation,serial=audioVersion,period=draftKey(id),media=await navigator.mediaDevices.getUserMedia({audio:true});if(scope!==owner||version!==generation||serial!==audioVersion||draftKey(currentId())!==period){media.getTracks().forEach(t=>t.stop());return;}
 stream=media;audioOwner=owner;audioActivity=id;const chunks=[],recording=new MediaRecorder(media);recorder=recording;
 recording.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 recording.onstop=()=>{media.getTracks().forEach(t=>t.stop());if(scope!==owner||version!==generation||serial!==audioVersion||audioActivity!==id)return;draftAudio=new Blob(chunks,{type:chunks[0]?.type||'audio/webm'});if(draftAudio.size>25*1024*1024){clearAudio();options.toast?.('This recording exceeds 25 MB. Record a shorter response.');return;}draftUrl=URL.createObjectURL(draftAudio);if(recorder===recording)recorder=null;rerender();};
 recording.start();rerender();
}
async function uploadDraft(a){
 if(!draftAudio||audioOwner!==scope||audioActivity!==a.id)throw new Error('Choose or finish your own recording first.');
 const owner=scope,version=generation;await options.flush();if(scope!==owner||version!==generation)throw new Error('Your class code changed. Reopen your own activity.');
 const rows=options.submissionResult(drafts[draftKey(a.id)]?.id)?.submissions||completedRows(a.id),row=rows.find(r=>r.kind==='speaking');if(!row)throw new Error('Your activity is waiting to send. Send pending work before uploading audio.');
 audioBusy=true;try{await uploadSpeakingRecording(row.id,draftAudio);if(scope===owner&&version===generation){clearAudio();void loadIndex(true);}}finally{audioBusy=false;rerender();}
}
async function material(id,play=false){
 const owner=scope,version=generation,target=currentId();
 try{const access=await options.materialAccess(id),url=new URL(access.url);if(url.origin!==new URL(options.origin()).origin||!url.pathname.startsWith('/api/materials/file/'))throw new Error('This material link could not be opened.');
  if(scope!==owner||generation!==version||currentId()!==target){return;}
  if(play){const p=document.querySelector('#courseListeningPlayer'),floated=openFloatingAudio({url:url.href,title:access.title||'Uploaded weekly listening test recording',owner:floatingAudioOwner(),autoplay:false});if(p)p.innerHTML=floated?'<p class="small muted">Your floating player is ready. Press Play, then answer or read the paper while listening.</p>':`<audio controls preload="metadata" controlslist="nodownload" data-course-media src="${esc(url.href)}" aria-label="${esc(access.title||'Uploaded weekly listening test recording')}"></audio>`;}
  else{const paper=document.querySelector('#courseListeningPaper');if(paper){stopBookReaders(paper);paper.innerHTML=studentDocumentHTML(access);await mountBookReader(paper.querySelector('.book-reader'),access);}}
 }catch(e){throw e;}
}
export function teacherCourseHTML({mode='course',skill=''}={}){
 if(!teacherIndex)return `<section class="card" aria-live="polite"><h2>Weekly course & homework</h2>${teacherError?`<p class="notice warm">${esc(teacherError)}</p>${button('Try again','teacher-refresh')}`:'<p>Opening your eight-week course…</p>'}</section>`;
 const students=options.teacherStudents?.()||[],rows=teacherIndex.submissions||[];
 return `<section class="card"><div class="section-head"><div><h2>Your weekly course.</h2><p class="small muted">Eight mocks and sixteen homework tasks. Save sharing settings, due dates, and instructions, then copy the links for students.</p></div>${button(teacherLoading?'Refreshing…':'Refresh course','teacher-refresh',teacherLoading?'disabled':'','secondary')}</div><div class="table-wrap"><table class="course-tracker"><caption>Completion tracker · Speaking homework needs an uploaded recording.</caption><thead><tr><th>Student</th>${teacherIndex.weeks.map(w=>`<th>Week ${w.week}</th>`).join('')}</tr></thead><tbody>${students.map(s=>`<tr><th>${esc(s.name)}</th>${teacherIndex.weeks.map(w=>{
  const own=rows.filter(r=>r.student_id===s.id&&r.week===w.week),count=new Set(own.filter(r=>r.context==='weekly-mock').map(r=>r.attempt_id)).size,write=own.some(r=>r.context==='homework'&&r.kind==='writing'),speak=own.some(r=>r.context==='homework'&&r.kind==='speaking'&&r.recordings>0);
  return `<td><span>${count?'✓ Mock '+count:'— Mock'}</span><span>${write?'✓':'—'} Writing</span><span>${speak?'✓':'—'} Speaking</span></td>`;
 }).join('')}</tr>`).join('')||'<tr><td colspan="9">Add students in Students & class codes to track work.</td></tr>'}</tbody></table></div></section>${teacherPreview?teacherPreviewHTML(teacherPreview):teacherPreviewFlight?'<section class="card" aria-live="polite"><h3>Opening teacher tasks & keys…</h3></section>':teacherPreviewError?`<p class="notice warm" role="alert">${esc(teacherPreviewError)}</p>`:''}<div class="course-week-grid">${teacherIndex.weeks.map(w=>`<section class="card course-week"><h2>Week ${w.week} · ${esc(w.title)}</h2>${teacherIndex.activities.filter(a=>a.week===w.week&&(mode==='course'||a.type===mode)&&(!skill||a.type==='mock'||a.kind===skill)).map(a=>{
  const d=teacherDrafts[a.id]||a;return `<form data-course-setting="${esc(a.id)}" class="course-sharing"><h3>${esc(a.title)}</h3><label class="check-item"><input name="published" type="checkbox" ${d.published?'checked':''}>Share with students</label><label>Due date (optional)<input name="dueDate" type="date" value="${esc(d.dueDate)}"></label><label>Instruction for students<textarea name="message" rows="2" maxlength="500">${esc(d.message)}</textarea></label><div class="button-row"><button class="button soft">Save activity</button>${button('Preview tasks & keys','teacher-preview',`data-id="${esc(a.id)}"`,'secondary')}${button('Copy student link','copy-link',`data-link="${esc(a.shareUrl)}"`,'secondary')}</div><input class="course-share-link" readonly aria-label="Student activity link" value="${esc(a.shareUrl)}"></form>`;
 }).join('')}<div class="button-row">${button('Review mock submissions','inbox',`data-week="${w.week}" data-context="weekly-mock"`,'secondary')}${button('Review homework','inbox',`data-week="${w.week}" data-context="homework"`,'secondary')}</div></section>`).join('')}</div>`;
}
function teacherPreviewHTML(a){
 return `<section class="card course-private-preview" id="courseTeacherPreview"><div class="section-head"><div><span class="pill">Teacher only</span><h2>${esc(a.title)}</h2></div>${button('Close preview','close-preview','','secondary')}</div>${a.type==='mock'?`<details><summary>Listening · uploaded paper & key</summary><p>Question paper: ${esc(a.listening.paperId)}. Open it in Lesson resources.</p>${a.listening.questions.map(q=>`<p>${q.id}. ${esc(Array.isArray(q.answer)?q.answer.join(' / '):q.answer)} <small>${esc(q.evidence)}</small></p>`).join('')}</details><details><summary>Reading · passages, questions & evidence</summary>${a.reading.passages.map(p=>`<h3>${esc(p.title)}</h3>${p.paragraphs.map((para,i)=>`<p><strong>${String.fromCharCode(65+i)}</strong> ${esc(typeof para==='string'?para:para.text)}</p>`).join('')}${a.reading.questions.filter(q=>q.passageId===p.id).map(q=>`<p><strong>${q.id}. ${esc(q.text)}</strong><br>Answer: ${esc(Array.isArray(q.answer)?q.answer.join(' / '):q.answer)}<br><small>${esc(q.evidence)}</small></p>`).join('')}`).join('')}</details><details><summary>Writing tasks & teacher notes</summary>${['task1','task2'].map(k=>`<h3>${esc(a.writing[k].title)}</h3><p>${esc(a.writing[k].prompt)}</p>${tableHTML(a.writing[k].table)}${list(a.writing[k].teacherNotes)}`).join('')}</details><details><summary>Speaking prompts & teacher notes</summary>${speakingPromptHTML(a.speaking)}${list(a.speaking.teacherNotes)}</details>`:`<p>${esc(a.prompt)}</p>${list(a.instructions)}<h3>Teacher notes</h3>${list(a.teacherNotes)}${a.rubric?`<pre class="course-rubric">${esc(JSON.stringify(a.rubric,null,2))}</pre>`:''}`}</section>`;
}
export async function loadTeacherCourse(force=false){if(teacherLoading||(!force&&(teacherIndex||teacherError)))return;const version=teacherGeneration;teacherLoading=true;teacherError='';try{const v=await options.teacherRequest('/api/teacher/course');if(version===teacherGeneration)teacherIndex=v;}catch(e){if(version===teacherGeneration)teacherError=e.message;}finally{if(version===teacherGeneration){teacherLoading=false;rerender();}}}
export function loadTeacherPreview(id,force=false){
 if(!/^[a-z0-9-]{1,60}$/.test(id||''))return Promise.resolve();
 if(!force&&teacherPreviewId===id&&(teacherPreviewFlight||teacherPreview||teacherPreviewError))return teacherPreviewFlight||Promise.resolve();
 const version=teacherGeneration;teacherPreviewId=id;teacherPreview=null;teacherPreviewError='';
 teacherPreviewFlight=Promise.resolve().then(()=>options.teacherRequest('/api/teacher/course/'+id)).then(value=>{if(version===teacherGeneration&&teacherPreviewId===id)teacherPreview=value.activity;}).catch(error=>{if(version===teacherGeneration&&teacherPreviewId===id)teacherPreviewError=error.message;}).finally(()=>{if(version===teacherGeneration&&teacherPreviewId===id){teacherPreviewFlight=null;rerender();}});
 return teacherPreviewFlight;
}
export function resetTeacherCourse(){teacherGeneration++;teacherIndex=null;teacherLoading=false;teacherError='';teacherDrafts={};teacherPreview=null;teacherPreviewId='';teacherPreviewFlight=null;teacherPreviewError='';}
export function initCourse(callbacks){
 options=callbacks;syncScope();const app=document.querySelector('#app');
 function keepSetting(e){const f=e.target.closest('[data-course-setting]');if(f)teacherDrafts[f.dataset.courseSetting]={published:f.elements.published.checked,dueDate:f.elements.dueDate.value,message:f.elements.message.value};}
 app.addEventListener('input',e=>{
  const field=e.target.dataset.courseText,a=active(),d=a?drafts[draftKey(a.id)]:null;if(field||e.target.dataset.courseAnswer)pauseMock();if(field&&d&&!d.finished){if(a.type==='mock'){if(field==='notes')d.responses.speaking.notes=e.target.value;else d.responses[field]=e.target.value;}else d[field]=e.target.value;save();const n=document.querySelector('[data-course-word-count]');if(n)n.textContent=words(e.target.value)+' words';}
  const q=e.target.dataset.courseAnswer;if(q&&a&&d&&!d.finished){d.responses[stages[d.stage].id][q]=e.target.value;save();}keepSetting(e);
 });
 app.addEventListener('change',e=>{
  const a=active(),d=a?drafts[draftKey(a.id)]:null,q=e.target.dataset.courseAnswer;if(q||e.target.id==='courseAudioFile')pauseMock();if(q&&d&&!d.finished){d.responses[stages[d.stage].id][q]=e.target.value;save();}keepSetting(e);
  if(e.target.id==='courseAudioFile'){const f=e.target.files?.[0];if(!f||!a)return;if(f.size>25*1024*1024){options.toast?.('Choose audio of 25 MB or less.');return;}if(!f.type.startsWith('audio/')&&!/\.(mp3|m4a|wav|ogg|webm|flac)$/i.test(f.name)){options.toast?.('Choose an audio file.');return;}clearAudio();draftAudio=f;draftUrl=URL.createObjectURL(f);audioOwner=scope;audioActivity=a.id;rerender();}
 });
 app.addEventListener('submit',async e=>{
  const f=e.target.closest('[data-course-setting]');if(!f)return;e.preventDefault();const id=f.dataset.courseSetting,version=teacherGeneration,b=f.querySelector('button');b.disabled=true;
  try{const setting=teacherDrafts[id]||{published:f.elements.published.checked,dueDate:f.elements.dueDate.value,message:f.elements.message.value};await options.teacherRequest('/api/teacher/course/'+id,{method:'PATCH',body:JSON.stringify(setting)});if(version===teacherGeneration){delete teacherDrafts[id];await loadTeacherCourse(true);options.toast?.('Activity saved for students.');}}
  catch(error){options.toast?.(error.message);}finally{b.disabled=false;}
 });
 app.addEventListener('click',async e=>{
  const b=e.target.closest('[data-course-action]');if(!b||b.disabled)return;const action=b.dataset.courseAction,a=active(),d=a?drafts[draftKey(a.id)]:null;
  try{
   if(action==='refresh'){index=null;indexError='';if(currentId()){details.delete(currentId());errors.delete(currentId());}rerender();mountCourse();}
   else if(action==='start'&&a)startMock(a);
   else if(action==='toggle-timer'&&d){if(d.paused)resumeMock();else pauseMock();}
   else if(action==='save-later'&&d){pauseMock();save();location.hash='mock';rerender();}
   else if(action==='back'&&a&&d)openSection(d,d.stage-1);
   else if(action==='section'&&a&&d)openSection(d,Number(b.dataset.stage));
   else if(action==='next'&&a&&d&&(d.stage!==3||confirm('Finish this mock and send all sections to your teacher? Review earlier sections first if you need to change an answer.')))next(a,d);
   else if(action==='passage'){passageTab=Number(b.dataset.index);rerender();}
   else if(action==='writing-tab'){writingTab=b.dataset.task;rerender();}
   else if(action==='paper')await material(b.dataset.file);
   else if(action==='load-audio')await material(b.dataset.file,true);
   else if(action==='record'&&a){pauseMock();await record(a.id);}
   else if(action==='stop-recording')recorder?.stop();
   else if(action==='delete-draft'){clearAudio();rerender();}
   else if(action==='submit-homework'&&a&&d){
    if(a.kind==='writing'&&!d.text?.trim())throw new Error('Write your homework before submitting it.');
    if(a.kind==='speaking'&&(!draftAudio||audioOwner!==scope||audioActivity!==a.id))throw new Error('Record or choose your speaking audio before submitting.');
    if(a.kind==='writing'){if(!document.querySelector('[data-writing-confident]')?.checked)throw new Error('Confirm that you’re confident with your own answer before submitting.');d.coachReportId=coachReportId(homeworkCoachKey(a.id),d.text);}else if(!confirm('Share this homework with Teacher Angelo?'))return;finish(a,d);if(a.kind==='speaking')await uploadDraft(a);
   }
   else if(action==='retry'){await options.flush();const pending=drafts[draftKey(a?.id)];if(a&&pending?.finished&&!options.submissionStatus(pending.id)){options.queueSubmission(a.id,pending);await options.flush();}void loadIndex(true);rerender();}
   else if(action==='upload'&&a)await uploadDraft(a);
   else if(action==='load-results'&&a)await loadResults(a);
   else if(action==='previous'&&a){await loadResults(a);drafts[draftKey(a.id)]={id:crypto.randomUUID(),activityId:a.id,weeklyKey:details.get(a.id)?.weeklyKey,type:'mock',finished:true,previous:true};save();rerender();}
   else if(action==='new-attempt'&&a){if(options.submissionStatus(d?.id)==='pending')throw new Error('Send this completed attempt before starting another.');if(confirm('Start a blank attempt? Your submitted work stays with your teacher.')){delete drafts[draftKey(a.id)];resultCache.delete(a.id);clearAudio();save();rerender();}}
   else if(action==='teacher-refresh')await loadTeacherCourse(true);
   else if(action==='teacher-preview'){const pending=loadTeacherPreview(b.dataset.id,true);rerender();await pending;document.querySelector('#courseTeacherPreview')?.scrollIntoView({behavior:'smooth'});}
   else if(action==='close-preview'){teacherPreview=null;teacherPreviewId='';teacherPreviewError='';if(location.hash.startsWith('#teacher/')&&location.hash.slice(1).split('/')[2])location.hash=location.hash.split('/').slice(0,2).join('/');rerender();}
   else if(action==='copy-link'){try{await navigator.clipboard.writeText(b.dataset.link);options.toast?.('Student activity link copied.');}catch{options.toast?.('Copy the student link shown below the activity.');}}
   else if(action==='inbox')options.openInbox(Number(b.dataset.week),b.dataset.context);
  }catch(error){options.toast?.(error.message);}
 });
 app.addEventListener('focusin',e=>{if(e.target.dataset.courseAnswer||e.target.dataset.courseText)pauseMock();});
 app.addEventListener('play',e=>{if(/^(AUDIO|VIDEO)$/i.test(e.target.tagName||''))pauseMock();},true);
 window.addEventListener('hashchange',()=>pauseAwayMocks());
 window.addEventListener('blur',()=>pauseAwayMocks(true,'You moved away from the studio.'));
 window.addEventListener('beforeunload',()=>{pauseAwayMocks(true);save();});
 window.addEventListener('pagehide',()=>{pauseAwayMocks(true);save();stream?.getTracks().forEach(t=>t.stop());});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseAwayMocks(true);updateCourseTimer();});
 setInterval(()=>{processCourseExpiry();updateCourseTimer();},1000);
}
