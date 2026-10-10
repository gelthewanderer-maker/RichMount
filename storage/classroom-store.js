const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id=v=>{if(!UUID.test(v||''))throw new Error('Invalid record identifier');return v;};
const bounded=(v,n)=>{if(typeof v!=='string'||v.length>n)throw new Error('Invalid record value');return v;};
const summary='s.id,s.student_id,s.client_id,s.kind,s.title,s.score,s.total,s.words,s.created_at,s.reviewed,s.feedback,s.teacher_score,s.reviewed_at,p.name AS student_name';
// The owner-private Sites boundary and a server-only API key protect every operation.
export async function storeOperation(db,op,p={}){
  if(!db)throw new Error('Classroom database unavailable');
  switch(op){
  case 'health':return {ready:!!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='classroom_submissions'").first()};
  case 'students:list':return {students:(await db.prepare('SELECT * FROM classroom_students WHERE active=1 ORDER BY created_at ASC').all()).results};
  case 'students:by-code':return {student:await db.prepare('SELECT * FROM classroom_students WHERE code_hash=? AND active=1').bind(bounded(p.codeHash,64)).first()};
  case 'students:by-id':return {student:await db.prepare('SELECT * FROM classroom_students WHERE id=? AND active=1').bind(id(p.id)).first()};
  case 'students:add':{
    const count=await db.prepare('SELECT COUNT(*) AS n FROM classroom_students WHERE active=1').first();if(count.n>=100)throw new Error('Classroom full');
    await db.prepare('INSERT INTO classroom_students (id,name,code_hash,encrypted_code,created_at) VALUES (?,?,?,?,?)').bind(id(p.id),bounded(p.name,60),bounded(p.codeHash,64),bounded(p.encryptedCode,300),bounded(p.createdAt,30)).run();return {id:p.id};
  }
  case 'students:add-many':{
    if(!Array.isArray(p.students)||!p.students.length||p.students.length>20)throw new Error('Invalid student batch');
    const count=await db.prepare('SELECT COUNT(*) AS n FROM classroom_students WHERE active=1').first();if(count.n+p.students.length>100)throw new Error('Classroom full');
    const statements=p.students.map(s=>db.prepare('INSERT INTO classroom_students (id,name,code_hash,encrypted_code,created_at) VALUES (?,?,?,?,?)').bind(id(s.id),bounded(s.name,60),bounded(s.codeHash,64),bounded(s.encryptedCode,300),bounded(s.createdAt,30)));
    await db.batch(statements);return {added:p.students.length};
  }
  case 'students:rename':await db.prepare('UPDATE classroom_students SET name=? WHERE id=? AND active=1').bind(bounded(p.name,60),id(p.id)).run();return {saved:true};
  case 'students:archive':await db.prepare('UPDATE classroom_students SET active=0 WHERE id=?').bind(id(p.id)).run();return {saved:true};
  case 'settings:get':return {setting:await db.prepare('SELECT value FROM classroom_settings WHERE key=?').bind(bounded(p.key,80)).first()};
  case 'settings:set':await db.prepare('INSERT INTO classroom_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(bounded(p.key,80),bounded(p.value,1000)).run();return {saved:true};
  case 'submissions:save':{
    id(p.studentId);id(p.clientId);id(p.id);if(!['writing','reading','listening','speaking'].includes(p.kind))throw new Error('Invalid activity');
    await db.prepare('INSERT INTO classroom_submissions (id,student_id,client_id,kind,title,payload,score,total,words,created_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(student_id,client_id) DO NOTHING').bind(p.id,p.studentId,p.clientId,p.kind,bounded(p.title,200),bounded(p.payload,150000),p.score??null,p.total??null,p.words??null,bounded(p.createdAt,30)).run();
    return {submission:await db.prepare('SELECT id,student_id,client_id,kind,title,score,total,words,created_at,reviewed,feedback,teacher_score FROM classroom_submissions WHERE student_id=? AND client_id=?').bind(p.studentId,p.clientId).first()};
  }
  case 'submissions:list':{
    const clauses=[],args=[];if(p.studentId){clauses.push('s.student_id=?');args.push(id(p.studentId));}
    if(p.kind){if(!['writing','reading','listening','speaking'].includes(p.kind))throw new Error('Invalid skill');clauses.push('s.kind=?');args.push(p.kind);}
    if(p.reviewed===0||p.reviewed===1){clauses.push('s.reviewed=?');args.push(p.reviewed);}
    const where=clauses.length?' WHERE '+clauses.join(' AND '):'',limit=Math.min(100,Math.max(1,Math.floor(Number(p.limit))||50)),offset=Math.min(100000,Math.max(0,Math.floor(Number(p.offset))||0));
    const sql=' FROM classroom_submissions s JOIN classroom_students p ON p.id=s.student_id'+where;
    const records=await db.prepare('SELECT '+summary+sql+' ORDER BY s.created_at DESC,s.id DESC LIMIT ? OFFSET ?').bind(...args,limit,offset).all();
    const count=await db.prepare('SELECT COUNT(*) AS n'+sql).bind(...args).first();return {submissions:records.results,total:count.n,offset,limit};
  }
  case 'submissions:detail':return {submission:await db.prepare('SELECT '+summary+',s.payload FROM classroom_submissions s JOIN classroom_students p ON p.id=s.student_id WHERE s.id=?'+(p.studentId?' AND s.student_id=?':'')).bind(id(p.id),...(p.studentId?[id(p.studentId)]:[])).first()};
  case 'submissions:review':await db.prepare('UPDATE classroom_submissions SET feedback=?,teacher_score=?,reviewed=?,reviewed_at=? WHERE id=?').bind(bounded(p.feedback,10000),p.teacherScore==null?null:bounded(p.teacherScore,30),p.reviewed?1:0,bounded(p.reviewedAt,30),id(p.id)).run();return {saved:true};
  case 'summary':return {students:(await db.prepare('SELECT COUNT(*) AS n FROM classroom_students WHERE active=1').first()).n,submissions:(await db.prepare('SELECT COUNT(*) AS n FROM classroom_submissions').first()).n,awaitingReview:(await db.prepare('SELECT COUNT(*) AS n FROM classroom_submissions WHERE reviewed=0').first()).n};
  default:throw new Error('Unsupported classroom operation');
  }
}
export async function handleStore(request,env){
  const key=env.STORE_API_KEY,supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
  if(!key||!supplied)return Response.json({error:'Not authorized'},{status:401});
  const enc=new TextEncoder(),[a,b]=await Promise.all([key,supplied].map(v=>crypto.subtle.digest('SHA-256',enc.encode(v))));
  const av=new Uint8Array(a),bv=new Uint8Array(b);let diff=0;for(let i=0;i<av.length;i++)diff|=av[i]^bv[i];if(diff)return Response.json({error:'Not authorized'},{status:401});
  if(request.method!=='POST')return Response.json({error:'Use POST'},{status:405});
  if(Number(request.headers.get('content-length')||0)>200000)return Response.json({error:'Request too large'},{status:413});
  try{const raw=await request.text();if(raw.length>200000)return Response.json({error:'Request too large'},{status:413});const {op,params}=JSON.parse(raw);return Response.json(await storeOperation(env.DB,op,params),{headers:{'Cache-Control':'no-store'}});}
  catch{return Response.json({error:'The classroom record could not be processed'},{status:400});}
}
