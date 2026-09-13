// Differential interaction probe. Fixtures/diagnostic switches live ONLY in
// isolated browser contexts; never in the production app or owner's storage.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {openProfileArea} from './qa-current-navigation.mjs';
const phase=process.env.ROOK_PARITY_PHASE||'after',out=`artifacts/SCRATCH-VS-EDIT-PLAN-REVIEW/${phase}`;
await mkdir(`${out}/traces`,{recursive:true});
const diagnostic=await readFile('scripts/scratch-reentry-diagnostics.js','utf8');
if(process.env.ROOK_PARITY_VERIFY_RECORDED==='1'){
 const recorded=JSON.parse(await readFile(`${out}/results.json`,'utf8'));
 verifyOwnership(recorded);console.log(`PASS ${recorded.length} recorded listener-ownership comparisons`);process.exit(0);
}
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
const base=process.env.ROOK_QA_URL||'http://127.0.0.1:4173';
let current;
try{for(const width of [320,390])for(const appearance of ['light','dark'])for(const style of ['standard','premium']){
 const key=`${width}-${appearance}-${style}`;
 if(process.env.ROOK_PARITY_CASE&&!key.includes(process.env.ROOK_PARITY_CASE))continue;
 const motion=(appearance==='dark')?'reduce':'no-preference';let source;
 for(const mode of ['scratch','edit']){
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,reducedMotion:motion,serviceWorkers:'block'});
  await context.addInitScript(({mode,fixture})=>{
   Object.defineProperty(navigator,'standalone',{value:true});
   window.rookEditorTraceSelector=`.${mode==='scratch'?'scratch-editor':'edit-plan'}-screen .plan-editor`;
   if(fixture&&!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(fixture));
   // Diagnostic-only disabling: bypass native activator callbacks, retain EXACT
   // DOM, CSS and other listeners. Map removeEventListener correctly too.
   const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,wrapped=new WeakMap();
   EventTarget.prototype.addEventListener=function(type,fn,opts){
    if((type==='touchstart'||type==='pointerdown')&&this.classList?.contains('plan-editor')){
     let proxy=wrapped.get(fn);if(!proxy){proxy=function(e){if(window.qaDisableWorkoutDrag&&e.target.closest('[data-reorder-kind="workout"]'))return;return fn.call(this,e);};wrapped.set(fn,proxy);}
     return add.call(this,type,proxy,opts);
    }return add.call(this,type,fn,opts);
   };
   EventTarget.prototype.removeEventListener=function(type,fn,opts){return remove.call(this,type,wrapped.get(fn)||fn,opts);};
  },{mode,fixture:mode==='edit'?(()=>{const s=createReturningUserFixture(3);s.activeWorkout=null;s.program=source;return s;})():null});
  await context.addInitScript(diagnostic);
  const p=await context.newPage();current=p;p.setDefaultTimeout(12000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto(base);
  if(mode==='scratch'){
   await p.getByRole('button',{name:/Start from scratch/i}).tap();
   for(const d of ['Mon','Wed','Fri'])await p.locator('.scratch-day-options').getByRole('button',{name:d,exact:true}).tap();
   await p.getByRole('button',{name:'CONTINUE',exact:true}).tap();
  }else{await p.getByRole('button',{name:'PROFILE',exact:true}).tap();await openProfileArea(p,'program');await p.getByRole('button',{name:/Edit plan/}).tap();}
  await p.evaluate(({appearance,style})=>Object.assign(document.documentElement.dataset,{appearance,style}),{appearance,style});
  const screen=p.locator(`.${mode==='scratch'?'scratch-editor':'edit-plan'}-screen`),root=screen.locator('.plan-editor'),days=root.locator('[data-reorder-workout-section]');
  await root.waitFor();const cdp=await context.newCDPSession(p),frame=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
  const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:x==null?[]:[{x,y}]});
  const model=()=>root.evaluate(root=>{let f=root[Object.keys(root).find(k=>k.startsWith('__reactFiber$'))];while(f&&!['scratch','edit'].includes(f.memoizedProps?.mode))f=f.return;return f.memoizedState.memoizedState;});
  if(mode==='scratch')source=await model();
  else assert.deepEqual(content(await model()),content(source),'same source content in both editors');
  const initial=await p.evaluate(()=>{rookScratchTrace.finish();return rookScratchTrace.sample();});
  const listeners=()=>p.evaluate(()=>rookScratchTrace.listeners());
  const rootListeners=rootListenersFor;
  async function scrollRun(label){
   await p.evaluate(label=>rookScratchTrace.begin(label),label);
   const before=await p.evaluate(()=>rookScratchTrace.sample()),idleListeners=await listeners(),gestures=[];
   // Three consecutive user-controlled gestures; reverse before hitting an end.
   for(let i=0;i<3;i++){
    const a=await p.evaluate(()=>rookScratchTrace.sample());
    const direction=a.scroller.scrollTop>190?-1:1;
    await touch('touchStart',width-65,530);
    for(let n=1;n<=9;n++){await touch('touchMove',width-65,530-direction*n*20);await frame();}
    await touch('touchEnd');await frame();const b=await p.evaluate(()=>rookScratchTrace.sample());
    gestures.push({direction,delta:b.scroller.scrollTop-a.scroller.scrollTop,root:b.root.id,scroller:b.scroller.id,documentDelta:b.y-a.y});
    assert.ok(gestures.at(-1).delta*direction>20,`${key} ${mode} ${label}: every gesture must scroll`);
   }
   const after=await p.evaluate(()=>rookScratchTrace.sample()),trace=await p.evaluate(()=>{rookScratchTrace.finish();return rookScratchTrace.traces.at(-1);});
   const firstTouch=trace.events.find(e=>e.kind==='touchstart');
   const writes=trace.events.filter(e=>e.kind==='scroll-write'&&e.t>=firstTouch.t),cancellations=trace.events.filter(e=>e.kind==='prevent-default');
   const item={key,mode,motion,label,before,after,gestures,writes,cancellations,idleListeners,finalListeners:await listeners(),
    firstScrollMs:trace.events.find(e=>e.kind==='scroll'&&e.t>=firstTouch.t)?.t-firstTouch.t,
    styleMutations:trace.events.filter(e=>e.kind==='attribute'),nativePointerCancels:trace.events.filter(e=>e.kind==='pointercancel').length};
   results.push(item);await writeFile(`${out}/traces/${key}-${mode}-${label}.json`,JSON.stringify(trace));
   assert.deepEqual(writes,[],'no programmatic writes during ordinary scroll');assert.deepEqual(cancellations,[],'no app touch cancellation');
   assert.equal(before.root.id,after.root.id);assert.equal(before.component.programKey,after.component.programKey);
   assert.equal(after.overlayCount,mode==='edit'?1:0);assert.ok(!after.root.target.includes('reordering'));
   assert.deepEqual(rootListeners(item.finalListeners),rootListeners(idleListeners),'idle ownership returns to baseline');
   if(phase==='after'){assert.ok(before.scroller.target.startsWith('MAIN.'),'editor panel owns scrolling');assert.ok(gestures.every(g=>g.documentDelta===0));}
   console.log(`PASS ${phase} ${key} ${mode} ${label}: ${gestures.map(g=>Math.round(g.delta))}; ${before.scroller.target}`);
  }
  await scrollRun('fresh');
  if(mode==='scratch'){
   const grip=days.first().locator('.plan-workout-drag-surface');await grip.scrollIntoViewIfNeeded();
   const original=await root.evaluate(e=>e.outerHTML);await p.evaluate(()=>window.qaDisableWorkoutDrag=true);
   const b=await grip.boundingBox();await touch('touchStart',b.x+20,b.y+20);await touch('touchEnd');
   assert.equal(await p.locator('.plan-reorder-preview').count(),0);assert.equal(await root.evaluate(e=>e.outerHTML),original,'disabling reorder preserves DOM');
   await scrollRun('workout-reorder-disabled');await p.evaluate(()=>window.qaDisableWorkoutDrag=false);
  }
  // Diagnostic visibility ablation, not a shipped product flag or markup change.
  const warmStyle=await p.addStyleTag({content:'.plan-warmup-card,.plan-warmup-row,.plan-warmup-preference{display:none!important}'});
  await scrollRun('warmups-hidden');await warmStyle.evaluate(e=>e.remove());
  if(mode==='scratch'){
   for(let cycle=0;cycle<2;cycle++){
    await p.getByRole('button',{name:'Back to plan setup',exact:true}).tap();await p.getByRole('button',{name:'CONTINUE',exact:true}).tap();await root.waitFor();
    assert.equal((await p.evaluate(()=>rookScratchTrace.sample())).root.id,initial.root.id);
    await scrollRun(`reentry-${cycle}`);
   }
  }else{
   await p.getByRole('button',{name:'Expand Edit plan to full screen',exact:true}).tap();await scrollRun('expanded');
   assert.equal((await p.evaluate(()=>rookScratchTrace.sample())).root.id,initial.root.id,'expand does not remount');
  }
  // Matching populated content through real picker actions in BOTH editors.
  if(mode==='scratch')for(let i=0;i<3;i++)for(const name of ['Bench Press','Seated Cable Row']){
   const d=days.nth(i);await d.getByRole('button',{name:/\+ Add (first )?exercise/i}).tap();await d.getByPlaceholder('Search exercises',{exact:true}).fill(name);await d.getByRole('option',{name,exact:true}).tap();
  }
  await screen.locator('h1').tap();await scrollRun('populated');
  if(mode==='scratch')source=await model();
  const grip=days.first().locator('.plan-workout-drag-surface');await grip.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await frame();
  const g=await grip.boundingBox();await touch('touchStart',g.x+20,g.y+22);await p.locator('.plan-reorder-preview.workout').waitFor();
  await touch('touchMove',g.x+20,g.y+65);await touch('touchEnd');await scrollRun('after-workout-drop');
  await screen.locator('h1').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));await p.screenshot({path:`${out}/${key}-${mode}.png`});
  assert.deepEqual(errors,[]);await context.close();
 }
 const scratch=results.find(r=>r.key===key&&r.mode==='scratch'&&r.label==='fresh'),edit=results.find(r=>r.key===key&&r.mode==='edit'&&r.label==='fresh');
 assert.deepEqual(rootListenersFor(scratch.idleListeners),rootListenersFor(edit.idleListeners),'shared idle reorder listener contract');
 if(phase==='after')for(const field of ['overflowX','overflowY','touchAction','overscroll'])assert.equal(scratch.before.scroller[field],edit.before.scroller[field],`${field} parity`);
}}
catch(e){await current?.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw e;}
finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
function rootListenersFor(ls){return ls.filter(l=>l.target.split('.').includes('plan-editor')).map(({type,passive,capture})=>({type,passive,capture})).sort((a,b)=>a.type.localeCompare(b.type));}
function verifyOwnership(rows){
 assert.ok(rows.length>0);
 const expected=[{type:'pointerdown',passive:null,capture:false},{type:'touchstart',passive:true,capture:false}];
 for(const r of rows){
  assert.deepEqual(rootListenersFor(r.idleListeners),expected,`${r.key} ${r.mode} ${r.label}: two shared activation listeners, not an empty/vacuous comparison`);
  assert.deepEqual(rootListenersFor(r.finalListeners),expected);
  assert.ok(!r.finalListeners.some(l=>l.target==='window'&&/^(touchmove|pointermove)$/.test(l.type)),'no leaked reorder move listeners');
 }
}
// Persisted fixtures explicitly annotate catalog defaults. Both QA exercises
// are normal/required-load; compare those defaults without discarding targets.
function content(program){return program.days.map(d=>[d.id,d.exercises.map(e=>({...e,loggingMode:e.loggingMode||'normal',loadRequirement:e.loadRequirement||'required'}))]);}
verifyOwnership(results);console.log(`PASS ${results.length} differential sequences`);
