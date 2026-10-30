const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const readers=new WeakMap();let zipLibrary;
async function loadZip(){if(!zipLibrary)zipLibrary=import('./vendor/jszip.min.js').then(()=>globalThis.JSZip).catch(e=>{zipLibrary=null;throw e;});return zipLibrary;}
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos);/g,c=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[c]));
function tags(xml,name){
 if(typeof xml!=='string'||xml.length>1000000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Unsupported presentation XML.');
 return [...xml.matchAll(new RegExp('<(?:[\\w-]+:)?'+name+'\\b([^>]*)>','g'))].map(m=>Object.fromEntries([...m[1].matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/g)].map(a=>[a[1],decode(a[3])])));
}
function internal(from,target){const url=new URL(target,'https://ppt.local/'+from);if(url.origin!=='https://ppt.local'||!url.pathname.startsWith('/ppt/')||url.search||url.hash)throw new Error('Unsupported presentation link.');return url.pathname.slice(1);}
const relPath=p=>p.slice(0,p.lastIndexOf('/')+1)+'_rels/'+p.slice(p.lastIndexOf('/')+1)+'.rels';
async function xml(zip,path){const file=zip.file(path);if(!file)throw new Error('Presentation data is missing.');return file.async('string');}
async function relations(zip,path){return new Map(tags(await xml(zip,relPath(path)),'Relationship').map(r=>{if(r.TargetMode==='External')return [r.Id,null];return [r.Id,internal(path,r.Target)];}));}
export async function readSlideDeck(zip,overrides=[]){
 const presentation=await xml(zip,'ppt/presentation.xml'),ids=tags(presentation,'sldId'),size=tags(presentation,'sldSz')[0],rels=await relations(zip,'ppt/presentation.xml');
 if(!ids.length||ids.length>300||!size||!(Number(size.cx)>0&&Number(size.cy)>0))throw new Error('Presentation slides are not available.');
 const slides=[],overrideMap=new Map(overrides.map(o=>[o.page,o]));
 for(const [index,id] of ids.entries()){
  if(overrideMap.has(index+1)){slides.push({override:overrideMap.get(index+1)});continue;}
  const path=rels.get(id['r:id']);if(!path)throw new Error('A slide could not be found.');
  const source=await xml(zip,path),pictures=tags(source,'pic'),blips=tags(source,'blip');
  if(!pictures.length||!blips.length)throw new Error('A preview for this slide is missing.');
  const image=(await relations(zip,path)).get(blips.at(-1)['r:embed']);if(!image||!/^ppt\/media\/.+\.(?:png|jpe?g)$/i.test(image)||!zip.file(image))throw new Error('The slide image could not be found.');
  slides.push({image});
 }
 return {zip,slides,width:Number(size.cx),height:Number(size.cy)};
}
export function slidesDocumentHTML(access){return `<dialog open class="materials-reader slides-reader" data-slides-reader data-material-reader-type="slides" data-material-reader-view="inline" aria-label="${esc(access.filename||'Teacher presentation')}" aria-modal="false"><div class="materials-reader-toolbar"><strong>${esc(access.filename||'Teacher presentation')}</strong><div class="materials-reader-controls"><button type="button" class="button secondary" data-material-reader-action="minimize" aria-expanded="true">Minimize</button><button type="button" class="button soft" data-material-reader-action="expand" aria-pressed="false">Full-page view</button><button type="button" class="button secondary" data-material-reader-close>Close slides</button></div></div><div class="materials-reader-body" data-material-reader-body><nav class="slides-navigation" aria-label="Presentation slides"><button type="button" class="button secondary" data-slides-action="previous" disabled>← Previous</button><output data-slides-counter aria-live="polite">Opening slides…</output><label>Go to slide <input type="number" min="1" value="1" data-slides-page disabled></label><button type="button" class="button soft" data-slides-action="next" disabled>Next →</button></nav><p class="small slides-status" data-slides-status role="status">Opening your uploaded PowerPoint…</p><button type="button" class="button secondary" data-slides-action="retry" hidden>Try again</button><div class="slides-stage"><img data-slides-image alt="Presentation slide" hidden></div><p class="small muted slides-help">Use Previous / Next or the arrow keys. Full-page view keeps the discussion on this page. This slide preview is static; use the original PPT for animations.</p></div></dialog>`;}
export function destroySlideReader(reader){readers.get(reader)?.destroy();}
export function stopSlideReaders(root=document){root.querySelectorAll?.('[data-slides-reader]').forEach(destroySlideReader);}
export async function mountSlideReader(reader,access,{zipLoader=loadZip,fetcher=fetch}={}){
 destroySlideReader(reader);const state={deck:null,page:0,epoch:0,closed:false,urls:new Map(),abort:null};
 const q=s=>reader.querySelector(s),image=q('[data-slides-image]'),status=q('[data-slides-status]'),counter=q('[data-slides-counter]'),jump=q('[data-slides-page]'),previous=q('[data-slides-action="previous"]'),next=q('[data-slides-action="next"]'),retry=q('[data-slides-action="retry"]');
 const current=e=>!state.closed&&reader.isConnected&&state.epoch===e;
 function controls(){const count=state.deck?.slides.length||0;counter.textContent=count?`Slide ${state.page+1} of ${count}`:'Opening slides…';jump.value=String(state.page+1);jump.max=String(count||1);jump.disabled=!count;previous.disabled=!count||state.page===0;next.disabled=!count||state.page===count-1;}
 async function show(){
  if(!state.deck||state.closed)return;const epoch=++state.epoch,slide=state.deck.slides[state.page],path=slide.image||slide.override.id;controls();status.textContent='Opening slide '+(state.page+1)+'…';
  try{
   let url=state.urls.get(path);
   if(!url){let bytes;if(slide.override){const target=new URL(slide.override.url),original=new URL(access.url);if(target.origin!==original.origin||!target.pathname.startsWith('/api/materials/file/'))throw new Error('Unsupported slide link.');const response=await fetcher(target.href,{credentials:'include',signal:state.abort.signal});if(!response.ok)throw new Error('This slide could not load.');bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==slide.override.size)throw new Error('Slide image differs.');}else bytes=await state.deck.zip.file(path).async('uint8array');if(!current(epoch))return;if(bytes.length>20000000||!(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71||bytes[0]===255&&bytes[1]===216))throw new Error('Unsupported image.');url=URL.createObjectURL(new Blob([bytes],{type:slide.override||/\.png$/i.test(path)?'image/png':'image/jpeg'}));state.urls.set(path,url);}
   if(!current(epoch))return;image.src=url;image.alt=`Slide ${state.page+1} of ${state.deck.slides.length} · ${access.filename||'Teacher presentation'}`;await image.decode();if(!current(epoch))return;image.hidden=false;status.textContent='Slide '+(state.page+1)+' ready.';retry.hidden=true;
  }catch(error){if(current(epoch)){status.textContent='This slide could not load. Try again or download the original PPT.';retry.hidden=false;}}
 }
 async function load(){
  const epoch=++state.epoch;status.textContent='Opening your uploaded PowerPoint…';retry.hidden=true;state.abort=new AbortController();const timer=setTimeout(()=>state.abort?.abort(),90000);
  try{
   const Zip=await zipLoader();if(!current(epoch))return;const response=await fetcher(access.url,{credentials:'include',signal:state.abort.signal});if(!response.ok)throw new Error('The presentation link could not be opened.');
   const data=await response.arrayBuffer();if(data.byteLength>25000000||access.size&&data.byteLength!==access.size)throw new Error('The presentation file differs.');if(!current(epoch))return;
   const zip=await Zip.loadAsync(data),deck=await readSlideDeck(zip,access.slideOverrides||[]);if(!current(epoch))return;state.deck=deck;state.page=0;controls();await show();
  }catch(error){if(current(epoch)){status.textContent=error.message||'The presentation could not load. Try again.';retry.hidden=false;}}
  finally{clearTimeout(timer);}
 }
 function move(page){if(!state.deck||!Number.isInteger(page)||page<0||page>=state.deck.slides.length){controls();return;}state.page=page;void show();}
 const click=e=>{const action=e.target.closest('[data-slides-action]')?.dataset.slidesAction;if(action==='previous')move(state.page-1);else if(action==='next')move(state.page+1);else if(action==='retry'){if(state.deck)void show();else void load();}};
 const change=e=>{if(e.target===jump)move(Number(jump.value)-1);};
 const keydown=e=>{if(e.ctrlKey||e.metaKey||e.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;const page={ArrowLeft:state.page-1,ArrowRight:state.page+1,Home:0,End:state.deck?.slides.length-1}[e.key];if(page!==undefined){e.preventDefault();move(page);}};
 reader.addEventListener('click',click);reader.addEventListener('change',change);reader.addEventListener('keydown',keydown);
 readers.set(reader,{destroy(){state.closed=true;state.epoch++;state.abort?.abort();for(const url of state.urls.values())URL.revokeObjectURL(url);state.urls.clear();reader.removeEventListener('click',click);reader.removeEventListener('change',change);reader.removeEventListener('keydown',keydown);readers.delete(reader);}});
 await load();
}
