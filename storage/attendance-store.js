const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class AttendanceError extends Error{constructor(status,message){super(message);this.status=status;}}
const invalid=message=>{throw new AttendanceError(400,message);};
export function attendanceMonth(value){if(typeof value!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value))invalid('Choose a valid month.');return value;}
export function attendanceDate(now=Date.now()){return new Date(now+8*3600000).toISOString().slice(0,10);}
export function attendanceClock(now=Date.now()){return new Date(now+8*3600000).toISOString().slice(11,16);}
function dateValue(value){if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)invalid('Choose a valid class date.');return value;}
function timestamp(value){if(value===null||value===undefined||value==='')return null;if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,19)!==value.slice(0,19))invalid('Choose a valid attendance time.');return new Date(value).toISOString();}
function minutes(time){if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))invalid('Choose valid start and end times.');const [h,m]=time.split(':').map(Number);return h*60+m;}
export function validateAttendance(value,now=Date.now()){
 if(!value||!UUID.test(value.id||''))invalid('This class record reference is invalid.');
 if(!Number.isInteger(value.revision)||value.revision<0||value.revision>1000000)invalid('Refresh this class record before saving.');
 dateValue(value.date);const state=value.state??'completed';if(!['live','completed'].includes(state))invalid('Choose a valid class status.');
 const startedAt=timestamp(value.startedAt),endedAt=timestamp(value.endedAt),start=minutes(value.startTime),endDate=state==='live'?null:dateValue(value.endDate||value.date);
 const manual=value.teachingHours!==undefined,hours=value.teachingHours;
 if(manual&&(state!=='completed'||hours!==null&&(typeof hours!=='number'||!Number.isFinite(hours)||hours<=0||hours>24||Math.abs(hours*100-Math.round(hours*100))>0.00001)))invalid('Enter teaching hours from 0.01 to 24, with up to two decimal places.');
 let durationMinutes=0;
 if(state==='live'){if(!startedAt||endedAt||value.endTime||!value.teacherPresent||value.paid)invalid('A launched class needs a start time and cannot have a payment recorded before it ends.');if(Date.parse(startedAt)>now+60000)invalid('The class start time cannot be in the future.');}
 else if(manual){durationMinutes=hours===null?0:Math.round(hours*6000)/100;minutes(value.endTime);}
 else{durationMinutes=(Date.parse(endDate+'T00:00:00Z')-Date.parse(value.date+'T00:00:00Z'))/60000+minutes(value.endTime)-start;if(durationMinutes<0||durationMinutes===0&&!startedAt||durationMinutes>1440)invalid('The end time must follow the start time, within 24 hours.');}
 if(endedAt&&(!startedAt||Date.parse(endedAt)<Date.parse(startedAt)||Date.parse(endedAt)>now+60000))invalid('Check the class finish time.');
 if(typeof value.title!=='string'||!value.title.trim()||value.title.trim().length>120)invalid('Enter a class title of 1–120 characters.');
 if(typeof value.teacherPresent!=='boolean'||typeof value.paid!=='boolean')invalid('Check your teaching attendance and payment status.');
 if(value.teacherPresent&&value.date>attendanceDate(now))invalid('Teaching attendance can be recorded on or after the class date.');
 const rate=value.hourlyRate;let rateMinor=null;
 if(rate!==null&&rate!==''&&rate!==undefined){if(typeof rate!=='number'||!Number.isFinite(rate)||rate<0||rate>100000000||Math.abs(rate*100-Math.round(rate*100))>0.00001)invalid('Enter a non-negative hourly rate with up to two decimal places.');rateMinor=Math.round(rate*100);}
 if(!['MNT','PHP','USD'].includes(value.currency))invalid('Choose MNT, PHP or USD for this rate.');
 if(value.paid&&(!value.teacherPresent||rateMinor===null||manual&&hours===null))invalid('Enter your teaching hours and amount per hour before marking payment received.');
 if(typeof value.notes!=='string'||value.notes.length>1000)invalid('Keep class notes within 1,000 characters.');
 if(!Array.isArray(value.attendees)||value.attendees.length>100)invalid('Choose up to 100 students for this class.');
 const seen=new Set(),attendees=value.attendees.map(row=>{if(!UUID.test(row?.studentId||'')||seen.has(row.studentId)||!['present','absent','late','excused','unmarked'].includes(row.status))invalid('Choose a valid attendance status for each student.');seen.add(row.studentId);return {studentId:row.studentId,status:row.status,markedAt:row.status==='unmarked'?null:timestamp(row.markedAt)};}).sort((a,b)=>a.studentId.localeCompare(b.studentId));
 return {id:value.id,revision:value.revision,date:value.date,startTime:value.startTime,endTime:state==='live'?'':value.endTime,endDate,state,startedAt,endedAt,durationMinutes,...(manual?{teachingHours:hours}:{}),title:value.title.trim(),teacherPresent:value.teacherPresent,rateMinor,currency:value.currency,paid:value.paid,notes:value.notes,attendees};
}
export function attendanceAmount(session){return session.state!=='live'&&session.teacherPresent&&session.rateMinor!==null&&session.teachingHours!==null?Math.round((session.teachingHours??session.durationMinutes/60)*session.rateMinor):null;}
export function attendanceSummary(sessions){const taught=sessions.filter(s=>s.teacherPresent&&s.state!=='live'),payments={};for(const s of taught){const amount=attendanceAmount(s);if(amount===null)continue;payments[s.currency]??={totalMinor:0,paidMinor:0,outstandingMinor:0};const group=payments[s.currency];group.totalMinor+=amount;group[s.paid?'paidMinor':'outstandingMinor']+=amount;}return {sessions:sessions.length,running:sessions.filter(s=>s.state==='live').length,taught:taught.length,minutes:taught.reduce((sum,s)=>sum+s.durationMinutes,0),missingRates:taught.filter(s=>s.rateMinor===null).length,payments};}
function fromRow(row){return row?{...JSON.parse(row.payload),id:row.id,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at}:null;}
export async function attendanceStore(db,op,p={}){
 await db.prepare('CREATE TABLE IF NOT EXISTS classroom_attendance (id TEXT PRIMARY KEY,date TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)').run();
 await db.prepare('CREATE INDEX IF NOT EXISTS attendance_date ON classroom_attendance(date)').run();
 if(op==='attendance:list'){const month=attendanceMonth(p.month);return {sessions:(await db.prepare('SELECT * FROM classroom_attendance WHERE date LIKE ? ORDER BY date DESC,json_extract(payload,\'$.startTime\') DESC,id').bind(month+'-%').all()).results.map(fromRow)};}
 if(!UUID.test(p.id||p.session?.id||''))invalid('Invalid attendance reference.');
 if(op==='attendance:get')return {session:fromRow(await db.prepare('SELECT * FROM classroom_attendance WHERE id=?').bind(p.id).first())};
 if(op!=='attendance:save')throw new Error('Unsupported attendance operation');
 const s=p.session,checked=validateAttendance({...s,hourlyRate:s.rateMinor===null?null:s.rateMinor/100},p.now??Date.now());
 if(!Array.isArray(s.attendees)||s.attendees.some(a=>typeof a.name!=='string'||!a.name||a.name.length>60))invalid('Student names are missing from this attendance record.');
 const payload=JSON.stringify({...checked,id:undefined,revision:undefined,teacherName:'Teacher Angelo',attendees:checked.attendees.map(a=>({...a,name:s.attendees.find(row=>row.studentId===a.studentId).name}))}),timestamp=p.updatedAt;
 if(typeof timestamp!=='string'||!Number.isFinite(Date.parse(timestamp)))invalid('Invalid attendance update time.');
 const existing=await db.prepare('SELECT * FROM classroom_attendance WHERE id=?').bind(s.id).first();
 // Retries of the same record return the saved version. Each entire class is
 // one atomic JSON write; revision checks prevent another device being overwritten.
 if(existing?.payload===payload)return {saved:true,session:fromRow(existing)};
 const statement=s.revision===0?db.prepare('INSERT INTO classroom_attendance (id,date,payload,revision,created_at,updated_at) VALUES (?,?,?,1,?,?) ON CONFLICT(id) DO NOTHING').bind(s.id,checked.date,payload,timestamp,timestamp):db.prepare('UPDATE classroom_attendance SET date=?,payload=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(checked.date,payload,timestamp,s.id,s.revision);
 const result=await statement.run(),row=await db.prepare('SELECT * FROM classroom_attendance WHERE id=?').bind(s.id).first();
 if(Number(result.meta?.changes??result.changes)!==1&&row?.payload!==payload)return {saved:false,conflict:true};
 return {saved:true,session:fromRow(row)};
}
