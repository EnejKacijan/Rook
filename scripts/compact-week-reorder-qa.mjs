import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {buildProgram} from '../src/domain.js';
import {openProfileArea} from './qa-current-navigation.mjs';
const phase=process.env.ROOK_COMPACT_PHASE||'after',out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW';await mkdir(`${out}/traces`,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
const results=[];
try{for(const width of (phase==='before'?[390]:[320,390]))for(const style of (phase==='before'?['standard']:['standard','premium']))for(const appearance of (phase==='before'?['dark']:['light','dark'])){
 const s=createReturningUserFixture(3);s.activeWorkout=null;Object.assign(s.profile,{daysPerWeek:5,availableDays:['Mon','Tue','Wed','Thu','Fri'],stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});s.program=buildProgram(s.profile);
 const c=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:appearance==='dark'?'reduce':'no-preference'});
 await c.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
 await c.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));window.weekQA={renders:0,warmups:0,writes:0,longTasks:[]};const original=Storage.prototype.setItem;Storage.prototype.setItem=function(...args){window.weekQA.writes++;return original.apply(this,args);};new PerformanceObserver(l=>window.weekQA.longTasks.push(...l.getEntries().map(e=>e.duration))).observe({type:'longtask'});},s);
 const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 await p.route('**/src/App.jsx*',async r=>{const response=await r.fetch();const body=(await response.text()).replace('const exerciseBlocks = buildExerciseReorderBlocks(day.exercises);','window.weekQA.renders++; const exerciseBlocks = buildExerciseReorderBlocks(day.exercises);').replace('const warmupPrescription = warmupIncluded','window.weekQA.warmups++; const warmupPrescription = warmupIncluded');await r.fulfill({response,body});});
 const open=async()=>{await p.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(p,'program');await p.getByRole('button',{name:/Edit plan/}).click();await p.getByRole('heading',{name:'Edit your plan'}).waitFor();await p.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});};
 await p.goto('http://127.0.0.1:4173');await open();
 const days=p.locator('[data-reorder-workout-section]'),ids=()=>days.evaluateAll(es=>es.map(e=>e.dataset.dayId));const original=await ids();
 if(phase==='after'){
  await days.first().locator('.plan-editor-summary').first().click();const sets=days.first().getByRole('textbox',{name:/^Sets for/});await sets.fill('4');await sets.press('Tab');
  await days.first().locator('.plan-warmup-card-header button').click();await days.first().getByLabel('Warm-up movement 1',{exact:true}).fill('Edited preparation');
 }
 await p.screenshot({path:`${out}/screenshots/compact-week-${phase}-${width}-${style}-${appearance}-expanded.png`});
 for(const [from,to,cancel] of (phase==='before'?[[0,4,false]]:[[0,4,false],[4,0,false],[1,2,false],[2,4,true],[0,3,false]])){
  const before=await ids(),handle=days.nth(from).locator('.plan-workout-drag-surface');await handle.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));const r=await handle.boundingBox();
  await p.mouse.move(r.x+20,r.y+20);await p.mouse.down();await p.mouse.move(r.x+20,r.y+26);await p.locator('.plan-reorder-preview').waitFor();
  if(phase==='after'){assert.equal(await p.locator('.is-week-reordering').count(),1);assert.equal(await p.locator('.plan-editor-exercise:visible').count(),0);}
  const visibleExercises=await p.locator('.plan-editor-exercise:visible').count();
  await p.evaluate(()=>Object.assign(window.weekQA,{renders:0,warmups:0,writes:0,longTasks:[]}));const cdp=await c.newCDPSession(p);await cdp.send('Performance.enable');const perfBefore=await cdp.send('Performance.getMetrics');
  await days.nth(to).evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
  const target=await days.nth(to).boundingBox();await p.mouse.move(r.x+20,Math.max(90,Math.min(690,to===0?target.y-24:target.y+target.height/2+(to>from?30:-30))),{steps:24});
  const perfAfter=await cdp.send('Performance.getMetrics'),data=await p.evaluate(()=>window.weekQA);data.visibleExercises=visibleExercises;data.width=width;data.style=style;data.appearance=appearance;data.from=from;data.to=to;data.metrics=Object.fromEntries(perfAfter.metrics.filter(m=>['ScriptDuration','LayoutDuration','LayoutCount'].includes(m.name)).map(m=>[m.name,m.value-perfBefore.metrics.find(x=>x.name===m.name).value]));results.push(data);
  await p.screenshot({path:`${out}/screenshots/compact-week-${phase}-${width}-${style}-${appearance}-drag-${from}-${to}.png`});
  if(cancel)await p.keyboard.press('Escape');await p.mouse.up();await p.locator('.plan-reorder-preview').waitFor({state:'detached'});
  if(phase==='after'){const expected=[...before];if(!cancel)expected.splice(to,0,expected.splice(from,1)[0]);assert.deepEqual(await ids(),expected);assert.equal(await p.locator('.is-week-reordering').count(),0);assert.ok(await p.locator('.plan-editor-exercise:visible').count()>0);assert.equal(data.renders,0);assert.equal(data.warmups,0);assert.equal(data.writes,0);assert.equal(await p.getByLabel('Warm-up movement 1',{exact:true}).inputValue(),'Edited preparation');assert.equal(await p.getByRole('textbox',{name:/^Sets for/}).inputValue(),'4');}
 }
 if(phase==='after'){
  const expected=await ids();await p.locator('.edit-plan-screen').evaluate(e=>e.scrollTop=0);await p.screenshot({path:`${out}/screenshots/compact-week-${phase}-${width}-${style}-${appearance}-restored.png`});
  // Save uses the existing footer action outside the drag surface.
  await p.getByRole('button',{name:'SAVE CHANGES',exact:true}).focus();await p.keyboard.press('Enter');await p.locator('.edit-plan-screen').waitFor({state:'detached'});await p.waitForFunction(expected=>{const days=JSON.parse(localStorage.getItem('lift-v2-state')).program.days;const week=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];return JSON.stringify([...days].sort((a,b)=>week.indexOf(a.weekday)-week.indexOf(b.weekday)).map(d=>d.id))===JSON.stringify(expected);},expected);await p.reload();await open();assert.deepEqual(await ids(),expected);assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).workouts),JSON.parse(JSON.stringify(s.workouts)));
  const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).program);const movedDay=saved.days.find(d=>d.id===original[0]);assert.equal(movedDay.warmupPlan.items[0].label,'Edited preparation');assert.equal(movedDay.exercises[0].sets.length,4);
  await days.first().locator('.plan-workout-drag-surface').focus();await p.keyboard.press('Alt+ArrowDown');p.once('dialog',d=>{assert.equal(d.message(),'Discard unsaved plan changes?');return d.accept();});await p.getByRole('button',{name:'Close edit plan',exact:true}).click();await p.locator('.edit-plan-screen').waitFor({state:'detached'});assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).program),saved);
 }
 console.log(`PASS ${phase} ${width} ${style} ${appearance}`);await c.close();
}}finally{await writeFile(`${out}/traces/compact-week-${phase}.json`,JSON.stringify(results,null,2));await browser.close();}
