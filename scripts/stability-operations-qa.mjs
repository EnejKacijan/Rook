import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {deserializeState,serializeState,startWorkout,completeWorkout,isoDay,weekday,buildProgram} from '../src/domain.js';
import {openProfileArea,startFreestyle} from './qa-current-navigation.mjs';
import {createHistoryCorrection,saveHistoryCorrection} from '../src/historyCorrection.js';
const dir='artifacts/ROOK-STABILITY-PASS',base=process.env.ROOK_QA_URL||'http://127.0.0.1:4173',only=process.env.ROOK_STABILITY_CASE,results=[];
await mkdir(`${dir}/screenshots`,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const stored=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
const fixture=()=>{const s=deserializeState(createReturningUserFixture(2));s.activeWorkout=null;s.ai.planUpgradeDismissed=true;s.profile.avoid='No jumping';const draft=createHistoryCorrection(s.workouts[0]);draft.workout.sessionNote='Historical correction preserved across plan replacement';const result=saveHistoryCorrection(s,draft);assert.equal(result.status,'saved');return result.state;};
async function open(seed,width=390){
 const c=await browser.newContext({viewport:{width,height:844},hasTouch:true,serviceWorkers:'block'}),p=await c.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await c.addInitScript(raw=>{if(!localStorage.getItem('stability-seeded')){localStorage.setItem('lift-v2-state',raw);localStorage.setItem('stability-seeded','yes');}},serializeState(seed));
 await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto(base,{waitUntil:'networkidle'});
 return {c,p,errors};
}
async function photo(p,workoutId,id='stability-photo'){
 await p.evaluate(async({workoutId,id})=>{
  await new Promise((resolve,reject)=>{const request=indexedDB.open('rook-workout-media',3);request.onsuccess=()=>{const db=request.result,tx=db.transaction('photos','readwrite');tx.objectStore('photos').put({id,workoutId,createdAt:new Date().toISOString(),mimeType:'image/png',width:1,height:1,blob:new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GHEAAAAASUVORK5CYII='),c=>c.charCodeAt(0))],{type:'image/png'})});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);});
 },{workoutId,id});
}
async function photos(p){return p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('rook-workout-media',3);r.onsuccess=()=>{const db=r.result,q=db.transaction('photos').objectStore('photos').getAll();q.onsuccess=()=>{db.close();resolve(q.result.map(x=>({id:x.id,workoutId:x.workoutId,size:x.blob.size})));};q.onerror=()=>reject(q.error);};}));}
async function replaceMenu(p){await p.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(p,'program');await p.getByRole('button',{name:/Replace plan/}).click();await p.getByRole('heading',{name:'Change plan',exact:true}).waitFor();}
async function shot(p,name){await p.screenshot({path:`${dir}/screenshots/${name}.png`});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
async function run(name,fn){if(only&&!name.startsWith(only))return;await fn();results.push({name,passed:true});console.log(`PASS ${name}`);}
try{
 for(const source of ['build','scratch','import']) await run(`replacement-${source}`,async()=>{
  const seed=fixture();seed.workouts[0].photoId='stability-photo';const {c,p,errors}=await open(seed,source==='scratch'?320:390);
  await photo(p,seed.workouts[0].id);const before=await stored(p),photoBefore=await photos(p);await replaceMenu(p);
  if(source==='build'){
   await p.getByRole('button',{name:/Build a personalized plan/}).click();await p.getByRole('button',{name:'BUILD NEW PLAN',exact:true}).click();await p.getByText('Plan preview',{exact:true}).waitFor();
  }else if(source==='scratch'){
   await p.getByRole('button',{name:/Start from scratch/}).click();await p.getByLabel('Weekly plan name').fill('Stability replacement');await p.getByRole('button',{name:'Mon',exact:true}).click();await p.getByRole('button',{name:'CONTINUE',exact:true}).click();
   const day=p.locator('.import-day').first();await day.getByRole('button',{name:'+ Add first exercise',exact:true}).click();await day.getByLabel('Search exercise for Mon').fill('Bench Press');await day.getByRole('option',{name:'Bench Press',exact:true}).click();
  }else{
   await p.getByRole('button',{name:/Import from Notes|Import a different plan/}).click();await p.locator('textarea').first().fill('Monday: Home\nPush Up 3x12 bodyweight\nThursday: Gym\nBench Press 3x8 60kg');
   await p.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
  }
  const apply=p.getByRole('button',{name:/^USE THIS PLAN$|^SAVE CHANGES$/}).last();await apply.waitFor();await shot(p,`replacement-${source}-review`);
  assert.deepEqual((await stored(p)).program,before.program,'preview has no persistent effect');
  await p.evaluate(()=>{window.__save=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='lift-v2-state')throw new DOMException('Synthetic quota','QuotaExceededError');return window.__save.call(this,k,v);};});
  p.on('dialog',d=>d.accept());await apply.click();await p.getByRole('alert').filter({hasText:/couldn’t save/}).waitFor();assert.deepEqual((await stored(p)).program,before.program);
  await p.evaluate(()=>Storage.prototype.setItem=window.__save);await apply.click();await p.waitForFunction(id=>JSON.parse(localStorage.getItem('lift-v2-state')).program.id!==id,before.program.id);
  await p.reload({waitUntil:'networkidle'});const after=await stored(p);assert.notEqual(after.program.id,before.program.id);assert.deepEqual(after.workouts,before.workouts);assert.deepEqual(after.workoutCorrections,before.workoutCorrections);assert.equal(after.profile.avoid,before.profile.avoid);assert.ok(after.planVersions.length>before.planVersions.length);assert.deepEqual(await photos(p),photoBefore);assert.equal(await p.locator('.entry-screen').count(),0);assert.deepEqual(errors,[]);await c.close();
 });
 await run('replacement-cancel-active',async()=>{
  const seed=fixture(),{c,p}=await open(seed);const before=await stored(p);await replaceMenu(p);await p.getByRole('button',{name:'Close',exact:true}).click();assert.deepEqual((await stored(p)).program,before.program);
  seed.activeWorkout=startWorkout(seed,seed.program.days[0]);await p.evaluate(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),seed);await p.reload();await replaceMenu(p);
  for(const label of [/Build a personalized plan/,/Import from Notes|Import a different plan/,/Start from scratch/])assert.ok(await p.getByRole('button',{name:label}).isDisabled());await c.close();
 });
 for(const width of [320,390]) for(const style of ['standard','premium']) await run(`per-side-${width}-${style}`,async()=>{
  const seed=fixture();seed.profile.rirEnabled=true;seed.profile.stylePreference=style;seed.profile.appearancePreference=width===320?'dark':'light';seed.profile.themePreference=style==='premium'?'premium':seed.profile.appearancePreference;
  const template=seed.program.days[0];template.exercises[0].loggingMode='per_side';seed.activeWorkout=startWorkout(seed,template);const e=seed.activeWorkout.exercises[0];e.sets=e.sets.slice(0,3);e.sets.forEach(s=>{s.weight=null;s.rir=null;s.sides={left:{reps:null},right:{reps:null}};});
  const {c,p,errors}=await open(seed,width);await p.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();
  await p.getByLabel('right reps for set 3',{exact:true}).fill('6');
  await p.getByLabel('left reps for set 1',{exact:true}).fill('10');await p.getByLabel('right reps for set 1',{exact:true}).fill('8');
  await p.getByLabel('Weight in kg for set 1',{exact:true}).fill('40');await p.getByLabel('RIR for set 1',{exact:true}).selectOption('0');
  await p.getByRole('button',{name:'Increase left reps for set 1',exact:true}).click();await p.getByRole('button',{name:'Decrease left reps for set 1',exact:true}).click();await p.getByRole('button',{name:'Log set 1',exact:true}).click();
  assert.equal(await p.getByLabel('left reps for set 2',{exact:true}).inputValue(),'10');assert.equal(await p.getByLabel('right reps for set 2',{exact:true}).inputValue(),'8');
  assert.equal((await stored(p)).activeWorkout.exercises[0].sets[1].rir,0);await shot(p,`per-side-${width}-${style}`);
  await p.getByRole('button',{name:'Log set 2',exact:true}).click();assert.equal(await p.getByLabel('right reps for set 3',{exact:true}).inputValue(),'6');await p.reload({waitUntil:'networkidle'});await p.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();assert.equal(await p.getByLabel('right reps for set 3',{exact:true}).inputValue(),'6');assert.deepEqual(errors,[]);await c.close();
 });
 for(const withPhoto of [false,true]) await run(`delete-${withPhoto?'photo':'only-history'}`,async()=>{
  let seed=fixture();seed.activeWorkout=startWorkout(seed,seed.program.days[0]);seed.activeWorkout.canonicalPlanDate=isoDay();seed.activeWorkout.workoutDateKey=isoDay();seed.activeWorkout.exercises.forEach(e=>e.sets.forEach(s=>Object.assign(s,{completed:true,weight:40,reps:8})));seed=completeWorkout(seed);const target=seed.workouts.at(-1);if(withPhoto)target.photoId='stability-photo';else seed.workouts=[target];
  const {c,p,errors}=await open(seed,withPhoto?390:320);if(withPhoto){await photo(p,target.id);await photo(p,'unrelated','other-photo');}
  const before=await stored(p);const heroHistory=p.getByRole('button',{name:'WORKOUT COMPLETE · VIEW HISTORY',exact:true});await (await heroHistory.isVisible()?heroHistory:p.locator(`[data-workout-id="${target.id}"]`)).click();await p.getByRole('button',{name:'Workout options',exact:true}).click();await p.locator('.completed-workout-actions-sheet').getByRole('button',{name:'Delete workout',exact:true}).click();await p.getByRole('heading',{name:'Delete this workout?',exact:true}).waitFor();await shot(p,`delete-${withPhoto?'photo':'only-history'}-confirm`);
  await p.getByRole('button',{name:'CANCEL',exact:true}).click();assert.deepEqual((await stored(p)).workouts,before.workouts);await p.getByRole('button',{name:'Workout options',exact:true}).click();await p.locator('.completed-workout-actions-sheet').getByRole('button',{name:'Delete workout',exact:true}).click();
  if(withPhoto){
   const photosBefore=await photos(p);
   await p.evaluate(()=>{const set=Storage.prototype.setItem;let failed=false;Storage.prototype.setItem=function(k,v){if(k==='lift-v2-state'&&!failed){failed=true;throw new DOMException('Synthetic single write failure','QuotaExceededError');}return set.call(this,k,v);};});
   await p.getByRole('button',{name:'DELETE WORKOUT',exact:true}).click();await p.getByRole('alert').filter({hasText:/could not be deleted/}).waitFor();assert.deepEqual((await stored(p)).workouts,before.workouts);assert.deepEqual(await photos(p),photosBefore);
  }
  await p.getByRole('button',{name:'DELETE WORKOUT',exact:true}).click();await p.waitForFunction(id=>!JSON.parse(localStorage.getItem('lift-v2-state')).workouts.some(w=>w.id===id),target.id);await p.reload({waitUntil:'networkidle'});
  const after=await stored(p);assert.deepEqual(after.program,before.program);assert.deepEqual(after.workouts,before.workouts.filter(w=>w.id!==target.id));assert.deepEqual((await photos(p)).map(x=>x.id),withPhoto?['other-photo']:[]);await p.getByRole('button',{name:'PROGRESS',exact:true}).click();if(!withPhoto)await p.getByText('No exercises logged yet',{exact:true}).waitFor();assert.deepEqual(errors,[]);await c.close();
 });
 for(const width of [320,390]) await run(`drag-${width}`,async()=>{
  const {c,p}=await open(fixture(),width);await p.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(p,'program');await p.getByRole('button',{name:/Edit plan/}).click();await p.getByRole('heading',{name:'Edit your plan',exact:true}).waitFor();
  const day=p.locator('.import-day').first(),cards=day.locator('.plan-editor-exercise'),before=await cards.evaluateAll(items=>items.map(x=>x.id));
  const dragCdp=await c.newCDPSession(p);
  for(const [from,to] of [[0,before.length-1],[before.length-1,0],[0,before.length-1]]){
   const handle=cards.nth(from).locator('.plan-exercise-drag-handle');await handle.evaluate(x=>x.scrollIntoView({block:'center',behavior:'instant'}));
   await p.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
   const box=await handle.boundingBox();
   assert.ok(await handle.evaluate(x=>{const r=x.getBoundingClientRect();return x.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'drag grip must be the actual touch target after scrolling');
   await dragCdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
   await p.locator('.plan-reorder-preview.exercise').waitFor();assert.equal(await cards.nth(from).locator('.plan-exercise-drag-handle > i').evaluate(x=>getComputedStyle(x).visibility),'hidden');
   assert.equal(await p.locator('.plan-reorder-preview .plan-exercise-drag-handle').count(),0);assert.equal(await cards.nth(from===0?1:0).locator('.plan-exercise-drag-handle > i').evaluate(x=>getComputedStyle(x).visibility),'visible');await shot(p,`drag-${width}-${from}`);await dragCdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await p.locator('.plan-reorder-preview').waitFor({state:'detached'});
   // Use the documented keyboard gesture, not a synthetic click during the
   // intentional post-drag click-suppression window.
   const movingId=await cards.nth(from).getAttribute('id');
   for(let index=from;index!==to;index+=to>from?1:-1)await p.locator(`[id="${movingId}"] .plan-exercise-drag-handle`).press(to>from?'Alt+ArrowDown':'Alt+ArrowUp');
   await p.waitForFunction(({movingId,to})=>[...document.querySelector('.import-day').querySelectorAll('.plan-editor-exercise')][to]?.id===movingId,{movingId,to});
  }
  const after=await cards.evaluateAll(items=>items.map(x=>x.id));assert.deepEqual([...after].sort(),[...before].sort());assert.equal(after.at(-1),before[0]);await p.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();await p.locator('.edit-plan-screen').waitFor({state:'detached'});await c.close();
 });
 await run('freestyle-cross-flow',async()=>{
  const seed=fixture(),{c,p,errors}=await open(seed),before=await stored(p);
  await startFreestyle(p);await p.getByRole('button',{name:'+ ADD EXERCISE',exact:true}).click();await p.getByRole('searchbox',{name:'Search exercises',exact:true}).fill('Dumbbell Bench Press');await p.locator('.freestyle-picker .list-row').filter({hasText:/^Dumbbell Bench Press/}).first().click();
  await p.getByLabel('Weight in kg for set 1',{exact:true}).click();await p.getByLabel('Weight in kg for set 1',{exact:true}).pressSequentially('20');await p.getByLabel('Reps for set 1',{exact:true}).click();await p.getByLabel('Reps for set 1',{exact:true}).pressSequentially('8');await p.getByLabel('Reps for set 1',{exact:true}).blur();
  if(await p.getByRole('button',{name:'Log set 1',exact:true}).isDisabled()){console.log('Blocked freestyle state',JSON.stringify((await stored(p)).activeWorkout));await shot(p,'freestyle-blocked-diagnostic');}
  await p.getByRole('button',{name:'Log set 1',exact:true}).click();const active=(await stored(p)).activeWorkout;
  const cdp=await c.newCDPSession(p);await cdp.send('Page.setWebLifecycleState',{state:'frozen'});await cdp.send('Page.setWebLifecycleState',{state:'active'});await p.reload({waitUntil:'networkidle'});assert.deepEqual((await stored(p)).activeWorkout.exercises,active.exercises);await p.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();
  await p.getByRole('button',{name:'Finish',exact:true}).click();await p.locator('.complete-screen').waitFor();await p.getByRole('button',{name:'DONE',exact:true}).click();await p.reload({waitUntil:'networkidle'});
  const completed=await stored(p);assert.equal(completed.workouts.length,before.workouts.length+1);assert.equal(completed.workouts.at(-1).exercises[0].sets[0].reps,8);assert.deepEqual(completed.program,before.program);
  await replaceMenu(p);await p.getByRole('button',{name:/Build a personalized plan/}).click();await p.getByRole('button',{name:'BUILD NEW PLAN',exact:true}).click();await p.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await p.waitForFunction(id=>JSON.parse(localStorage.getItem('lift-v2-state')).program.id!==id,completed.program.id);await p.reload({waitUntil:'networkidle'});
  const after=await stored(p);assert.deepEqual(after.workouts,completed.workouts);assert.deepEqual(after.workoutCorrections,completed.workoutCorrections);assert.equal(after.profile.avoid,before.profile.avoid);assert.equal(await p.locator('.entry-screen').count(),0);await p.getByRole('button',{name:'PROGRESS',exact:true}).click();await shot(p,'cross-flow-progress');assert.deepEqual(errors,[]);await c.close();
 });
}finally{await browser.close();await writeFile(`${dir}/stability-operations${only?`-${only}`:''}.json`,JSON.stringify(results,null,2));}
