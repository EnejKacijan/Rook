import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {combineExample} from '../src/combineWorkouts.fixture.js';
import {flexibleSessions} from '../src/flexibleWeek.js';
const out='artifacts/coach-combine-audit';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[],errors=[];
let diagnosticPage;
const read=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
const review=async page=>{const button=page.getByRole('button',{name:'REVIEW COMBINED WORKOUT'});await button.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await button.click();assert.ok(await page.locator('.combine-review-surface').count(),'first click opens review while composer draft is focused');};
try{for(const width of (process.env.COMBINE_QA_ONE?[390]:[320,390]))for(const style of (process.env.COMBINE_QA_ONE?['standard']:['standard','premium']))for(const appearance of (process.env.COMBINE_QA_ONE?['dark']:['light','dark'])){
 const s=combineExample();Object.assign(s.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 const c=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Ljubljana',serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'});
 await c.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},s);
 const p=await c.newPage();diagnosticPage=p;p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-09-12T12:00:00+02:00'));
 await p.addInitScript(()=>{window.qaClicks=[];for(const name of ['pointerdown','pointerup','click'])document.addEventListener(name,e=>window.qaClicks.push({type:name,target:e.target.tagName,text:e.target.textContent?.slice(0,60),y:e.clientY}),true);});
 await p.route('**/api/ai/status',r=>r.fulfill({json:{available:true,provider:'qa'}}));
 await p.route('**/api/ai',r=>r.fulfill({json:{data:{sourceIds:[],minutes:null,unambiguous:false,text:'No changes applied.',action:null}}}));
 await p.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4177');await p.getByRole('button',{name:'COACH',exact:true}).click();
 const baseline=await read(p),input=p.getByLabel('Ask Coach');
 await input.fill('Combine Push and Pull');await p.getByRole('button',{name:'Send message',exact:true}).click();
 await p.getByRole('button',{name:'60 min',exact:true}).waitFor();
 await p.clock.setFixedTime(new Date('2026-09-12T12:00:01+02:00'));
 const draft='  My next custom question\nkeep unchanged  ';await input.fill(draft);
 await p.getByRole('button',{name:'60 min',exact:true}).evaluate(el=>{el.click();el.click();});
 await p.getByRole('button',{name:'REVIEW COMBINED WORKOUT'}).waitFor();assert.equal(await input.inputValue(),draft);
 assert.equal((await p.locator('.user-message').allTextContents()).filter(t=>t==='60 min').length,1);
 assert.equal((await read(p)).todayAdaptation,null);assert.deepEqual((await read(p)).program,baseline.program);
 await review(p);await p.getByRole('button',{name:'CANCEL',exact:true}).click();
 assert.equal((await read(p)).todayAdaptation,null);
 await review(p);
 await p.locator('.combine-card .adapt-review-list').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await p.screenshot({path:`${out}/${width}-${style}-${appearance}-review.png`});
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
 // Failure at the actual storage boundary; Apply must remain recoverable.
 await p.evaluate(()=>{window.qaSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='lift-v2-state')throw new DOMException('QA quota','QuotaExceededError');return window.qaSetItem.call(this,k,v);};});
 await p.getByRole('button',{name:'USE THIS WORKOUT',exact:true}).click();await p.locator('.combine-card [role=alert]').waitFor();
 assert.equal((await read(p)).todayAdaptation,null);
 await p.evaluate(()=>Storage.prototype.setItem=window.qaSetItem);
 await p.getByRole('button',{name:'USE THIS WORKOUT',exact:true}).evaluate(el=>{el.click();el.click();});
 await p.getByText('Combined workout applied',{exact:true}).waitFor();let applied=await read(p);
 assert.ok(applied.todayAdaptation);assert.equal(applied.workouts.length,0);assert.deepEqual(applied.program,baseline.program);
 assert.equal(flexibleSessions(applied,'2026-09-12').filter(s=>s.status==='reserved').length,2);
 await p.getByRole('button',{name:'View workout →',exact:true}).click();await p.getByRole('button',{name:'START WORKOUT',exact:true}).waitFor();
 assert.equal(await p.getByLabel('Reschedule missed session').count(),0);
 await p.reload();await p.getByRole('button',{name:'START WORKOUT',exact:true}).waitFor();
 assert.ok((await read(p)).todayAdaptation);await p.screenshot({path:`${out}/${width}-${style}-${appearance}-today.png`});
 if(width===390&&style==='standard'&&appearance==='dark'){
  await p.getByRole('button',{name:'START WORKOUT',exact:true}).click();await p.getByLabel('Back to Today',{exact:true}).waitFor();
  let active=await read(p);assert.equal(active.activeWorkout.adjustment.sourceSessions.length,2);assert.deepEqual(active.program,baseline.program);
  await p.reload();await p.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();await p.getByLabel('Back to Today',{exact:true}).waitFor();
  // Log the actual reviewed prescription through the regular logger.
  for(let exercise=0;exercise<20;exercise++){
    const current=(await read(p)).activeWorkout;if(!current)break;
    const rows=p.locator('.sets .set-row');await rows.first().waitFor();
    for(const row of await rows.all()){
      const weight=row.locator('input').filter({visible:true});
      for(const field of await weight.all()){
        const label=await field.getAttribute('aria-label');
        await field.fill(/reps/i.test(label)?'8':/seconds/i.test(label)?'30':'20');
        await field.blur();
      }
      const log=row.getByRole('button',{name:/^Log set /});if(await log.count())await log.click();
    }
    const next=p.getByRole('button',{name:/^NEXT EXERCISE/});
    if(await next.count())await next.click();else break;
    await p.waitForFunction(previous=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout?.exerciseIndex!==previous,current.exerciseIndex);
  }
  await p.evaluate(()=>{window.qaSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='lift-v2-state')throw new DOMException('QA quota','QuotaExceededError');return window.qaSetItem.call(this,k,v);};});
  await p.getByRole('button',{name:'Finish',exact:true}).click();await p.locator('.workout-screen [role=alert]').waitFor();
  const failed=await read(p);assert.equal(failed.workouts.length,0);assert.ok(failed.activeWorkout);assert.equal(flexibleSessions(failed,'2026-09-12').filter(s=>s.status==='reserved').length,2);
  await p.evaluate(()=>Storage.prototype.setItem=window.qaSetItem);
  await p.getByRole('button',{name:'Finish',exact:true}).click();
  await p.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state')).workouts.length===1);
  const completed=await read(p);assert.equal(completed.workouts[0].combinedSourcesResolved,true);assert.equal(completed.activeWorkout,null);assert.equal(completed.todayAdaptation,null);assert.deepEqual(completed.program,baseline.program);
  assert.equal(flexibleSessions(completed,'2026-09-12').filter(s=>s.status==='combined').length,2);
  await p.reload();assert.equal((await read(p)).workouts.length,1);await p.screenshot({path:`${out}/390-completed.png`});
 }else{
  await p.getByRole('button',{name:'Cancel combined workout',exact:true}).click();
  await p.getByLabel('Reschedule missed session').waitFor();const cancelled=await read(p);assert.equal(cancelled.todayAdaptation,null);assert.equal(cancelled.workouts.length,0);assert.deepEqual(cancelled.program,baseline.program);
 }
 results.push({width,style,appearance,result:'PASS'});console.log('PASS',width,style,appearance);await c.close();
}assert.deepEqual(errors,[]);}catch(error){if(diagnosticPage&&!diagnosticPage.isClosed()){await diagnosticPage.screenshot({path:`${out}/failure.png`});await writeFile(`${out}/failure.txt`,await diagnosticPage.locator('body').innerText());}throw error;}finally{await writeFile(`${out}/browser-results.json`,JSON.stringify({results,errors},null,2));await browser.close();}
