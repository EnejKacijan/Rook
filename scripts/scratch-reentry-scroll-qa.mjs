import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const out=process.env.ROOK_REENTRY_OUTPUT||'artifacts/SCRATCH-REENTRY-REVIEW';
const base=process.env.ROOK_QA_URL||'http://127.0.0.1:4173';
await mkdir(`${out}/traces`,{recursive:true});
const diagnostic=await readFile('scripts/scratch-reentry-diagnostics.js','utf8');
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
// Verify the diagnostic itself, including own Window methods (not just its
// prototype). These writes happen only on an isolated non-app test document.
const probe=await browser.newPage();
await probe.setContent('<main style="height:3000px"><input></main>');
await probe.evaluate(diagnostic);
const selfTest=await probe.evaluate(()=>{
 rookScratchTrace.begin('diagnostic-self-test');
 window.scrollTo(0,10);window.scrollBy(0,10);window.scroll(0,30);
 document.documentElement.scrollTop=40;
 document.querySelector('main').scrollIntoView();
 document.querySelector('input').focus({preventScroll:true});
 const events=rookScratchTrace.finish()[0].events;rookScratchTrace.stop();
 return {methods:events.filter(e=>e.kind==='scroll-write').map(e=>e.method),focus:events.filter(e=>e.kind==='focus-call').length,removed:!window.rookScratchTrace};
});
assert.deepEqual(selfTest.methods,['scrollTo','scrollBy','scroll','scrollTop','scrollIntoView']);assert.equal(selfTest.focus,1);assert.equal(selfTest.removed,true);
await writeFile(`${out}/diagnostic-self-test.json`,JSON.stringify(selfTest,null,2));await probe.close();
try{for(const width of [320,390])for(const appearance of ['light','dark'])for(const style of ['standard','premium'])for(const motion of ['no-preference','reduce']){
 const key=`${width}-${appearance}-${style}-${motion}`;
 if(process.env.ROOK_REENTRY_CASE&&!key.includes(process.env.ROOK_REENTRY_CASE))continue;
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,reducedMotion:motion,serviceWorkers:'block'});
 await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
 await context.addInitScript(diagnostic);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(base);
 await page.getByRole('button',{name:/Start from scratch/i}).tap();
 await page.evaluate(({appearance,style})=>Object.assign(document.documentElement.dataset,{appearance,style}),{appearance,style});
 for(const day of ['Mon','Wed','Fri'])await page.locator('.scratch-day-options').getByRole('button',{name:day,exact:true}).tap();
 await page.getByRole('button',{name:'CONTINUE',exact:true}).tap();
 await page.locator('.scratch-editor-screen .plan-editor').waitFor();
 await page.evaluate(()=>rookScratchTrace.finish());
 const initial=await page.evaluate(()=>rookScratchTrace.sample());
 const cdp=await context.newCDPSession(page),touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:x==null?[]:[{x,y}]});
 if(process.env.ROOK_REENTRY_CPU)await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.ROOK_REENTRY_CPU)});
 const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
 for(let cycle=0;cycle<3;cycle++){
  // Exact video path: existing editor, unchanged Mon/Wed/Fri, Back, Continue.
  const beforeBack=await page.evaluate(()=>{rookScratchTrace.begin('scratch-back');return rookScratchTrace.sample();});
  await page.getByRole('button',{name:'Back to plan setup',exact:true}).tap();
  await page.getByRole('button',{name:'CONTINUE',exact:true}).tap();
  await page.waitForFunction(()=>rookScratchTrace.traces.at(-1).readyAt!==null);
  const before=await page.evaluate(()=>rookScratchTrace.sample()),gestures=[];
  let count=0;
  // No settling wait: the first gesture begins at the first observed ready frame.
  // Keep input running through the following seconds, not just one initial swipe.
  while(await page.evaluate(()=>performance.now()-rookScratchTrace.traces.at(-1).readyAt<5600)){
   const direction=count%2===0?1:-1;
   const start=await page.evaluate(()=>{rookScratchTrace.mark('gesture-start');return rookScratchTrace.sample();});
   const x=width-65,y=530;
   await touch('touchStart',x,y);
   for(let step=1;step<=10;step++){await touch('touchMove',x,y-direction*step*18);await frame();}
   await touch('touchEnd');await frame();
   const end=await page.evaluate(()=>rookScratchTrace.sample());
   gestures.push({number:count++,direction,start:start.t,end:end.t,initial:start.scroller.scrollTop,final:end.scroller.scrollTop,delta:end.scroller.scrollTop-start.scroller.scrollTop});
  }
  const trace=await page.evaluate(()=>{rookScratchTrace.finish();return rookScratchTrace.traces.at(-1);});
  const backTrace=await page.evaluate(()=>rookScratchTrace.traces.at(-2));
  const firstTouch=trace.events.find(e=>e.kind==='touchstart'),frames=trace.frames.filter(f=>f.t>=firstTouch.t);
  const writes=trace.events.filter(e=>e.kind==='scroll-write'&&e.t>=firstTouch.t);
  const prevented=trace.events.filter(e=>e.kind==='prevent-default');
  const result={key,cycle,initialRoot:initial.root.id,reentryRoot:before.root.id,
   beforeBack:{root:beforeBack.root.id,component:beforeBack.component,scroll:beforeBack.scroller.scrollTop},
   afterContinue:{root:before.root.id,component:before.component,scroll:before.scroller.scrollTop},
   backMounts:backTrace.events.filter(e=>/^editor-/.test(e.kind)),
   readyAfterContinueMs:trace.readyAt-trace.start,firstTouchAfterReadyMs:firstTouch.t-trace.readyAt,
   firstScrollAfterTouchMs:trace.events.find(e=>e.kind==='scroll'&&e.t>=firstTouch.t)?.t-firstTouch.t,
   gestures,programmaticWrites:writes,prevented,rootIdentities:[...new Set(frames.map(f=>f.root?.id))],
   componentIdentities:[...new Set(frames.map(f=>f.component?.id))],programIdentities:[...new Set(frames.map(f=>f.component?.programId))],
   rootHeights:[...new Set(frames.map(f=>f.root?.height))],dayIdentitySets:[...new Set(frames.map(f=>f.days.map(d=>d.id).join(',')))],
   activeElements:[...new Set(frames.map(f=>f.active))],viewportHeights:[...new Set(frames.map(f=>f.viewport?.height))],
   overlayCounts:[...new Set(frames.map(f=>f.overlayCount))],mounts:trace.events.filter(e=>/^editor-/.test(e.kind))};
  results.push(result);
  await writeFile(`${out}/traces/${key}-${cycle}.json`,JSON.stringify(trace));
  await writeFile(`${out}/traces/${key}-${cycle}-back.json`,JSON.stringify(backTrace));
  if(process.env.ROOK_EXPECT_RETAINED_DRAFT==='1'){
   assert.equal(before.root.id,initial.root.id,'same root across Back/Continue');
   assert.equal(before.component.id,initial.component.id,'same component across Back/Continue');
   assert.equal(before.component.programKey,initial.component.programKey,'same actual draft ID');
   assert.equal(before.component.programId,initial.component.programId,'same unedited draft object');
   assert.deepEqual(result.backMounts,[]);assert.deepEqual(result.mounts,[],'no editor mount/unmount on resume');
  }
  assert.ok(gestures[0].delta>20,'first re-entry gesture scrolls');
  assert.ok(gestures.every(g=>g.delta*g.direction>20),'every repeated gesture stays under user control');
  assert.deepEqual(writes,[],'no delayed programmatic scroll writer');assert.deepEqual(prevented,[]);
  assert.equal(result.rootIdentities.length,1);assert.equal(result.componentIdentities.length,1);assert.equal(result.programIdentities.length,1);
  assert.equal(result.rootHeights.length,1);assert.equal(result.dayIdentitySets.length,1);assert.deepEqual(result.overlayCounts,[0]);
  console.log(JSON.stringify({key,cycle,gestures:count,firstDelta:gestures[0].delta,firstTouchAfterReadyMs:result.firstTouchAfterReadyMs,firstScrollAfterTouchMs:result.firstScrollAfterTouchMs,rootStable:true,writes:0}));
 }
 assert.deepEqual(errors,[]);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')||'null')?.program||null),null);
 await context.close();
}}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
