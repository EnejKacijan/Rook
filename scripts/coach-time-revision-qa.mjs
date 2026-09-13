import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {combineExample} from '../src/combineWorkouts.fixture.js';
import {flexibleSessions} from '../src/flexibleWeek.js';

// Real UI and persistence in a fresh browser context, never the owner's storage.
// LIVE mode leaves API routes entirely unmocked. Other runs deliberately isolate
// deterministic UI/lifecycle checks from provider availability and cost.
const live=process.env.COMBINE_LIVE==='1',url=process.env.ROOK_QA_URL||'http://127.0.0.1:4177';
const out='artifacts/coach-time-revision';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[],errors=[],provider=[];
const read=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
let page,tick=Date.parse('2026-09-12T12:00:00+02:00');
const review=async p=>{const button=p.getByRole('button',{name:'REVIEW COMBINED WORKOUT',exact:true}).last();await button.click();await p.locator('.combine-review-surface').last().waitFor();};
const send=async(p,text)=>{
 const count=(await read(p)).conversations.length;await p.clock.setFixedTime(new Date(tick+=2000));
 await p.getByLabel('Ask Coach').fill(text);await p.getByRole('button',{name:'Send message',exact:true}).click();
 await p.waitForFunction(n=>{const entries=JSON.parse(localStorage.getItem('lift-v2-state')).conversations;return entries.length>n&&!!entries.at(-1).reply;},count,{timeout:100000});
 return (await read(p)).conversations.at(-1).reply;
};
try{
 for(const width of live?[390]:[320,390])for(const style of live?['standard']:['standard','premium'])for(const appearance of live?['dark']:['light','dark']){
  const seed=combineExample();Object.assign(seed.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
  const c=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Ljubljana',serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'});
  await c.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},seed);
  const p=await c.newPage();page=p;p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date(tick));
  if(!live){await p.route('**/api/ai/status',r=>r.fulfill({json:{available:true,provider:'simulated-status'}}));await p.route('**/api/ai',r=>r.fulfill({json:{data:{text:'No changes.',action:null}}}));}
  else p.on('response',async r=>{if(r.url().endsWith('/api/ai')){const input=r.request().postDataJSON();provider.push({operation:input.operation,message:input.payload.message,status:r.status(),result:await r.json()});}});
  await p.goto(url);await p.getByRole('button',{name:'COACH',exact:true}).click();const initial=await read(p),program=initial.program;
  let reply=await send(p,live?"I'd like my Monday and Wednesday sessions rolled into a single visit today.":'Combine Push and Pull');
  assert.equal(reply.combineRequest?.step,'time',JSON.stringify(reply));assert.equal(reply.action,null);assert.equal((await read(p)).todayAdaptation,null);
  await p.reload();await p.getByRole('button',{name:'COACH',exact:true}).click();reply=await send(p,'60 min');assert.equal(reply.action?.proposal.requestedMinutes,60,JSON.stringify(reply));
  await review(p);await p.getByRole('button',{name:'USE THIS WORKOUT',exact:true}).click();await p.getByText('Combined workout applied',{exact:true}).waitFor();
  let applied=(await read(p)).todayAdaptation;const id=applied.id,sources=applied.sourceSessions;assert.equal(applied.requestedMinutes,60);
  reply=await send(p,'kaj pa ce ga podaljsas ker mam vec casa');assert.equal(reply.combineRequest?.step,'time',reply.text);
  await p.reload();await p.getByRole('button',{name:'COACH',exact:true}).click();reply=await send(p,'75 min');assert.equal(reply.action?.proposal.id,id,reply.text);
  await review(p);const surface=p.locator('.combine-review-surface').last();assert.ok(await surface.getByRole('button',{name:'USE UPDATED WORKOUT',exact:true}).count());
  await surface.getByRole('button',{name:'CANCEL',exact:true}).click();assert.deepEqual((await read(p)).todayAdaptation,applied);
  // Ambiguous-free natural paraphrase takes frontend → real server → provider →
  // revision action dispatcher in LIVE mode, not a hand-inserted action object.
  reply=await send(p,live?'The joint session has a sixty minute budget. Please allocate an extra quarter of an hour to it.':'Zdaj imam 75 minut.');
  assert.equal(reply.action?.proposal.requestedMinutes,75,JSON.stringify(reply));assert.equal(reply.action.proposal.id,id);
  await review(p);await p.locator('.combine-revision-summary').last().evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  await p.screenshot({path:`${out}/${live?'live':'qa'}-${width}-${style}-${appearance}-review.png`});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  // Same Back action used by the semantic gesture; explicit button also retains focus.
  await p.getByLabel('Back to combined workout proposal').last().click();assert.equal(await p.locator('.combine-review-surface').count(),0);assert.deepEqual((await read(p)).todayAdaptation,applied);
  await review(p);
  if(!live){
   // Native touch dispatch on the same bounded review surface. Standalone gate
   // is emulated here; this does not claim a physical iPhone/PWA test.
   await p.evaluate(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));
   await p.locator('.combine-review-surface').last().evaluate(el=>{
    document.activeElement?.blur();const r=el.getBoundingClientRect(),x=r.left+4,y=Math.max(150,r.top+90);
    const fire=(type,dx)=>el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[new Touch({identifier:1,target:el,clientX:x+dx,clientY:y})]}));
    fire('touchstart',0);fire('touchmove',r.width*.6);fire('touchend',r.width*.6);
   });
   await p.waitForFunction(()=>!document.querySelector('.combine-review-surface'));assert.deepEqual((await read(p)).todayAdaptation,applied);await review(p);
  }
  if(!live){
   await p.evaluate(()=>{window.qaOriginalWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='lift-v2-state')throw new DOMException('Synthetic failure','QuotaExceededError');return window.qaOriginalWrite.call(this,k,v);};});
   await p.getByRole('button',{name:'USE UPDATED WORKOUT',exact:true}).click();await p.locator('.combine-card [role=alert]').waitFor();assert.deepEqual((await read(p)).todayAdaptation,applied);
   await p.evaluate(()=>Storage.prototype.setItem=window.qaOriginalWrite);
  }
  await p.getByRole('button',{name:'USE UPDATED WORKOUT',exact:true}).evaluate(el=>{el.click();el.click();});
  await p.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state')).todayAdaptation.requestedMinutes===75);
  applied=(await read(p)).todayAdaptation;assert.equal(applied.id,id);assert.deepEqual(applied.sourceSessions,sources);assert.equal(flexibleSessions(await read(p),'2026-09-12').filter(s=>s.status==='reserved').length,2);
  const full=applied.workout.exercises;
  for(const minutes of [45,75]){reply=await send(p,`Zdaj imam ${minutes} minut.`);assert.equal(reply.action?.proposal.id,id,reply.text);await review(p);await p.getByRole('button',{name:'USE UPDATED WORKOUT',exact:true}).click();await p.waitForFunction(m=>JSON.parse(localStorage.getItem('lift-v2-state')).todayAdaptation.requestedMinutes===m,minutes);}
  let final=await read(p);assert.deepEqual(final.todayAdaptation.workout.exercises,full);assert.deepEqual(final.program,program);assert.equal(final.todayAdaptation.id,id);assert.deepEqual(final.todayAdaptation.sourceSessions,sources);assert.equal(final.workouts.length,0);
  await p.reload();await p.getByRole('button',{name:'TODAY',exact:true}).click();await p.getByRole('button',{name:'START WORKOUT',exact:true}).waitFor();final=await read(p);assert.equal(final.todayAdaptation.id,id);
  await p.screenshot({path:`${out}/${live?'live':'qa'}-${width}-${style}-${appearance}-today.png`});
  if(live){
   await p.getByRole('button',{name:'START WORKOUT',exact:true}).click();await p.getByLabel('Back to Today',{exact:true}).waitFor();
   assert.equal((await read(p)).activeWorkout.adjustment.id,id);
   for(let exercise=0;exercise<20;exercise++){
    const current=(await read(p)).activeWorkout;if(!current)break;const rows=p.locator('.sets .set-row');await rows.first().waitFor();
    for(const row of await rows.all()){
     for(const input of await row.locator('input').filter({visible:true}).all()){
      const label=await input.getAttribute('aria-label');await input.fill(/reps/i.test(label)?'8':/seconds/i.test(label)?'30':'20');await input.blur();
     }
     const log=row.getByRole('button',{name:/^Log set /});if(await log.count())await log.click();
    }
    const next=p.getByRole('button',{name:/^NEXT EXERCISE/});if(await next.count())await next.click();else break;
    await p.waitForFunction(index=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout?.exerciseIndex!==index,current.exerciseIndex);
   }
   await p.getByRole('button',{name:'Finish',exact:true}).click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state')).workouts.length===1);
   const completed=await read(p);assert.equal(completed.workouts[0].adjustment.id,id);assert.equal(completed.workouts[0].combinedSourcesResolved,true);assert.equal(completed.todayAdaptation,null);assert.equal(completed.activeWorkout,null);assert.deepEqual(completed.program,program);
   assert.equal(flexibleSessions(completed,'2026-09-12').filter(s=>s.status==='combined').length,2);await p.reload();assert.equal((await read(p)).workouts.length,1);
  }
  results.push({width,style,appearance,motion:width===320?'reduced':'normal',mode:live?'real-provider':'simulated-provider-status',result:'PASS',temporaryId:id,reservations:sources.map(s=>({logicalSessionId:s.logicalSessionId,reservedBy:s.reservedBy})),revision:final.todayAdaptation.revision});
  console.log('PASS',live?'LIVE':'UI',width,style,appearance);await c.close();
 }
 if(live){assert.ok(provider.some(r=>r.result.data?.action?.type==='combine-workouts'),'real provider selected Combine');assert.ok(provider.some(r=>r.result.data?.action?.type==='revise-combined-workout'),'real provider selected revision');}
 assert.deepEqual(errors,[]);
}catch(error){if(page&&!page.isClosed()){await page.screenshot({path:`${out}/${live?'live':'qa'}-failure.png`});await writeFile(`${out}/${live?'live':'qa'}-failure.txt`,await page.locator('body').innerText());}throw error;}
finally{await writeFile(`${out}/${live?'live':'qa'}-results.json`,JSON.stringify({results,errors,provider},null,2));await browser.close();}
