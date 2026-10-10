import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createClassroomServer} from '../server/index.mjs';
import {codeHash,hashPassword} from '../server/security.mjs';
import {findMaterial,materialCatalog,makeMaterialTicket,readMaterialTicket} from '../server/materials.mjs';
import {lessonMaterials} from '../dist/materials-data.js';
import {materialsPage} from '../dist/materials.js';
import {createStudentSync} from '../dist/classroom.js';

const teacherCatalog=materialCatalog('teacher'),studentCatalog=materialCatalog('student');
assert.deepEqual(studentCatalog,lessonMaterials,'The student catalogue matches the server permissions.');
const all=teacherCatalog.lessons.flatMap(lesson=>lesson.files),studentFiles=studentCatalog.lessons.flatMap(lesson=>lesson.files);
assert.equal(all.length,87);assert.equal(new Set(all.map(file=>file.id)).size,87);assert.equal(studentFiles.length,68);
assert.equal(studentFiles.filter(file=>file.kind==='audio').length,47);
assert.ok(!studentFiles.some(file=>file.kind==='slides'||file.filename.endsWith('.pptx')));
assert.ok(!readFileSync(new URL('../dist/materials-data.js',import.meta.url),'utf8').includes('TG.pptx'));
assert.ok(!studentCatalog.lessons.some(lesson=>[7,16].includes(lesson.day)),'Only uploaded days are offered.');
assert.ok(studentCatalog.lessons.find(lesson=>lesson.day===20).files.some(file=>file.id==='practice-test-4-audio'));
assert.ok(studentCatalog.lessons.find(lesson=>lesson.day===21).files.some(file=>file.id==='lesson17-lp01'));
assert.ok(materialsPage({isConnected:false}).includes('Join your class'));
assert.ok(materialsPage({isConnected:true}).includes('Open audio player'));
assert.ok(!materialsPage({isConnected:true}).includes('Teacher slides'));
assert.ok(materialsPage({role:'teacher',catalog:teacherCatalog}).includes('Teacher only'));
assert.ok(materialsPage({catalog:{lessons:[{day:1,title:'<img src=x onerror=alert(1)>',files:[]}],version:'test'}}).includes('&lt;img'));

