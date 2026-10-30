import {openFloatingAudio,floatingAudioOwner,closeFloatingAudioSource} from './floating-audio.js?v=20261015-books1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const AUDIO_ACCEPT='.mp3,.m4a,.wav,.ogg,.webm,.flac,audio/*';
const categoryLabels={general:'General practice',speaking:'Speaking models','listening-1':'Listening · Part 1','listening-2':'Listening · Part 2','listening-3':'Listening · Part 3','listening-4':'Listening · Part 4'};
let config={},cache=new Map(),library=null,scope='',busy=false,message='';
const button=(label,action,attrs='',style='secondary')=>`<button type="button" class="button ${style}" data-audio-action="${action}" ${attrs} ${busy?'disabled':''}>${label}</button>`;
function current(){const next=config.studentId?.()||'';if(next!==scope){scope=next;cache.clear();library=null;message='';}return scope;}
export function stopClassAudio(){document.querySelectorAll('.class-audio-player audio').forEach(a=>a.pause());}
function fileList(files,role,submissionId=''){
  return files.length?`<div class="class-audio-list">${files.map(file=>`<article class="class-audio-item"><div><strong>${esc(file.title)}</strong><p class="small muted">${file.role==='student'?'Student recording · Attempt '+file.attempt:'Teacher audio'} · ${(file.size/1024/1024).toFixed(1)} MB${!file.submission_id?' · '+esc(categoryLabels[file.category]||'General practice'):''}</p></div><div class="button-row">${button('▶ Listen','play',`data-id="${file.id}" data-role="${role}"`)}${role==='teacher'&&file.role==='teacher'?`<label class="button soft audio-file-label">Replace<input type="file" accept="${AUDIO_ACCEPT}" data-audio-replace="${file.id}" ${busy?'disabled':''}></label>`:''}${role==='teacher'&&file.role==='teacher'||role==='student'&&file.role==='student'?button('Delete','delete',`data-id="${file.id}" data-role="${role}" data-submission="${submissionId}"`,'danger'):''}</div><div class="class-audio-player" id="class-audio-${file.id}"></div></article>`).join('')}</div>`:'<p class="small muted">No audio attached yet.</p>';
}
export function studentAudioHTML(id,kind='speaking'){
  current();const data=cache.get(id);
  if(!data)return `<div class="class-audio-panel">${button('Open recordings & teacher audio','open',`data-submission="${id}" data-kind="${kind}"`,'soft')}</div>`;
  return `<section class="class-audio-panel"><h4>${kind==='speaking'?'Your speaking recordings':'Teacher audio feedback'}</h4>${message?`<p class="notice warm" role="status">${esc(message)}</p>`:''}${kind==='speaking'?`<p class="small"><strong>${data.attemptsUsed} of 3 upload attempts used</strong>. Deleting a recording does not reset the count. A new upload replaces your previous recording.</p>`:''}${fileList(data.audio,'student',id)}${kind==='speaking'?`<label class="audio-file-label button soft">${data.attemptsUsed?'Redo / upload next attempt':'Upload speaking audio'}<input type="file" accept="${AUDIO_ACCEPT}" data-audio-upload="student" data-submission="${id}" ${busy||data.attemptsUsed>=3?'disabled':''}></label><p class="small muted">${data.attemptsUsed>=3?'All three attempts have been used. You can still delete or listen to your current audio.':'Choose a recording of 25 MB or less. Failed uploads do not use an attempt.'}</p>`:''}${button('Refresh audio','open',`data-submission="${id}" data-kind="${kind}"`)}</section>`;
}
export function speakingAudioHTML(id,hasRecording,mock=false){
  current();const exhausted=id&&cache.get(id)?.attemptsUsed>=3;return `<div class="class-audio-panel"><h4>Send your speaking audio</h4>${!scope?'<p class="small muted">Join your class to upload a recording for Teacher Angelo.</p><a class="button soft" href="#class">Join your class →</a>':mock?'<p class="small muted">Finish the mock first, then attach or redo your recording in My progress. Keep this tab open to upload the recording you just made.</p>':`<p class="small muted">Three successful uploads per activity. You can review your recording before sending it.</p>${button(busy?'Uploading…':exhausted?'All three attempts used':'Upload this recording to teacher','draft',hasRecording&&!exhausted?'':'disabled','soft')}${id?studentAudioHTML(id):'<p class="small muted">Or save your speaking practice, then attach an audio file below.</p>'}`}</div>`;
}
export function teacherAudioHTML(row){return `<section class="class-audio-panel"><h4>Audio attachments</h4><p class="small muted">Add several feedback recordings. Each file can be up to 25 MB; up to 50 attachments per activity. Audio is shared immediately with this student.</p>${fileList(row.audio||[],'teacher',row.id)}<label class="audio-file-label button soft">Add audio files<input type="file" multiple accept="${AUDIO_ACCEPT}" data-audio-upload="teacher" data-submission="${row.id}" ${busy?'disabled':''}></label>${message?`<p class="notice warm" role="status">${esc(message)}</p>`:''}</section>`;}
export function teacherLibraryHTML(){return `<section class="card"><h2>Your class audio library</h2><p class="small muted">Share model answers and extra listening recordings with all joined students. Add up to 200 files, 25 MB each. Replace or delete each file whenever needed.</p><label for="audioCategory">Audio category</label><select id="audioCategory">${Object.entries(categoryLabels).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select><div class="button-row"><label class="audio-file-label button soft">Add audio files<input type="file" multiple accept="${AUDIO_ACCEPT}" data-audio-upload="library" ${busy?'disabled':''}></label>${button('Refresh library','library','data-role="teacher"')}</div>${message?`<p class="notice warm" role="status">${esc(message)}</p>`:''}${library?fileList(library,'teacher'):'<p class="small muted">Open or refresh your audio library to load your files.</p>'}</section>`;}
export function studentLibraryHTML(category=''){
  current();return `<section class="card class-audio-panel"><h3>Teacher Angelo’s audio library</h3>${!scope?'<p class="small muted">Join your class to listen to your teacher’s shared recordings.</p>':`${button('Open / refresh teacher audio','library',`data-role="student" data-category="${category}"`,'soft')}${library?fileList(library.filter(f=>!category||f.category===category||f.category==='general'),'student'):''}`}</section>`;
}
function query(file,category='general'){return '?'+new URLSearchParams({filename:file.name||'Richmount_Speaking.'+(file.type.includes('mp4')?'m4a':'webm'),title:file.name||'Speaking recording',category});}
async function reloadStudent(id){const owner=current(),data=await config.studentRequest('/api/student/submissions/'+id);if(owner===current())cache.set(id,{...data.submission});}
export async function uploadSpeakingRecording(id,file){
  if(!current())throw new Error('Join your class before uploading speaking audio.');
  const previous=(cache.get(id)?.audio||[]).filter(audio=>audio.role==='student').map(audio=>audio.id),owner=current();await config.studentRequest('/api/student/submissions/'+id+'/audio'+query(file),{method:'POST',body:file,headers:{'Content-Type':file.type||'application/octet-stream'},audio:true});
  if(owner!==current())return;for(const old of previous)closeFloatingAudioSource('/api/audio/file/'+old);await reloadStudent(id);config.toast?.('Speaking audio sent. Your teacher can listen now.');config.onChange?.();
}
export function initClassAudio(callbacks){
  config=callbacks;
  document.querySelector('#app').addEventListener('click',async e=>{
    const b=e.target.closest('[data-audio-action]');if(!b||busy||b.disabled)return;const a=b.dataset.audioAction,role=b.dataset.role||'student',id=b.dataset.id,submissionId=b.dataset.submission;
    busy=true;message='';
    try{
      if(a==='draft'){await config.uploadDraft?.();}
      else if(a==='open'){await reloadStudent(submissionId);}
      else if(a==='library'){library=(await (role==='teacher'?config.teacherRequest:config.studentRequest)('/api/'+role+'/audio-library')).audio;}
      else if(a==='play'){
        const owner=floatingAudioOwner(),result=await (role==='teacher'?config.teacherRequest:config.studentRequest)('/api/'+role+'/audio/'+id+'/access');if(openFloatingAudio({url:result.url,title:b.closest?.('article')?.querySelector?.('strong')?.textContent||'Audio recording',owner,autoplay:true,originElement:b}))return;if(owner)throw new Error('Your class session changed. Open this recording again.');const target=document.getElementById('class-audio-'+id);if(target){stopClassAudio();target.innerHTML=`<audio controls preload="metadata" ${role==='student'?'controlslist="nodownload" ':''}src="${esc(result.url)}" aria-label="Audio recording"></audio><p class="small muted">If playback expires, choose Listen again.</p>`;target.querySelector('audio').play().catch(()=>{});}return;
      }else if(a==='delete'){
        if(!confirm(role==='student'?'Delete this speaking recording? The upload attempt will still count toward your three attempts.':'Delete this teacher audio attachment?'))return;
        const path=role==='student'?'/api/student/submissions/'+submissionId+'/audio/'+id:'/api/teacher/audio/'+id;
        await (role==='teacher'?config.teacherRequest:config.studentRequest)(path,{method:'DELETE',body:'{}'});closeFloatingAudioSource('/api/audio/file/'+id);
        if(role==='student')await reloadStudent(submissionId);else if(submissionId)await config.reloadTeacherDetail?.();else library=(await config.teacherRequest('/api/teacher/audio-library')).audio;
        config.toast?.('Audio deleted.');
      }
    }catch(err){message=err.message;config.toast?.(err.message);}finally{busy=false;if(a!=='play')config.onChange?.();}
  });
  document.querySelector('#app').addEventListener('change',async e=>{
    const input=e.target,mode=input.dataset.audioUpload,replace=input.dataset.audioReplace;if((!mode&&!replace)||busy)return;const files=Array.from(input.files||[]);if(!files.length)return;
    const owner=current(),category=document.querySelector('#audioCategory')?.value||'general',submissionId=input.dataset.submission;busy=true;message='';let saved=0;
    try{
      for(const file of files){
        if(file.size>25*1024*1024)throw new Error('Choose audio files of 25 MB or less.');
        if(mode==='student'){if(owner!==current())break;await uploadSpeakingRecording(submissionId,file);}
        else{const path=replace?'/api/teacher/audio/'+replace:mode==='library'?'/api/teacher/audio-library':'/api/teacher/submissions/'+submissionId+'/audio';await config.teacherRequest(path+query(file,category),{method:replace?'PUT':'POST',body:file,headers:{'Content-Type':file.type||'application/octet-stream'},audio:true});}
        if(replace)closeFloatingAudioSource('/api/audio/file/'+replace);saved++;
      }
      config.toast?.(saved+(saved===1?' audio file saved.':' audio files saved.'));
    }catch(err){message=(saved?saved+' files saved. ':'')+err.message;config.toast?.(message);}
    finally{try{if(mode==='student'&&owner===current())await reloadStudent(submissionId);else if(mode!=='student'){if(config.teacherDetailId?.())await config.reloadTeacherDetail?.();else library=(await config.teacherRequest('/api/teacher/audio-library')).audio;}}catch(err){message=err.message;}busy=false;config.onChange?.();}
  });
}
