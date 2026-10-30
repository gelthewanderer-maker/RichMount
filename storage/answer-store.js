const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function answerStore(db,op,p){
 if(!UUID.test(p.studentId||'')||typeof p.key!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9:@._-]{0,199}$/.test(p.key))throw Error('Invalid answer draft owner or activity');
 if(op==='answers:list')return {drafts:(await db.prepare('SELECT device_id,revision,payload,previous_payload,updated_at FROM classroom_answer_drafts WHERE student_id=? AND draft_key=? ORDER BY updated_at DESC,revision DESC LIMIT 8').bind(p.studentId,p.key).all()).results};
 if(!UUID.test(p.deviceId||'')||!Number.isSafeInteger(p.revision)||p.revision<1||typeof p.payload!=='string'||p.payload.length>150000||!Number.isFinite(Date.parse(p.updatedAt)))throw Error('Invalid answer draft');
 const current=await db.prepare('SELECT revision,payload,updated_at FROM classroom_answer_drafts WHERE student_id=? AND draft_key=? AND device_id=?').bind(p.studentId,p.key,p.deviceId).first();
 if(current?.revision===p.revision)return {saved:current.payload===p.payload,revision:current.revision,updatedAt:current.updated_at};
 await db.prepare('INSERT INTO classroom_answer_drafts (student_id,draft_key,device_id,revision,payload,previous_payload,updated_at) VALUES (?,?,?,?,?,NULL,?) ON CONFLICT(student_id,draft_key,device_id) DO UPDATE SET previous_payload=CASE WHEN classroom_answer_drafts.payload<>excluded.payload THEN classroom_answer_drafts.payload ELSE classroom_answer_drafts.previous_payload END,revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at WHERE excluded.revision>classroom_answer_drafts.revision').bind(p.studentId,p.key,p.deviceId,p.revision,p.payload,p.updatedAt).run();
 const actual=await db.prepare('SELECT revision,payload,updated_at FROM classroom_answer_drafts WHERE student_id=? AND draft_key=? AND device_id=?').bind(p.studentId,p.key,p.deviceId).first();
 return {saved:actual.revision===p.revision&&actual.payload===p.payload,revision:actual.revision,updatedAt:actual.updated_at};
}
