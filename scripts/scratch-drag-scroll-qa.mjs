import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const phase=process.env.ROOK_DRAG_PHASE||'after',base=process.env.ROOK_QA_URL||'http://127.0.0.1:4173';
const out=process.env.ROOK_DRAG_OUTPUT_DIR||'artifacts/ROOK-STABILITY-PASS/scratch-drag';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{for(const width of (phase==='before'?[390]:[320,390])){
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
 await context.addInitScript(()=>{
  Object.defineProperty(navigator,'standalone',{value:true});window.dragAudit={events:[],listeners:[]};
  const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener=function(type,fn,options){if(['touchmove','touchend','touchcancel','pointermove','pointerup','pointercancel'].includes(type))window.dragAudit.listeners.push({target:this,type,fn,options,active:true});return add.call(this,type,fn,options);};
  EventTarget.prototype.removeEventListener=function(type,fn,options){for(const l of window.dragAudit.listeners)if(l.target===this&&l.type===type&&l.fn===fn)l.active=false;return remove.call(this,type,fn,options);};
  for(const type of ['touchstart','touchend','touchcancel','pointercancel'])add.call(window,type,e=>{window.dragAudit.events.push({type,target:e.target.className});if(type==='touchend'||type==='touchcancel')window.dragAudit.lastTouchEnd=performance.now();},true);
 });
 const p=await context.newPage(),errors=[];p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto(base);console.log('Opened',base);
 await p.getByRole('button',{name:/Start from scratch/}).click();for(const d of ['Mon','Tue','Wed','Thu','Fri'])await p.getByRole('button',{name:d,exact:true}).click();await p.getByRole('button',{name:'CONTINUE',exact:true}).click();
 const root=p.locator('.plan-editor'),days=root.locator('[data-reorder-workout-section]');
 console.log('Scratch editor ready');for(let i=0;i<5;i++)for(const name of ['Bench Press','Seated Cable Row','Squat']){
  const day=days.nth(i);await day.getByRole('button',{name:/\+ Add (first )?exercise/i}).click();await day.getByPlaceholder('Search exercises',{exact:true}).fill(name);await day.getByRole('option',{name,exact:true}).click();
 }
 const cdp=await context.newCDPSession(p),ids=()=>days.evaluateAll(ds=>ds.map(d=>d.dataset.dayId));
 await root.evaluate(root=>{window.dragAudit.root=root;window.dragAudit.baseline=new Set(window.dragAudit.listeners);window.dragAudit.days=new Map([...root.querySelectorAll('[data-day-id][data-reorder-workout-section]')].map(e=>[e.dataset.dayId,e]));});
 const frame=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
 const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:x==null?[]:[{x,y}]});
 const snapshot=()=>root.evaluate(root=>{
  let scroller=root.parentElement;while(scroller!==document.body&&!(scroller.scrollHeight>scroller.clientHeight&&/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)))scroller=scroller.parentElement;
  if(scroller===document.body)scroller=document.scrollingElement;
  window.dragAudit.scroller=scroller;
  return {className:root.className,style:root.getAttribute('style'),scroll:scroller.scrollTop,height:scroller.clientHeight,scrollHeight:scroller.scrollHeight,anchor:scroller.style.overflowAnchor,bodyOverflow:document.body.style.overflow,overlay:document.querySelectorAll('.plan-reorder-preview').length,edge:document.documentElement.dataset.edgeBackActive||null,nodesRetained:root===window.dragAudit.root&&[...root.querySelectorAll('[data-reorder-workout-section]')].every(e=>window.dragAudit.days.get(e.dataset.dayId)===e),listeners:window.dragAudit.listeners.filter(l=>l.active&&(l.target===root||l.target===window&&!window.dragAudit.baseline.has(l))).map(l=>({type:l.type,fn:l.fn.name,target:l.target===window?'window':l.target.className}))};
 });
 async function scrollImmediately(direction=1){
  const before=await snapshot();const x=width-65,y=530;
  await touch('touchStart',x,y);
  for(let i=1;i<=8;i++){await touch('touchMove',x,y-direction*i*22);await frame();}
  await touch('touchEnd');
  const after=await snapshot();return {before:before.scroll,after:after.scroll,delta:after.scroll-before.scroll};
 }
 for(const [from,to,cancel]of [[0,2,false],[2,4,false],[4,0,false],[1,3,true]]){
  const previous=await ids(),handle=days.nth(from).locator('.plan-workout-drag-surface');
  await handle.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await p.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));const r=await handle.boundingBox(),x=r.x+3,y=r.y+r.height/2;
  assert.ok(await handle.evaluate((e,{x,y})=>e.contains(document.elementFromPoint(x,y)),{x,y}));
  await touch('touchStart',x,y);await p.locator('.plan-reorder-preview.workout').waitFor();
  const compact=await snapshot();
  await days.nth(to).evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
  const target=await days.nth(to).boundingBox(),endY=Math.max(95,Math.min(705,to>from?target.y+target.height+12:target.y-24));
  for(let i=1;i<=10;i++){await touch('touchMove',x,y+(endY-y)*i/10);await frame();}
  await p.screenshot({path:`${out}/${phase}-${width}-drag-${from}-${to}.png`});
  await touch(cancel?'touchCancel':'touchEnd');
  const idle=await snapshot(),scroll=await scrollImmediately(),reverseScroll=phase==='after'?await scrollImmediately(-1):null,current=await ids();
  const expected=[...previous];if(!cancel)expected.splice(to,0,expected.splice(from,1)[0]);
  const result={width,from,to,cancel,compact,idle,scroll,reverseScroll,orderCorrect:JSON.stringify(current)===JSON.stringify(expected),events:await p.evaluate(()=>window.dragAudit.events.splice(0))};results.push(result);
  if(phase==='after'){assert.deepEqual(current,expected);assert.equal(idle.overlay,0);assert.equal(idle.edge,null);assert.equal(idle.nodesRetained,true);assert.deepEqual(idle.listeners,[]);assert.equal(idle.style,'');assert.ok(!idle.className.includes('is-reordering'));assert.ok(!idle.className.includes('is-week-reordering'));assert.ok(scroll.delta>20,'first post-drag vertical gesture must scroll');assert.ok(reverseScroll.delta< -20,'reverse vertical scroll must also work');}
  console.log(`PASS ${width} ${from}->${to} cancel=${cancel}; first scroll ${scroll.delta}px; idle listeners=${idle.listeners.length}`);
 }
 // Isolate the interruption event: pointercancel must release the touch-owned
 // reorder even before/without a later touchcancel delivery.
 const interruptHandle=days.first().locator('.plan-workout-drag-surface');await interruptHandle.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await frame();
 const ib=await interruptHandle.boundingBox();await touch('touchStart',ib.x+22,ib.y+22);await p.locator('.plan-reorder-preview.workout').waitFor();
 await interruptHandle.evaluate(e=>e.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerType:'touch',pointerId:77})));
 const interruption=await snapshot();results.push({width,scenario:'touch-pointercancel-only',interruption});console.log(`Pointercancel ${width}: overlay=${interruption.overlay}`);
 if(phase==='after'){assert.equal(interruption.overlay,0);assert.ok(!interruption.className.includes('is-week-reordering'));}
  await touch('touchCancel');
 if(phase==='after'){
  assert.ok((await scrollImmediately()).delta>20);
  const previous=await ids();
  await p.screenshot({path:`${out}/${phase}-${width}-restored.png`});
  for(const cancel of ['Escape','blur']){
   await interruptHandle.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await frame();const b=await interruptHandle.boundingBox();await touch('touchStart',b.x+3,b.y+22);await p.locator('.plan-reorder-preview.workout').waitFor();
   if(cancel==='Escape')await p.keyboard.press('Escape');else await p.evaluate(()=>window.dispatchEvent(new Event('blur')));
   const idle=await snapshot();await touch('touchCancel');const scroll=await scrollImmediately();assert.equal(idle.overlay,0);assert.deepEqual(idle.listeners,[]);assert.ok(scroll.delta>20);assert.deepEqual(await ids(),previous);results.push({width,scenario:cancel,idle,scroll});
  }
  // Exercise-level touch reorder, plus editable controls/expand/collapse and
  // the existing explicit save boundary, after repeated whole-day drags.
  const cards=days.first().locator('.plan-editor-exercise'),original=await cards.evaluateAll(es=>es.map(e=>e.id)),grip=cards.first().locator('.plan-exercise-drag-handle');
  await grip.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await frame();const b=await grip.boundingBox();await touch('touchStart',b.x+3,b.y+22);await p.locator('.plan-reorder-preview.exercise').waitFor();const dest=await cards.nth(1).boundingBox();
  for(let i=1;i<=8;i++){await touch('touchMove',b.x+3,b.y+22+(dest.y+dest.height-b.y-22)*i/8);await frame();}await touch('touchEnd');
  const changed=await cards.evaluateAll(es=>es.map(e=>e.id));assert.notDeepEqual(changed,original);assert.deepEqual([...changed].sort(),[...original].sort());assert.deepEqual((await snapshot()).listeners,[]);
  assert.ok((await scrollImmediately()).delta>20);
  // Scroll assertions above have NO post-drop delay. Unrelated button checks
  // respect the pre-existing 500ms synthetic-click guard; do not change it.
  await p.waitForFunction(()=>performance.now()-window.dragAudit.lastTouchEnd>=500);
  await cards.first().locator('.plan-editor-summary').focus();await p.keyboard.press('Enter');const input=cards.first().getByRole('textbox',{name:/^Sets for/});await input.fill('4');await input.press('Tab');assert.equal(await input.inputValue(),'4');
  await cards.first().locator('.plan-editor-summary').focus();await p.keyboard.press('Enter');await cards.first().locator('.plan-editor-summary').focus();await p.keyboard.press('Enter');assert.equal(await input.inputValue(),'4');
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')||'null')?.program||null),null,'draft reorder does not persist before apply');
  const expected=await ids();await p.getByRole('button',{name:'USE THIS PLAN',exact:true}).focus();await p.keyboard.press('Enter');await p.locator('.scratch-editor-screen').waitFor({state:'detached'});await p.reload();
  const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).program);assert.deepEqual(saved.days.map(d=>d.id),expected);assert.equal(saved.days[0].exercises[0].sets.length,4);results.push({width,scenario:'exercise-input-save-reload',passed:true});
 }
 assert.deepEqual(errors,[]);await context.close();
}}finally{await browser.close();await writeFile(`${out}/${phase}-results.json`,JSON.stringify(results,null,2));}
