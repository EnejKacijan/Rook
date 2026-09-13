import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,deserializeState} from '../src/domain.js';
import {buildWeeklyPlanExport,buildWorkoutExport} from '../src/workoutExport.js';
const out='artifacts/import-open-targets';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[],errors=[];let page;
const read=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function open(t){
 const c=await browser.newContext({viewport:{width:t.width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'Europe/Ljubljana'});
 const s=blankState();Object.assign(s.profile,{appearancePreference:t.appearance,stylePreference:t.style,themePreference:t.style==='premium'?'premium':t.appearance,recommendedWarmupsEnabled:false});
 await c.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},s);
 page=await c.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-09-14T12:00:00+02:00'));
 await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));await page.route('**/api/ai',()=>{throw Error('No AI call is needed for missing targets');});
 await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4177');await page.getByRole('button',{name:'Back to plan options',exact:true}).click();await page.locator('.existing-plan-action').click();return c;
}
async function preview(source){await page.getByPlaceholder(/Paste your workout notes/).fill(source);await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();}
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const t={width,style,appearance},prefix=`${width}-${style}-${appearance}`;let c=await open(t);
 await preview('Monday: Upper\nBench Press 3 sets\nPush Up 2 sets');await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();
 assert.equal(await page.locator('.import-resolution').count(),0,'no empty numeric wizard');assert.match(await page.locator('body').innerText(),/3 sets · Reps not specified/);
 await page.locator('.plan-editor-summary').first().scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${prefix}-preview.png`});await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await page.locator('.bottom-nav').waitFor();
 const accepted=(await read(page)).program;assert.ok(accepted.days[0].exercises.every(e=>e.repTarget==='unspecified'&&e.sets.every(s=>s.reps===null&&s.weight===null&&!s.completed)));
 await page.reload();await page.getByRole('button',{name:'START WORKOUT',exact:true}).click();await page.locator('.workout-screen').waitFor();
 const row=page.locator('.sets .set-row'),first=row.nth(0);await first.waitFor();
 assert.ok((await read(page)).activeWorkout.exercises[0].sets.every(s=>s.reps===null&&s.weight===null&&!s.completed));assert.equal(await first.getByRole('button',{name:/^Log set /}).isDisabled(),true);
 await page.screenshot({path:`${out}/${prefix}-active-empty.png`});
 const reps=i=>row.nth(i).getByRole('spinbutton',{name:/reps/i}),weight=i=>row.nth(i).getByRole('spinbutton',{name:/weight|kg/i});
 await reps(2).fill('13');await reps(2).blur();await reps(0).fill('7');await weight(0).fill('40');await weight(0).blur();
 let e=(await read(page)).activeWorkout.exercises[0];assert.deepEqual(e.sets.map(s=>s.reps),[7,7,13]);assert.ok(e.sets.every(s=>!s.completed));assert.equal(e.repMin,null);
 await page.screenshot({path:`${out}/${prefix}-active.png`});
 for(let i=0;i<3;i++)await row.nth(i).getByRole('button',{name:/^Log set /}).click();
 await page.getByRole('button',{name:/^NEXT EXERCISE/}).click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exerciseIndex===1);
 for(let i=0;i<2;i++){await reps(i).fill('12');await reps(i).blur();await row.nth(i).getByRole('button',{name:/^Log set /}).click();}
 await page.getByRole('button',{name:'Finish',exact:true}).click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state')).workouts.length===1);
 await page.reload();let saved=await read(page),history=saved.workouts[0];assert.deepEqual(history.exercises[0].sets.map(s=>s.reps),[7,7,13]);assert.ok(history.exercises[1].sets.every(s=>s.weight===null&&s.completed));
 assert.deepEqual(saved.program.days[0].exercises,accepted.days[0].exercises);const planText=buildWeeklyPlanExport({state:deserializeState(saved)}).text,historyText=buildWorkoutExport({workout:history,completed:true}).text;
 assert.match(planText,/Reps not specified - Load not specified/);assert.match(historyText,/7 reps - 40 kg/);assert.doesNotMatch(planText,/7 reps|13 reps|40 kg/);
 await writeFile(`${out}/${prefix}-exports.json`,JSON.stringify({plan:planText,history:historyText},null,2));
 await page.getByRole('button',{name:/WORKOUT COMPLETE.*VIEW HISTORY/}).click();await page.locator('.completed-workout-detail').waitFor();await frames(page);
 await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().endTime!==Infinity).map(a=>a.finished.catch(()=>{}))));
 await page.locator('.completed-workout-detail .session-log-trigger').first().click();await page.locator('.session-log-item.is-expanded').scrollIntoViewIfNeeded();await frames(page);
 const loggedText=await page.locator('.completed-workout-detail .session-log-item.is-expanded').innerText();assert.match(loggedText,/40\s*kg/);assert.match(loggedText,/13/);
 assert.match(await page.locator('.completed-workout-detail').innerText(),/Bench Press/);await page.screenshot({path:`${out}/${prefix}-history.png`});await c.close();
 c=await open(t);await preview('Monday: Upper\nBench Press 60kg\nY Balance Reach – 2 kroga');const root=page.locator('.import-resolution'),a=()=>root.locator('.import-decision-content:visible');await root.waitFor();
 assert.match(await a().locator('.import-group-source').innerText(),/Bench Press 60kg/);assert.equal(await a().locator('input').count(),1);const sets=a().getByLabel('Reviewed Sets',{exact:true});
 await page.evaluate(()=>{window.__vv=(height,offsetTop=0)=>{for(const[k,v]of Object.entries({height,offsetTop,scale:1}))Object.defineProperty(visualViewport,k,{configurable:true,value:v});visualViewport.dispatchEvent(new Event('resize'));};});
 await sets.focus();await page.evaluate(()=>__vv(420,60));await frames(page);await sets.fill('3');await frames(page);
 const box=await sets.boundingBox(),footer=await root.locator('footer').boundingBox();assert.ok(box.y>=60&&box.y+box.height<=footer.y,'focused field remains above footer');
 await page.screenshot({path:`${out}/${prefix}-keyboard.png`});await sets.press('Enter');await page.evaluate(()=>__vv(844));await root.locator('footer button.primary').click();
 await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();assert.equal(await root.count(),0);assert.match(await page.locator('body').innerText(),/2 rounds · Reps not specified/);
 await page.screenshot({path:`${out}/${prefix}-rounds.png`});await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await page.locator('.bottom-nav').waitFor();
 saved=await read(page);assert.deepEqual(saved.program.days[0].exercises.map(e=>e.sets.length),[3,2]);assert.deepEqual(saved.program.days[0].exercises[1].importedRoundPrescription,{count:2});assert.equal(saved.program.days[0].exercises[1].importPrescriptionCorrections,undefined);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));results.push({...t,result:'PASS',keyboard:'simulated visualViewport, not physical keyboard',carryForward:'manual future value retained',actual:[7,7,13],rounds:'direct import; source unit/count preserved'});await c.close();console.log('PASS',prefix);
}assert.deepEqual(errors,[]);}catch(error){if(page&&!page.isClosed()){await page.screenshot({path:`${out}/failure.png`});await writeFile(`${out}/failure.txt`,await page.locator('body').innerText());}throw error;}finally{await writeFile(`${out}/browser-results.json`,JSON.stringify({results,errors},null,2));await browser.close();}
