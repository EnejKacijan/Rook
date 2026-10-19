import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {sessionStructureKey,exerciseCatalog} from '../src/domain.js';
import {customFocusSatisfied} from '../src/customTrainingStructure.js';
import {otherStructureClarification} from '../src/splitPreferences.js';

const base=process.env.ROOK_QA_URL||'http://127.0.0.1:4173',phase=process.env.ROOK_SPLIT_PHASE||'after';
const ux=process.env.ROOK_SPLIT_UX_ONLY==='1';
const generic=process.env.ROOK_SPLIT_GENERIC==='1';
const dir=process.env.ROOK_SPLIT_OUTPUT_DIR||'artifacts/ROOK-STABILITY-PASS/owner-split-followup',results=[];
await mkdir(dir,{recursive:true});
const matrix=[320,390].flatMap(width=>['light','dark'].flatMap(appearance=>['standard','premium'].map(style=>['push / pull / legs + Arnold split',5,width,null,appearance,style])));
const cases=generic?[...matrix,
 ['Back+biceps, Chest+triceps, Legs, Upper, Full body',5,320,['back-biceps','chest-triceps','legs','upper','full-body']],
 ['1. Quads + hamstrings\n2. Chest & core\n3. Back and biceps',3,390,['quads-hamstrings','chest-core','back-biceps']],
 ['Mon: Upper\nTue: Lower\nThu: Upper\nSat: Lower',4,320,['upper','lower','upper','lower']],
 ['Chest / Back / Legs / Shoulders / Arms / Core',6,390,['chest','back','legs','shoulders','arms','core']],
]:ux?matrix:phase==='before'?[['push pull legs + arnold split',5,320,'before']]:[
 ['push pull legs + arnold split',5,320,null],['PPL + Arnold',5,390,null],
 ['bodybuilding split I used with my coach',5,390,null],['push pull legs push pull',5,320,['push','pull','legs','push','pull']],
 ['upper / lower / upper / lower',5,390,null],
 ['push pull legs upper lower',5,320,['push','pull','legs','upper','lower']],
 ['Push / Pull / Legs / Upper / Lower',5,390,['push','pull','legs','upper','lower']],
 ['PPLUL',5,390,['push','pull','legs','upper','lower']],
 ['upper lower full body',3,320,['upper','lower','full-body']],
 ['chest back / shoulders arms / legs',3,390,['chest-back','shoulders-arms','legs']],
 ['upper / lower / upper / lower',4,390,['upper','lower','upper','lower']],
];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const [text,days,width,expected,appearance='light',style='standard']of cases){
 const c=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'}),p=await c.newPage(),errors=[];
 p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));await p.route('**/api/ai',r=>r.fulfill({status:503,json:{error:'Offline QA'}}));await p.goto(base,{waitUntil:'networkidle'});
 await p.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();await p.getByRole('combobox',{name:'Age range'}).click();await p.getByRole('option',{name:'18–29'}).click();await p.getByRole('button',{name:'CONTINUE',exact:true}).click();
 await p.getByRole('button',{name:'Build muscle',exact:true}).click();await p.getByRole('button',{name:/^Beginner/}).click();await p.getByRole('button',{name:`${days} days`,exact:true}).click();await p.getByLabel('Any day works').check();await p.getByRole('button',{name:'60 min',exact:true}).click();await p.getByRole('button',{name:'CONTINUE',exact:true}).click();
 await p.getByRole('button',{name:'Commercial gym',exact:true}).click();await p.getByRole('button',{name:'CONTINUE',exact:true}).click();
 await p.getByText('Optional. Choose up to two areas to emphasize, or keep the plan balanced.',{exact:true}).waitFor();
 if(!results.length)await p.screenshot({path:`${dir}/${phase}-emphasis-${width}.png`});
 await p.getByRole('button',{name:'Balanced',exact:true}).click();await p.getByRole('button',{name:'CONTINUE',exact:true}).click();await p.getByRole('button',{name:/Balanced starting point/}).click();await p.getByRole('button',{name:'CONTINUE',exact:true}).click();
 await p.getByRole('button',{name:/I already have a preferred weekly structure/}).click();await p.getByRole('button',{name:'Other',exact:true}).click();const input=p.getByLabel('Other preferred split');await input.fill(text);
 await p.evaluate(({appearance,style})=>{document.documentElement.dataset.appearance=appearance;document.documentElement.dataset.style=style;},{appearance,style});
 if(Array.isArray(expected)){await p.getByRole('button',{name:/Add movements or exercises to avoid/}).click();await p.getByLabel('Restrictions or clinician limits').fill('No jumping');}
 const build=p.getByRole('button',{name:'BUILD MY PLAN',exact:true});
 if(expected!==null)await build.click();
 if(expected===null){
  await p.locator('#custom-split-error').waitFor();assert.equal(await input.inputValue(),text);assert.equal(await input.getAttribute('aria-invalid'),'true');
  assert.equal(await p.getByRole('button',{name:'USE THIS PLAN',exact:true}).count(),0);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')||'null')?.program||null),null);
  await input.scrollIntoViewIfNeeded();await build.scrollIntoViewIfNeeded();await p.screenshot({path:`${dir}/blocked-${results.length}-${width}.png`});
  assert.equal(await build.isDisabled(),true);assert.equal(await input.inputValue(),text);
  const error=p.locator('#custom-split-error');assert.equal(await input.getAttribute('aria-describedby'),'custom-split-error');assert.equal(await error.getAttribute('role'),'alert');
  assert.equal((await error.innerText()).replace(/\s+/g,' '),otherStructureClarification(text,days).message);
  const invalidStyle=await input.evaluate(e=>({background:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderColor,height:e.getBoundingClientRect().height}));
  const errorStyle=await error.evaluate(e=>({background:getComputedStyle(e).backgroundColor,padding:getComputedStyle(e).padding,card:e.classList.contains('offline-banner')}));
  assert.equal(errorStyle.card,false);assert.equal(errorStyle.background,'rgba(0, 0, 0, 0)');assert.equal(errorStyle.padding,'0px');assert.ok(invalidStyle.height<=92,'two-line invalid text must not create a large textarea');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  let borderEvidence;
  if(generic){
   await input.focus();
   // Reproduce the old OUTER outline in this isolated browser only. No source
   // reversion, shared browser state, or owner data is involved.
   const measure=()=>input.evaluate(e=>{
    const css=getComputedStyle(e),r=e.getBoundingClientRect(),out=Math.max(0,parseFloat(css.outlineWidth)+parseFloat(css.outlineOffset));
    const clips=[];for(let a=e.parentElement;a;a=a.parentElement){const s=getComputedStyle(a),b=a.getBoundingClientRect();if(['hidden','clip','auto','scroll'].includes(s.overflowX))clips.push({className:a.className,overflow:s.overflowX,left:r.left-out<b.left,right:r.right+out>b.right});}
    return {outlineWidth:css.outlineWidth,outlineOffset:css.outlineOffset,borderRadius:css.borderRadius,focusVisible:e.matches(':focus-visible'),clips};
   });
   await input.evaluate(e=>e.style.setProperty('outline-offset','2px','important'));
   const before=await measure();assert.ok(before.clips.some(c=>c.left||c.right),'old external ring intersects clipping ancestor');
   await p.screenshot({path:`${dir}/border-before-${width}-${appearance}-${style}.png`});
   await input.evaluate(e=>e.style.removeProperty('outline-offset'));
   const after=await measure();assert.equal(after.focusVisible,true);assert.ok(parseFloat(after.outlineOffset)+parseFloat(after.outlineWidth)<=0,'entire focus outline is inset');
   assert.ok(after.clips.every(c=>!c.left&&!c.right));
   await p.screenshot({path:`${dir}/border-after-${width}-${appearance}-${style}.png`});
   await p.keyboard.press('Tab'); // Keyboard focus, not touch-mode focus without a ring.
   const option=p.getByRole('button',{name:'Other',exact:true});await option.focus();assert.ok(await option.evaluate(e=>e.matches(':focus-visible')&&parseFloat(getComputedStyle(e).outlineWidth)+parseFloat(getComputedStyle(e).outlineOffset)<=0));
   const segment=p.locator('.exercise-preference-options button').first();await segment.focus();
   assert.ok(await segment.evaluate(e=>parseFloat(getComputedStyle(e).outlineWidth)+parseFloat(getComputedStyle(e).outlineOffset)<=0));
   await p.screenshot({path:`${dir}/segment-focus-${width}-${appearance}-${style}.png`});
   borderEvidence={before,after,selectedAndSegmentFocusInset:true};
  }
  // Correction is reflected synchronously with the input event, no submit,
  // blur, timer or second request is needed to re-enable the native button.
  await input.fill('push / pull / legs / upper / lower');assert.equal(await build.isEnabled(),true);assert.equal(await error.count(),0);assert.equal(await input.getAttribute('aria-invalid'),'false');
  assert.equal(await input.evaluate(e=>getComputedStyle(e).backgroundColor),invalidStyle.background,'error must not tint the normal field surface');
  await input.fill(text);assert.equal(await build.isDisabled(),true);
  await input.fill(Array.from({length:8},(_,i)=>`Focus ${i+1}`).join('\n'));assert.ok(await input.evaluate(e=>e.getBoundingClientRect().height<=144&&e.scrollHeight>e.clientHeight));assert.equal(await input.inputValue(),Array.from({length:8},(_,i)=>`Focus ${i+1}`).join('\n'));
  await input.fill(text);
  await p.getByRole('button',{name:'Back',exact:true}).last().click();await p.getByRole('button',{name:'CONTINUE',exact:true}).click();assert.equal(await input.inputValue(),text);
  if(text==='upper / lower / upper / lower'){
   for(let i=0;i<4;i++)await p.getByRole('button',{name:'Back',exact:true}).last().click();
   await p.getByRole('button',{name:'4 days',exact:true}).click();
   for(let i=0;i<4;i++)await p.getByRole('button',{name:'CONTINUE',exact:true}).click();
   assert.equal(await input.inputValue(),text,'changing day count must not erase Other');
   await p.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();await p.getByRole('heading',{name:'Your week is ready.',exact:true}).waitFor();
  }
  if(!results.length||ux||generic){
   // Fix the input in-place; retry must use this correction, never a stale build profile.
   const correction=generic?'Push / Pull / Legs / Chest Back / Shoulders Arms':'push pull legs upper lower';
   const correctedSequence=generic?['push','pull','legs','chest-back','shoulders-arms']:['push','pull','legs','upper','lower'];
   await input.fill(correction);assert.equal(await build.isEnabled(),true);assert.equal(await error.count(),0);
   if(generic)await p.screenshot({path:`${dir}/valid-${width}-${appearance}-${style}.png`});
   await p.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();await p.getByRole('heading',{name:'Your week is ready.',exact:true}).waitFor();
   if(generic){assert.equal(await p.locator('.personalization-summary').getByText('Custom weekly structure',{exact:true}).count(),1);await p.screenshot({path:`${dir}/generated-${width}-${appearance}-${style}.png`});}
   await p.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state'))?.profile.onboardingComplete);await p.reload({waitUntil:'networkidle'});
   const s=await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.equal(s.profile.trainingPreferences,correction);assert.equal(s.profile.trainingSplitChoice,'other');assert.deepEqual(s.program.days.map(sessionStructureKey),correctedSequence);
   if(generic)for(const d of s.program.days)assert.ok(customFocusSatisfied(d.customFocus,d.exercises.map(e=>exerciseCatalog[e.exerciseId])),'generated exercises preserve each focus after reload');
  }
  results.push({text,days,width,appearance,style,blocked:true,rawRetained:true,retrySafe:true,backForwardRetained:true,clarifiedAndSaved:results.length===0||ux||generic,invalidStyle,errorStyle,liveDisabledVerified:true,borderEvidence});
 }else{
  await p.getByRole('heading',{name:'Your week is ready.',exact:true}).waitFor();await p.screenshot({path:`${dir}/${phase}-review-${results.length}-${width}.png`});await p.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state'))?.profile.onboardingComplete);await p.reload({waitUntil:'networkidle'});
  const s=await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state'))),sequence=s.program.days.map(sessionStructureKey);
  assert.equal(s.profile.trainingPreferences,text);
  if(phase==='after'){assert.deepEqual(sequence,expected);assert.equal(s.profile.trainingSplitChoice,'other');assert.equal(s.profile.avoid,'No jumping');for(const d of s.program.days)for(const ex of d.exercises)assert.notEqual(exerciseCatalog[ex.exerciseId].pattern,'power-lower');}
  if(generic)for(const d of s.program.days)assert.ok(customFocusSatisfied(d.customFocus,d.exercises.map(e=>exerciseCatalog[e.exerciseId])));
  else assert.deepEqual(sequence,['push','pull','legs','upper','lower']);
  results.push({text,days,width,sequence,raw:s.profile.trainingPreferences,choice:s.profile.trainingSplitChoice||null,passed:phase==='after',confirmedBeforeDefect:phase==='before'});
 }
 assert.deepEqual(errors,[]);console.log(`${phase==='before'?'REPRODUCED':'PASS'} ${text}`);await c.close();
}}finally{await browser.close();await writeFile(`${dir}/${phase}-results.json`,JSON.stringify(results,null,2));}
