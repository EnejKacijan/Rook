import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const out='artifacts/SCRATCH-DRAFT-LIFECYCLE-REVIEW',base=process.env.ROOK_QA_URL||'http://127.0.0.1:4173';
await mkdir(`${out}/screenshots`,{recursive:true});await mkdir(`${out}/traces`,{recursive:true});
const diagnostic=await readFile('scripts/scratch-reentry-diagnostics.js','utf8');
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
let current;
try {for(const width of [320,390])for(const appearance of ['light','dark'])for(const style of ['standard','premium']){
 const key=`${width}-${appearance}-${style}`;if(process.env.ROOK_DRAFT_CASE&&!key.includes(process.env.ROOK_DRAFT_CASE))continue;
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:appearance==='dark'?'reduce':'no-preference'});
 await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));await context.addInitScript(diagnostic);
 const page=await context.newPage();current=page;page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(base);
 const b=name=>page.getByRole('button',{name,exact:true});
 await page.getByRole('button',{name:/Start from scratch/i}).click();for(const day of ['Mon','Wed','Fri'])await b(day).click();await b('CONTINUE').click();
 await page.evaluate(({appearance,style})=>Object.assign(document.documentElement.dataset,{appearance,style}),{appearance,style});
 const editor=page.locator('.scratch-editor-screen'),list=editor.locator('.plan-editor'),days=editor.locator('[data-reorder-workout-section]');
 const stable=await page.evaluate(()=>{window.originalScratch=document.querySelector('.scratch-editor-screen');window.originalList=document.querySelector('.plan-editor');return rookScratchTrace.sample();});
 const originalIds=await days.evaluateAll(ds=>ds.map(d=>d.dataset.dayId));
 const day=id=>editor.locator(`[data-reorder-workout-section][data-day-id="${id}"]`),a=day(originalIds[0]),z=day(originalIds[2]);
 const settle=()=>page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
 const form=()=>editor.evaluate(root=>({days:[...root.querySelectorAll('[data-reorder-workout-section]')].map(d=>({id:d.dataset.dayId,collapsed:d.classList.contains('is-collapsed'),name:d.querySelector('input[aria-label$="workout name"]')?.value,descriptor:d.querySelector('input[aria-label$="workout descriptor"]')?.value,exercises:[...d.querySelectorAll('.plan-editor-exercise')].map(e=>({id:e.id,expanded:e.querySelector('.plan-editor-summary')?.getAttribute('aria-expanded'),fields:[...e.querySelectorAll('input,textarea')].map(i=>[i.getAttribute('aria-label'),i.value])}))})),name:root.querySelector('[aria-label="Weekly plan name"]').value}));
 const retain=async before=>{
  await b('CONTINUE').click();await editor.waitFor({state:'visible'});await settle();
  assert.ok(await editor.evaluate(e=>e===window.originalScratch&&e.querySelector('.plan-editor')===window.originalList));
  assert.deepEqual(await form(),before);const sample=await page.evaluate(()=>rookScratchTrace.sample());
  assert.equal(sample.component.programKey,stable.component.programKey);assert.equal(sample.root.id,stable.root.id);
 };
 // Back with no edits does not create another empty draft either.
 const empty=await form();await b('Back to plan setup').click();assert.equal(await editor.isHidden(),true);await retain(empty);
 await editor.getByLabel('Weekly plan name').fill('My retained week');await a.getByRole('textbox',{name:/workout name$/}).fill('Retained upper');
 const add=async(d,name)=>{await d.getByRole('button',{name:/\+ Add (first )?exercise/i}).click();await d.getByPlaceholder('Search exercises',{exact:true}).fill(name);await d.getByRole('option',{name,exact:true}).click();};
 await add(a,'Bench Press');await add(a,'Seated Cable Row');await add(day(originalIds[1]),'Squat');await add(z,'Leg Curl');
 // Create custom content through the existing real picker/library path.
 await a.getByRole('button',{name:/\+ Add exercise/i}).click();await a.getByPlaceholder('Search exercises',{exact:true}).fill('QA retained custom press');
 await a.getByRole('button',{name:'Create custom exercise',exact:true}).click();const custom=page.locator('.custom-exercise-editor');await custom.waitFor();
 await custom.getByLabel('Exercise name',{exact:true}).fill('QA retained custom press');
 await custom.getByLabel('Exercise equipment',{exact:true}).selectOption('machines');await custom.getByLabel('Primary target muscle',{exact:true}).selectOption('Chest');
 await custom.getByLabel('Exercise notes',{exact:true}).fill('Seat 3 · controlled tempo');await custom.getByRole('button',{name:'CREATE & ADD',exact:true}).click();await custom.waitFor({state:'detached'});
 // The entry is initially collapsed; use its existing disclosure action.
 await a.locator('.plan-editor-exercise').first().locator('.plan-editor-summary').click();
 for(const [label,value]of [['Sets for Bench Press','4'],['Minimum reps for Bench Press','8'],['Maximum reps for Bench Press','10']]){const input=a.getByRole('textbox',{name:label,exact:true});await input.fill(value);await input.press('Enter');}
 await a.getByLabel('Starting weight for Bench Press in kg',{exact:true}).fill('60');
 const beforeExerciseOrder=await a.locator('.plan-editor-exercise').evaluateAll(es=>es.map(e=>e.id));
 await a.locator('.plan-exercise-drag-handle').first().focus();await page.keyboard.press('Alt+ArrowDown');
 await page.waitForFunction(({id,dayId})=>document.querySelector(`[data-day-id="${dayId}"] .plan-editor-exercise`)?.id!==id,{id:beforeExerciseOrder[0],dayId:originalIds[0]});
 await a.locator('.plan-workout-drag-surface').focus();await page.keyboard.press('Alt+ArrowDown');await settle();
 const reorderedIds=await days.evaluateAll(ds=>ds.map(d=>d.dataset.dayId));assert.deepEqual(reorderedIds,[originalIds[1],originalIds[0],originalIds[2]]);
 await z.getByRole('button',{name:/Workout options/}).click();await b('Collapse workout').click();await page.locator('.plan-workout-actions-sheet').waitFor({state:'detached'});
 const cdp=await context.newCDPSession(page),touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:x==null?[]:[{x,y}]});
 const cycles=[];
 for(let cycle=0;cycle<3;cycle++){
  await a.getByRole('textbox',{name:/workout name$/}).fill(`Retained upper ${cycle}`);await editor.locator('h1').click();await settle();const before=await form();
  if(cycle===2){await touch('touchStart',3,180);for(let i=1;i<=6;i++)await touch('touchMove',3+width*.56*i/6,181);await touch('touchEnd');}
  else await b('Back to plan setup').click();
  await page.locator('.scratch-plan-screen').waitFor();assert.equal(await editor.isHidden(),true);assert.equal(await editor.getAttribute('inert'),'');
  assert.equal(await page.locator('.scratch-plan-screen').getByLabel('Weekly plan name',{exact:true}).inputValue(),'My retained week');
  await retain(before);cycles.push({cycle,method:cycle===2?'edge':'header',programId:stable.component.programKey,rootId:stable.root.id,retained:true});
 }
 // Changing just the setup name is compatible; it must not rebuild workouts.
 await b('Back to plan setup').click();await page.locator('.scratch-plan-screen').getByLabel('Weekly plan name',{exact:true}).fill('Renamed retained week');await b('CONTINUE').click();await editor.waitFor({state:'visible'});
 assert.equal(await editor.getByLabel('Weekly plan name').inputValue(),'Renamed retained week');assert.deepEqual(await days.evaluateAll(ds=>ds.map(d=>d.dataset.dayId)),reorderedIds);
 // Structural discard must be explicit. Reject it, then restore the selection.
 await b('Back to plan setup').click();await b('Fri').click();let warned=false;page.once('dialog',async dialog=>{warned=true;assert.match(dialog.message(),/Discard your current draft edits/);await dialog.dismiss();});await b('CONTINUE').click();assert.equal(warned,true);assert.equal(await editor.isHidden(),true);
 await b('Fri').click();await b('CONTINUE').click();await editor.waitFor({state:'visible'});assert.ok(await editor.evaluate(e=>e===window.originalScratch));
 // Exiting setup is likewise protected; cancel leaves the session recoverable.
 await b('Back to plan setup').click();page.once('dialog',dialog=>dialog.dismiss());await b('Back to start').click();await page.locator('.scratch-plan-screen').waitFor();await b('CONTINUE').click();await editor.waitFor({state:'visible'});
 assert.deepEqual(await days.evaluateAll(ds=>ds.map(d=>d.dataset.dayId)),reorderedIds);assert.equal(await a.getByRole('textbox',{name:/workout name$/}).inputValue(),'Retained upper 2');
 await settle();if(style==='standard')await page.screenshot({path:`${out}/screenshots/${key}-retained.png`});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')||'null')?.program||null),null,'editing is not plan apply');
 await b('USE THIS PLAN').click();await editor.waitFor({state:'detached'});await page.reload({waitUntil:'networkidle'});
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state'))),plan=saved.program;
 assert.equal(plan.id,stable.component.programKey);assert.equal(plan.name,'Renamed retained week');assert.deepEqual(plan.days.map(d=>d.id),reorderedIds);
 const savedA=plan.days.find(d=>d.id===originalIds[0]);assert.equal(savedA.workoutName,'Retained upper 2');
 assert.deepEqual(savedA.exercises.map(e=>`import-exercise-${e.id}`),[beforeExerciseOrder[1],beforeExerciseOrder[0],beforeExerciseOrder[2]]);
 const savedBench=savedA.exercises[1];assert.equal(savedBench.sets.length,4);assert.equal(savedBench.repMin,8);assert.equal(savedBench.repMax,10);assert.ok(savedBench.sets.every(s=>s.weight===60));
 const customRecord=saved.customExercises.find(e=>e.name==='QA retained custom press');assert.equal(customRecord.notes,'Seat 3 · controlled tempo');assert.equal(savedA.exercises[2].exerciseId,customRecord.id);
 assert.equal(saved.profile.onboardingComplete,true);assert.deepEqual(errors,[]);results.push({key,passed:true,cycles,programId:plan.id,dayIds:reorderedIds,exerciseIds:savedA.exercises.map(e=>e.id),customNote:customRecord.notes,saveReload:true});
 console.log(`PASS ${key}: stable draft/editor, contents, guards, save/reload`);await context.close();
 }}catch(error){await current?.screenshot({path:`${out}/screenshots/failure.png`}).catch(()=>{});console.error(await current?.locator('body').innerText().catch(()=>''));throw error;}
finally{await browser.close();await writeFile(`${out}/lifecycle-results${process.env.ROOK_DRAFT_CASE?'-'+process.env.ROOK_DRAFT_CASE:''}.json`,JSON.stringify(results,null,2));}
console.log(`PASS ${results.length} Scratch draft lifecycle cases`);
