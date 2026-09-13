import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { onboardingSplitOptions, TRAINING_STRUCTURES } from '../src/splitPreferences.js';
import { buildProgram, sessionStructureKey, exerciseCatalog } from '../src/domain.js';
import { customFocusSatisfied } from '../src/customTrainingStructure.js';

const base=process.env.ROOK_QA_URL||'http://127.0.0.1:4173',dir='artifacts/ROOK-SPLIT-RESEARCH',results=[];
const examples=[
  ['Horizontal push + horizontal pull / Squat + hip hinge / Vertical push + vertical pull',3],
  ['Chest + front delts / Back + rear delts / Legs / Side delts + arms',4],
  ['Pecs + triceps / Back + bicep / Quadriceps + calf / Deltoids + arms / Total body',5],
  ['Total-body',2], ['Chest / Back / Legs / Deltoids / Arms / Core',6],
  ['Gluteals + hamstring / Pecs + tricep / Back + bicep / Quad + abs',4],
  ['Bro split',5], ['Upper body / Lower body / Total body',3],
];
const matrix=[320,390].flatMap(width=>['light','dark'].flatMap(appearance=>['standard','premium'].map(style=>({width,appearance,style}))));
const cases=matrix.map((visual,i)=>({...visual,text:examples[i][0],days:examples[i][1],avoid:i===0?'No jumping':null}));
cases.push({width:390,appearance:'dark',style:'standard',days:3,text:examples[0][0],home:true});
cases.push({width:320,appearance:'light',style:'premium',days:3,text:examples[7][0],reviewRestriction:true});
await mkdir(`${dir}/screenshots`,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
let activePage;
try{for(const [i,test]of cases.entries()){
  if(process.env.ROOK_SPLIT_CASE!=null && i!==Number(process.env.ROOK_SPLIT_CASE))continue;
  const context=await browser.newContext({viewport:{width:test.width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:i===7?'reduce':'no-preference'});
  const page=await context.newPage(),errors=[],aiRequests=[];page.setDefaultTimeout(15000);
  activePage=page;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
  await page.route('**/api/ai',r=>{aiRequests.push(r.request().url());return r.fulfill({status:503,json:{error:'Offline QA'}});});
  await page.goto(base,{waitUntil:'networkidle'});
  const button=name=>page.getByRole('button',{name,exact:true});
  const capture=async name=>{
    await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
    await page.screenshot({path:`${dir}/screenshots/${i}-${name}.png`});
  };
  await button('BUILD MY PLAN').click();await page.getByRole('combobox',{name:'Age range'}).click();
  await page.getByRole('option',{name:'18–29'}).click();await button('CONTINUE').click();
  await button('Build muscle').click();
  // Existing auto-advance choices intentionally suppress 350ms double-tap
  // bursts across Goal/Experience. Respect that guard, including reduced
  // motion; this is unrelated to Other and is not a parser readiness delay.
  const choiceAt=await page.evaluate(()=>performance.now());
  await page.waitForFunction(start=>performance.now()-start>=350,choiceAt);
  await page.getByRole('button',{name:/^Beginner/}).click();
  await button(`${test.days} days`).click();await page.getByLabel('Any day works').check();
  await button('60 min').click();await button('CONTINUE').click();
  await button(test.home?'Home gym':'Commercial gym').click();
  if(test.home)await page.getByRole('button',{name:'Bodyweight only',exact:true}).click();
  await button('CONTINUE').click();await button('Balanced').click();await button('CONTINUE').click();
  await page.getByRole('button',{name:/Balanced starting point/}).click();await button('CONTINUE').click();
  await page.getByRole('button',{name:/I already have a preferred weekly structure/}).click();await button('Other').click();
  await page.evaluate(({appearance,style})=>{document.documentElement.dataset.appearance=appearance;document.documentElement.dataset.style=style;},test);
  const input=page.getByLabel('Other preferred split'),build=button('BUILD MY PLAN'),error=page.locator('#custom-split-error');
  const labels=onboardingSplitOptions(test.days).filter(o=>TRAINING_STRUCTURES[o.id]).map(o=>o.label);
  if(!test.home)for(const label of labels){await input.fill(label);assert.equal(await build.isEnabled(),true,label);assert.equal(await error.count(),0);}
  const invalid=[['Anterior / Posterior',/vary/],['Upper strength / Lower strength',/intensity/],['Quantum split',/recognize/],['Chest / Back / Legs / Legs / Legs / Legs / Legs',/7 workout/]];
  for(const [text,copy]of invalid){
    await input.fill(text);assert.equal(await build.isDisabled(),true);assert.equal(await input.inputValue(),text);
    assert.match(await error.innerText(),copy);assert.equal(await input.getAttribute('aria-describedby'),'custom-split-error');
    assert.equal(await error.getAttribute('role'),'alert');
    assert.equal(await error.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
  }
  await input.fill('Anterior / Posterior');await input.scrollIntoViewIfNeeded();await capture('clarification');
  await page.getByRole('button',{name:'Back',exact:true}).last().click();await button('CONTINUE').click();
  assert.equal(await input.inputValue(),'Anterior / Posterior');assert.equal(await build.isDisabled(),true);
  const started=performance.now();await input.fill(test.text);const fillMs=performance.now()-started;
  assert.equal(await input.inputValue(),test.text);
  if(test.home){
    assert.equal(await build.isDisabled(),true);assert.match(await error.innerText(),/equipment/);
    await input.scrollIntoViewIfNeeded();await capture('equipment-conflict');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')||'null')?.program||null),null);
    results.push({...test,passed:true,equipmentBlocked:true,rawRetained:true,fillMs});await context.close();continue;
  }
  assert.equal(await build.isEnabled(),true);assert.equal(await error.count(),0);
  if(test.avoid||test.reviewRestriction){
    await page.getByRole('button',{name:/Add movements or exercises to avoid/}).click();
    await page.getByLabel('Restrictions or clinician limits').fill(test.avoid||'Avoid deep knee flexion');
    assert.equal(await error.count(),0,'restriction clarification must not become split error');
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await input.scrollIntoViewIfNeeded();await capture('accepted');
  await build.click();
  if(test.reviewRestriction){
    await page.getByText('NEEDS A CLOSER CHECK',{exact:true}).waitFor();
    await button('EDIT RESTRICTION').waitFor();
    assert.equal(await error.count(),0);
    assert.equal(await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).count(),0);
    await capture('separate-restriction-gate');
    results.push({...test,passed:true,separateRestrictionGate:true,rawRetained:true,fillMs});await context.close();continue;
  }
  await page.getByRole('heading',{name:'Your week is ready.',exact:true}).waitFor();await capture('preview');
  await button('USE THIS PLAN').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state'))?.profile.onboardingComplete);
  await page.reload({waitUntil:'networkidle'});
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  assert.equal(saved.profile.trainingPreferences,test.text);assert.equal(saved.profile.trainingSplitChoice,'other');
  assert.equal(saved.program.days.length,test.days);
  const expected=buildProgram(saved.profile);
  assert.deepEqual(saved.program.days.map(sessionStructureKey),expected.days.map(sessionStructureKey));
  assert.deepEqual(saved.program.days.map(d=>d.name),expected.days.map(d=>d.name));
  for(const day of saved.program.days)if(day.customFocus)assert.ok(customFocusSatisfied(day.customFocus,day.exercises.map(e=>exerciseCatalog[e.exerciseId])));
  if(test.avoid)assert.equal(saved.profile.avoid,test.avoid);
  assert.deepEqual(aiRequests,[],'Other must not call AI');assert.deepEqual(errors,[]);
  results.push({...test,passed:true,labelsChecked:labels,rawRetained:true,reloaded:true,fillMs,sequence:saved.program.days.map(sessionStructureKey)});
  console.log(`PASS ${i}: ${test.width} ${test.appearance} ${test.style} ${test.text}`);await context.close();
}}catch(error){
  await activePage?.screenshot({path:`${dir}/screenshots/browser-failure.png`}).catch(()=>{});
  console.error(await activePage?.locator('body').innerText().catch(()=>''));throw error;
}finally{await browser.close();await writeFile(`${dir}/browser-results${process.env.ROOK_SPLIT_CASE==null?'':`-${process.env.ROOK_SPLIT_CASE}`}.json`,JSON.stringify(results,null,2));}
console.log(`PASS ${results.length} real onboarding scenarios`);
