import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {sessionStructureKey,exerciseCatalog} from '../src/domain.js';
const dir=process.env.ROOK_CUSTOM_INPUTS_OUTPUT_DIR||'artifacts/ROOK-STABILITY-PASS',base=process.env.ROOK_QA_URL||'http://127.0.0.1:4173',results=[];
await mkdir(`${dir}/screenshots`,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const [text,days,avoid,expected] of [
 ['Push / Pull / Legs / Upper / Lower',5,'No jumping',['push','pull','legs','upper','lower']],
 ['Upper / Lower / Full Body',3,'Avoid overhead press',['upper','lower','full-body']],
 ['Push / Pull / Legs / Push / Pull',5,'',['push','pull','legs','push','pull']],
 ['Upper / Lower / Full Body',3,'No barbell squats','restriction'],
 ['Upper / Lower / Full Body',3,'Avoid deep knee flexion','restriction'],
]){
 const c=await browser.newContext({viewport:{width:days===5?320:390,height:844},serviceWorkers:'block'}),p=await c.newPage();
 await p.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));await p.route('**/api/ai',r=>r.fulfill({status:503,json:{error:'Offline QA'}}));await p.goto(base,{waitUntil:'networkidle'});
 await p.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();await p.getByRole('combobox',{name:'Age range'}).click();await p.getByRole('option',{name:'18–29'}).click();await p.getByRole('button',{name:'CONTINUE',exact:true}).click();
 await p.getByRole('button',{name:'Build muscle',exact:true}).click();await p.getByRole('button',{name:/^Beginner/}).click();await p.getByRole('button',{name:`${days} days`,exact:true}).click();await p.getByLabel('Any day works').check();await p.getByRole('button',{name:'60 min',exact:true}).click();await p.getByRole('button',{name:'CONTINUE',exact:true}).click();
 await p.getByRole('button',{name:'Commercial gym',exact:true}).click();await p.getByRole('button',{name:'CONTINUE',exact:true}).click();await p.getByRole('button',{name:'Balanced',exact:true}).click();await p.getByRole('button',{name:'CONTINUE',exact:true}).click();await p.getByRole('button',{name:/Balanced starting point/}).click();await p.getByRole('button',{name:'CONTINUE',exact:true}).click();
 await p.getByRole('button',{name:/I already have a preferred weekly structure/}).click();await p.getByRole('button',{name:'Other',exact:true}).click();await p.getByLabel('Other preferred split').fill(text);
 if(avoid){await p.getByRole('button',{name:/Add movements or exercises to avoid/}).click();await p.getByLabel('Restrictions or clinician limits').fill(avoid);}
 if(expected!=='split-conflict')await p.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();
 if(Array.isArray(expected)){
  await p.getByRole('heading',{name:'Your week is ready.',exact:true}).waitFor();await p.screenshot({path:`${dir}/screenshots/custom-${days}-review.png`});await p.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state'))?.profile.onboardingComplete);await p.reload({waitUntil:'networkidle'});
  const s=await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.deepEqual(s.program.days.map(sessionStructureKey),expected);assert.equal(s.profile.trainingPreferences,text);assert.equal(s.profile.avoid,avoid);
  const excludedPattern=avoid==='No jumping'?'power-lower':avoid==='Avoid overhead press'?'vertical-push':null;
  if(excludedPattern)for(const day of s.program.days)for(const ex of day.exercises)assert.notEqual(exerciseCatalog[ex.exerciseId].pattern,excludedPattern);
 }else{
  if(expected==='split-conflict'){await p.locator('#custom-split-error').waitFor();assert.equal(await p.getByRole('button',{name:'BUILD MY PLAN',exact:true}).isDisabled(),true);}else await p.getByRole('button',{name:/EDIT RESTRICTION|CLARIFY RESTRICTION/}).waitFor();
  assert.equal(await p.getByRole('button',{name:'USE THIS PLAN',exact:true}).count(),0);await p.screenshot({path:`${dir}/screenshots/custom-${results.length}-blocked.png`});
 }
 results.push({text,avoid,expected,passed:true});console.log(`PASS ${text} / ${avoid||'no restriction'}`);await c.close();
}}finally{await browser.close();await writeFile(`${dir}/custom-inputs-results.json`,JSON.stringify(results,null,2));}
