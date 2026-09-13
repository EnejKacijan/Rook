import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const out=process.env.ROOK_SCROLL_OUTPUT||'artifacts/SCRATCH-TRANSITION-REVIEW';
const base=process.env.ROOK_QA_URL||'http://127.0.0.1:4173';
await mkdir(`${out}/screenshots`,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try { for(const width of [320,390])for(const appearance of ['light','dark'])for(const style of ['standard','premium'])for(const reducedMotion of ['reduce','no-preference']) {
 const key=`${width}-${appearance}-${style}-${reducedMotion}`;
 if(process.env.ROOK_SCROLL_CASE&&!key.includes(process.env.ROOK_SCROLL_CASE))continue;
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion});
 await context.addInitScript(()=>{
  Object.defineProperty(navigator,'standalone',{value:true});
  const a=window.scrollAudit={events:[],prevented:[],tasks:[],writes:[]};
  new PerformanceObserver(list=>a.tasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
  const prevent=Event.prototype.preventDefault;
  Event.prototype.preventDefault=function(){if(/touch|pointer/.test(this.type))a.prevented.push({t:performance.now(),type:this.type,target:this.target?.className,stack:new Error().stack});return prevent.call(this);};
  for(const name of ['scrollTo','scrollIntoView']){
   for(const target of [window,Element.prototype])if(typeof target[name]==='function'){
    const original=target[name];target[name]=function(...args){a.writes.push({t:performance.now(),name,target:this.className||'window',stack:new Error().stack});return original.apply(this,args);};
   }
  }
  document.addEventListener('click',e=>{if(e.target.textContent.trim()==='CONTINUE'){a.continueAt=performance.now();a.readyAt=null;a.events=[];a.prevented=[];a.writes=[];}},true);
  new MutationObserver(()=>{if(a.continueAt&&!a.readyAt&&document.querySelector('.scratch-editor-screen .plan-editor'))requestAnimationFrame(()=>{a.readyAt ||= performance.now();});}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  for(const type of ['touchstart','touchmove','touchend','pointercancel','scroll'])document.addEventListener(type,e=>a.events.push({t:performance.now(),type,target:e.target?.className||e.target?.nodeName,prevented:e.defaultPrevented}),{capture:true,passive:true});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(base);
 await page.getByRole('button',{name:/Start from scratch/i}).waitFor();
 // Theme-only fixture: seed no saved profile (which would resume onboarding).
 await page.evaluate(({appearance,style})=>Object.assign(document.documentElement.dataset,{appearance,style}),{appearance,style});
 await page.getByRole('button',{name:/Start from scratch/i}).tap();
 const cdp=await context.newCDPSession(page),touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:x==null?[]:[{x,y}]});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.ROOK_SCROLL_CPU||1)});
 const selections=[['Mon','Wed','Fri'],['Tue','Wed','Thu','Fri','Sun'],['Mon','Tue','Wed','Thu','Fri','Sat']];
 for(let repeat=0;repeat<3;repeat++){
  const clear=page.locator('.scratch-days-heading button');if(await clear.isVisible())await clear.tap();
  for(const day of selections[repeat])await page.locator('.scratch-day-options').getByRole('button',{name:day,exact:true}).tap();
  await page.getByRole('button',{name:'CONTINUE',exact:true}).tap();
  await page.waitForFunction(()=>window.scrollAudit.readyAt);
  const snapshot=()=>page.evaluate(()=>{const nodes=[document.documentElement,document.body,document.querySelector('.scratch-editor-screen'),document.querySelector('.plan-editor')];return {now:performance.now(),readyAt:scrollAudit.readyAt,continueAt:scrollAudit.continueAt,y:scrollY,active:document.activeElement?.outerHTML.slice(0,200),hit:document.elementFromPoint(innerWidth-65,530)?.outerHTML.slice(0,250),nodes:nodes.map(e=>({name:e.className,height:e.clientHeight,scrollHeight:e.scrollHeight,scrollTop:e.scrollTop,style:e.getAttribute('style'),overflow:getComputedStyle(e).overflow,touchAction:getComputedStyle(e).touchAction})),overlays:[...document.querySelectorAll('.modal-layer,[inert],.plan-reorder-preview')].map(e=>e.className),animations:document.getAnimations().map(a=>({name:a.animationName,state:a.playState})),prevented:scrollAudit.prevented,writes:scrollAudit.writes,tasks:scrollAudit.tasks};});
  const before=await snapshot();await touch('touchStart',width-65,530);
  for(let step=1;step<=8;step++){await touch('touchMove',width-65,530-step*22);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));}
  await touch('touchEnd');const after=await snapshot();
  const events=await page.evaluate(()=>scrollAudit.events.splice(0)),start=events.find(e=>e.type==='touchstart'),scroll=events.find(e=>e.type==='scroll'&&e.t>=start?.t);
  const result={key,repeat,days:selections[repeat],before,after,events,delta:after.y-before.y,firstTouchAfterReadyMs:start?.t-before.readyAt,firstScrollAfterTouchMs:scroll?scroll.t-start.t:null};results.push(result);
  assert.ok(result.delta>20,'first vertical swipe must scroll');assert.ok(result.firstScrollAfterTouchMs!==null);
  assert.deepEqual(after.prevented,[]);assert.deepEqual(after.writes,[]);assert.deepEqual(before.overlays,[]);assert.equal(before.nodes[1].style,null);assert.equal(before.nodes[2].touchAction,'auto');
  assert.deepEqual(await page.evaluate(()=>[document.documentElement.dataset.appearance,document.documentElement.dataset.style]),[appearance,style]);
  console.log(JSON.stringify({key,repeat,readyDelay:before.readyAt-before.continueAt,firstTouchAfterReadyMs:result.firstTouchAfterReadyMs,firstScrollAfterTouchMs:result.firstScrollAfterTouchMs,delta:result.delta,prevented:after.prevented.length}));
  if(repeat===0&&reducedMotion==='no-preference')await page.screenshot({path:`${out}/screenshots/${key}.png`});
  const input=page.locator('.scratch-editor-screen').getByRole('textbox',{name:'Weekly plan name',exact:true});await input.fill('Immediate scroll check');await input.press('Tab');assert.equal(await input.inputValue(),'Immediate scroll check');
  if(repeat===2){
   await page.locator('.scratch-editor-screen').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));
   await touch('touchStart',3,155);for(let i=1;i<=8;i++){await touch('touchMove',3+width*.6*i/8,155);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));}await touch('touchEnd');
  }else await page.getByRole('button',{name:'Back to plan setup',exact:true}).tap();
  await page.locator('.scratch-plan-screen').waitFor();assert.equal(await page.locator('.scratch-day-options .selected').count(),selections[repeat].length);
 }
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')||'null')?.program||null),null);
 await context.close();
}} finally { await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2)); }
