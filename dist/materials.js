import {openFloatingAudio,floatingAudioOwner,moveFloatingAudioHome,placeFloatingAudio} from './floating-audio.js?v=20261015-books1';
import {lessonMaterials} from './materials-data.js?v=20261011-reading1';
import {slidesDocumentHTML,mountSlideReader,destroySlideReader,stopSlideReaders} from './slides.js?v=20261012-coach1';
import {bookReaderHTML,mountBookReader,destroyBookReader,stopBookReaders,resizeBookReader} from './book-reader.js?v=20261015-books1';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let options={},connected=false,readerSequence=0;
const filters={student:{query:'',type:'all',skill:'all'},teacher:{query:'',type:'all',skill:'all'}};
const duration=seconds=>seconds?Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'';
const size=bytes=>bytes>=1000000?(bytes/1000000).toFixed(1)+' MB':Math.round(bytes/1000)+' KB';
const button=(text,file,mode,role,disabled)=>`<button class="button ${mode==='play'?'soft':'secondary'}" data-material-open="${mode}" data-material-id="${esc(file.id)}" data-material-role="${role}" ${disabled?'disabled':''}>${text}</button>`;

export function studentDocumentHTML(access){
  const title=esc(access.title||'Student document'),bodyId='material-reader-'+(++readerSequence);
  return `<dialog open class="materials-reader book-reader" data-material-reader-view="inline" aria-label="${title}" aria-modal="false"><div class="materials-reader-toolbar"><strong>${title}</strong><div class="materials-reader-controls"><button type="button" class="button secondary" data-material-reader-action="minimize" aria-controls="${bodyId}" aria-expanded="true">Minimize</button><button type="button" class="button soft" data-material-reader-action="expand" aria-pressed="false">Full-page view</button><button type="button" class="button secondary" data-material-reader-close>Close document</button></div></div><div class="materials-reader-body" data-material-reader-body id="${bodyId}">${bookReaderHTML()}</div></dialog>`;
}

function setReaderView(reader,view){
  const wasPage=reader.dataset.materialReaderView==='page',page=view==='page',minimized=view==='minimized';
  // Keep the loaded PDF and current page when changing the reader layout.
  if(wasPage!==page){moveFloatingAudioHome();reader.close();}
  reader.dataset.materialReaderView=view;
  reader.setAttribute('aria-modal',String(page));
  reader.querySelector('[data-material-reader-body]').hidden=minimized;
  const minimize=reader.querySelector('[data-material-reader-action="minimize"]'),expand=reader.querySelector('[data-material-reader-action="expand"]');
  minimize.textContent=minimized?(reader.dataset.materialReaderType==='slides'?'Restore slides':'Restore book'):'Minimize';minimize.setAttribute('aria-expanded',String(!minimized));
  expand.textContent=page?'Smaller view':'Full-page view';expand.setAttribute('aria-pressed',String(page));
  if(wasPage!==page){if(page)reader.showModal();else reader.show();}placeFloatingAudio();resizeBookReader(reader);
}

