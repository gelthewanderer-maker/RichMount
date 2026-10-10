import {lessonMaterials} from './materials-data.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let options={},connected=false;
const filters={student:{query:'',type:'all'},teacher:{query:'',type:'all'}};
const duration=seconds=>seconds?Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'';
const size=bytes=>bytes>=1000000?(bytes/1000000).toFixed(1)+' MB':Math.round(bytes/1000)+' KB';
const button=(text,file,mode,role,disabled)=>`<button class="button ${mode==='play'?'soft':'secondary'}" data-material-open="${mode}" data-material-id="${esc(file.id)}" data-material-role="${role}" ${disabled?'disabled':''}>${text}</button>`;

export function materialsPage({role='student',catalog=lessonMaterials,isConnected=connected}={}){
  const teacher=role==='teacher',ready=teacher||isConnected;
  if(!catalog)return '<section class="card" aria-live="polite"><h3>Opening your lesson resources…</h3><p>Please wait while your private files load.</p></section>';
  const all=catalog.lessons.flatMap(lesson=>lesson.files),audio=all.filter(file=>file.kind==='audio').length,documents=all.filter(file=>file.kind==='document').length,videos=all.filter(file=>file.kind==='video').length,slides=all.filter(file=>file.kind==='slides').length;
  const f=filters[role];
  return `<section id="materialsSection" data-material-role="${role}"><div class="page-head"><div class="eyebrow">${teacher?'YOUR TEACHING RESOURCES':'YOUR CLASSROOM RESOURCES'}</div><h1>${teacher?'Every lesson, in one place.':'Your lessons, ready to play.'}</h1><p>${teacher?'Student books, recordings and your private presentation slides, organised by lesson day.':'Open your student book, then listen to the recording for the same lesson. You can download files for your own study.'}</p></div><div class="materials-overview"><span class="pill">${catalog.lessons.length} lesson days</span><span class="pill">${documents} student documents</span><span class="pill">${audio} audio tracks</span><span class="pill">${videos} lesson ${videos===1?'video':'videos'}</span>${teacher?`<span class="pill materials-private">${slides} private slide decks</span>`:''}</div>${!ready?'<div class="notice materials-join"><div><strong>Your class materials are waiting.</strong><p>Join with your individual class code to open books and recordings.</p></div><a class="button" href="#class">Join your class →</a></div>':teacher?'<p class="small muted">Teacher slides are available only here, after teacher sign-in.</p>':'<p class="small muted">Use the questions in the matching student book while listening. These class recordings accompany your uploaded books.</p>'}<div class="materials-toolbar"><div><label for="materialSearch">Find a lesson</label><input type="search" id="materialSearch" data-material-filter="search" placeholder="Search a day, topic or practice test" value="${esc(f.query)}"></div><div><label for="materialType">Show</label><select id="materialType" data-material-filter="type"><option value="all" ${f.type==='all'?'selected':''}>All lesson days</option><option value="lesson" ${f.type==='lesson'?'selected':''}>Skill lessons</option><option value="practice" ${f.type==='practice'?'selected':''}>Listening practice tests</option></select></div></div><p class="small muted" id="materialsResultCount" aria-live="polite">${catalog.lessons.length} lesson days</p><div class="materials-grid">${catalog.lessons.map(lesson=>{
    const tracks=lesson.files.filter(file=>['audio','video'].includes(file.kind)).length;
    return `<details class="materials-card" data-material-day="${lesson.day}" data-material-kind="${lesson.type}" data-material-search="${esc(('day '+lesson.day+' '+lesson.title+' '+(lesson.lesson?'lesson '+lesson.lesson:'')).toLowerCase())}"><summary><span class="materials-day">DAY ${String(lesson.day).padStart(2,'0')}</span><span class="materials-heading"><strong>${esc(lesson.title)}</strong><small>${lesson.lesson?'Lesson '+lesson.lesson+' · ':''}Student book${tracks?' · '+tracks+' '+(tracks===1?'recording':'recordings'):''}</small></span><span class="materials-chevron" aria-hidden="true">⌄</span></summary><div class="materials-files">${lesson.files.map(file=>`<div class="materials-file ${file.kind==='slides'?'materials-teacher-file':''}" data-material-file="${esc(file.id)}"><div class="materials-file-heading"><span class="materials-file-icon" aria-hidden="true">${file.kind==='audio'?'♫':file.kind==='video'?'▷':file.kind==='slides'?'▧':'▤'}</span><div><h3>${esc(file.title)}${file.kind==='slides'?'<span class="pill materials-private">Teacher only</span>':''}</h3><p>${esc(file.filename)} · ${file.filename.split('.').pop().toUpperCase()} · ${size(file.size)}${file.duration?' · '+duration(file.duration):''}</p></div></div><div class="materials-file-actions">${file.mime==='application/pdf'?button('Open book ↗',file,'view',role,!ready):''}${['audio','video'].includes(file.kind)?button(file.kind==='audio'?'Open audio player':'Open video player',file,'play',role,!ready):''}${button('Download ↓',file,'download',role,!ready)}</div><div data-material-status="${esc(file.id)}" class="small materials-status" role="status" aria-live="polite"></div><div data-material-player="${esc(file.id)}"></div></div>`).join('')}</div></details>`;
  }).join('')}</div><div class="empty" id="materialsEmpty" hidden><h3>No matching lessons.</h3><p>Try a different topic or select all lesson days.</p></div></section>`;
}

