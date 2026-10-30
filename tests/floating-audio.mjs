import assert from 'node:assert/strict';
import {initFloatingAudio,openFloatingAudio,moveFloatingAudioHome,placeFloatingAudio,syncFloatingAudioOwner,closeFloatingAudioSource,pauseFloatingAudio,floatingAudioOwner} from '../dist/floating-audio.js?v=20261013-attendance1';

class Events{
 constructor(){this.listeners={};}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 fire(type,event={}){for(const fn of this.listeners[type]||[])fn({target:this,preventDefault(){},stopPropagation(){},...event});}
}
class Element extends Events{
 constructor(tag,doc){super();this.tagName=tag.toUpperCase();this.doc=doc;this.children=[];this.attrs={};this.dataset={};this.hidden=false;this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),toggle:(c,on)=>on?this.classes.add(c):this.classes.delete(c)};this.style={setProperty:(k,v)=>this.attrs[k]=v};}
 append(child){if(child.parentNode)child.parentNode.children=child.parentNode.children.filter(node=>node!==child);child.parentNode=this;this.children.push(child);}
 get isConnected(){return this===this.doc.body||!!this.parentNode?.isConnected;}
 setAttribute(key,value){this.attrs[key]=String(value);}getAttribute(key){return this.attrs[key]??null;}
 removeAttribute(key){delete this.attrs[key];if(key==='src')this.src='';}
 matches(selector){return selector.startsWith('#')?this.id===selector.slice(1):selector==='[data-floating-action]'?!!this.dataset.floatingAction:selector.toUpperCase()===this.tagName;}
 closest(selector){return this.matches(selector)?this:this.parentNode?.closest(selector)||null;}
 contains(node){return node===this||this.children.some(child=>child.contains(node));}
 querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
 querySelector(selector){const match=selector.match(/^\[data-floating-action="(.*?)"\]$/);return match?this.querySelectorAll('[data-floating-action]').find(child=>child.dataset.floatingAction===match[1])||null:this.querySelectorAll(selector)[0]||null;}
 set innerHTML(html){this.html=html;this.children=[];for(const match of html.matchAll(/<(\w+)\b[^>]*(?:id="([^"]+)"|data-floating-action="([^"]+)")[^>]*>/g)){const child=this.doc.createElement(match[1]);if(match[2])child.id=match[2];if(match[3])child.dataset.floatingAction=match[3];this.append(child);}}
 get innerHTML(){return this.html||'';}
 insertAdjacentElement(_,child){this.parentNode.append(child);}
 focus(){this.doc.activeElement=this;}
}
class Audio extends Element{
 constructor(doc){super('audio',doc);this.paused=true;this.currentTime=0;this.duration=0;this.loads=0;this.playCalls=0;}
 load(){this.loads++;this.currentTime=0;}
 play(){this.playCalls++;if(this.nextPlay){const pending=this.nextPlay;this.nextPlay=null;return pending;}this.paused=false;this.doc.fire('play',{target:this});this.fire('play');return Promise.resolve();}
 pause(){this.paused=true;this.fire('pause');}
 metadata(duration=180){this.duration=duration;this.fire('loadedmetadata');}
}
const doc=new Events(),win=new Events();doc.body=new Element('body',doc);doc.createElement=tag=>tag==='audio'?new Audio(doc):new Element(tag,doc);const app=new Element('main',doc);app.id='app';doc.body.append(app);doc.activeElement=app;let modal=null;
doc.querySelector=selector=>selector==='dialog:modal'?modal?.open?modal:null:doc.body.querySelector(selector);
doc.querySelectorAll=selector=>selector==='#app audio,#app video'?[...app.querySelectorAll('audio'),...app.querySelectorAll('video')]:doc.body.querySelectorAll(selector);
win.location={origin:'https://student.test'};win.innerHeight=800;win.visualViewport=new Events();Object.assign(win.visualViewport,{height:800,offsetTop:0});
let actor='student:a',onPlay=0,renew,toast='';const pending=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const controller=initFloatingAudio({doc,win,scope:()=>actor,origin:()=> 'https://teacher.test',onPlay:()=>onPlay++,toast:text=>toast=text,refreshAccess:()=>renew.promise});const {media,panel}=controller;
const button=action=>panel.querySelector('[data-floating-action="'+action+'"]'),click=action=>panel.fire('click',{target:button(action)}),tick=()=>new Promise(resolve=>setImmediate(resolve));
const a='https://teacher.test/api/materials/file/test-1?ticket=a',b='https://teacher.test/api/audio/file/record-2?ticket=b';
assert.ok(openFloatingAudio({url:a,title:'Uploaded practice test',owner:actor,autoplay:true}));media.metadata();await tick();assert.equal(controller.state().playing,true);assert.equal(onPlay,1,'Starting audio pauses the current mock timer.');media.currentTime=45;
const initialLoads=media.loads;moveFloatingAudioHome();app.innerHTML='<p>Reading or answering on another page</p>';placeFloatingAudio();assert.equal(media.parentNode,doc.body);assert.equal(media.currentTime,45);assert.equal(media.loads,initialLoads,'Changing app content does not reload the audio.');assert.equal(controller.media,media);assert.ok(controller.state().playing);
assert.ok(openFloatingAudio({url:a.replace('ticket=a','ticket=new'),owner:actor}));assert.equal(media.currentTime,45,'Reopening the same recording preserves playback position.');assert.equal(media.loads,initialLoads);
click('play');assert.equal(media.paused,true);click('play');await tick();assert.equal(media.paused,false);click('back');assert.equal(media.currentTime,35);click('forward');assert.equal(media.currentTime,45);const seek=panel.querySelector('#floatingAudioSeek');seek.value='99';seek.fire('input');assert.equal(media.currentTime,99);click('replay');await tick();assert.equal(media.currentTime,0);assert.equal(media.paused,false);
click('minimize');assert.equal(panel.querySelector('#floatingAudioControls').hidden,true);assert.equal(button('minimize').getAttribute('aria-expanded'),'false');assert.equal(media.paused,false,'Minimizing controls keeps audio playing.');click('minimize');assert.equal(panel.querySelector('#floatingAudioControls').hidden,false);
modal=new Element('dialog',doc);modal.open=true;doc.body.append(modal);placeFloatingAudio();assert.equal(panel.parentNode,modal);assert.equal(media.parentNode,doc.body,'Full-page reader moves only controls, never the active media.');media.currentTime=60;modal.open=false;doc.fire('close',{target:modal});assert.equal(panel.parentNode,doc.body);assert.equal(media.currentTime,60);assert.equal(media.paused,false);
const inline=doc.createElement('audio');inline.src='blob:https://student.test/speaking-1';inline.currentTime=12;app.append(inline);inline.play();await tick();media.metadata(90);assert.equal(inline.hidden,true);assert.equal(inline.paused,true);assert.equal(controller.state().url,inline.src);assert.equal(media.currentTime,12);assert.ok(app.querySelector('button'),'A recording preview can reopen the floating player.');closeFloatingAudioSource(inline.src);assert.equal(panel.hidden,true);assert.equal(media.src,'');assert.equal(inline.src,'blob:https://student.test/speaking-1','Closing playback does not delete the recording.');
const invalid=doc.createElement('audio');invalid.src='https://untrusted.test/file.mp3';app.append(invalid);invalid.play();await tick();assert.equal(invalid.paused,true);assert.equal(invalid.hidden,false);assert.match(toast,/cannot be played/);assert.equal(panel.hidden,true);
for(const url of ['https://evil.test/api/audio/file/x','https://teacher.test/private-page','javascript:alert(1)','blob:https://evil.test/x'])assert.throws(()=>openFloatingAudio({url}),/cannot be played/);
assert.equal(openFloatingAudio({url:a,owner:'student:b'}),false,'A stale access response cannot play under another learner.');openFloatingAudio({url:b,owner:actor,autoplay:true});media.metadata();await tick();const video=new Element('video',doc);video.pause=()=>{video.paused=true;};app.append(video);doc.fire('play',{target:video});assert.equal(media.paused,true,'A video and floating recording do not play over each other.');
click('play');await tick();media.currentTime=37;renew=pending();media.fire('error');renew.resolve({url:b.replace('ticket=b','ticket=renewed')});await tick();media.metadata();assert.equal(media.currentTime,37);assert.equal(media.paused,false,'Access renewal preserves the intended playback position.');
controller.close();openFloatingAudio({url:b,owner:actor,autoplay:true});media.metadata();await tick();renew=pending();media.fire('error');pauseFloatingAudio();renew.resolve({url:b.replace('ticket=b','ticket=paused')});await tick();media.metadata();assert.equal(media.paused,true,'Pausing while access reconnects does not restart audio.');
controller.close();openFloatingAudio({url:b,owner:actor,autoplay:true});await tick();renew=pending();media.fire('error');controller.close();renew.resolve({url:b.replace('ticket=b','ticket=stale')});await tick();assert.equal(panel.hidden,true);assert.equal(media.src,'','A closed player cannot be resurrected by a late access response.');
const rejected=pending();openFloatingAudio({url:a,owner:actor});media.nextPlay=rejected.promise;click('play');openFloatingAudio({url:b,owner:actor,autoplay:true});rejected.reject(new Error('old play request'));await tick();assert.equal(controller.state().url,b);assert.equal(media.paused,false);assert.ok(!panel.querySelector('#floatingAudioStatus').textContent.includes('Press Play'),'An old play failure cannot change the new recording.');
actor='student:b';syncFloatingAudioOwner();assert.equal(panel.hidden,true);assert.equal(media.src,'');assert.equal(floatingAudioOwner(),actor);actor='teacher';openFloatingAudio({url:a,owner:actor,autoplay:true});await tick();actor='teacher:out';syncFloatingAudioOwner();assert.equal(panel.hidden,true,'Logout clears teacher media access.');
assert.ok(!panel.innerHTML.includes('<a '));assert.equal(media.getAttribute('controlslist'),'nodownload');
console.log('Floating audio passed: persistent media identity across pages/readers, speaking previews, play/pause/replay/seeking, minimising, single-stream playback, source restrictions, access renewal, stale response isolation, and logout cleanup.');
