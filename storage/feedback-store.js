const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id=x=>{if(!UUID.test(x||''))throw Error('Invalid feedback identifier');return x;};
const date=x=>{if(typeof x!=='string'||!Number.isFinite(Date.parse(x)))throw Error('Invalid feedback time');return new Date(x).toISOString();};
export async function ensureFeedback(db){await db.prepare(`CREATE TABLE IF NOT EXISTS classroom_feedback_jobs (
 submission_id TEXT PRIMARY KEY REFERENCES classroom_submissions(id),due_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TEXT NOT NULL,lease_until TEXT,claim_token TEXT,report_json TEXT,
 completed_at TEXT,last_error TEXT NOT NULL DEFAULT '')`).run();}
export function enqueueStatement(db,submissionId){return db.prepare(`INSERT INTO classroom_feedback_jobs (submission_id,due_at,next_attempt_at)
 SELECT id,strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+1 hour'),strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+1 hour')
 FROM classroom_submissions WHERE id=? AND kind='writing' ON CONFLICT(submission_id) DO NOTHING`).bind(id(submissionId));}
export async function feedbackStore(db,op,p={}){
 await ensureFeedback(db);const now=date(p.now||new Date().toISOString());
 // Raw AI reports are private teacher drafts. Student reads only return the
 // teacher's saved, explicitly published text, including all teacher edits.
 if(op==='feedback:status'){
  const row=await db.prepare(`SELECT j.status,j.due_at,s.reviewed,s.feedback,s.reviewed_at FROM classroom_feedback_jobs j JOIN classroom_submissions s ON s.id=j.submission_id WHERE j.submission_id=? AND s.student_id=?`).bind(id(p.id),id(p.studentId)).first();
  if(!row)return {feedback:null};
  const published=!!row.reviewed,waiting=['completed','awaiting_review'].includes(row.status);
  return {feedback:{status:published?'published':waiting?'awaiting_teacher':row.status,dueAt:row.due_at,completedAt:published?row.reviewed_at:null,text:published?row.feedback:null,report:null}};
 }
 if(op==='feedback:teacher-draft'){
  const row=await db.prepare('SELECT status,due_at,completed_at,report_json FROM classroom_feedback_jobs WHERE submission_id=?').bind(id(p.id)).first();
  if(!row)return {automaticFeedback:null};
  const ready=['completed','awaiting_review'].includes(row.status)&&row.due_at<=now;
  return {automaticFeedback:{status:ready?'awaiting_review':row.status,dueAt:row.due_at,completedAt:ready?row.completed_at:null,report:ready&&row.report_json?JSON.parse(row.report_json):null}};
 }
 if(op==='feedback:summary')return {counts:(await db.prepare('SELECT status,COUNT(*) AS count FROM classroom_feedback_jobs GROUP BY status').all()).results};
 if(op==='feedback:claim'){
  const token=id(p.token),until=new Date(Date.parse(now)+5*60000).toISOString();
  const row=await db.prepare(`SELECT j.submission_id FROM classroom_feedback_jobs j JOIN classroom_submissions s ON s.id=j.submission_id JOIN classroom_students p ON p.id=s.student_id
  WHERE p.active=1 AND j.due_at<=? AND j.next_attempt_at<=? AND (j.status IN ('pending','retry') OR (j.status='processing' AND j.lease_until<=?)) ORDER BY j.due_at LIMIT 1`).bind(now,now,now).first();
  if(!row)return {job:null};
  const updated=await db.prepare(`UPDATE classroom_feedback_jobs SET status='processing',claim_token=?,lease_until=?,attempts=attempts+1
   WHERE submission_id=? AND due_at<=? AND next_attempt_at<=? AND (status IN ('pending','retry') OR (status='processing' AND lease_until<=?))`).bind(token,until,row.submission_id,now,now,now).run();
  if(Number(updated.meta?.changes??updated.changes)!==1)return {job:null};
  return {job:await db.prepare('SELECT j.*,s.student_id,s.payload FROM classroom_feedback_jobs j JOIN classroom_submissions s ON s.id=j.submission_id WHERE j.submission_id=? AND j.claim_token=?').bind(row.submission_id,token).first()};
 }
 if(op==='feedback:complete'){
  if(typeof p.report!=='string'||p.report.length>45000)throw Error('Invalid feedback report');JSON.parse(p.report);
  const result=await db.prepare("UPDATE classroom_feedback_jobs SET status='awaiting_review',report_json=?,completed_at=?,lease_until=NULL,claim_token=NULL,last_error='' WHERE submission_id=? AND status='processing' AND claim_token=? AND due_at<=?").bind(p.report,now,id(p.id),id(p.token),now).run();
  return {saved:Number(result.meta?.changes??result.changes)===1};
 }
 if(op==='feedback:retry'){
  const row=await db.prepare('SELECT attempts FROM classroom_feedback_jobs WHERE submission_id=? AND claim_token=? AND status=\'processing\'').bind(id(p.id),id(p.token)).first();if(!row)return {saved:false};
  const failed=row.attempts>=6,delay=Math.min(60,2**Math.min(row.attempts,6));
  const error=p.reason==='provider'?'AI connection needs attention. The original writing remains saved.':'Feedback needs teacher attention. The original writing remains saved.';
  await db.prepare('UPDATE classroom_feedback_jobs SET status=?,next_attempt_at=?,lease_until=NULL,claim_token=NULL,last_error=? WHERE submission_id=? AND claim_token=?').bind(failed?'needs_attention':'retry',new Date(Date.parse(now)+delay*60000).toISOString(),error,p.id,p.token).run();return {saved:true};
 }
 if(op==='feedback:retry-failed'){await db.prepare("UPDATE classroom_feedback_jobs SET status='retry',attempts=0,next_attempt_at=? WHERE status='needs_attention'").bind(now).run();return {saved:true};}
 throw Error('Unknown feedback operation');
}