export function mountMaterials(){
  const section=document.querySelector('#materialsSection');if(!section)return;
  const f=filters[section.dataset.materialRole];let count=0;
  const query=f.query.trim().toLowerCase();
  section.querySelectorAll('[data-material-day]').forEach(card=>{card.hidden=!(card.dataset.materialSearch.includes(query)&&(f.type==='all'||card.dataset.materialKind===f.type));if(!card.hidden)count++;});
  section.querySelector('#materialsResultCount').textContent=count+' '+(count===1?'lesson day':'lesson days');
  section.querySelector('#materialsEmpty').hidden=count!==0;
}

export function initMaterials(callbacks){
  options=callbacks;connected=!!callbacks.isConnected();
  const app=document.querySelector('#app');
  app.addEventListener('input',event=>{
    if(event.target.dataset.materialFilter!=='search')return;
    const role=event.target.closest('#materialsSection').dataset.materialRole;filters[role].query=event.target.value;mountMaterials();
  });
  app.addEventListener('change',event=>{
    if(event.target.dataset.materialFilter!=='type')return;
    const role=event.target.closest('#materialsSection').dataset.materialRole;filters[role].type=event.target.value;mountMaterials();
  });
  app.addEventListener('click',async event=>{
    const b=event.target.closest('[data-material-open]');if(!b||b.disabled)return;
    const id=b.dataset.materialId,role=b.dataset.materialRole,mode=b.dataset.materialOpen;
    const row=b.closest('[data-material-file]'),status=row.querySelector('[data-material-status]'),player=row.querySelector('[data-material-player]');
    const original=b.textContent;let tab=null;
    if(mode==='view'){tab=window.open('about:blank','_blank');if(tab){tab.opener=null;tab.document.title='Opening your Richmount book';tab.document.body.textContent='Opening your Richmount book…';}}
    b.disabled=true;b.textContent='Opening…';status.textContent='Connecting to your class materials…';
    try{
      const access=await (role==='teacher'?options.teacherAccess(id):options.studentAccess(id));
      // The server returns a Richmount URL; never navigate to an arbitrary origin.
      const url=new URL(access.url),base=new URL(options.apiBase());
      if(url.origin!==base.origin||!url.pathname.startsWith('/api/materials/file/'))throw new Error('This file link could not be opened.');
      if(!row.isConnected){tab?.close();return;}
      if(mode==='play'){
        const type=access.kind==='video'?'video':'audio';
        player.innerHTML=`<${type} controls preload="metadata" data-material-media="${esc(id)}" src="${esc(url.href)}" aria-label="${esc(access.title)}"></${type}>`;
        status.textContent='Use the player controls to start. You can pause or move through the recording.';
        b.hidden=true;
      }else if(mode==='view'&&tab){tab.location.replace(url.href);status.textContent='Your student book opened in a new tab.';}
      else{
        if(mode==='download')url.searchParams.set('download','1');
        const link=document.createElement('a');link.href=url.href;link.rel='noopener noreferrer';
        if(mode==='download')link.download=access.filename;else link.target='_blank';
        link.click();status.textContent=mode==='download'?'Download requested.':'Open the book using the link below.';
        if(mode==='view'){const retry=document.createElement('a');retry.href=url.href;retry.target='_blank';retry.rel='noopener noreferrer';retry.textContent='Open student book ↗';status.replaceChildren(retry);}
      }
    }catch(error){tab?.close();status.textContent=error.message||'This file could not be opened. Please try again.';options.toast?.(status.textContent);}
    finally{b.disabled=false;b.textContent=original;}
  });
  app.addEventListener('play',event=>{if(!event.target.dataset.materialMedia)return;app.querySelectorAll('[data-material-media]').forEach(media=>{if(media!==event.target)media.pause();});},true);
  app.addEventListener('error',event=>{
    if(!event.target.dataset.materialMedia)return;
    const row=event.target.closest('[data-material-file]');row.querySelector('[data-material-status]').textContent='The recording could not load. Open the player again to retry.';
    row.querySelector('[data-material-open="play"]').hidden=false;
  },true);
}

export function refreshMaterialsConnection(){connected=!!options.isConnected?.();}
export function stopMaterialsMedia(){document.querySelectorAll('[data-material-media]').forEach(media=>media.pause());}
