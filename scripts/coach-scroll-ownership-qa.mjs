import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {combineExample} from '../src/combineWorkouts.fixture.js';
const before=process.argv.includes('--before');
const out='artifacts/COACH-SCROLL-OWNERSHIP';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
const base=process.env.ROOK_QA_URL||(before?'http://127.0.0.1:4177':'http://127.0.0.1:5173');
function fixture(count=24){
 const s=createReturningUserFixture(1);s.activeWorkout=null;s.ai.planUpgradeDismissed=true;s.activeCoachConversationId=count?'qa-thread':null;
 s.conversations=Array.from({length:count},(_,i)=>({id:`qa-${i}`,conversationId:'qa-thread',user:`Question ${i+1}`,reply:{text:'A synthetic coaching answer. Your training remains unchanged. '.repeat(5),action:null},createdAt:Date.now()-i*1000}));return s;
}
async function open({width=390,appearance='dark',style='standard',count=24,reduced=false,standalone=false,native=false,combine=false}={}){
 const s=combine?combineExample():fixture(count);Object.assign(s.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 const c=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference',colorScheme:appearance});
 await c.addInitScript(({s,standalone,native})=>{
  if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));
  // Deterministic visual-viewport contract probe. This is NOT a physical iOS keyboard.
  if(!native){const vv=new EventTarget();let heightOverride=null;Object.assign(vv,{offsetTop:0,offsetLeft:0,scale:1});Object.defineProperties(vv,{height:{get:()=>heightOverride??innerHeight},width:{get:()=>innerWidth}});Object.defineProperty(window,'visualViewport',{configurable:true,value:vv});
  window.qaViewport=(height,offsetTop=0,event='resize')=>{heightOverride=height;vv.offsetTop=offsetTop;vv.dispatchEvent(new Event(event));};}
  if(standalone)Object.defineProperty(navigator,'standalone',{value:true,configurable:true});
 },{s,standalone,native});
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 if(combine)await p.clock.setFixedTime(new Date('2026-09-12T12:00:00+02:00'));
 await p.route('**/api/ai/status',r=>r.fulfill({json:{available:true}}));await p.route('**/api/ai',r=>r.fulfill({json:{data:{text:'Reply received. No changes applied.',action:null}}}));
 await p.goto(base);await p.getByRole('button',{name:'COACH',exact:true}).click();await p.locator('.coach-screen').waitFor();await frames(p);
 const cdp=await c.newCDPSession(p);return {p,c,cdp,errors};
}
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function measure(p){return p.evaluate(()=>{
 const rect=e=>e?{top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,height:e.getBoundingClientRect().height}:null;
 const container=s=>{const e=document.querySelector(s);if(!e)return null;const c=getComputedStyle(e);return {scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,overflowY:c.overflowY,position:c.position,touchAction:c.touchAction,...rect(e)};};
 return {document:{scrollY,scrollHeight:document.scrollingElement.scrollHeight,clientHeight:document.scrollingElement.clientHeight,htmlOverflow:getComputedStyle(document.documentElement).overflowY,bodyOverflow:getComputedStyle(document.body).overflowY},vv:{height:visualViewport.height,offsetTop:visualViewport.offsetTop},shell:container('.app-shell'),root:container('.coach-screen'),surface:container('.coach-content-surface'),transcript:container('.coach-scroll'),composer:container('.coach-input'),nav:container('.bottom-nav'),header:rect(document.querySelector('.coach-header')),input:container('.coach-input textarea')};
 });}
