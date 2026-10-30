import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {mobileLinks,mobilePlatform,installInstructions,initMobileApp} from '../dist/mobile.js';
import {appSetup,phoneSteps,initAppSetup} from '../dist/install.js';
import {appHTMLForRole} from '../server/mobile.mjs';

const file=name=>readFileSync(new URL('../dist/'+name,import.meta.url));
const origin='https://richmount-ielts.onrender.com';
for(const [name,teacher] of [['manifest.webmanifest',false],['teacher.webmanifest',true]]){
 const manifest=JSON.parse(file(name));
 assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');
 assert.equal(manifest.prefer_related_applications,false);
 assert.equal(manifest.start_url,teacher?'/#teacher/overview':'/#home');
 assert.equal(manifest.shortcuts.length,4);
 for(const icon of manifest.icons){const bytes=file(icon.src.replace(/^\//,'')),size=Number(icon.sizes.split('x')[0]);assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);assert.match(icon.purpose,/maskable/);}
 assert.ok(manifest.icons.some(i=>i.sizes==='192x192')&&manifest.icons.some(i=>i.sizes==='512x512'));
 assert.ok(manifest.shortcuts.every(s=>teacher===s.url.includes('#teacher/')));
}
assert.equal(file('assets/apple-touch-icon.png').readUInt32BE(16),180);
assert.ok(mobileLinks(true).every(([,href])=>href.startsWith('#teacher/')));
assert.ok(mobileLinks(false).every(([,href])=>!href.startsWith('#teacher/')));
assert.equal(mobilePlatform({userAgent:'iPhone'}),'ios');assert.equal(mobilePlatform({userAgent:'Mac',platform:'MacIntel',maxTouchPoints:5}),'ios');assert.equal(mobilePlatform({userAgent:'Android'}),'android');
assert.match(installInstructions('ios'),/Share.*Add to Home Screen/);assert.match(installInstructions('android'),/Install app/);assert.match(installInstructions('android',true),/Open this page in Chrome/);

// Exercise the real navigation and installation handlers without a browser.
class Events{constructor(){this.events={};}addEventListener(type,fn){(this.events[type]??=[]).push(fn);}async emit(type,event={}){for(const fn of this.events[type]||[])await fn({currentTarget:this,target:this,preventDefault(){},...event});}}
class Element extends Events{
 constructor(tag,doc){super();this.tag=tag;this.doc=doc;this.attrs={};this.children=[];this.hidden=false;this.inert=false;this.open=false;this.className='';this.classList={toggle:(name,on)=>{const c=new Set(this.className.split(' ').filter(Boolean));if(on===undefined?!c.has(name):on)c.add(name);else c.delete(name);this.className=[...c].join(' ');},contains:name=>this.className.split(' ').includes(name)};}
 setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 append(el){this.children.push(el);}prepend(el){this.children.unshift(el);}insertBefore(el,before){const index=this.children.indexOf(before);assert.ok(index>=0);this.children.splice(index,0,el);}
 set innerHTML(html){this.html=html;this.children=[];for(const m of html.matchAll(/<(button|a|p)\b([^>]*)>/g)){const el=new Element(m[1],this.doc);for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))el.setAttribute(a[1],a[2]??'');this.append(el);}}
 get innerHTML(){return this.html||'';}
 matches(selector){if(selector.startsWith('#'))return this.id===selector.slice(1);if(selector.startsWith('.'))return this.className.split(' ').includes(selector.slice(1));const m=selector.match(/^(\w+)?(?:\[([^=\]]+)(?:="([^"]*)")?\])?$/);return !!m&&(!m[1]||this.tag===m[1])&&(!m[2]||this.getAttribute(m[2])!==null&&(m[3]===undefined||this.getAttribute(m[2])===m[3]));}
 querySelectorAll(selector){const all=this.children.flatMap(c=>[c,...c.querySelectorAll('*')]);return selector==='*'?all:all.filter(c=>selector.split(',').some(s=>c.matches(s)));}querySelector(s){return this.querySelectorAll(s)[0]||null;}
 click(){this.clicks=(this.clicks||0)+1;}focus(){this.doc.activeElement=this;}select(){this.selected=true;}scrollIntoView(){this.scrolled=true;}getClientRects(){return this.hidden?[]:[{}];}closest(s){return this.matches(s)?this:null;}showModal(){this.open=true;}close(){this.open=false;}
}
function dom({teacher=false,standalone=false,ios=false,offline=false}={}){
 const doc=new Events();doc.createElement=tag=>new Element(tag,doc);doc.body=doc.createElement('body');doc.querySelector=s=>doc.body.querySelector(s);
 const sidebar=doc.createElement('aside');sidebar.className='sidebar';const firstLink=doc.createElement('a');firstLink.setAttribute('href','#writing');sidebar.append(firstLink);
 const main=doc.createElement('div');main.className='main-wrap';const top=doc.createElement('header');top.className='topbar';const actions=doc.createElement('div');actions.className='top-actions';top.append(actions);main.append(top);
 const logout=doc.createElement('button');logout.id='logoutBtn';logout.setAttribute('data-session-logout','');sidebar.append(logout);
 const task=doc.createElement('div');task.id='studentTaskBar';main.append(task);const app=doc.createElement('main');app.id='app';main.append(app);doc.body.append(sidebar);doc.body.append(main);
 const win=new Events(),media=new Events(),display=new Events();media.matches=true;display.matches=standalone;win.matchMedia=s=>s.includes('max-width')?media:display;win.location={origin:teacher?'https://richmount-ielts-classroom.onrender.com':origin,hash:teacher?'#teacher/overview':'#writing'};win.isSecureContext=true;
 const nav={userAgent:ios?'iPhone':'Android',onLine:!offline,standalone:ios&&standalone};const state=initMobileApp({win,doc,nav,api:'https://richmount-ielts-classroom.onrender.com'});
 return {doc,win,nav,media,display,state,sidebar,main,actions,firstLink,bar:doc.querySelector('.mobile-tabbar'),install:doc.querySelector('.mobile-install-button'),dialog:doc.querySelector('#richmountInstallDialog')};
}
const student=dom();await student.bar.querySelector('button').emit('click');await student.sidebar.emit('click',{target:student.sidebar.querySelector('[data-session-logout]')});assert.equal(student.main.inert,false,'The drawer closes when its single logout control is chosen.');assert.equal(student.doc.body.querySelectorAll('[data-session-logout]').length,1);assert.equal(student.state.teacher,false);assert.equal(student.sidebar.inert,true);assert.equal(student.bar.querySelector('a[href="#writing"]').getAttribute('aria-current'),'page');
await student.bar.querySelector('button').emit('click');assert.equal(student.sidebar.inert,false);assert.equal(student.main.inert,true);assert.equal(student.bar.inert,true);assert.equal(student.sidebar.getAttribute('aria-modal'),'true');
await student.doc.emit('keydown',{key:'Escape'});assert.equal(student.main.inert,false);assert.equal(student.sidebar.inert,true);assert.equal(student.doc.activeElement,student.bar.querySelector('button'));
await student.bar.querySelector('button').emit('click');await student.firstLink.emit('click');await student.sidebar.emit('click',{target:student.firstLink});assert.equal(student.main.inert,false);
student.win.location.hash='#homework';await student.win.emit('hashchange');assert.equal(student.bar.querySelector('a[href="#homework"]').getAttribute('aria-current'),'page');
student.media.matches=false;await student.media.emit('change');assert.equal(student.sidebar.inert,false);
await student.install.emit('click');assert.equal(student.dialog.open,true);await student.dialog.querySelector('[data-install-close]').emit('click');assert.equal(student.dialog.open,false);
let prompted=0;await student.win.emit('beforeinstallprompt',{prompt:async()=>prompted++,userChoice:Promise.resolve({outcome:'accepted'})});await student.install.emit('click');assert.equal(prompted,1);assert.equal(student.install.hidden,false);await student.win.emit('appinstalled');assert.equal(student.install.hidden,true);
const teacher=dom({teacher:true});assert.equal(teacher.state.teacher,true);assert.ok(teacher.bar.querySelectorAll('a').every(a=>a.getAttribute('href').startsWith('#teacher/')));
const iphone=dom({ios:true,standalone:true,offline:true});assert.equal(iphone.install.hidden,true);assert.equal(iphone.doc.querySelector('.mobile-connection').hidden,false);await iphone.win.emit('online');assert.equal(iphone.doc.querySelector('.mobile-connection').hidden,true);

// Verify initial teacher installation identity before browser JavaScript runs.
for(const page of ['index.html','install.html']){const original=file(page).toString(),teacherHTML=appHTMLForRole(original,true),studentHTML=appHTMLForRole(teacherHTML,false);assert.match(teacherHTML,/<link rel="manifest" href="teacher.webmanifest">/);assert.match(teacherHTML,/<meta name="apple-mobile-web-app-title" content="Richmount Teacher">/);assert.match(teacherHTML,/<body[^>]*data-app-role="teacher"/);assert.match(studentHTML,/<link rel="manifest" href="manifest.webmanifest">/);assert.match(studentHTML,/<body[^>]*data-app-role="student"/);assert.equal(appHTMLForRole(teacherHTML,true),teacherHTML);assert.equal(file(page).toString(),original,'Serving teacher HTML never changes the release files');}
for(const [role,host] of [['student',origin],['teacher','https://richmount-ielts-classroom.onrender.com']])assert.ok(file('assets/'+role+'-app-qr.svg').toString().includes('<title>'+host+'/install.html</title>'),'QR points to the correct public setup page');
assert.equal(appSetup(true,'https://teacher.test').start,'/#teacher/overview');assert.equal(appSetup(false,origin).start,'/#home');assert.match(phoneSteps('ios').join(' '),/Share.*Add to Home Screen/);assert.match(phoneSteps('android').join(' '),/Chrome.*Install/);
function setupDOM({teacher=false,ios=false,standalone=false,inApp=false,clipboard=true}={}){
 const doc=new Events();doc.createElement=tag=>new Element(tag,doc);doc.body=doc.createElement('body');doc.body.dataset={appRole:teacher?'teacher':'student'};doc.querySelector=s=>doc.body.querySelector(s);doc.querySelectorAll=s=>doc.body.querySelectorAll(s);
 for(const [tag,id] of [['button','installAppButton'],['p','installStatus'],['ol','deviceSteps'],['input','appInstallLink'],['button','copyAppLink'],['p','copyStatus'],['img','appQRCode'],['p','browserNotice'],['section','deviceGuide']]){const e=doc.createElement(tag);e.id=id;doc.body.append(e);}
 for(const key of ['role-label','role-description','open-label','signin-title','signin-description','feature-label']){const e=doc.createElement('p');e.setAttribute('data-'+key,'');doc.body.append(e);}
 const anchor=doc.createElement('a');anchor.setAttribute('data-studio-link','');doc.body.append(anchor);const manifest=doc.createElement('link');manifest.setAttribute('rel','manifest');doc.body.append(manifest);
 for(const device of ['android','ios']){const e=doc.createElement('button');e.dataset={device};e.setAttribute('data-device',device);doc.body.append(e);}
 const win=new Events();win.location={origin:teacher?'https://richmount-ielts-classroom.onrender.com':origin};win.matchMedia=()=>({matches:standalone});win.isSecureContext=true;let copied='';const nav={userAgent:(ios?'iPhone':'Android')+(inApp?' FBAV':''),clipboard:{writeText:async value=>{if(!clipboard)throw new Error('Unavailable');copied=value;}}};
 const state=initAppSetup({win,doc,nav,api:'https://richmount-ielts-classroom.onrender.com'});return {win,doc,state,manifest,anchor,install:doc.querySelector('#installAppButton'),copied:()=>copied};
}
const installStudent=setupDOM();assert.equal(installStudent.state.setup.teacher,false);assert.equal(installStudent.anchor.href,'/#home');assert.equal(installStudent.doc.querySelector('#appInstallLink').value,origin+'/install.html');await installStudent.install.emit('click');assert.equal(installStudent.doc.querySelector('#deviceGuide').scrolled,true);assert.match(installStudent.doc.querySelector('#installStatus').textContent,/Chrome/);
await installStudent.doc.querySelector('#copyAppLink').emit('click');assert.equal(installStudent.copied(),origin+'/install.html');assert.match(installStudent.doc.querySelector('#copyStatus').textContent,/copied/);
let nativePrompts=0;await installStudent.win.emit('beforeinstallprompt',{prompt:async()=>nativePrompts++,userChoice:Promise.resolve({outcome:'accepted'})});await installStudent.install.emit('click');assert.equal(nativePrompts,1);assert.equal(installStudent.state.installed,false,'Requested installation waits for browser confirmation');await installStudent.win.emit('appinstalled');assert.equal(installStudent.state.installed,true);assert.equal(installStudent.install.hidden,true);
const installTeacher=setupDOM({teacher:true});assert.equal(installTeacher.manifest.href,'teacher.webmanifest');assert.equal(installTeacher.anchor.href,'/#teacher/overview');assert.match(installTeacher.doc.querySelector('[data-signin-title]').textContent,/teacher password/);assert.equal(installTeacher.doc.querySelector('#appQRCode').src,'assets/teacher-app-qr.svg');
const installIphone=setupDOM({ios:true,inApp:true,clipboard:false});assert.equal(installIphone.doc.querySelector('#browserNotice').hidden,false);assert.match(installIphone.doc.querySelector('#deviceSteps').innerHTML,/Safari/);await installIphone.doc.querySelector('#copyAppLink').emit('click');assert.equal(installIphone.doc.querySelector('#appInstallLink').selected,true);assert.equal(setupDOM({standalone:true}).install.hidden,true);

// Run the service worker lifecycle and its actual request/response privacy policy.
const events={},cacheStores=new Map();let online=true,privateResponse=false,claims=0;
class AppRequest extends Request{constructor(input,options){super(new URL(typeof input==='string'?input:input.url,origin),options?.mode==='navigate'?{...options,mode:'same-origin'}:options??(typeof input==='string'?undefined:input));if(options?.mode==='navigate')Object.defineProperty(this,'mode',{value:'navigate'});}}
function response(path,privateCache=false){const mime=path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':path.endsWith('.png')?'image/png':path.endsWith('.jpg')?'image/jpeg':path.endsWith('.svg')?'image/svg+xml':'text/html';const res=new Response((privateCache?'Private response: ':'Public interface: ')+path,{headers:{'Content-Type':mime,'Cache-Control':privateCache?'private, no-store':'public'}});Object.defineProperty(res,'type',{value:'basic'});const clone=res.clone.bind(res);res.clone=()=>{const c=clone();Object.defineProperty(c,'type',{value:'basic'});return c;};return res;}
const caches={async open(name){if(!cacheStores.has(name))cacheStores.set(name,new Map());return {put:async(key,value)=>cacheStores.get(name).set(key,value.clone()),match:async key=>cacheStores.get(name).get(key)?.clone()};},async keys(){return [...cacheStores.keys()];},async delete(key){return cacheStores.delete(key);},async match(key,{cacheName}){return cacheStores.get(cacheName)?.get(key)?.clone();}};
const sandbox={URL,Request:AppRequest,caches,fetch:async request=>{if(!online)throw new Error('offline');return response(new URL(request.url).pathname,privateResponse);},self:{location:{origin},clients:{claim:async()=>claims++},addEventListener:(name,fn)=>events[name]=fn}};
vm.createContext(sandbox);vm.runInContext(file('sw.js').toString()+'\nglobalThis.policy={FILES,CACHE,interfaceRequest,cacheable};',sandbox);
const policy=sandbox.policy;for(const path of policy.FILES)assert.ok(existsSync(new URL('../dist'+path,import.meta.url)),'Precache file exists: '+path);
let pending;events.install({waitUntil:p=>pending=p});await pending;assert.equal(cacheStores.get(policy.CACHE).size,policy.FILES.length);
for(const input of [origin+'/api/student/submissions',origin+'/api/materials/book/stream?ticket=private',origin+'/assets/recording.mp3',origin+'/?ticket=private','https://richmount-ielts-classroom.onrender.com/api/student/homework'])assert.equal(policy.interfaceRequest(new AppRequest(input)),false,'Do not intercept classroom/private resource: '+input);
assert.equal(policy.interfaceRequest(new AppRequest('/app.js',{headers:{Authorization:'Bearer test'}})),false);assert.equal(policy.interfaceRequest(new AppRequest('/app.js',{headers:{Range:'bytes=0-99'}})),false);assert.equal(policy.interfaceRequest(new AppRequest('/app.js',{method:'POST'})),false);
assert.equal(policy.cacheable(response('/app.js',true),'/app.js'),false);assert.equal(policy.cacheable(new Response('private data'),'/app.js'),false);
function request(path,options){let handled;events.fetch({request:new AppRequest(path,options),respondWith:p=>handled=p});return handled;}
online=false;assert.match(await (await request('/app.js?v=update')).text(),/Public interface/);assert.match(await (await request('/',{mode:'navigate'})).text(),/Public interface/);assert.equal(request('/api/teacher/students'),undefined);
online=true;privateResponse=true;const stored=await cacheStores.get(policy.CACHE).get('/app.js').clone().text();await request('/app.js');assert.equal(await cacheStores.get(policy.CACHE).get('/app.js').clone().text(),stored,'A private response never replaces public cached content');
cacheStores.set('richmount-interface-old',new Map());cacheStores.set('unrelated-data',new Map());events.activate({waitUntil:p=>pending=p});await pending;assert.equal(claims,1);assert.equal(cacheStores.has('richmount-interface-old'),false);assert.equal(cacheStores.has('unrelated-data'),true);
assert.doesNotMatch(file('sw.js').toString(),/skipWaiting\(/,'An update must not interrupt writing or recording');
console.log('Passed mobile app checks: student/teacher routes, phone setup guides, QR links, initial teacher install identity, clipboard fallback, confirmed installation, drawer accessibility, offline interface and private-resource cache isolation.');
