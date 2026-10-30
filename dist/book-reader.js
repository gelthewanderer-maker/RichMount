const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const readers=new Map();
let pdfLibrary,options={};
export function initBookActivities(callbacks){options=callbacks;}
export function bookReaderHTML(){return `<div class="book-navigation" aria-label="Book page and zoom controls"><div class="book-control-group"><button type="button" class="button secondary" data-book-action="previous" aria-label="Previous book page">←</button><label>Page <input type="number" min="1" value="1" data-book-page aria-label="Book page"></label><output data-book-count>/ …</output><button type="button" class="button secondary" data-book-action="next" aria-label="Next book page">→</button></div><div class="book-control-group"><button type="button" class="button secondary" data-book-action="zoom-out" aria-label="Zoom out">−</button><output data-book-zoom>100%</output><button type="button" class="button secondary" data-book-action="zoom-in" aria-label="Zoom in">+</button><button type="button" class="button secondary" data-book-action="fit">Fit</button></div></div><p class="book-status small" data-book-status role="status" aria-live="polite">Loading book pages…</p><div class="book-workspace book-reading-only"><div class="book-stage" data-book-stage tabindex="0" aria-label="Book page. Use zoom buttons or pinch to zoom, and drag to move."><div class="book-page-surface" data-book-surface><canvas data-book-canvas aria-label="Student book page"></canvas></div></div></div>`;}
async function defaultLibrary(){if(!pdfLibrary)pdfLibrary=import('./vendor/pdfjs/pdf.mjs').then(lib=>{lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;return lib;}).catch(error=>{pdfLibrary=null;throw error;});return pdfLibrary;}
export async function mountBookReader(reader,access,{libraryLoader=defaultLibrary,role=access.role||'student'}={}){
 if(!reader?.querySelector?.('[data-book-canvas]'))return;
 destroyBookReader(reader);
 const stage=reader.querySelector('[data-book-stage]'),surface=reader.querySelector('[data-book-surface]'),canvas=reader.querySelector('[data-book-canvas]'),status=reader.querySelector('[data-book-status]'),counter=reader.querySelector('[data-book-count]'),pageInput=reader.querySelector('[data-book-page]'),zoomOutput=reader.querySelector('[data-book-zoom]');
 const owner=options.studentId?.()||'';
 let pageNumber=1,zoom=1,task=null,pdf=null,renderTask=null,sequence=0,dead=false,timer=null;
 const current=()=>!dead&&reader.isConnected!==false&&(role==='teacher'||owner===(options.studentId?.()||''));
 function controls(){pageInput.value=String(pageNumber);pageInput.max=String(pdf?.numPages||1);counter.textContent='/ '+(pdf?.numPages||'…');zoomOutput.textContent=Math.round(zoom*100)+'%';for(const action of ['previous','next']){const button=reader.querySelector('[data-book-action="'+action+'"]');button.disabled=!pdf||(action==='previous'?pageNumber===1:pageNumber===pdf.numPages);}}
 async function render(){
  if(!pdf||!current())return;const serial=++sequence;
  if(renderTask){renderTask.cancel();try{await renderTask.promise;}catch{}renderTask=null;}
  const page=await pdf.getPage(pageNumber);if(!current()||serial!==sequence)return;
  const original=page.getViewport({scale:1}),width=Math.max(180,(stage.clientWidth||reader.clientWidth||640)-24),scale=width/original.width*zoom,viewport=page.getViewport({scale});
  const dpr=Math.min(globalThis.devicePixelRatio||1,2,Math.sqrt(9000000/(viewport.width*viewport.height)));
  canvas.width=Math.ceil(viewport.width*dpr);canvas.height=Math.ceil(viewport.height*dpr);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';surface.style.width=viewport.width+'px';surface.style.height=viewport.height+'px';
  status.textContent='Rendering page '+pageNumber+'…';renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:dpr===1?null:[dpr,0,0,dpr,0,0]});
  try{await renderTask.promise;if(!current()||serial!==sequence)return;status.textContent='Page '+pageNumber+' · Pinch to zoom or use − / +. Drag to move around.';controls();}catch(error){if(error.name!=='RenderingCancelledException'&&current())status.textContent='This page could not render. Use Retry book.';}
 }
 const requestRender=()=>{clearTimeout(timer);timer=setTimeout(()=>void render().catch(error=>{if(current())status.textContent=error.message;}),100);};
 function setZoom(value){zoom=Math.max(.5,Math.min(4,value));controls();requestRender();}
 function goPage(value){if(!pdf)return;pageNumber=Math.max(1,Math.min(pdf.numPages,Math.round(Number(value)||1)));stage.scrollTop=0;stage.scrollLeft=0;controls();requestRender();}
 function click(event){
  const target=event.target.closest('[data-book-action]');if(!target||target.disabled)return;
  const action=target.dataset.bookAction;
  if(action==='previous')goPage(pageNumber-1);if(action==='next')goPage(pageNumber+1);
  if(action==='zoom-in')setZoom(zoom+.25);if(action==='zoom-out')setZoom(zoom-.25);if(action==='fit')setZoom(1);
 }
 function change(event){if(event.target===pageInput)goPage(pageInput.value);}
 const pointers=new Map();let pinch=null,drag=null;
 function down(event){if(event.pointerType==='mouse'&&event.button!==0)return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});stage.setPointerCapture?.(event.pointerId);if(pointers.size===1)drag={x:event.clientX,y:event.clientY,left:stage.scrollLeft,top:stage.scrollTop};if(pointers.size===2){const p=[...pointers.values()];pinch={distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),zoom};drag=null;}}
 function move(event){if(!pointers.has(event.pointerId))return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size===2&&pinch){event.preventDefault();const p=[...pointers.values()];setZoom(pinch.zoom*Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)/Math.max(1,pinch.distance));}else if(drag){stage.scrollLeft=drag.left+drag.x-event.clientX;stage.scrollTop=drag.top+drag.y-event.clientY;}}
 function up(event){pointers.delete(event.pointerId);pinch=null;drag=null;}
 reader.addEventListener('click',click);reader.addEventListener('change',change);
 stage.addEventListener('pointerdown',down);stage.addEventListener('pointermove',move,{passive:false});stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',up);
 const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(requestRender);observer?.observe(stage);
 const controller={refresh:()=>{if(current())return true;controller.destroy();return false;},resize:requestRender,destroy(){dead=true;sequence++;clearTimeout(timer);renderTask?.cancel();task?.destroy?.();observer?.disconnect();for(const [type,fn] of [['click',click],['change',change]])reader.removeEventListener(type,fn);for(const [type,fn] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up]])stage.removeEventListener(type,fn);readers.delete(reader);}};
 readers.set(reader,controller);controls();
 try{const lib=await libraryLoader();if(!current())return;task=lib.getDocument({url:access.url,withCredentials:true,isEvalSupported:false,useWasm:false,useSystemFonts:true});pdf=await task.promise;if(!current()){pdf.destroy();return;}controls();await render();}
 catch(error){if(current())status.innerHTML='The book could not load. Close and reopen it to refresh access. '+esc(error.message||'');}
 return controller;
}
export function resizeBookReader(reader){readers.get(reader)?.resize();}
export function destroyBookReader(reader){readers.get(reader)?.destroy();}
export function stopBookReaders(root=document){for(const [reader,controller] of readers)if(root===reader||root.contains?.(reader))controller.destroy();}
export function refreshBookReaders(){let count=0;for(const controller of readers.values())if(controller.refresh())count++;return count;}
