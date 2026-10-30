// Run from an approved background scheduler; credentials belong in its secret environment.
const origin=process.env.FEEDBACK_APP_ORIGIN||'https://richmount-ielts-classroom.onrender.com';
const key=process.env.RICHMOUNT_FEEDBACK_JOB_KEY;
if(!key||key.length<40)throw Error('Set the feedback scheduler secret before running this job.');
if(!/^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(origin))throw Error('Set the exact classroom HTTPS origin.');
const response=await fetch(origin+'/api/internal/feedback/run',{method:'POST',headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(300000),redirect:'error'});
if(!response.ok)throw Error('The feedback job did not complete: HTTP '+response.status);
const result=await response.json();console.log(JSON.stringify({processed:result.processed,failed:result.failed,waitingFor:result.waitingFor}));