export function materialsPage({role='student',catalog=lessonMaterials,isConnected=connected,listeningOnly=false}={}){
  const teacher=role==='teacher',ready=teacher||isConnected;
  if(!catalog)return '<section class="card" aria-live="polite"><h3>Opening your lesson resources…</h3><p>Please wait while your private files load.</p></section>';
  if(listeningOnly)catalog={...catalog,lessons:catalog.lessons.filter(l=>(l.skill||'listening')==='listening')};
  const all=catalog.lessons.flatMap(lesson=>lesson.files),audio=all.filter(file=>file.kind==='audio').length,documents=all.filter(file=>file.kind==='document').length,videos=all.filter(file=>file.kind==='video').length,slides=all.filter(file=>file.kind==='slides').length;
  const f=filters[role];
  return `<section id="materialsSection" data-material-role="${role}" data-material-scope="${listeningOnly?'listening':'all'}"><div class="page-head"><div class="eyebrow">${teacher?'YOUR TEACHING RESOURCES':'YOUR CLASSROOM RESOURCES'}</div><h1>${teacher?listeningOnly?'Your listening tests, ready to play.':'Every lesson, in one place.':listeningOnly?'Your listening tests, ready to play.':'Your lessons, ready to play.'}</h1><p>${teacher?listeningOnly?'Play your uploaded Listening tests with their matching papers, teacher guides and answer keys.':'Your Reading and Listening books, uploaded recordings, teacher guides and answer keys, organised by course and lesson day.':listeningOnly?'Your teacher’s uploaded practice, diagnostic, and final exam recordings. Open the matching question paper while you listen.':'Study your Reading lessons or open a Listening book with its matching recording. Choose a course below to find your materials.'}</p></div><div class="materials-overview"><span class="pill">${catalog.lessons.filter(l=>l.type!=='exam').length} lesson groups · ${catalog.lessons.filter(l=>l.type==='exam').length} extra exams</span><span class="pill">${documents} student documents</span><span class="pill">${audio} audio tracks</span><span class="pill">${videos} lesson ${videos===1?'video':'videos'}</span>${teacher?`<span class="pill materials-private">${slides} private slide decks</span>`:''}</div>${!ready?'<div class="notice materials-join"><div><strong>Your class materials are waiting.</strong><p>Join with your individual class code to open books and recordings.</p></div><a class="button" href="#class">Join your class →</a></div>':teacher?'<p class="small muted">Teacher slides and answer keys are available only here, after teacher sign-in.</p>':'<p class="small muted">Reading books and papers are ready for study. In Listening, use the recording with the book for that lesson.</p>'}<div class="materials-toolbar"><div><label for="materialSearch">Find a lesson</label><input type="search" id="materialSearch" data-material-filter="search" placeholder="Search a day, topic or practice test" value="${esc(f.query)}"></div>${!listeningOnly?`<div><label for="materialSkill">Course</label><select id="materialSkill" data-material-filter="skill"><option value="all" ${f.skill==='all'?'selected':''}>All courses</option><option value="reading" ${f.skill==='reading'?'selected':''}>Reading</option><option value="listening" ${f.skill==='listening'?'selected':''}>Listening</option></select></div>`:''}<div><label for="materialType">Show</label><select id="materialType" data-material-filter="type"><option value="all" ${f.type==='all'?'selected':''}>All resources</option><option value="lesson" ${f.type==='lesson'?'selected':''}>Skill lessons</option><option value="practice" ${f.type==='practice'?'selected':''}>Practice & mock tests</option><option value="exam" ${f.type==='exam'?'selected':''}>Diagnostic & final exams</option></select></div></div><p class="small muted" id="materialsResultCount" aria-live="polite">${catalog.lessons.filter(l=>l.type!=='exam').length} lesson groups · ${catalog.lessons.filter(l=>l.type==='exam').length} extra exams</p><div class="materials-grid">${catalog.lessons.map(lesson=>{
    const tracks=lesson.files.filter(file=>['audio','video'].includes(file.kind)).length;
    return `<details class="materials-card" data-material-day="${lesson.day??lesson.group}" data-material-kind="${lesson.type}" data-material-skill="${esc(lesson.skill||'listening')}" data-material-search="${esc(((lesson.day?'day '+lesson.day:lesson.group+' exam')+' '+lesson.title+' '+(lesson.lesson?'lesson '+lesson.lesson:'')).toLowerCase())}"><summary><span class="materials-day">${lesson.day?'DAY '+String(lesson.day).padStart(2,'0'):'EXAM'}</span><span class="materials-heading"><strong>${esc(lesson.title)}</strong><small>${lesson.skill==='reading'?'Reading':'Listening'} · ${lesson.lesson?'Lesson '+lesson.lesson+' · ':''}Student book${tracks?' · '+tracks+' '+(tracks===1?'recording':'recordings'):''}</small></span><span class="materials-chevron" aria-hidden="true">⌄</span></summary><div class="materials-files">${lesson.files.map(file=>`<div class="materials-file ${['slides','answer-key'].includes(file.kind)?'materials-teacher-file':''}" data-material-file="${esc(file.id)}"><div class="materials-file-heading"><span class="materials-file-icon" aria-hidden="true">${file.kind==='audio'?'♫':file.kind==='video'?'▷':['slides','answer-key'].includes(file.kind)?'▧':'▤'}</span><div><h3>${esc(file.title)}${['slides','answer-key'].includes(file.kind)?'<span class="pill materials-private">Teacher only</span>':''}</h3><p>${esc(file.filename)} · ${file.filename.split('.').pop().toUpperCase()} · ${size(file.size)}${file.duration?' · '+duration(file.duration):''}${!teacher&&file.filename.endsWith('.docx')?' · PDF view':''}</p></div></div><div class="materials-file-actions">${file.mime==='application/pdf'||!teacher&&file.filename.endsWith('.docx')?button(teacher?'Open PDF ↗':'Read document',file,'view',role,!ready):''}${teacher&&file.kind==='slides'?button('Open slides',file,'slides',role,!ready):''}${['audio','video'].includes(file.kind)?button(file.kind==='audio'?'Open audio player':'Open video player',file,'play',role,!ready):''}${teacher?button('Download ↓',file,'download',role,!ready):''}</div><div data-material-status="${esc(file.id)}" class="small materials-status" role="status" aria-live="polite"></div><div data-material-player="${esc(file.id)}"></div></div>`).join('')}</div></details>`;
  }).join('')}</div><div class="empty" id="materialsEmpty" hidden><h3>No matching lessons.</h3><p>Try a different topic or select all resources.</p></div></section>`;
}

