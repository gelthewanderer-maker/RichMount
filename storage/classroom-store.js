import {ensureAttachments,attachmentStore} from './attachment-store.js';
import {ensureFeedback,enqueueStatement,feedbackStore} from './feedback-store.js';
import {draftStore} from './draft-store.js';
import {answerStore} from './answer-store.js';
import {liveStore} from './live-store.js';
import {attendanceStore} from './attendance-store.js';
import {audioForSubmission,audioLibrary} from './audio-store.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id=v=>{if(!UUID.test(v||''))throw new Error('Invalid record identifier');return v;};
const bounded=(v,n)=>{if(typeof v!=='string'||v.length>n)throw new Error('Invalid record value');return v;};
const summary="s.id,s.student_id,s.client_id,s.kind,s.title,s.score,s.total,s.words,s.created_at,s.reviewed,s.feedback,s.teacher_score,s.reviewed_at,p.name AS student_name,(SELECT COUNT(*) FROM classroom_feedback_files f WHERE f.submission_id=s.id AND f.deleted=0 AND f.published=1 AND s.reviewed=1) AS feedback_file_count,(SELECT status FROM classroom_feedback_jobs j WHERE j.submission_id=s.id) AS auto_feedback_status,(SELECT due_at FROM classroom_feedback_jobs j WHERE j.submission_id=s.id) AS auto_feedback_due_at,json_extract(s.payload,'$.context') AS context,json_extract(s.payload,'$.week') AS week,json_extract(s.payload,'$.activityId') AS activity_id,json_extract(s.payload,'$.coach.bandEstimate') AS ai_band,COALESCE(json_extract(s.payload,'$.coach.taskType'),json_extract(s.payload,'$.writingTaskType')) AS writing_task_type,json_extract(s.payload,'$.coach.criteria') AS writing_criteria";
// The owner-private Sites boundary and a server-only API key protect every operation.
export async function storeOperation(db,op,p={}){
  if(!db)throw new Error('Classroom database unavailable');
  await ensureFeedback(db);await ensureAttachments(db);
  if(op.startsWith('attachments:'))return attachmentStore(db,op,p);
  if(op.startsWith('feedback:'))return feedbackStore(db,op,p);
  switch(op){
  case 'drafts:list':case 'drafts:save':return draftStore(db,op,p);
  case 'answers:list':case 'answers:save':return answerStore(db,op,p);
  case 'live:touch':case 'live:roster':case 'live:drafts':return liveStore(db,op,p);
  case 'students:credentials':case 'students:password-set':{
    await db.prepare('CREATE TABLE IF NOT EXISTS classroom_student_passwords (student_id TEXT PRIMARY KEY,password_hash TEXT,session_version TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(student_id) REFERENCES classroom_students(id))').run();
    const studentId=id(p.id);
    if(op==='students:credentials')return {credentials:await db.prepare('SELECT password_hash,session_version FROM classroom_student_passwords WHERE student_id=?').bind(studentId).first()};
    if(p.passwordHash!==null&&!/^scrypt-v2\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(p.passwordHash||'')||!/^[0-9a-f]{64}$/.test(p.version||''))throw new Error('Invalid student password settings');
    const check=p.expectedVersion===null?' AND NOT EXISTS (SELECT 1 FROM classroom_student_passwords WHERE student_id=?)':p.expectedVersion!==undefined?' AND EXISTS (SELECT 1 FROM classroom_student_passwords WHERE student_id=? AND session_version=?)':'';
    const args=[studentId,p.passwordHash,p.version,bounded(p.updatedAt,30),studentId,...(p.expectedVersion===null?[studentId]:p.expectedVersion!==undefined?[studentId,bounded(p.expectedVersion,64)]:[])];
    const result=await db.prepare('INSERT INTO classroom_student_passwords (student_id,password_hash,session_version,updated_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM classroom_students WHERE id=? AND active=1)'+check+' ON CONFLICT(student_id) DO UPDATE SET password_hash=excluded.password_hash,session_version=excluded.session_version,updated_at=excluded.updated_at').bind(...args).run();
    return {saved:Number(result.meta?.changes??result.changes)===1};
  }
  case 'attendance:list':case 'attendance:get':case 'attendance:save':return attendanceStore(db,op,p);
  case 'writing:cache':case 'writing:by-id':case 'writing:save':case 'writing:reserve':{
    await db.prepare('CREATE TABLE IF NOT EXISTS classroom_writing_reviews (id TEXT PRIMARY KEY,owner TEXT NOT NULL,cache_key TEXT NOT NULL,text_hash TEXT NOT NULL,report TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(owner,cache_key))').run();
    if(op==='writing:cache')return {report:await db.prepare('SELECT * FROM classroom_writing_reviews WHERE owner=? AND cache_key=?').bind(id(p.owner),bounded(p.key,64)).first()};
    if(op==='writing:by-id')return {report:await db.prepare('SELECT * FROM classroom_writing_reviews WHERE id=? AND owner=?').bind(id(p.id),id(p.owner)).first()};
    if(op==='writing:save'){await db.prepare('INSERT INTO classroom_writing_reviews (id,owner,cache_key,text_hash,report,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(owner,cache_key) DO NOTHING').bind(id(p.id),id(p.owner),bounded(p.key,64),bounded(p.textHash,64),bounded(p.report,45000),bounded(p.createdAt,30)).run();return {saved:true};}
    await db.prepare('CREATE TABLE IF NOT EXISTS classroom_writing_usage (owner TEXT NOT NULL,day TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,day))').run();
    const day=bounded(p.day,10),maximum=p.teacher?80:8;
    const reserved=await db.prepare('INSERT INTO classroom_writing_usage (owner,day,used) VALUES (?,?,1) ON CONFLICT(owner,day) DO UPDATE SET used=used+1 WHERE used<?').bind(id(p.owner),day,maximum).run();
    const usage=await db.prepare('SELECT used FROM classroom_writing_usage WHERE owner=? AND day=?').bind(p.owner,day).first();
    // A guarded increment is atomic; callers beyond the limit cannot reserve.
    return {allowed:Number(reserved.meta?.changes??reserved.changes)===1&&usage.used<=maximum};
  }
  case 'submissions:coach':await db.prepare("UPDATE classroom_submissions SET payload=json_set(payload,'$.coach',json(?)) WHERE id=? AND student_id=? AND kind='writing'").bind(bounded(p.coach,45000),id(p.id),id(p.studentId)).run();return {saved:true};
  case 'weekly:list':case 'weekly:award':{
    await db.prepare('CREATE TABLE IF NOT EXISTS classroom_weekly_points (student_id TEXT NOT NULL,window_key TEXT NOT NULL,activity_id TEXT NOT NULL,points INTEGER NOT NULL CHECK(points>=0 AND points<=100),approved INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,PRIMARY KEY(student_id,window_key,activity_id),FOREIGN KEY(student_id) REFERENCES classroom_students(id))').run();
    if(op==='weekly:award'){if(!Number.isInteger(p.points)||p.points<0||p.points>100||p.approved!==true)throw new Error('Invalid weekly approval');await db.prepare('INSERT INTO classroom_weekly_points (student_id,window_key,activity_id,points,approved,updated_at) VALUES (?,?,?,?,1,?) ON CONFLICT(student_id,window_key,activity_id) DO UPDATE SET points=excluded.points,approved=1,updated_at=excluded.updated_at').bind(id(p.studentId),bounded(p.windowKey,40),bounded(p.activityId,60),p.points,bounded(p.updatedAt,30)).run();return {saved:true};}
    const where=p.studentId?' WHERE a.student_id=?':'';
    return {awards:(await db.prepare('SELECT a.* FROM classroom_weekly_points a JOIN classroom_students s ON s.id=a.student_id'+where+' ORDER BY a.updated_at DESC').bind(...(p.studentId?[id(p.studentId)]:[])).all()).results,totals:(await db.prepare('SELECT s.id AS student_id,COALESCE(SUM(CASE WHEN a.approved=1 THEN a.points ELSE 0 END),0) AS points FROM classroom_students s LEFT JOIN classroom_weekly_points a ON a.student_id=s.id WHERE s.active=1 GROUP BY s.id').all()).results};
  }
  case 'course:settings':return {settings:(await db.prepare("SELECT key,value FROM classroom_settings WHERE key LIKE 'course:%'").all()).results};
  case 'materials:settings':return {settings:(await db.prepare("SELECT key,value FROM classroom_settings WHERE key LIKE 'materials:%'").all()).results};
  case 'books:keys':return {settings:(await db.prepare("SELECT key,value FROM classroom_settings WHERE key LIKE ?").bind('book-key:'+bounded(p.bookId,60)+':%').all()).results};
  case 'books:grades':return {submissions:(await db.prepare('SELECT '+summary+",json_extract(s.payload,'$.bookId') AS book_id,json_extract(s.payload,'$.bookActivityId') AS book_activity_id,json_extract(s.payload,'$.questionCount') AS question_count,json_extract(s.payload,'$.answeredCount') AS answered_count,json_extract(s.payload,'$.pendingCount') AS pending_count FROM classroom_submissions s JOIN classroom_students p ON p.id=s.student_id WHERE json_extract(s.payload,'$.source')='student-book' ORDER BY s.created_at DESC,s.id DESC LIMIT 10000").all()).results};
  case 'course:progress':{
    const where=p.studentId?' AND s.student_id=?':'';
    return {submissions:(await db.prepare('SELECT '+summary+",json_extract(s.payload,'$.section') AS section,json_extract(s.payload,'$.weeklyKey') AS weekly_key,json_extract(s.payload,'$.courseAttemptId') AS attempt_id,(SELECT COUNT(*) FROM classroom_audio a WHERE a.submission_id=s.id AND a.role='student' AND a.deleted=0) AS recordings FROM classroom_submissions s JOIN classroom_students p ON p.id=s.student_id WHERE p.active=1 AND json_extract(s.payload,'$.context') IN ('homework','weekly-mock')"+where+' ORDER BY s.created_at DESC,s.id DESC LIMIT 4000').bind(...(p.studentId?[id(p.studentId)]:[])).all()).results};
  }
  case 'submissions:save-many':{
    if(!Array.isArray(p.submissions)||p.submissions.length<1||p.submissions.length>5)throw new Error('Invalid course submission batch');
    const owner=id(p.submissions[0].studentId);
    const statements=p.submissions.map(s=>{if(id(s.studentId)!==owner||!['writing','reading','listening','speaking'].includes(s.kind))throw new Error('Invalid course submission owner');return db.prepare('INSERT INTO classroom_submissions (id,student_id,client_id,kind,title,payload,score,total,words,created_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(student_id,client_id) DO NOTHING').bind(id(s.id),owner,id(s.clientId),s.kind,bounded(s.title,200),bounded(s.payload,150000),s.score??null,s.total??null,s.words??null,bounded(s.createdAt,30));});
    await db.batch([...statements,...p.submissions.filter(s=>s.kind==='writing').map(s=>enqueueStatement(db,s.id))]);
    const submissions=[];for(const s of p.submissions)submissions.push(await db.prepare('SELECT * FROM classroom_submissions WHERE student_id=? AND client_id=?').bind(owner,s.clientId).first());
    return {submissions};
  }
  case 'audio:for-submission':return audioForSubmission(db,id(p.id));
  case 'audio:library':return audioLibrary(db);
  case 'audio:by-id':return {audio:await db.prepare('SELECT * FROM classroom_audio WHERE id=? AND deleted=0').bind(id(p.id)).first()};
  case 'health':return {ready:!!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='classroom_submissions'").first()};
  case 'students:archived':return {students:(await db.prepare('SELECT id,name,created_at FROM classroom_students WHERE active=0 ORDER BY created_at ASC').all()).results};
  case 'students:any-id':return {student:await db.prepare('SELECT * FROM classroom_students WHERE id=?').bind(id(p.id)).first()};
  case 'students:restore':{const count=await db.prepare('SELECT COUNT(*) AS n FROM classroom_students WHERE active=1').first();if(count.n>=100)throw new Error('Classroom full');await db.prepare('UPDATE classroom_students SET active=1 WHERE id=?').bind(id(p.id)).run();return {saved:true};}
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
  case 'settings:set':await db.prepare('INSERT INTO classroom_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(bounded(p.key,80),bounded(p.value,/^book-key:[a-z0-9-]{1,60}:[a-z0-9-]{1,60}$/.test(p.key)?12000:/^materials:[a-z0-9-]{1,60}$/.test(p.key)?5000:1000)).run();return {saved:true};
  case 'submissions:save':{
    id(p.studentId);id(p.clientId);id(p.id);if(!['writing','reading','listening','speaking'].includes(p.kind))throw new Error('Invalid activity');
    const insert=db.prepare('INSERT INTO classroom_submissions (id,student_id,client_id,kind,title,payload,score,total,words,created_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(student_id,client_id) DO NOTHING').bind(p.id,p.studentId,p.clientId,p.kind,bounded(p.title,200),bounded(p.payload,150000),p.score??null,p.total??null,p.words??null,bounded(p.createdAt,30));
    await db.batch(p.kind==='writing'?[insert,enqueueStatement(db,p.id)]:[insert]);
    return {submission:await db.prepare("SELECT id,student_id,client_id,kind,title,score,total,words,created_at,reviewed,feedback,teacher_score,json_extract(payload,'$.coach.bandEstimate') AS ai_band,COALESCE(json_extract(payload,'$.coach.taskType'),json_extract(payload,'$.writingTaskType')) AS writing_task_type,json_extract(payload,'$.coach.criteria') AS writing_criteria FROM classroom_submissions WHERE student_id=? AND client_id=?").bind(p.studentId,p.clientId).first()};
  }
  case 'submissions:list':{
    const clauses=[],args=[];if(p.studentId){clauses.push('s.student_id=?');args.push(id(p.studentId));}
    if(p.kind){if(!['writing','reading','listening','speaking'].includes(p.kind))throw new Error('Invalid skill');clauses.push('s.kind=?');args.push(p.kind);}
    if(p.context){if(!['practice','mock','homework','weekly-mock'].includes(p.context))throw new Error('Invalid activity filter');clauses.push("json_extract(s.payload,'$.context')=?");args.push(p.context);}
    if(p.week){if(!Number.isInteger(p.week)||p.week<1||p.week>8)throw new Error('Invalid course week');clauses.push("json_extract(s.payload,'$.week')=?");args.push(p.week);}
    if(p.weeklyKey){clauses.push("(json_extract(s.payload,'$.weeklyKey')=? OR (json_extract(s.payload,'$.weeklyKey') IS NULL AND s.created_at>=? AND s.created_at<?))");args.push(bounded(p.weeklyKey,40),bounded(p.startsAt,30),bounded(p.endsAt,30));}
    if(p.reviewed===0||p.reviewed===1){clauses.push('s.reviewed=?');args.push(p.reviewed);}
    const where=clauses.length?' WHERE '+clauses.join(' AND '):'',limit=Math.min(100,Math.max(1,Math.floor(Number(p.limit))||50)),offset=Math.min(100000,Math.max(0,Math.floor(Number(p.offset))||0));
    const sql=' FROM classroom_submissions s JOIN classroom_students p ON p.id=s.student_id'+where;
    const records=await db.prepare('SELECT '+summary+sql+' ORDER BY s.created_at DESC,s.id DESC LIMIT ? OFFSET ?').bind(...args,limit,offset).all();
    const count=await db.prepare('SELECT COUNT(*) AS n'+sql).bind(...args).first();return {submissions:records.results,total:count.n,offset,limit};
  }
  case 'submissions:detail':return {submission:await db.prepare('SELECT '+summary+',s.payload FROM classroom_submissions s JOIN classroom_students p ON p.id=s.student_id WHERE s.id=?'+(p.studentId?' AND s.student_id=?':'')).bind(id(p.id),...(p.studentId?[id(p.studentId)]:[])).first()};
  case 'submissions:review':{
    const selected=p.attachmentIds||[];if(!Array.isArray(selected)||selected.length>10)throw Error('Invalid attachment selection');selected.forEach(id);
    await db.batch([db.prepare('UPDATE classroom_submissions SET feedback=?,teacher_score=?,reviewed=?,reviewed_at=? WHERE id=?').bind(bounded(p.feedback,10000),p.teacherScore==null?null:bounded(p.teacherScore,30),p.reviewed?1:0,bounded(p.reviewedAt,30),id(p.id)),
      db.prepare('UPDATE classroom_feedback_files SET published=0 WHERE submission_id=?').bind(p.id),
      ...(p.reviewed&&selected.length?[db.prepare('UPDATE classroom_feedback_files SET published=1 WHERE submission_id=? AND deleted=0 AND id IN ('+selected.map(()=>'?').join(',')+')').bind(p.id,...selected)]:[])]);return {saved:true};
  }
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
  if(Number(request.headers.get('content-length')||0)>400000)return Response.json({error:'Request too large'},{status:413});
  try{const raw=await request.text();if(raw.length>400000)return Response.json({error:'Request too large'},{status:413});const {op,params}=JSON.parse(raw);if(raw.length>200000&&op!=='answers:save')return Response.json({error:'Request too large'},{status:413});return Response.json(await storeOperation(env.DB,op,params),{headers:{'Cache-Control':'no-store'}});}
  catch{return Response.json({error:'The classroom record could not be processed'},{status:400});}
}
