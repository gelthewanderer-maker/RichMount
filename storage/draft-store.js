const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function draftStore(db,op,p){
 if(!UUID.test(p.studentId||'')||typeof p.key!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9:@._-]{0,199}$/.test(p.key))throw new Error('Invalid draft owner or key');
 if(op==='drafts:list')return {drafts:(await db.prepare('SELECT device_id,revision,payload,previous_payload,updated_at FROM classroom_writing_drafts WHERE student_id=? AND draft_key=? ORDER BY updated_at DESC LIMIT 8').bind(p.studentId,p.key).all()).results};
 if(!UUID.test(p.deviceId||'')||!Number.isSafeInteger(p.revision)||p.revision<=0||typeof p.payload!=='string'||p.payload.length>50000||typeof p.updatedAt!=='string'||!Number.isFinite(Date.parse(p.updatedAt)))throw new Error('Invalid draft data');
 const current=await db.prepare('SELECT revision,payload FROM classroom_writing_drafts WHERE student_id=? AND draft_key=? AND device_id=?').bind(p.studentId,p.key,p.deviceId).first();
 if(current?.revision===p.revision){const a=JSON.parse(current.payload),b=JSON.parse(p.payload);return {saved:a.text===b.text&&JSON.stringify(a.plan)===JSON.stringify(b.plan),revision:current.revision};}
 if(!current){const size=await db.prepare('SELECT COUNT(*) AS n FROM classroom_writing_drafts WHERE student_id=?').bind(p.studentId).first();if(size.n>=160)throw new Error('Draft backup limit reached');}
 await db.prepare('INSERT INTO classroom_writing_drafts (student_id,draft_key,device_id,revision,payload,previous_payload,updated_at) VALUES (?,?,?,?,?,NULL,?) ON CONFLICT(student_id,draft_key,device_id) DO UPDATE SET previous_payload=CASE WHEN classroom_writing_drafts.payload<>excluded.payload THEN classroom_writing_drafts.payload ELSE classroom_writing_drafts.previous_payload END,revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at WHERE excluded.revision>classroom_writing_drafts.revision').bind(p.studentId,p.key,p.deviceId,p.revision,p.payload,p.updatedAt).run();
 const actual=await db.prepare('SELECT revision,payload FROM classroom_writing_drafts WHERE student_id=? AND draft_key=? AND device_id=?').bind(p.studentId,p.key,p.deviceId).first();
 return {saved:actual.revision===p.revision&&actual.payload===p.payload,revision:actual.revision};
}
