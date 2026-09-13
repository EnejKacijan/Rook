// Real production UI, synthetic private-local fixture. No AI request is sent.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';

const before=process.argv.includes('--before');
const phase=before?'before':'after';
const out=`artifacts/COACH-TAB-EXIT/${phase}`;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const pairs=[['today','progress'],['progress','profile'],['profile','today'],['today','coach'],['progress','coach'],['profile','coach'],['coach','today'],['coach','progress'],['coach','profile']];
async function setup(width,style,appearance,reducedMotion,long=true,record=false){
 const state=createReturningUserFixture(1);state.activeWorkout=null;state.ai.planUpgradeDismissed=true;
 state.activeCoachConversationId='qa-tabs';state.coachDraft='Unsent draft — keep exactly.\nSecond line.';
 state.conversations=Array.from({length:long?24:1},(_,i)=>({id:`qa-${i}`,conversationId:'qa-tabs',user:`Synthetic question ${i}`,reply:{text:'Synthetic response for transition testing. '.repeat(long?8:1),action:null},createdAt:Date.now()+i}));
 Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',colorScheme:appearance,reducedMotion,
  ...(record?{recordVideo:{dir:out,size:{width,height:844}}}:{})});
 await context.addInitScript(({state,standalone})=>{
  if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(state));
  if(standalone)Object.defineProperty(navigator,'standalone',{value:true});
  const vv=new EventTarget();let height=null;Object.assign(vv,{offsetTop:0,offsetLeft:0,scale:1});
  Object.defineProperties(vv,{height:{get:()=>height??innerHeight},width:{get:()=>innerWidth}});
  Object.defineProperty(window,'visualViewport',{value:vv,configurable:true});
  window.qaKeyboard=(h,offset=0)=>{height=h;vv.offsetTop=offset;vv.dispatchEvent(new Event('resize'));};
  window.qaEvents=[];
  for(const type of ['animationstart','animationcancel','animationend'])document.addEventListener(type,e=>qaEvents.push({type,name:e.animationName,target:e.target.className,time:performance.now()}));
 },{state,standalone:style==='premium'});
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/ai/status',r=>r.fulfill({json:{available:true}}));
 await p.route('**/api/ai',()=>{throw new Error('Navigation must not send AI requests');});
 await p.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:5173');
 await p.locator('.today-screen').waitFor();await p.evaluate(()=>document.fonts.ready);
 await p.locator('.bottom-nav').evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{}))));
 await p.evaluate(()=>{window.qaIdentity={shell:document.querySelector('.app-shell'),content:document.querySelector('.app-content'),nav:document.querySelector('.bottom-nav')};});
 return {p,context,errors,state};
}
async function read(p){return p.evaluate(()=>{
 const box=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {top:r.top,bottom:r.bottom,height:r.height,width:r.width,scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,position:s.position,overflow:s.overflow,transform:s.transform,opacity:s.opacity,animation:s.animationName,duration:s.animationDuration,easing:s.animationTimingFunction,transition:s.transition,inline:e.getAttribute('style')};};
 const nav=document.querySelector('.bottom-nav'),screen=document.querySelector('.app-content > .screen');
 return {screenClass:screen.className,screen:box(screen),nav:box(nav),active:nav.querySelector('[aria-current]')?.getAttribute('aria-label'),
  shellSame:qaIdentity.shell===document.querySelector('.app-shell'),contentSame:qaIdentity.content===document.querySelector('.app-content'),navSame:qaIdentity.nav===nav,
  document:{scrollY,overflow:getComputedStyle(document.documentElement).overflow,body:box(document.body),width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},
  viewport:{height:visualViewport.height,offsetTop:visualViewport.offsetTop},composer:box(document.querySelector('.coach-input')),transcript:box(document.querySelector('.coach-scroll')),
  focused:document.activeElement?.getAttribute('aria-label'),activeAnimations:document.getAnimations().map(a=>({name:a.animationName,target:a.effect?.target?.className})),events:qaEvents.splice(0)};
 });}
