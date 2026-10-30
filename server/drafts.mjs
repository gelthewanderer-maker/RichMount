const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY=/^[a-zA-Z0-9][a-zA-Z0-9:@._-]{0,199}$/;
export class DraftError extends Error{constructor(message){super(message);this.status=400;}}
export function draftKey(value){if(typeof value!=='string'||!KEY.test(value))throw new DraftError('Choose a valid writing activity.');return value;}
export function validateDraft(value,updatedAt){
 if(!value||typeof value!=='object'||!UUID.test(value.deviceId||''))throw new DraftError('The draft device identifier is invalid.');
 const key=draftKey(value.key);
 if(!Number.isSafeInteger(value.revision)||value.revision<=0)throw new DraftError('The draft version is invalid.');
 if(typeof value.text!=='string'||value.text.length>30000)throw new DraftError('Writing drafts can contain up to 30,000 characters.');
 const plan=value.plan;if(!plan||typeof plan!=='object'||Array.isArray(plan))throw new DraftError('The writing plan is invalid.');
 const fields=new Set(['format','focus','overview','point1','point2','ending','goal','reflection','check0','check1','check2','check3']);
 if(Object.keys(plan).some(k=>!fields.has(k)||(k.startsWith('check')?typeof plan[k]!=='boolean':typeof plan[k]!=='string'||plan[k].length>2000)))throw new DraftError('A writing plan field is invalid.');
 const payload=JSON.stringify({version:1,key,text:value.text,plan,updatedAt});
 if(payload.length>50000)throw new DraftError('This draft is too large to back up. Download a copy.');
 return {key,deviceId:value.deviceId,revision:value.revision,payload,updatedAt};
}
export function publicDraft(row){const value=JSON.parse(row.payload);return {...value,deviceId:row.device_id,revision:row.revision,previous:row.previous_payload?JSON.parse(row.previous_payload):null};}