async function swipe(r,x,y,dy){
 const trace=[];await r.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let i=1;i<=10;i++){await r.cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy*i/10}]});await frames(r.p);trace.push(await measure(r.p));}
 await r.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frames(r.p);trace.push(await measure(r.p));return trace;
}
function anchored(trace,reference,label){for(const m of trace){
 assert.equal(m.document.scrollY,0,`${label}: document`);for(const key of ['root','surface','shell'])assert.equal(m[key].scrollTop,0,`${label}: ${key}`);
 for(const key of ['root','composer','header','nav']){assert.ok(Math.abs(m[key].top-reference[key].top)<1,`${label}: ${key} top`);assert.ok(Math.abs(m[key].bottom-reference[key].bottom)<1,`${label}: ${key} bottom`);}
}}
async function checkScroll(r,label){
 // Existing bottom-nav entry motion can replay when display:none ends. Wait for
 // that animation's actual completion, not an arbitrary keyboard settling delay.
 await r.p.locator('.bottom-nav').evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{}))));
 const m=await measure(r.p),w=await r.p.evaluate(()=>innerWidth);
 assert.equal(m.root.overflowY,'clip');assert.equal(m.shell.overflowY,'clip');assert.equal(m.document.bodyOverflow,'hidden');assert.equal(m.document.htmlOverflow,'hidden');
 assert.equal(m.root.touchAction,'auto');assert.equal(m.transcript.overflowY,'auto');
 if(m.transcript.scrollHeight>m.transcript.clientHeight+150){
  await r.p.locator('.coach-scroll').evaluate(e=>e.scrollTop=100);await frames(r.p);const a=await measure(r.p);
  const t=await swipe(r,w/2,a.transcript.bottom-20,-Math.min(140,a.transcript.clientHeight-40));anchored(t,a,`${label} transcript`);assert.ok(t.at(-1).transcript.scrollTop>120,'transcript accepts first swipe');
 }
 const checks=[];
 for(const target of ['background','input','send']){
  const a=await measure(r.p),b=target==='input'?await r.p.getByLabel('Ask Coach').boundingBox():target==='send'?await r.p.locator('.coach-send').boundingBox():null;
  const t=await swipe(r,b?b.x+b.width/2:8,b?b.y+b.height/2:a.composer.top+15,-100);anchored(t,a,`${label} ${target}`);checks.push({target,start:a,end:t.at(-1)});
 }
 return checks;
}
async function scenario(name,fn){console.log('RUN '+name);try{const evidence=await fn();results.push({name,passed:true,...evidence});console.log('PASS '+name);}catch(e){results.push({name,passed:false,error:e.message});throw e;}finally{await writeFile(`${out}/browser-results.json`,JSON.stringify(results,null,2));}}
try{
 if(!before && !process.argv.includes('--probe')){
 for(const width of [320,390])for(const appearance of ['light','dark'])for(const style of ['standard','premium'])await scenario(`${width} ${style} ${appearance} — touch, keyboard contract, history, cleanup`,async()=>{
  const r=await open({width,appearance,style,reduced:width===320,standalone:style==='premium'});try{
   const initial=await measure(r.p);assert.equal(initial.composer.bottom,initial.nav.top);
   const checks=await checkScroll(r,'closed');
   // At both transcript boundaries the page/composer must remain anchored.
   for(const position of ['top','bottom']){await r.p.locator('.coach-scroll').evaluate((e,pos)=>e.scrollTop=pos==='top'?0:e.scrollHeight,position);await frames(r.p);const a=await measure(r.p);anchored(await swipe(r,width/2,a.transcript.top+Math.min(150,a.transcript.clientHeight/2),position==='top'?120:-120),a,position);}
   const input=r.p.getByLabel('Ask Coach');await input.fill('A retained multiline draft\nSecond line');await input.evaluate(e=>e.setSelectionRange(2,10));assert.equal(await input.evaluate(e=>e.selectionEnd-e.selectionStart),8);
   await r.p.locator('.coach-scroll').evaluate(e=>e.scrollTop=200);await frames(r.p);const reading=(await measure(r.p)).transcript.scrollTop;
   await r.p.evaluate(()=>qaViewport(500,40));await frames(r.p);const keyboard=await measure(r.p);assert.equal(keyboard.root.top,40);assert.equal(keyboard.composer.bottom,540);assert.equal(keyboard.nav.height,0);assert.equal(keyboard.transcript.scrollTop,reading,'keyboard does not yank an older-message reader');
   checks.push(...await checkScroll(r,'keyboard'));
   await r.p.evaluate(()=>qaViewport(500,25,'scroll'));await frames(r.p);assert.equal((await measure(r.p)).composer.bottom,525);
   await r.p.locator('.coach-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);await frames(r.p);await r.p.evaluate(()=>qaViewport(450,25));await frames(r.p);const bottom=await measure(r.p);assert.ok(bottom.transcript.scrollHeight-bottom.transcript.clientHeight-bottom.transcript.scrollTop<2,'near-bottom follows keyboard resize');
   await r.p.screenshot({path:`${out}/${width}-${style}-${appearance}-keyboard.png`});
   await input.evaluate(e=>e.blur());await r.p.evaluate(()=>qaViewport(844,0));await frames(r.p);assert.equal((await measure(r.p)).composer.bottom,initial.composer.bottom);checks.push(...await checkScroll(r,'closed-again'));
   await r.p.getByLabel('Conversation history',{exact:true}).click();assert.equal(await r.p.locator('.coach-content-surface').evaluate(e=>e.inert),true);
   await r.p.locator('.coach-history-group button').first().click();await r.p.getByLabel('Back to conversation history',{exact:true}).waitFor();await frames(r.p);checks.push(...await checkScroll(r,'history-conversation'));
   assert.equal(await input.inputValue(),'A retained multiline draft\nSecond line');
   // Background/foreground notifications re-read viewport, without a timeout.
   await r.p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'));});await frames(r.p);
   const foreground=await measure(r.p);assert.equal(foreground.composer.bottom,initial.composer.bottom);
   await r.p.screenshot({path:`${out}/${width}-${style}-${appearance}-conversation.png`});
   await r.p.getByRole('button',{name:'TODAY',exact:true}).click();assert.notEqual(await r.p.evaluate(()=>getComputedStyle(document.body).position),'fixed');
   // Give the normal page enough content to scroll even on a short rest-day fixture.
   await r.p.locator('main.screen').evaluate(e=>e.style.minHeight='1500px');await r.p.evaluate(()=>scrollTo(0,200));assert.ok(await r.p.evaluate(()=>scrollY)>0,'normal page scrolling restored');
   assert.deepEqual(r.errors,[]);return {initial,keyboard,foreground,checks};
  }finally{await r.c.close();}
 });
 for(const count of [0,1])await scenario(`${count?'short conversation':'fresh Coach'} — native viewport and first-tap send`,async()=>{
  const r=await open({count,native:true});try{
   await checkScroll(r,'native');const input=r.p.getByLabel('Ask Coach');await input.fill('Question sent on first tap');await input.focus();await frames(r.p);const b=await r.p.locator('.coach-send').boundingBox();await r.p.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);await r.p.getByText('Reply received. No changes applied.',{exact:true}).waitFor();assert.equal(await input.inputValue(),'');assert.ok(await input.evaluate(e=>e===document.activeElement));
   await input.fill(Array.from({length:10},(_,i)=>`Long draft line ${i}`).join('\n'));const m=await measure(r.p);assert.ok(m.input.clientHeight<=124);assert.ok(m.input.scrollHeight>m.input.clientHeight);assert.equal(m.input.overflowY,'auto');await input.evaluate(e=>e.blur());await frames(r.p);await checkScroll(r,'multiline');
   assert.deepEqual(r.errors,[]);return {geometry:await measure(r.p)};
  }finally{await r.c.close();}
 });
 await scenario('combine review — same anchored Coach shell, proposal/apply separate',async()=>{
  const r=await open({combine:true});try{
   const stored=()=>r.p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));const initial=await stored();await r.p.getByLabel('Ask Coach').fill('Combine Push and Pull');await r.p.getByLabel('Send message',{exact:true}).click();await r.p.getByRole('button',{name:'60 min',exact:true}).waitFor();await r.p.clock.setFixedTime(new Date('2026-09-12T12:00:01+02:00'));await r.p.getByRole('button',{name:'60 min',exact:true}).click();await r.p.getByRole('button',{name:'REVIEW COMBINED WORKOUT',exact:true}).click();await r.p.locator('.combine-review-surface').waitFor();await checkScroll(r,'combine');await r.p.getByRole('button',{name:'CANCEL',exact:true}).click();assert.deepEqual((await stored()).program,initial.program);assert.equal((await stored()).todayAdaptation,null);assert.deepEqual(r.errors,[]);return {geometry:await measure(r.p)};
  }finally{await r.c.close();}
 });
 }else{
 const r=await open();
 try{
  const initial=await measure(r.p);await r.p.locator('.coach-scroll').evaluate(e=>e.scrollTop=100);const transcriptDrag=await swipe(r,190,440,-150);
  const footerDrag=await swipe(r,8,initial.composer.top+15,-190);
  await r.p.getByRole('textbox',{name:'Ask Coach'}).fill('Unsent draft');await r.p.evaluate(()=>qaViewport(500,40));await frames(r.p);
  const keyboard=await measure(r.p);await r.p.screenshot({path:`${out}/${before?'before':'after'}-keyboard-contract.png`});
  const keyboardDrag=await swipe(r,8,Math.min(510,keyboard.composer.top+10),-180);
  results.push({initial,transcriptDrag,footerDrag,keyboard,keyboardDrag});console.log(JSON.stringify({initial,transcriptLast:transcriptDrag.at(-1),footerLast:footerDrag.at(-1),keyboard},null,2));
 }finally{await r.c.close();}
 }
}finally{await browser.close();if(before||process.argv.includes('--probe'))await writeFile(`${out}/${before?'before':'after'}-probe.json`,JSON.stringify(results,null,2));}
