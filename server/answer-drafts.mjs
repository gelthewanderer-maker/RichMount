import {DraftError} from './drafts.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function answerKey(key){if(typeof key!=='string'||key.length>199||!/^(practice:(reading|listening|speaking|mock)|course:[a-z0-9][a-z0-9:@._-]*)$/.test(key)){const e=new DraftError('Choose a valid answer activity.');e.status=400;throw e;}return key;}
export function validateAnswers(data,updatedAt){
 const key=answerKey(data?.key);
 if(!UUID.test(data.deviceId||'')||!Number.isSafeInteger(data.revision)||data.revision<1||data.value!==null&&(typeof data.value!=='object'||Array.isArray(data.value))){const e=new DraftError('The saved answers are invalid.');e.status=400;throw e;}
 const payload=JSON.stringify(data.value);
 if(payload.length>150000){const e=new DraftError('This activity is too large to back up online. Your device copy is kept.');e.status=400;throw e;}
 return {key,deviceId:data.deviceId,revision:data.revision,payload,updatedAt};
}
export function publicAnswers(row){return {deviceId:row.device_id,revision:row.revision,value:JSON.parse(row.payload),previous:row.previous_payload?JSON.parse(row.previous_payload):null,updatedAt:row.updated_at};}
