// Integration fixtures use the same password exchange as real students.
import assert from 'node:assert/strict';
export const fixturePassword='Classroom-test-personal-password-1';
const sessions=new Map();
export const forgetStudentTestSession=(base,code)=>sessions.delete(base+':'+code);
export async function studentTestSession(base,code){
 if(!code||!code.startsWith('RM-'))return code;
 const key=base+':'+code;if(sessions.has(key))return sessions.get(key);
 const flight=(async()=>{
  const login=await fetch(base+'/api/student/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({studentCode:code,password:code})});if(login.status===401){const personal=await fetch(base+'/api/student/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({studentCode:code,password:fixturePassword})});if(personal.status===401)return code;assert.equal(personal.status,200);return (await personal.json()).token;}assert.equal(login.status,200,'Test student signs in with their initial code.');
  const initial=await login.json();
  const change=await fetch(base+'/api/student/password',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+initial.token},body:JSON.stringify({currentPassword:code,newPassword:fixturePassword,confirmPassword:fixturePassword})});assert.equal(change.status,200,'Test student chooses their personal password.');return (await change.json()).token;
 })();sessions.set(key,flight);return flight;
}
