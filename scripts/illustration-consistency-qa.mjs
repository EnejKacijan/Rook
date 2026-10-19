import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {exerciseCatalog,isoDay} from '../src/domain.js';
const phase=process.env.ART_QA_PHASE||'after',out=`${process.env.ART_REVIEW_DIR||'artifacts/ROOK-BASELINE-CORRECTION-REVIEW/illustration-consistency'}/${phase}/app`;
await mkdir(out,{recursive:true});
const samples=['wg-leg-press','wg-rook-single-leg-leg-press','wg-dumbbell-skull-crusher','wg-step-down','wg-hip-adduction-machine','wg-rook-high-to-low-cable-fly','wg-preacher-curl','wg-rook-machine-preacher-curl','wg-rook-bodyweight-split-squat','wg-assisted-dip','wg-bird-dog','wg-archer-push-up','wg-banded-squat','wg-cable-lateral-raise','wg-cossack-squat','wg-captains-chair-knee-raise'];
const all=Object.values(exerciseCatalog),results=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const catalog=phase==='after'&&width===320&&style==='standard'&&appearance==='dark'?all:all.filter(e=>samples.includes(e.artId)&&!e.id.startsWith('wg-'));
 // Include library-only samples too, without changing catalog eligibility.
 for(const artId of samples)if(!catalog.some(e=>e.artId===artId))catalog.push(all.find(e=>e.artId===artId));
 const state=createReturningUserFixture(1);state.activeWorkout=null;
 Object.assign(state.profile,{showExerciseImages:true,appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 const base=state.program.days[0].exercises[0];
 state.workouts=[{...structuredClone(state.workouts[0]),id:'qa-illustration-history',name:'Illustration audit',canonicalPlanDate:isoDay(),completedAt:new Date().toISOString(),exercises:catalog.map((item,i)=>({...structuredClone(base),id:`qa-art-${i}`,exerciseId:item.id,sets:[{id:`qa-set-${i}`,weight:20,reps:8,completed:true}]}))}];
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4177');
 await page.getByRole('button',{name:'PROGRESS',exact:true}).click({timeout:8000}).catch(async e=>{console.log(await page.locator('body').innerText(),errors);throw e;});await page.getByRole('button',{name:/View all logged exercises/}).click();
 const rows=page.locator('.logged-exercises-sheet .logged-exercise-row'),count=await rows.count();assert.equal(count,catalog.length);
 for(let i=0;i<count;i++){
  const row=rows.nth(i),name=await row.locator('strong').textContent();await row.click();
  const thumb=page.locator('.exercise-detail-art');await thumb.waitFor();await thumb.evaluate(e=>e.decode());
  const src=await thumb.getAttribute('src'),match=src.match(/(wg-.+?)-[\w-]{8,}\.svg/)?.[1];
  assert.ok(src&&await thumb.evaluate(e=>e.complete&&e.naturalWidth>0),`${name}: loaded`);
  const thumbBounds=await thumb.boundingBox();assert.ok(thumbBounds.x>=0&&thumbBounds.x+thumbBounds.width<=width,`${name}: detail fits`);
  if(samples.some(id=>src.includes(`${id}-`)))await page.screenshot({path:`${out}/${width}-${style}-${appearance}-${i}-detail.png`,animations:'disabled'});
  const originalThumb=await thumb.elementHandle();
  await page.locator('.exercise-detail-art-button').click();const expanded=page.locator('.exercise-visual-stage img');await expanded.waitFor();await expanded.evaluate(e=>e.decode());
  assert.equal(await expanded.getAttribute('src'),src,`${name}: detail and viewer use identical current asset`);
  const geometry=await page.locator('.exercise-visual-viewer').evaluate(view=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return {image:rect(view.querySelector('.exercise-visual-stage img')),header:rect(view.querySelector('header')),close:rect(view.querySelector('.exercise-visual-viewer-close')),overflow:document.documentElement.scrollWidth>innerWidth};});
  assert.ok(!geometry.overflow);assert.ok(geometry.image.x>=0&&geometry.image.right<=width+1&&geometry.image.bottom<=845,`${name}: image contained`);
  if(phase==='after')assert.ok(Math.abs(geometry.image.x+geometry.image.width/2-width/2)<2,`${name}: centered`);
  assert.ok(geometry.close.width>=44&&geometry.close.height>=44,`${name}: close hit area`);
  if(samples.some(id=>src.includes(`${id}-`)))await page.screenshot({path:`${out}/${width}-${style}-${appearance}-${i}-viewer.png`,animations:'disabled'});
  results.push({width,style,appearance,name,src,artId:match,...geometry,result:'PASS'});
  await page.getByRole('button',{name:'Close visual viewer',exact:true}).click();
  assert.ok(await originalThumb.evaluate(e=>e.isConnected&&e===document.querySelector('.exercise-detail-art')),`${name}: same parent detail preserved`);
  await page.getByRole('button',{name:'Back',exact:true}).click();
 }
 assert.deepEqual(errors,[]);console.log(`PASS ${width} ${style} ${appearance}: ${count} detail/viewer flows`);await context.close();
}}finally{await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