export function mountMaterials(){
  const section=document.querySelector('#materialsSection');if(!section)return;
  const f=filters[section.dataset.materialRole];let count=0;
  const query=f.query.trim().toLowerCase(),skill=section.dataset.materialScope==='listening'?'listening':f.skill;
  section.querySelectorAll('[data-material-day]').forEach(card=>{card.hidden=!(card.dataset.materialSearch.includes(query)&&(f.type==='all'||card.dataset.materialKind===f.type)&&(skill==='all'||card.dataset.materialSkill===skill));if(!card.hidden)count++;});
  section.querySelector('#materialsResultCount').textContent=count+' '+(count===1?'resource group':'resource groups');
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
    const field=event.target.dataset.materialFilter;if(!['type','skill'].includes(field))return;
    const role=event.target.closest('#materialsSection').dataset.materialRole;filters[role][field]=event.target.value;mountMaterials();
  });
  app.addEventListener('click',async event=>{
    const close=event.target.closest('[data-material-reader-close]');
    if(close?.hasAttribute?.('data-material-reader-close')){
      const reader=close.closest('.materials-reader'),parent=reader.closest('[data-material-file]')||reader.closest('.card');
      moveFloatingAudioHome();destroySlideReader(reader);destroyBookReader(reader);reader.close();reader.remove();parent?.querySelector('[data-material-open="view"], [data-material-open="slides"], [data-course-action="paper"]')?.focus({preventScroll:true});return;
    }
    const control=event.target.closest('[data-material-reader-action]'),readerAction=control?.dataset?.materialReaderAction;
    if(['minimize','expand'].includes(readerAction)){
      const reader=control.closest('.materials-reader'),current=reader.dataset.materialReaderView;
      setReaderView(reader,readerAction==='minimize'?(current==='minimized'?'inline':'minimized'):(current==='page'?'inline':'page'));
      control.focus({preventScroll:true});return;
    }
    const b=event.target.closest('[data-material-open]');if(!b||b.disabled)return;
    const id=b.dataset.materialId,role=b.dataset.materialRole,mode=b.dataset.materialOpen;
    const row=b.closest('[data-material-file]'),status=row.querySelector('[data-material-status]'),player=row.querySelector('[data-material-player]');
    if(role!=='teacher'&&['download','slides'].includes(mode)){status.textContent='Student materials are available for viewing and playback only.';return;}
    const audioOwner=floatingAudioOwner();const original=b.textContent,inline=true;let tab=null;
    b.disabled=true;b.textContent='Opening…';status.textContent='Connecting to your class materials…';
    try{
      const access=await (role==='teacher'?options.teacherAccess(id):options.studentAccess(id));
      // The server returns a Richmount URL; never navigate to an arbitrary origin.
      const url=new URL(access.url),base=new URL(options.apiBase());
      if(url.origin!==base.origin||!url.pathname.startsWith('/api/materials/file/'))throw new Error('This file link could not be opened.');
      if(!row.isConnected){tab?.close();return;}
      if(mode==='play'){
        const type=access.kind==='video'?'video':'audio';if(type==='audio'&&openFloatingAudio({url:url.href,title:access.title,owner:audioOwner,autoplay:false,originElement:b})){status.textContent='Use the floating player to listen while reading or answering. You can reopen it here after closing it.';b.hidden=false;return;}if(type==='audio'&&audioOwner)throw new Error('Your class session changed. Open this recording again.');
        player.innerHTML=`<${type} controls preload="metadata" ${role==='student'?'controlslist="nodownload" ':''}data-floating-owner="${esc(audioOwner)}" data-material-media="${esc(id)}" src="${esc(url.href)}" aria-label="${esc(access.title)}"></${type}>`;
        status.textContent='Use the player controls to start. You can pause or move through the recording.';
        b.hidden=true;
      }else if(mode==='slides'){
        if(access.kind!=='slides')throw new Error('This file is not a presentation.');
        stopSlideReaders(player);player.innerHTML=slidesDocumentHTML(access);await mountSlideReader(player.querySelector('[data-slides-reader]'),access);
        if(row.isConnected)status.textContent='Use Previous / Next or Full-page view to discuss the slides here.';
      }else if(mode==='view'&&inline){stopSlideReaders(player);stopBookReaders(player);player.innerHTML=studentDocumentHTML(access);status.textContent='Read, zoom and answer in the book below.';await mountBookReader(player.querySelector?.('.book-reader'),{...access,id:access.id||id,role});}
      else if(mode==='view'&&tab){tab.location.replace(url.href);status.textContent='Your document opened in a new tab.';}
      else{
        if(mode==='download')url.searchParams.set('download','1');
        const link=document.createElement('a');link.href=url.href;link.rel='noopener noreferrer';
        if(mode==='download')link.download=access.filename;else link.target='_blank';
        link.click();status.textContent=mode==='download'?'Download requested.':'Open the book using the link below.';
        if(mode==='view'){const retry=document.createElement('a');retry.href=url.href;retry.target='_blank';retry.rel='noopener noreferrer';retry.textContent='Open document ↗';status.replaceChildren(retry);}
      }
    }catch(error){tab?.close();status.textContent=error.message||'This file could not be opened. Please try again.';options.toast?.(status.textContent);}
    finally{b.disabled=false;b.textContent=original;}
  });
  app.addEventListener('cancel',event=>{
    const reader=event.target;if(!reader.matches?.('.materials-reader')||reader.dataset.materialReaderView!=='page')return;
    event.preventDefault();setReaderView(reader,'inline');reader.querySelector('[data-material-reader-action="expand"]').focus({preventScroll:true});
  },true);
  app.addEventListener('play',event=>{if(!event.target.dataset.materialMedia)return;app.querySelectorAll('[data-material-media]').forEach(media=>{if(media!==event.target)media.pause();});},true);
  app.addEventListener('error',event=>{
    if(!event.target.dataset.materialMedia)return;
    const row=event.target.closest('[data-material-file]');row.querySelector('[data-material-status]').textContent='The recording could not load. Open the player again to retry.';
    row.querySelector('[data-material-open="play"]').hidden=false;
  },true);
}

export function refreshMaterialsConnection(){connected=!!options.isConnected?.();}
export function stopMaterialsMedia(root=document){root.querySelectorAll('[data-material-media]').forEach(media=>media.pause());stopSlideReaders(root);stopBookReaders(root);}
