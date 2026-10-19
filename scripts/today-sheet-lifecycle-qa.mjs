import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright-core';
const engine=process.argv.includes('--webkit')?'webkit':'chromium',out='artifacts/today-sheet-motion',results=[];
await mkdir(out,{recursive:true});const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
const settled=page=>page.waitForFunction(()=>!document.getAnimations().some(a=>['running','paused'].includes(a.playState)&&a.effect.getTiming().iterations!==Infinity));
const selector='.today-actions-sheet';
try{for(const width of [320,390,430])for(const reduced of [false,true]){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:reduced?'reduce':'no-preference',serviceWorkers:'block'}),page=await context.newPage();
 await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4198/scripts/today-sheet-motion-review.html?completed=1');
 const trigger=page.getByRole('button',{name:'Today options',exact:true}),panel=page.locator(selector);await trigger.waitFor();await settled(page);
 const saved=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('lift-v2-state'));return {program:s.program,workouts:s.workouts,activeWorkout:s.activeWorkout};});
 // Content/height changes and unrelated updates retain the mounted panel and do not replay entry.
 await trigger.tap();await settled(page);await panel.evaluate(n=>window.retainedPanel=n);
 const independentLayer=await panel.evaluate(n=>{const child=document.createElement('div');child.className='modal-layer superset-picker-layer';n.append(child);const css=getComputedStyle(child),value=[css.getPropertyValue('--rook-sheet-enter-duration').trim(),css.getPropertyValue('--rook-sheet-enter-play-state').trim()];child.remove();return value;});
 assert.deepEqual(independentLayer,['180ms','running'],'independently managed nested layers do not inherit a paused entrance or parent duration');
 const duration=await panel.evaluate(n=>n.style.getPropertyValue('--rook-sheet-enter-duration'));
 await panel.getByRole('button',{name:'Repeat a workout',exact:true}).tap();await settled(page);
 assert.equal(await panel.evaluate(n=>n===window.retainedPanel),true);assert.equal(await panel.evaluate(n=>n.getAnimations().length),0);
 await page.evaluate(()=>{document.documentElement.dataset.appearance='light';dispatchEvent(new Event('resize'));dispatchEvent(new Event('focus'));});
 assert.equal(await panel.evaluate(n=>n.style.getPropertyValue('--rook-sheet-enter-duration')),duration);assert.equal(await panel.evaluate(n=>n.getAnimations().length),0);
 await panel.getByRole('button',{name:'Back',exact:true}).tap();await page.keyboard.press('Escape');await panel.waitFor({state:'detached'});await settled(page);
 // Close while the entrance is still running; the exit must inherit the exact painted pose.
 const interrupted=[];
 for(let i=0;i<3;i++){
  await page.evaluate(()=>document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const n=document.querySelector('.today-actions-sheet'),l=n.parentElement;const a=getComputedStyle(n);window.exitProbe={before:a.transform,top:n.getBoundingClientRect().top,background:getComputedStyle(l).backgroundColor};queueMicrotask(()=>Object.assign(window.exitProbe,{after:getComputedStyle(n).transform,afterTop:n.getBoundingClientRect().top,afterBackground:getComputedStyle(l).backgroundColor}));},{capture:true,once:true}));
  await trigger.tap();
  if(i===0&&!reduced)await panel.evaluate(n=>{const a=n.getAnimations().find(a=>a.animationName==='rook-sheet-enter');if(!a)throw Error('Missing entry animation');a.pause();a.currentTime=a.effect.getTiming().duration*.35;});
  else await page.waitForTimeout(35);
  await page.keyboard.press('Escape');
  const probe=await page.evaluate(()=>window.exitProbe);interrupted.push(probe);
  if(!reduced)assert.ok(Math.abs(probe.top-probe.afterTop)<.1,`no cancellation snap ${JSON.stringify(probe)}`);
  await panel.waitFor({state:'detached'});await trigger.tap();await settled(page);
  assert.equal(await panel.evaluate(n=>n.style.transform),'');assert.equal(await panel.evaluate(n=>getComputedStyle(n).transform),'none');
  await page.keyboard.press('Escape');await panel.waitFor({state:'detached'});await settled(page);
 }
 // Native touch dismissal immediately after entrance settles, plus cancellation back to baseline.
 if(engine==='chromium'){
  const cdp=await context.newCDPSession(page);
  for(const cancel of [true,false]){
   await trigger.tap();await settled(page);const b=await panel.getByRole('button',{name:'Drag down or tap to close',exact:true}).boundingBox();
   const point=d=>({x:b.x+b.width/2,y:b.y+14+d,id:1});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(0)]});
   for(const d of cancel?[12,24]:[12,40,85,120])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(d)]});
   await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
   if(cancel){await settled(page);assert.equal(await panel.evaluate(n=>getComputedStyle(n).transform),'none');await page.keyboard.press('Escape');}
   await panel.waitFor({state:'detached'});await settled(page);
  }await cdp.detach();
 }
 // Safari does not focus buttons on touch. Explicit keyboard activation verifies
 // the existing return-to-previous-focus contract without assuming Chrome's tap behavior.
 await trigger.focus();await page.keyboard.press('Enter');await settled(page);await page.touchscreen.tap(5,5);await panel.waitFor({state:'detached'});await settled(page);
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Today options');
 await page.setViewportSize({width:844,height:width});await trigger.tap();await settled(page);
 const rotated=await panel.boundingBox();assert.ok(rotated.y>=0&&rotated.y+rotated.height<=width+.1);await page.keyboard.press('Escape');await panel.waitFor({state:'detached'});
 await page.setViewportSize({width,height:844});await trigger.tap();await settled(page);await panel.locator('.detail-header-close').tap();await panel.waitFor({state:'detached'});await settled(page);
 await page.waitForFunction(()=>document.body.style.position===''&&!document.querySelector('.app-content[inert]'));
 const latest=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('lift-v2-state'));return {program:s.program,workouts:s.workouts,activeWorkout:s.activeWorkout};});assert.deepEqual(latest,saved);
 results.push({width,reduced,interrupted,rotated});await context.close();console.log(`PASS ${engine} lifecycle ${width} reduced=${reduced}`);
}}finally{await browser.close();await writeFile(`${out}/lifecycle-${engine}.json`,JSON.stringify(results,null,2));}