// Exercise the real delegated UI handlers without opening a preview server.
const listeners={},player={innerHTML:''},status={textContent:'',replaceChildren(){}},row={isConnected:true,querySelector:selector=>selector==='[data-material-player]'?player:status};
const app={addEventListener:(event,handler)=>listeners[event]=handler,querySelectorAll:()=>[]};
const opened=[],links=[],requests=[];
const context={lessonMaterials,URL,console,document:{querySelector:selector=>selector==='#app'?app:null,querySelectorAll:()=>[],createElement:()=>{const link={click(){links.push({...this});}};return link;}},window:{open(){const tab={opener:'parent',document:{body:{}},location:{replace:url=>opened.push(url)},close(){this.closed=true;}};return tab;}}};
vm.createContext(context);
const ui=readFileSync(new URL('../dist/materials.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
vm.runInContext(ui+'\nglobalThis.ui={initMaterials,stopMaterialsMedia};',context);
let sourceOrigin='https://richmount-ielts-classroom.onrender.com';
context.ui.initMaterials({isConnected:()=>true,apiBase:()=> 'https://richmount-ielts-classroom.onrender.com',studentAccess:async id=>{requests.push(id);return {url:sourceOrigin+'/api/materials/file/'+id+'?ticket=test-file-ticket',kind:id.includes('video')?'video':'audio',title:'Lesson recording',filename:'recording.mp3'};},teacherAccess:()=>{throw new Error('Unexpected teacher access');}});
function uiButton(mode,id){return {textContent:'Open',disabled:false,dataset:{materialOpen:mode,materialId:id,materialRole:'student'},closest:()=>row};}
const playButton=uiButton('play','lesson02-lp01');await listeners.click({target:{closest:()=>playButton}});
assert.ok(player.innerHTML.includes('<audio controls preload="metadata"'));
assert.ok(!player.innerHTML.includes('autoplay'));assert.equal(playButton.hidden,true);assert.equal(requests[0],'lesson02-lp01');
const downloadButton=uiButton('download','lesson02-lp01');await listeners.click({target:{closest:()=>downloadButton}});
assert.equal(new URL(links[0].href).searchParams.get('download'),'1');assert.equal(links[0].download,'recording.mp3');
await listeners.click({target:{closest:()=>uiButton('view','day01-book')}});assert.equal(opened.length,1);assert.ok(opened[0].startsWith(sourceOrigin));
player.innerHTML='';sourceOrigin='https://evil.test';await listeners.click({target:{closest:()=>uiButton('play','lesson02-lp01')}});assert.equal(player.innerHTML,'');assert.match(status.textContent,/could not be opened/,'The UI refuses media links to an unexpected origin.');

const password='Testing-only-materials-password-1',nextPassword='Testing-only-materials-password-2',hash=await hashPassword(password);
const student={id:randomUUID(),name:'Media learner',active:1},code='RM-'+('CD'.repeat(12)),settings=new Map();
const config={appOrigin:'https://teacher.test',allowedOrigins:['https://richmount-ielts.onrender.com'],passwordHash:hash,sessionSecret:'only-a-test-session-secret-'.repeat(3),encryptionKey:'af'.repeat(32),storeUrl:'https://private-store.test',siteToken:'only-a-test-sites-token',storeKey:'only-a-test-store-key'};
const book=findMaterial('day01-book'),slide=findMaterial('day01-teacher-slides');
let upstreamMode='normal',bridgeCalls=0;
config.store=async(op,params={})=>{
  if(op==='settings:get')return {setting:settings.has(params.key)?{value:settings.get(params.key)}:null};
  if(op==='settings:set'){settings.set(params.key,params.value);return {saved:true};}
  if(op==='students:by-code')return {student:params.codeHash===codeHash(code,config.encryptionKey)&&student.active===1?student:null};
  if(op==='students:by-id')return {student:params.id===student.id?student:null};
  throw new Error('Unexpected test datastore operation');
};
config.materialFetch=async(url,init)=>{
  bridgeCalls++;
  assert.ok(url.startsWith('https://private-store.test/api/materials/'));
  assert.equal(init.headers.Authorization,'Bearer '+config.storeKey);
  assert.equal(init.headers['OAI-Sites-Authorization'],'Bearer '+config.siteToken);
  assert.equal(init.redirect,'error');
  const file=findMaterial(url.split('/').pop());assert.ok(file);
  if(upstreamMode==='missing')return new Response(null,{status:404});
  if(init.headers.Range==='bytes=999999999-')return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+file.size}});
  const headers={'Content-Type':file.mime,'Content-Length':String(file.size),'X-Material-SHA256':upstreamMode==='corrupt'?'bad-checksum':file.sha256,ETag:'"test-media"'};
  if(init.method==='HEAD')return new Response(null,{headers});
  const bytes=Buffer.alloc(file.size,37);
  if(init.headers.Range==='bytes=10-19'){headers['Content-Length']='10';headers['Content-Range']=`bytes 10-19/${file.size}`;return new Response(bytes.subarray(10,20),{status:206,headers});}
  return new Response(bytes,{headers});
};

const ticket=makeMaterialTicket({id:book.id,role:'student',subject:student.id,secret:config.sessionSecret,now:1000000}).ticket;
assert.ok(readMaterialTicket(ticket,book.id,config.sessionSecret,1000000));
assert.equal(readMaterialTicket(ticket,slide.id,config.sessionSecret,1000000),null,'Tickets are bound to a single file.');
assert.equal(readMaterialTicket(ticket,book.id,config.sessionSecret,1000000+3*60*60*1000),null,'Expired tickets are rejected.');
const [body,sig]=ticket.split('.'),forged=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(body,'base64url')),role:'teacher'})).toString('base64url')+'.'+sig;
assert.equal(readMaterialTicket(forged,book.id,config.sessionSecret,1000000),null,'Changing a ticket role invalidates the signature.');
assert.throws(()=>makeMaterialTicket({id:slide.id,role:'student',subject:student.id,secret:config.sessionSecret}),/not found/);

