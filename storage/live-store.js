import {answerStore} from './answer-store.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function liveStore(db,op,p={}){
 if(op==='live:touch'){
  if(typeof p.payload!=='string'||p.payload.length>2500)throw Error('Invalid activity update');
  return answerStore(db,'answers:save',{...p,key:'activity:current'});
 }
 if(p.studentId&&!UUID.test(p.studentId))throw Error('Invalid activity owner');
 if(op==='live:roster'){
  const sql='WITH sessions AS (SELECT student_id,device_id,payload,updated_at,revision,ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY updated_at DESC,revision DESC) AS recent_rank FROM classroom_answer_drafts WHERE draft_key=?) SELECT p.id AS student_id,p.name,s.device_id,s.payload,s.updated_at FROM classroom_students p LEFT JOIN sessions s ON s.student_id=p.id AND s.recent_rank<=8 WHERE p.active=1'+(p.studentId?' AND p.id=?':'')+' ORDER BY p.name,s.updated_at DESC,s.revision DESC';
  return {rows:(await db.prepare(sql).bind('activity:current',...(p.studentId?[p.studentId]:[])).all()).results};
 }
 if(op==='live:drafts'){
  if(!UUID.test(p.studentId||''))throw Error('Choose a student');
  if(p.key){
   if(typeof p.key!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9:@._-]{0,199}$/.test(p.key)||!['answers','writing'].includes(p.source))throw Error('Invalid activity draft');
   const table=p.source==='writing'?'classroom_writing_drafts':'classroom_answer_drafts';
   return {drafts:(await db.prepare('SELECT draft_key,device_id,revision,payload,updated_at FROM '+table+' WHERE student_id=? AND draft_key=? ORDER BY updated_at DESC,revision DESC LIMIT 8').bind(p.studentId,p.key).all()).results.map(row=>({...row,source:p.source}))};
  }
  return {drafts:(await db.prepare("SELECT draft_key,device_id,revision,payload,updated_at,'answers' AS source FROM classroom_answer_drafts WHERE student_id=? AND draft_key<>'activity:current' AND payload<>'null' UNION ALL SELECT draft_key,device_id,revision,payload,updated_at,'writing' AS source FROM classroom_writing_drafts WHERE student_id=? ORDER BY updated_at DESC LIMIT 1").bind(p.studentId,p.studentId).all()).results};
 }
 throw Error('Unknown live classroom operation');
}
