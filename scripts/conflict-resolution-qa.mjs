import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { compatibleReplacementCandidates, isoDay, weekday } from '../src/domain.js';

const root='artifacts/conflict-resolution/states';await mkdir(root,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
try {
 for(const width of [320,390]) for(const appearance of ['light','dark']) for(const style of ['standard','premium']) for(const scenario of (process.env.ROOK_QA_EFFORT_ONLY ? ['effort'] : ['effort','empty','search'])) {
  const state=createReturningUserFixture(3);state.activeWorkout=null;state.workouts=[];
  state.program.rotationStartDate=null;
  Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
  const day=state.program.days.at(-1);
  state.program.days=[day];state.profile.daysPerWeek=1;
  day.weekday=weekday();state.selectedDate=isoDay();state.selectedDay=weekday();
  const target=day.exercises[0];Object.assign(target,{exerciseId:'leg-press',importedName:'Leg Press',originalImportedName:'Leg Press',targetRir:0});
  day.exercises=[target];state.program.source='manual';state.profile.availableDays=state.program.days.map(item=>item.weekday);
  const names=scenario==='empty'?[...new Set(['Leg Press',...compatibleReplacementCandidates(target,state.profile,[]).map(item=>item.name),...compatibleReplacementCandidates(target,{...state.profile,equipment:['bodyweight']},[]).map(item=>item.name)])]:['Leg Press'];
  const text=scenario==='effort'?'Keep Leg Press at 3 RIR':`Avoid ${names.join(', ')}`;
  state.profile.avoid=text;state.profile.trainingSafetyAnalysis={sourceText:text,analysis:{schemaVersion:2,findings:names.map(name=>({kind:scenario==='effort'?'exercise_effort_limit':'explicit_avoidance',confidence:0.99,targetText:name,minimumRir:scenario==='effort'?3:null,allowedBodyRegion:null,evidence:[{quote:name,start:text.indexOf(name),end:text.indexOf(name)+name.length}]})),unresolved:[]}};
  const context=await browser.newContext({viewport:{width,height:844},colorScheme:appearance,serviceWorkers:'block'});
  await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
  await page.goto('http://127.0.0.1:4173');
  await page.waitForTimeout(500);
  if(!await page.getByRole('button',{name:'TODAY',exact:true}).count()) throw new Error(JSON.stringify({errors,body:await page.locator('body').innerText()}));
  await page.getByRole('button',{name:'TODAY',exact:true}).click();
  await page.getByRole('button',{name:'REVIEW CONFLICT',exact:true}).click();
  await page.waitForFunction(id=>document.activeElement?.id===`import-exercise-${id}`,target.id);
  const card=page.locator(`[id="import-exercise-${target.id}"]`);
  assert.equal(await card.getByRole('spinbutton').count(),0);
  assert.equal(await card.getByRole('button',{name:'CREATE SUPERSET',exact:true}).count(),0);
  const shot=async suffix=>{
   await page.evaluate(async()=>{
    await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   });
   await page.screenshot({path:`${root}/${width}-${style}-${appearance}-${scenario}-${suffix}.png`,animations:'disabled'});
  };
  await shot('initial');
  // Once loaded, all conflict resolution must remain local/offline.
  await context.setOffline(true);
  if(scenario==='effort') {
   const selector=card.getByRole('combobox',{name:'Target RIR'});assert.deepEqual(await selector.locator('option').allTextContents(),['Choose RIR','3 RIR','4 RIR']);
   assert.equal(await card.getByRole('button',{name:'CHOOSE REPLACEMENT',exact:true}).count(),0);
   assert.equal(await selector.inputValue(),'');
   assert.equal(await page.getByRole('button',{name:'APPLY EFFORT',exact:true}).count(),0);
   await selector.selectOption('4');
   await page.waitForFunction(()=>!document.querySelector('.safety-review-required'));
   assert.equal(await card.getByRole('spinbutton').count(),3);
   const prior=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.equal(prior.program.days.at(-1).exercises[0].targetRir,0);
   await shot('draft');
   await page.getByRole('button',{name:'Close edit plan',exact:true}).click();
   await page.locator('.edit-plan-screen').waitFor({state:'detached'});
   assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')))).program.days.at(-1).exercises[0].targetRir,0,'close does not persist draft');
   await page.getByRole('button',{name:'REVIEW CONFLICT',exact:true}).click();
   await card.getByRole('combobox',{name:'Target RIR'}).waitFor();
   assert.equal(await card.getByRole('combobox',{name:'Target RIR'}).inputValue(),'','reopening discarded draft still requires a choice');
   await card.getByRole('combobox',{name:'Target RIR'}).selectOption('3');
   await page.waitForFunction(()=>!document.querySelector('.safety-review-required'));
   await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('QA storage failure','QuotaExceededError');};});
   await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'Changes can’t be saved'}).waitFor();
   assert.deepEqual((await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')))).program,prior.program,'failed save leaves persisted plan unchanged');
   await shot('save-error');
   await context.setOffline(false);await page.reload();
   await page.getByRole('button',{name:'REVIEW CONFLICT',exact:true}).click();
   await card.getByRole('combobox',{name:'Target RIR'}).selectOption('4');
   await context.setOffline(true);
   await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();
   await page.locator('.edit-plan-screen').waitFor({state:'detached'});
   const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.equal(saved.program.days.at(-1).exercises[0].targetRir,4);assert.equal(saved.program.days.at(-1).exercises[0].exerciseId,'leg-press');
   await page.getByRole('button',{name:'START WORKOUT',exact:true}).waitFor();await shot('saved-offline');
   await context.setOffline(false);await page.reload();await page.getByRole('button',{name:'START WORKOUT',exact:true}).waitFor();
  } else {
   await card.getByRole('button',{name:'CHOOSE REPLACEMENT',exact:true}).click();
   if(scenario==='empty') {
    await card.getByText('No matching replacement found',{exact:true}).waitFor();assert.equal(await card.getByRole('option').count(),0);
    assert.equal(await card.getByRole('button',{name:'REMOVE EXERCISE',exact:true}).isDisabled(),true);await shot('no-replacement');
   } else {
    const names=await card.getByRole('option').allTextContents();assert.ok(names.length>0);assert.ok(!names.some(name=>/ab wheel/i.test(name)));
    await card.getByRole('button',{name:'SEARCH OTHER EXERCISES',exact:true}).click();
    await card.getByRole('listbox',{name:'Other exercises',exact:true}).waitFor();
    assert.ok(!(await card.getByRole('option').allTextContents()).includes('Leg Press'));
    await card.getByRole('searchbox').fill('Ab Wheel');
    assert.ok((await card.getByRole('option').allTextContents()).some(name=>/ab wheel/i.test(name)));
    await shot('broader-search');
    await card.getByRole('button',{name:'SHOW SIMILAR EXERCISES',exact:true}).click();
    const search=card.getByRole('searchbox');await search.fill('zzzz-no-compatible-match');await card.getByText('No similar exercises match your search.',{exact:true}).waitFor();await shot('no-search-match');
    await card.getByRole('button',{name:'Clear search',exact:true}).click();assert.deepEqual(await card.getByRole('option').allTextContents(),names);
    await card.getByRole('option').first().click();await page.waitForFunction(()=>!document.querySelector('.safety-review-required'));
    await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('QA storage failure','QuotaExceededError');};});
    await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();await page.getByRole('alert').filter({hasText:'Changes can’t be saved'}).waitFor();
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.equal(stored.program.days.at(-1).exercises[0].exerciseId,'leg-press');await shot('storage-failure');
   }
  }
  assert.deepEqual(errors,[]);results.push({width,appearance,style,scenario,pass:true});console.log(JSON.stringify(results.at(-1)));await context.close();
 }
 await writeFile(`${root}/RESULTS.json`,JSON.stringify(results,null,2));
} finally {await browser.close();}
