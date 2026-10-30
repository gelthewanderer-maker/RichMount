import{randomUUID,timingSafeEqual}from'node:crypto';
export const feedbackJobAuthorized=(value,key)=>!!key&&key.length>=40&&typeof value==='string'&&Buffer.byteLength(value)===Buffer.byteLength(key)&&timingSafeEqual(Buffer.from(value),Buffer.from(key));
export function createAutomaticFeedback({store,coach,config}){
 let running=null;
 const now=()=>new Date(config.now?.()??Date.now()).toISOString();
 async function status(){const ai=await coach.settings();return {delayMinutes:60,aiConfigured:ai.configured,aiEnabled:ai.enabled,schedulerConfigured:config.feedbackSchedulerEnabled===true,active:ai.configured&&ai.enabled&&config.feedbackSchedulerEnabled===true,...await store('feedback:summary')};}
 async function execute(){
  const settings=await coach.settings();if(!settings.configured||!settings.enabled)return {processed:0,waitingFor:'AI setup'};
  let processed=0,failed=0;
  for(let i=0;i<5;i++){
   const token=randomUUID(),{job}=await store('feedback:claim',{token,now:now()});if(!job)break;
   try{
    const payload=JSON.parse(job.payload);
    const report=await coach.review({owner:job.student_id,selector:{submissionId:job.submission_id},text:payload.text,automatic:true});
    const saved=await store('feedback:complete',{id:job.submission_id,token,report:JSON.stringify({...report,automatic:true,feedbackLabel:'AI writing coach · learning feedback'}),now:now()});if(saved.saved)processed++;
   }catch{await store('feedback:retry',{id:job.submission_id,token,reason:'provider',now:now()});failed++;}
  }
  return {processed,failed};
 }
 function run(){if(!running)running=execute().finally(()=>{running=null;});return running;}
 return {status,run};
}
