import {openFirstRunLanding} from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {importResolutionNotes} from '../src/importResolutionFixture.js';
const out=process.env.ROOK_PROGRESS_QA?'artifacts/import-step-progress':'artifacts/import-decisions';await mkdir(out,{recursive:true});
const progressStyle=page=>page.locator('.step-progress').evaluate(el=>{const line=getComputedStyle(el.querySelector('.progress-line')),fill=getComputedStyle(el.querySelector('.progress-line span')),text=getComputedStyle(el.querySelector('.step-count'));return {height:line.height,radius:line.borderRadius,track:line.backgroundColor,fill:fill.backgroundColor,margin:line.marginTop,font:text.fontFamily,size:text.fontSize,color:text.color,gap:text.marginTop,align:text.textAlign,transition:fill.transitionDuration,easing:fill.transitionTimingFunction};});
const browser=await chromium.launch({channel: 'chrome',headless:true});
async function open(width,appearance,style,notes){
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
 // A persisted incomplete profile now correctly resumes its questionnaire.
 // This tests first-run Import: start genuinely fresh, not with a resume draft.
 await context.addInitScript(()=>{window.qaWrites=0;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='lift-v2-state'&&JSON.parse(value).program)window.qaWrites++;return original.call(this,key,value);};});
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173');
 await page.evaluate(({appearance,style})=>{document.documentElement.dataset.appearance=appearance;document.documentElement.dataset.style=style;},{appearance,style});
 let onboardingStyle;
 if(process.env.ROOK_PROGRESS_QA){await page.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();onboardingStyle=await progressStyle(page);assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuetext'),'Step 1 of 8');await page.waitForTimeout(250);await page.screenshot({path:`${out}/${width}-${style}-${appearance}-onboarding.png`});await page.emulateMedia({reducedMotion:'reduce'});assert.equal((await progressStyle(page)).transition,'0.08s');await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('http://127.0.0.1:4173');}
 await openFirstRunLanding(page); await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(notes);await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();return {page,context,onboardingStyle};
}
try{
 for(const [width,appearance,style] of [[390,'light','standard'],[320,'dark','standard'],[390,'light','premium'],[390,'dark','premium'],[320,'light','standard'],[320,'light','premium'],[320,'dark','premium'],[390,'dark','standard']]){
  const {page,context,onboardingStyle}=await open(width,appearance,style,importResolutionNotes),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const active=page.locator('.import-decision-content:visible'),footer=page.locator('.import-resolution .sheet-action-footer'),next=footer.locator('button.primary'),back=page.getByRole('button',{name:'Back',exact:true});
  const shot=async name=>{await page.waitForTimeout(250);await page.screenshot({path:`${out}/${width}-${style}-${appearance}-${name}.png`});};
  await active.waitFor();assert.equal(await active.count(),1);assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuetext'),'Step 1 of 2','Leg Press prescription and ambiguous Ravnotežje identity require decisions');assert.equal(await back.count(),1);assert.equal(await next.isDisabled(),true);await shot('01-leg-press');
  await active.getByRole('button',{name:/Leg Press · 3 × 9 · 155 kg/}).click();assert.equal(await active.locator('[aria-pressed="true"]').count(),1);await shot('02-selected');
  await next.click();await active.getByRole('heading',{name:'Ravnotežje',exact:true}).waitFor();await active.getByPlaceholder('Search exercises',{exact:true}).fill('BOSU Balance');await active.getByRole('button',{name:'BOSU Balance',exact:true}).click();await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();
  await page.getByRole('button',{name:'Review exercise matches · Optional',exact:true}).click();
  await active.getByRole('heading',{name:'Overhead Extension',exact:true}).waitFor();
  assert.equal(await active.getByLabel('Reviewed Min reps',{exact:true}).count(),0,'A voluntary identity match does not ask for an already known prescription');
  await footer.getByRole('button',{name:'KEEP ORIGINAL',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.qaWrites),0);
  await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).evaluate(e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:2})));assert.equal(await page.evaluate(()=>window.qaWrites),0);assert.equal(await page.locator('.plan-import-choice').count(),0);await shot('07-review');await page.waitForTimeout(150);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await page.locator('.bottom-nav').waitFor();assert.equal(await page.evaluate(()=>window.qaWrites),1);const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.equal(saved.program.days.length,5);assert.equal(saved.program.days.flatMap(day=>day.exercises).length,41);assert.equal(saved.customExercises.length,0,'Keep original preserves the imported entry without creating a library exercise');assert.ok(saved.program.days.flatMap(day=>day.exercises).some(ex=>ex.originalImportedName==='Overhead Extension'||ex.importedName==='Overhead Extension'));const y=saved.program.days.flatMap(day=>day.exercises).find(ex=>ex.importedName==='Y Balance Reach');assert.equal(y.repMin,null);assert.equal(y.repMax,null);assert.equal(y.sets.length,2,'two rounds survive without invented reps');const preserved=saved.program.importMetadata.sourceNotes.map(note=>note.text).join('\n');for(const sourceLine of importResolutionNotes.split('\n').filter(line=>line.trim()))assert.ok(preserved.includes(sourceLine));assert.deepEqual(errors,[]);console.log(`${width} ${style} ${appearance}: two required decisions, optional identity, open rounds, footer, final one write passed`);await context.close();
 }
 {
  const {page,context}=await open(390,'light','standard','MONDAY\nBench Press 3x8');await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();assert.equal(await page.locator('.import-resolution').count(),0);await context.close();
 }
 {
  const {page,context}=await open(320,'dark','standard','MONDAY\nBench Press 3x8 50');const active=page.locator('.import-decision-content:visible');await active.waitFor();assert.equal(await page.locator('.step-progress').count(),0);await page.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await page.getByPlaceholder(/Paste your workout notes/).inputValue(),'MONDAY\nBench Press 3x8 50');await context.close();
 }
 {
  const notes=`MONDAY\n${Array.from({length:10},()=> 'Bench Press 3x8 50kg').join(' or ')}`;
  const {page,context}=await open(320,'dark','standard',notes);const active=page.locator('.import-decision-content:visible');await active.waitFor();
  const next=page.locator('.import-resolution .sheet-action-footer button'),scroller=page.locator('.import-decision-scroll');const before=await next.boundingBox();
  assert.ok(await scroller.evaluate(el=>el.scrollHeight>el.clientHeight));await scroller.evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForTimeout(250);assert.equal((await next.boundingBox()).y,before.y);
  const last=active.locator('.choice-row').last(),lastBox=await last.boundingBox();assert.ok(lastBox.y+lastBox.height<before.y);
  await page.screenshot({path:`${out}/320-standard-dark-long-source.png`});
  await page.addStyleTag({content:'.import-plan-screen { --sheet-action-safe-bottom:32px !important; }'});assert.ok((await next.boundingBox()).y+before.height<=812);
  await page.setViewportSize({width:320,height:500});await page.waitForFunction(()=>document.querySelector('.import-resolution footer').getBoundingClientRect().bottom<=500);await last.click();assert.equal(await next.isEnabled(),true);assert.ok((await next.boundingBox()).y+(await next.boundingBox()).height<=468);await page.setViewportSize({width:320,height:844});await page.waitForFunction(()=>document.querySelector('.import-resolution footer').getBoundingClientRect().top>600);assert.ok((await next.boundingBox()).y>600);await context.close();
 }
 console.log('Zero/one blocker, first Back, long source, stable footer, simulated safe area/reduced viewport passed');
}finally{await browser.close();}
