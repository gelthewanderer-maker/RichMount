import {byteRange} from './materials-store.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const AUDIO_MAX_BYTES=25*1024*1024;
const columns='id,submission_id,student_id,role,attempt,category,title,filename,mime,size,created_at';
export async function audioForSubmission(db,id){
  const audio=(await db.prepare('SELECT '+columns+' FROM classroom_audio WHERE submission_id=? AND deleted=0 ORDER BY created_at,id').bind(id).all()).results;
  const attempts=await db.prepare("SELECT COALESCE(MAX(attempt),0) AS n FROM classroom_audio WHERE submission_id=? AND role='student'").bind(id).first();
  return {audio,attemptsUsed:attempts.n,attemptsMax:3};
}
export async function audioLibrary(db){return {audio:(await db.prepare("SELECT "+columns+" FROM classroom_audio WHERE submission_id IS NULL AND role='teacher' AND deleted=0 ORDER BY created_at DESC,id").all()).results};}
const error=(status,message)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
async function authorized(request,key){
  const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
  if(!key||!supplied)return false;
  const enc=new TextEncoder(),[a,b]=await Promise.all([key,supplied].map(v=>crypto.subtle.digest('SHA-256',enc.encode(v))));
  const av=new Uint8Array(a),bv=new Uint8Array(b);let diff=0;for(let i=0;i<av.length;i++)diff|=av[i]^bv[i];return diff===0;
}
export async function handleAudio(request,env,id){
  if(!await authorized(request,env.STORE_API_KEY))return error(401,'Not authorized');
  if(!UUID.test(id)||!env.DB||!env.BUCKET)return error(404,'Audio not found');
  const db=env.DB,bucket=env.BUCKET;
  const existing=await db.prepare('SELECT * FROM classroom_audio WHERE id=? AND deleted=0').bind(id).first();
  if(request.method==='DELETE'){
    if(!existing)return error(404,'Audio not found');
    await db.prepare('UPDATE classroom_audio SET deleted=1 WHERE id=?').bind(id).run();
    await bucket.delete(existing.object_key).catch(()=>{});return Response.json({deleted:true});
  }
  if(request.method==='PUT'){
    let meta;try{meta=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(request.headers.get('x-audio-metadata')||''),c=>c.charCodeAt(0))));}catch{return error(400,'Invalid audio information');}
    const {role,submissionId,studentId,title,filename,mime,size,sha256,category='general'}=meta;
    if(!['student','teacher'].includes(role)||submissionId&&!UUID.test(submissionId)||studentId&&!UUID.test(studentId)||role==='student'&&(!submissionId||!studentId))return error(400,'Invalid audio owner');
    if(typeof title!=='string'||!title.trim()||title.length>100||typeof filename!=='string'||!filename||filename.length>120||!/^(audio\/(mpeg|wav|ogg|webm|mp4|flac))$/.test(mime||'')||!Number.isInteger(size)||size<16||size>AUDIO_MAX_BYTES||!/^[0-9a-f]{64}$/.test(sha256||'')||!['general','speaking','listening-1','listening-2','listening-3','listening-4'].includes(category))return error(400,'Invalid audio file');
    const submission=submissionId?await db.prepare('SELECT * FROM classroom_submissions WHERE id=?').bind(submissionId).first():null;
    if(submissionId&&!submission||role==='student'&&(submission.kind!=='speaking'||submission.student_id!==studentId))return error(404,'Speaking activity not found');
    if(existing&&(existing.role!=='teacher'||role!=='teacher'||existing.submission_id!==submissionId||existing.student_id!==studentId))return error(409,'Upload a new speaking attempt');
    if(!existing){
      if(role==='student'&&(await audioForSubmission(db,submissionId)).attemptsUsed>=3)return error(409,'All three speaking attempts have been used.');
      if(role==='teacher'){
        const count=await db.prepare("SELECT COUNT(*) AS n FROM classroom_audio WHERE role='teacher' AND deleted=0 AND "+(submissionId?'submission_id=?':'submission_id IS NULL')).bind(...(submissionId?[submissionId]:[])).first();
        if(count.n>=(submissionId?50:200))return error(409,submissionId?'This activity has 50 audio attachments. Delete one before adding another.':'Your audio library has 200 files. Delete one before adding another.');
      }
    }
    const key='classroom-audio/'+id+'/'+crypto.randomUUID(),createdAt=new Date().toISOString();let committed=false;
    try{
      const digest=Uint8Array.from(sha256.match(/../g),v=>parseInt(v,16)).buffer;
      const object=await bucket.put(key,request.body,{sha256:digest,httpMetadata:{contentType:mime}});
      if(!object||object.size!==size){await bucket.delete(key);return error(400,'The audio upload was incomplete. Try again.');}
      let saved;
      if(existing){
        saved=await db.prepare('UPDATE classroom_audio SET title=?,filename=?,mime=?,size=?,sha256=?,object_key=?,created_at=? WHERE id=? AND deleted=0 RETURNING *').bind(title,filename,mime,size,sha256,key,createdAt,id).first();
      }else if(role==='student'){
        // This atomic insert counts successful uploads, including deleted attempts.
        saved=await db.prepare("INSERT INTO classroom_audio (id,submission_id,student_id,role,attempt,category,title,filename,mime,size,sha256,object_key,created_at) SELECT ?,?,?,?,COALESCE(MAX(attempt),0)+1,?,?,?,?,?,?,?,? FROM classroom_audio WHERE submission_id=? AND role='student' HAVING COALESCE(MAX(attempt),0)<3 RETURNING *").bind(id,submissionId,studentId,role,category,title,filename,mime,size,sha256,key,createdAt,submissionId).first();
      }else{
        saved=await db.prepare("INSERT INTO classroom_audio (id,submission_id,student_id,role,category,title,filename,mime,size,sha256,object_key,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM classroom_audio WHERE role='teacher' AND deleted=0 AND "+(submissionId?'submission_id=?':'submission_id IS NULL')+')<? RETURNING *').bind(id,submissionId||null,studentId||null,role,category,title,filename,mime,size,sha256,key,createdAt,...(submissionId?[submissionId]:[]),submissionId?50:200).first();
      }
      if(!saved){await bucket.delete(key);return error(409,'The attachment limit has been reached. Refresh this page.');}
      committed=true;
      if(existing)await bucket.delete(existing.object_key).catch(()=>{});
      if(role==='student'){
        const older=(await db.prepare("SELECT object_key FROM classroom_audio WHERE submission_id=? AND role='student' AND attempt<? AND deleted=0").bind(submissionId,saved.attempt).all()).results;
        await db.prepare("UPDATE classroom_audio SET deleted=1 WHERE submission_id=? AND role='student' AND attempt<?").bind(submissionId,saved.attempt).run();
        for(const row of older)await bucket.delete(row.object_key).catch(()=>{});
      }
      return Response.json({saved:true,id,attempt:saved.attempt},{headers:{'Cache-Control':'no-store'}});
    }catch{if(!committed)await bucket.delete(key).catch(()=>{});return error(503,'The audio could not be saved. Refresh this page before trying again.');}
  }
  if(!['GET','HEAD'].includes(request.method))return error(405,'Use GET, HEAD, PUT or DELETE');
  if(!existing)return error(404,'Audio not found');
  try{
    const object=await bucket.head(existing.object_key);if(!object)return error(404,'Audio not found');
    const headers=new Headers({'Content-Type':existing.mime,'Accept-Ranges':'bytes','Cache-Control':'private, no-store','ETag':object.httpEtag,'Content-Length':String(object.size),'Content-Disposition':"inline; filename*=UTF-8''"+encodeURIComponent(existing.filename),'X-Audio-SHA256':existing.sha256});
    if(request.method==='HEAD')return new Response(null,{headers});
    let range;try{range=byteRange(request.headers.get('if-range')&&request.headers.get('if-range')!==object.httpEtag?null:request.headers.get('range'),object.size);}catch{return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+object.size,'Accept-Ranges':'bytes'}});}
    const content=await bucket.get(existing.object_key,range?{range}:{});if(!content)return error(404,'Audio not found');
    if(range){headers.set('Content-Length',String(range.length));headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${object.size}`);}
    return new Response(content.body,{status:range?206:200,headers});
  }catch{return error(503,'The audio is temporarily unavailable');}
}