async function tab(p,name){await p.locator('.bottom-nav').getByRole('button',{name:name.toUpperCase(),exact:true}).tap();await p.locator(`.${name}-screen`).waitFor();}
function check(m,destination,width){
 assert.equal(m.active,destination.toUpperCase());assert.ok(m.shellSame&&m.contentSame&&m.navSame,'persistent DOM owners');
 assert.equal(m.nav.opacity,'1','persistent nav must never fade on tab switch');assert.equal(m.nav.bottom,844,'persistent nav must not slide');
 assert.ok(!m.activeAnimations.some(a=>a.name==='bottom-nav-enter'),'no nav re-entry animation');
 assert.equal(m.screen.transform,'none');assert.equal(m.screen.opacity,'1');assert.ok(m.document.width<=width,'no horizontal root overflow');
 if(destination!=='coach'){
  assert.notEqual(m.document.body.position,'fixed');assert.notEqual(m.document.body.overflow,'hidden');assert.equal(m.screen.inline,null,'no Coach viewport fields on destination');
 }else{assert.equal(m.document.body.position,'fixed');assert.equal(m.document.scrollY,0);assert.equal(m.transcript.overflow,'hidden auto');}
}
try{
 for(const width of before?[390]:[320,390])for(const style of before?['premium']:['standard','premium'])for(const appearance of before?['dark']:['light','dark'])for(const reducedMotion of before?['no-preference']:['no-preference','reduce']){
  const r=await setup(width,style,appearance,reducedMotion,true,width===390&&style==='premium'&&appearance==='dark'&&reducedMotion==='no-preference');
  const {p,context,state,errors}=r,record={width,style,appearance,reducedMotion,pairs:[],cycles:[],keyboard:[]};
  try{
   for(const [from,to] of pairs){
    await tab(p,from);await p.locator('.bottom-nav').evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{}))));
    await frames(p);const previous=await read(p);
    await tab(p,to);const immediate=await read(p);await frames(p);const nextFrame=await read(p);
    if(!before){check(immediate,to,width);check(nextFrame,to,width);}
    if(width===390&&style==='premium'&&appearance==='dark'&&reducedMotion==='no-preference'){
     await p.screenshot({path:`${out}/${from}-to-${to}.png`});
    }
    // Observe actual motion completion rather than waiting an arbitrary settling time.
    await p.locator('.bottom-nav').evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{}))));
    const settled=await read(p);record.pairs.push({from,to,previous,immediate,nextFrame,settled});
   }
   if(!before){
    for(const destination of ['today','progress','profile'])for(let i=0;i<10;i++){
     await tab(p,'coach');await frames(p);
     assert.equal(await p.getByLabel('Ask Coach').inputValue(),state.coachDraft);
     assert.equal(await p.locator('.message-pair').count(),state.conversations.length);
     await p.locator('.coach-scroll').evaluate(e=>e.scrollTop=(e.scrollHeight-e.clientHeight)/2);await frames(p);
     const mid=await read(p);
     await tab(p,destination);await frames(p);const exited=await read(p);check(exited,destination,width);
     await tab(p,'coach');await frames(p);const returned=await read(p);check(returned,'coach',width);
     assert.equal(await p.getByLabel('Ask Coach').inputValue(),state.coachDraft);
     // Current product behavior remounts Coach and opens the active thread at
     // its end. This task must not change that behavior or the stored messages.
     assert.ok(returned.transcript.scrollHeight-returned.transcript.clientHeight-returned.transcript.scrollTop<=1);
     record.cycles.push({destination,cycle:i+1,midScroll:mid.transcript.scrollTop,returnedScroll:returned.transcript.scrollTop});
    }
    for(const destination of ['today','progress','profile']){
     await p.getByLabel('Ask Coach').focus();await p.evaluate(()=>qaKeyboard(480,24));await frames(p);
     const open=await read(p);assert.equal(open.nav.height,0,'existing keyboard rule hides nav');assert.equal(open.composer.bottom,504);
     // Bottom nav is intentionally not reachable while iOS keyboard covers it.
     // Exercise the same navigation callback without inventing a new access UI.
     await p.locator('.bottom-nav').getByRole('button',{name:destination.toUpperCase(),exact:true,includeHidden:true}).evaluate(e=>e.click());
     await p.locator(`.${destination}-screen`).waitFor();await frames(p);const exited=await read(p);check(exited,destination,width);
     await p.evaluate(()=>qaKeyboard(844));await frames(p);const closed=await read(p);check(closed,destination,width);
     assert.equal(closed.screen.height,exited.screen.height,'Coach keyboard cleanup cannot resize incoming tab');
     await tab(p,'coach');await frames(p);assert.equal(await p.getByLabel('Ask Coach').inputValue(),state.coachDraft);
     record.keyboard.push({destination,open,exited,closed});
    }
    await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'));});
    await tab(p,'today');await frames(p);check(await read(p),'today',width);
    // Same click state path, rapid navigation has no timeout / queued exit task.
    await p.evaluate(()=>{for(const name of ['COACH','PROGRESS','COACH','PROFILE','COACH','TODAY'])document.querySelector(`.bottom-nav [aria-label="${name}"]`).click();});
    await frames(p);check(await read(p),'today',width);
    await p.locator('.today-screen').evaluate(e=>window.scrollTo(0,e.scrollHeight));
    await tab(p,'coach');await frames(p);await tab(p,'today');await frames(p);check(await read(p),'today',width);
    assert.deepEqual(errors,[]);
   }
   record.errors=errors;record.passed=!before;results.push(record);console.log(JSON.stringify({width,style,appearance,reducedMotion,pairs:record.pairs.map(v=>({from:v.from,to:v.to,animation:v.immediate.nav.animation,opacity:v.immediate.nav.opacity,bottom:v.immediate.nav.bottom})),cycles:record.cycles.length}));
  }finally{await context.close();}
 }
 if(!before){
  const {p,context,errors}=await setup(390,'standard','dark','no-preference',false);
  try{for(const destination of ['today','progress','profile']){await tab(p,'coach');await frames(p);await tab(p,destination);await frames(p);check(await read(p),destination,390);}assert.deepEqual(errors,[]);results.push({shortTranscript:true,passed:true});}finally{await context.close();}
 }
}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
