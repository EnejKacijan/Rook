import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
import {importResolutionNotes} from '../src/importResolutionFixture.js';
const out=process.env.ROOK_PROGRESS_QA?'artifacts/import-step-progress':'artifacts/import-decisions';await mkdir(out,{recursive:true});
const progressStyle=page=>page.locator('.step-progress').evaluate(el=>{const line=getComputedStyle(el.querySelector('.progress-line')),fill=getComputedStyle(el.querySelector('.progress-line span')),text=getComputedStyle(el.querySelector('.step-count'));return {height:line.height,radius:line.borderRadius,track:line.backgroundColor,fill:fill.backgroundColor,margin:line.marginTop,font:text.fontFamily,size:text.fontSize,color:text.color,gap:text.marginTop,align:text.textAlign,transition:fill.transitionDuration,easing:fill.transitionTimingFunction};});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
async function open(width,appearance,style,notes){
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
 const state=blankState();Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 await context.addInitScript(s=>{localStorage.setItem('lift-v2-state',JSON.stringify(s));window.qaWrites=0;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='lift-v2-state'&&JSON.parse(value).program)window.qaWrites++;return original.call(this,key,value);};},state);
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173');
 let onboardingStyle;
 if(process.env.ROOK_PROGRESS_QA){await page.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();onboardingStyle=await progressStyle(page);assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuetext'),'Step 1 of 8');await page.waitForTimeout(250);await page.screenshot({path:`${out}/${width}-${style}-${appearance}-onboarding.png`});await page.emulateMedia({reducedMotion:'reduce'});assert.equal((await progressStyle(page)).transition,'0.08s');await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('http://127.0.0.1:4173');}
 await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(notes);await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();return {page,context,onboardingStyle};
}
try{
 for(const [width,appearance,style] of [[390,'light','standard'],[320,'dark','standard'],[390,'light','premium'],[390,'dark','premium'],[320,'light','standard'],[320,'light','premium'],[320,'dark','premium'],[390,'dark','standard']]){
  const {page,context,onboardingStyle}=await open(width,appearance,style,importResolutionNotes),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const active=page.locator('.import-decision-content:visible'),footer=page.locator('.import-resolution .sheet-action-footer'),next=footer.getByRole('button'),back=page.getByRole('button',{name:'Back',exact:true});
  const shot=async name=>{await page.waitForTimeout(250);await page.screenshot({path:`${out}/${width}-${style}-${appearance}-${name}.png`});};
  await active.waitFor();assert.equal(await active.count(),1);assert.ok((await page.locator('.import-resolution').innerText()).includes('STEP 1/5'));assert.equal(await back.count(),1);assert.equal(await next.isDisabled(),true);await shot('01-leg-press');
if(onboardingStyle){assert.deepEqual(await progressStyle(page),{...onboardingStyle,margin:'0px'});await page.emulateMedia({reducedMotion:'reduce'});assert.equal((await progressStyle(page)).transition,'0.08s');await page.emulateMedia({reducedMotion:'no-preference'});assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuetext'),'Step 1 of 5');const grid=await page.locator('.step-progress').boundingBox();assert.equal(grid.x,(await active.boundingBox()).x);assert.equal(grid.width,(await active.boundingBox()).width);}
  await active.getByRole('button',{name:/Leg Press · 3 × 9 · 155 kg/}).click();assert.equal(await active.locator('[aria-pressed="true"]').count(),1);assert.equal(await active.getByText('Choice resolved',{exact:false}).count(),0);await shot('02-selected');
  await next.click();assert.ok((await page.locator('.import-resolution').innerText()).includes('STEP 2/5'));assert.equal(await active.locator('.plan-import-choice').count(),1);assert.equal(await active.getByLabel('Reviewed Min reps',{exact:true}).inputValue(),'');await shot('03-y-balance');
  await active.getByLabel('Reviewed Min reps',{exact:true}).fill('8');assert.equal(await next.isDisabled(),true);await shot('04-validation');
  await back.click();assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuetext'),'Step 1 of 5');assert.equal(await active.locator('[aria-pressed="true"]').count(),1);await next.click();assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuetext'),'Step 2 of 5');assert.equal(await active.getByLabel('Reviewed Min reps',{exact:true}).inputValue(),'8');
  await active.getByLabel('Reviewed Max reps',{exact:true}).fill('10');assert.equal(await next.isEnabled(),true);
  const before=await next.boundingBox();await page.locator('.import-decision-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);const after=await next.boundingBox();assert.equal(after.y,before.y);assert.ok(after.y+after.height<=844);await shot('05-valid');
  await next.click();assert.ok((await page.locator('.import-resolution').innerText()).includes('STEP 3/5'));await shot('05b-monster-walk');await active.getByLabel('Reviewed Min reps',{exact:true}).fill('10');await active.getByLabel('Reviewed Max reps',{exact:true}).fill('12');await next.click();
  assert.ok((await page.locator('.import-resolution').innerText()).includes('STEP 4/5'));assert.equal(await next.count(),0);await active.getByPlaceholder('Search exercises',{exact:true}).fill('BOSU Balance');await shot('05c-first-match');await active.getByRole('button',{name:'BOSU Balance',exact:true}).press('Enter');assert.ok((await page.locator('.import-resolution').innerText()).includes('STEP 5/5'));assert.equal(await next.count(),0);assert.equal(await active.locator('h1').evaluate(e=>document.activeElement===e),true);await shot('06-final-blocker');
  await back.click();assert.ok((await page.locator('.import-resolution').innerText()).includes('STEP 4/5'));assert.equal(await active.getByRole('button',{name:'BOSU Balance ✓',exact:true}).getAttribute('aria-pressed'),'true');await page.waitForTimeout(400);await active.getByRole('button',{name:'KEEP AS CUSTOM',exact:true}).click();await page.waitForTimeout(400);await active.getByRole('button',{name:'KEEP AS CUSTOM',exact:true}).click();assert.equal(await page.evaluate(()=>window.qaWrites),0);
  await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).evaluate(e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:2})));assert.equal(await page.evaluate(()=>window.qaWrites),0);assert.equal(await page.locator('.plan-import-choice').count(),0);await shot('07-review');await page.waitForTimeout(150);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await page.locator('.bottom-nav').waitFor();assert.equal(await page.evaluate(()=>window.qaWrites),1);const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.equal(saved.program.days.length,5);assert.equal(saved.program.days.flatMap(day=>day.exercises).length,41);assert.equal(saved.customExercises.length,2);const y=saved.program.days.flatMap(day=>day.exercises).find(ex=>ex.importedName==='Y Balance Reach');assert.equal(y.repMin,8);assert.equal(y.repMax,10);const preserved=saved.program.importMetadata.sourceNotes.map(note=>note.text).join('\n');for(const sourceLine of importResolutionNotes.split('\n').filter(line=>line.trim()))assert.ok(preserved.includes(sourceLine));assert.deepEqual(errors,[]);console.log(`${width} ${style} ${appearance}: 5 decisions, draft/back, footer, final one write passed`);await context.close();
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
  await page.evaluate(()=>document.documentElement.style.setProperty('--sheet-action-safe-bottom','32px'));assert.ok((await next.boundingBox()).y+before.height<=812);
  await page.setViewportSize({width:320,height:500});await last.click();assert.equal(await next.isEnabled(),true);assert.ok((await next.boundingBox()).y+(await next.boundingBox()).height<=468);await page.setViewportSize({width:320,height:844});assert.ok((await next.boundingBox()).y>600);await context.close();
 }
 console.log('Zero/one blocker, first Back, long source, stable footer, simulated safe area/reduced viewport passed');
}finally{await browser.close();}