const server=createClassroomServer(config);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
async function request(route,{method='GET',code:classCode,cookie='',range,json,origin='https://richmount-ielts.onrender.com'}={}){
  const headers={Origin:origin};if(classCode)headers.Authorization='Bearer '+classCode;if(cookie)headers.Cookie=cookie;if(range)headers.Range=range;if(json!==undefined)headers['Content-Type']='application/json';
  return fetch(base+route,{method,headers,body:json===undefined?undefined:JSON.stringify(json)});
}
const path=url=>{const parsed=new URL(url);assert.equal(parsed.origin,config.appOrigin);return parsed.pathname+parsed.search;};
try{
  assert.equal((await request('/api/student/materials/'+book.id+'/access')).status,401);
  assert.equal((await request('/api/student/materials/'+slide.id+'/access',{code})).status,404,'Student codes cannot mint links to slides.');
  assert.equal((await request('/api/teacher/materials',{code})).status,401);
  assert.equal((await request('/api/materials/file/'+book.id)).status,401);
  const catalogue=await request('/api/student/materials',{code});assert.equal(catalogue.status,200);assert.deepEqual(await catalogue.json(),lessonMaterials);
  const accessResponse=await request('/api/student/materials/'+book.id+'/access',{code});assert.equal(accessResponse.status,200);const access=await accessResponse.json();
  assert.ok(!JSON.stringify(access).includes(code));assert.ok(!JSON.stringify(access).includes('private-store'));
  const full=await request(path(access.url));assert.equal(full.status,200);assert.equal((await full.arrayBuffer()).byteLength,book.size);assert.equal(full.headers.get('content-type'),'application/pdf');
  assert.match(full.headers.get('content-disposition'),/^inline/);assert.match(full.headers.get('cache-control'),/no-store/);
  const range=await request(path(access.url),{range:'bytes=10-19'});assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),`bytes 10-19/${book.size}`);assert.deepEqual(Buffer.from(await range.arrayBuffer()),Buffer.alloc(10,37));
  const head=await request(path(access.url),{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(book.size));assert.equal(await head.text(),'');
  const invalid=await request(path(access.url),{range:'bytes=999999999-'});assert.equal(invalid.status,416);assert.equal(invalid.headers.get('content-range'),'bytes */'+book.size);
  const download=await request(path(access.url)+'&download=1');assert.match(download.headers.get('content-disposition'),/^attachment/);await download.body.cancel();
  const mismatch=await request(path(access.url).replace('/'+book.id+'?','/'+slide.id+'?'));assert.equal(mismatch.status,401);
  const before=bridgeCalls;student.active=0;assert.equal((await request(path(access.url))).status,401);assert.equal(bridgeCalls,before,'An archived student cannot keep using a file ticket.');student.active=1;

  const login=await request('/api/teacher/login',{method:'POST',origin:config.appOrigin,json:{password}});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const teacherList=await request('/api/teacher/materials',{cookie,origin:config.appOrigin});assert.equal(teacherList.status,200);assert.equal((await teacherList.json()).lessons.flatMap(lesson=>lesson.files).filter(file=>file.kind==='slides').length,19);
  const teacherAccess=await request('/api/teacher/materials/'+slide.id+'/access',{cookie,origin:config.appOrigin});assert.equal(teacherAccess.status,200);const teacherFile=await teacherAccess.json();
  assert.equal((await request(path(teacherFile.url),{origin:config.appOrigin})).status,401,'Teacher file links also require the signed-in teacher session.');
  const teacherHead=await request(path(teacherFile.url),{method:'HEAD',cookie,origin:config.appOrigin});assert.equal(teacherHead.status,200);assert.match(teacherHead.headers.get('content-disposition'),/^attachment/);
  const change=await request('/api/teacher/password',{method:'POST',cookie,origin:config.appOrigin,json:{currentPassword:password,newPassword:nextPassword}});assert.equal(change.status,200);
  assert.equal((await request(path(teacherFile.url),{origin:config.appOrigin})).status,401,'Changing the teacher password invalidates earlier teacher file links.');

  upstreamMode='missing';assert.equal((await request(path(access.url))).status,404);upstreamMode='corrupt';assert.equal((await request(path(access.url))).status,503);upstreamMode='normal';
  const memory=new Map(),client=createStudentSync({storage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)},apiBase:base,fetcher:fetch});
  await client.join(code);assert.equal((await client.fileAccess(book.id)).id,book.id,'The student client uses its class code to request file access.');
  const preflight=await request('/api/materials/file/'+book.id,{method:'OPTIONS'});assert.equal(preflight.status,204);assert.match(preflight.headers.get('access-control-allow-headers'),/Range/);assert.match(preflight.headers.get('access-control-allow-methods'),/HEAD/);
  console.log('Passed: all 87 files, day/audio matching, student and teacher separation, signed tickets, download headers, byte-range streaming, expiry and revoked access.');
}finally{await new Promise(resolve=>server.close(resolve));}
