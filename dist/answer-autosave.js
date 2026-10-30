// Stable, private draft keys survive interface releases and sign-out.
const PREFIX='richmount-answer-draft-v1:',DEVICE='richmount-answer-device-v1';
const meaningful=value=>value&&typeof value==='object'?Object.values(value).some(meaningful):!!value;
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
export function createAnswerAutosave({storage,studentId,request,onStatus=()=>{},now=Date.now,schedule=setTimeout,cancel=clearTimeout}){
 let owner='',records=new Map(),idle=null,deadline=null,device='';
 try{device=storage.getItem(DEVICE)||crypto.randomUUID();storage.setItem(DEVICE,device);}catch{device=crypto.randomUUID();}
 const keyFor=(user,key)=>PREFIX+encodeURIComponent(user)+':'+encodeURIComponent(key);
 function sync(){const next=studentId()||'';if(next!==owner){owner=next;records=new Map();cancel(idle);cancel(deadline);idle=deadline=null;}return owner;}
 function persist(key,r,user=owner){try{storage.setItem(keyFor(user,key),JSON.stringify({version:1,value:r.value,revision:r.revision,pending:r.pending,syncedAt:r.syncedAt||''}));r.local=true;}catch{r.local=false;}onStatus();}
 function queue(){cancel(idle);idle=schedule(()=>void flush(),1000);if(!deadline)deadline=schedule(()=>{deadline=null;void flush();},5000);}
 function open(key,initial,apply=()=>{}){
  sync();if(!owner)return copy(initial);if(records.has(key)){records.get(key).apply=apply;return copy(records.get(key).value);}
  let saved;try{saved=JSON.parse(storage.getItem(keyFor(owner,key))||'null');}catch{}
  const valid=saved?.version===1&&Number.isSafeInteger(saved.revision)&&saved.revision>=0;
  const r={value:copy(valid?saved.value:initial),revision:valid?saved.revision:0,pending:valid?!!saved.pending:initial!==undefined,syncedAt:valid?saved.syncedAt||'':'',local:true,apply,loading:true};
  if(r.pending&&!r.revision)r.revision=now()*1000;
  records.set(key,r);if(r.value!==undefined)persist(key,r);
  const user=owner,revision=r.revision;
  r.flight=Promise.resolve().then(()=>request('/api/student/answer-drafts?key='+encodeURIComponent(key))).then(data=>{
   if(user!==sync()||records.get(key)!==r)return;
   const remote=data.drafts?.[0];
   // Never replace edits made during loading, or locally queued offline work.
   if(remote&&!r.pending&&r.revision===revision&&(!r.syncedAt||remote.updatedAt>r.syncedAt)){
    r.value=copy(remote.value);r.revision=Math.max(r.revision,remote.revision);r.syncedAt=remote.updatedAt;r.error='';persist(key,r);r.apply(copy(r.value));
   }
   r.loaded=true;
  }).catch(error=>{if(user===owner)r.error=error.message;}).finally(()=>{if(user===owner&&records.get(key)===r){r.loading=false;r.flight=null;onStatus();if(r.pending)queue();}});
  return copy(r.value);
 }
 function capture(key,value){sync();if(!owner)return;let r=records.get(key);if(!r){open(key,undefined);r=records.get(key);}if(r.value===undefined&&!meaningful(value)||JSON.stringify(r.value)===JSON.stringify(value))return;r.value=copy(value);r.revision=Math.max(now()*1000,r.revision+1);r.pending=true;r.error='';persist(key,r);queue();}
 async function flush({keepalive=false}={}){
  sync();if(!owner)return;const user=owner;
  for(const [key,r] of records){
   if(user!==sync())break;if(r.sending)try{await r.sendFlight;}catch{}if(user!==sync())break;if(!r.pending||r.value===undefined)continue;
   const revision=r.revision,value=copy(r.value);r.sending=true;onStatus();
   try{const result=await (r.sendFlight=request('/api/student/answer-drafts',{method:'POST',keepalive,body:JSON.stringify({key,deviceId:device,revision,value})}));if(user!==sync()||records.get(key)!==r)continue;if(result.saved!==true||result.revision!==revision)throw Error('Your account backup needs another sync.');r.syncedAt=result.updatedAt;r.error='';if(r.revision===revision)r.pending=false;persist(key,r);}
   catch(error){if(user===owner)r.error=error.message;}
   finally{r.sending=false;r.sendFlight=null;if(user===owner)onStatus();}
  }
 }
 function status(){sync();const all=[...records.values()];if(!owner)return 'Sign in to keep an account backup of your answers.';if(all.some(r=>r.local===false))return 'Browser save unavailable. Keep this page open until your account backup finishes.';if(all.some(r=>r.pending))return all.some(r=>r.error)?'Saved on this device · Waiting for connection to save online.':all.some(r=>r.sending)?'Saving answers to your account…':'Saved on this device · Saving online…';if(all.some(r=>r.loading))return 'Checking your saved answers…';return all.some(r=>r.syncedAt)?'✓ Answers saved to your account.':'Your answers save automatically as you work.';}
 return {open,capture,flush,status,connectionChanged:sync,loading:key=>{sync();return !!records.get(key)?.loading;},ready:async key=>{sync();await records.get(key)?.flight;},dispose(){cancel(idle);cancel(deadline);}};
}
