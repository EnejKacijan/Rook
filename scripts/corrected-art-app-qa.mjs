import assert from 'node:assert/strict';
import {mkdir,readdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {exerciseCatalog,isoDay} from '../src/domain.js';
const out='artifacts/art-corrections/app';await mkdir(out,{recursive:true});
const ids=(await readdir('src/assets/exercise-art/corrected-masters')).filter(f=>f.endsWith('.svg')).map(f=>f.slice(0,-4)).sort();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const [width,appearance,style] of [[390,'light','standard'],[320,'dark','standard'],[390,'light','premium'],[390,'dark','premium']]){
 const state=createReturningUserFixture(0);state.activeWorkout=null;Object.assign(state.profile,{showExerciseImages:true,appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 const base=state.program.days[0].exercises[0];const exercises=ids.map((artId,i)=>{const item=Object.values(exerciseCatalog).find(e=>e.artId===artId&&!e.id.startsWith('wg-'))||Object.values(exerciseCatalog).find(e=>e.artId===artId);assert.ok(item,artId);return {...structuredClone(base),id:`qa-art-${i}`,exerciseId:item.id,sets:[{id:`qa-art-set-${i}`,weight:20,reps:8,completed:true}]};});
 // Isolated historical records also cover illustrations for catalog movements
 // that are not currently eligible for new plans. Never change that eligibility.
 state.workouts=[{id:'qa-art-history',name:'Illustration QA',canonicalPlanDate:isoDay(),completedAt:new Date().toISOString(),exercises}];
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4175');
 const capture=async path=>{await page.waitForTimeout(300);await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});await page.screenshot({path,animations:'disabled'});};
 await page.getByRole('button',{name:'PROGRESS',exact:true}).click();await page.getByRole('button',{name:/View all logged exercises/}).click();
 for(let i=0;i<ids.length;i++){const artId=ids[i],directory=page.locator('.logged-exercises-sheet');await directory.locator('.logged-exercise-row').nth(i).click();const thumbnail=page.locator('.exercise-detail-art');await thumbnail.waitFor();await thumbnail.evaluate(e=>e.decode());assert.ok((await thumbnail.getAttribute('src')).includes(artId));await capture(`${out}/${width}-${style}-${appearance}-${artId}-detail.png`);await page.locator('.exercise-detail-art-button').click();const expanded=page.locator('.exercise-visual-stage img');await expanded.waitFor();await expanded.evaluate(e=>e.decode());const b=await expanded.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width&&b.y>=0&&b.y+b.height<=844,`${artId} image fits viewport`);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await capture(`${out}/${width}-${style}-${appearance}-${artId}.png`);await page.getByRole('button',{name:'Close visual viewer',exact:true}).click();await page.getByRole('button',{name:'Back',exact:true}).click();}
 assert.deepEqual(errors,[]);console.log(`PASS ${width} ${style} ${appearance}: all ${ids.length} images loaded/expanded, viewport containment, no runtime errors`);await context.close();
}}finally{await browser.close();}
