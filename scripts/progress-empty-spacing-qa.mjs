import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW';await mkdir(`${out}/screenshots`,{recursive:true});const results=[];
const b=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark'])for(const empty of [true,false]){
 const s=createReturningUserFixture(2);s.activeWorkout=null;if(empty)s.workouts=[];s.ai.planUpgradeDismissed=true;Object.assign(s.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 if(empty){s.program.goalAtCreation=null;s.progressFocusOverrideByPlanId={};}
 const c=await b.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});await c.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),s);
 const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');await p.getByRole('button',{name:'PROGRESS',exact:true}).click();const section=p.locator('.logged-exercises-preview');await section.waitFor();
 const sizes=await section.evaluate(el=>{const photo=document.querySelector('.workout-photo-entry-section'),next=el.nextElementSibling;
 const measure=()=>({height:el.getBoundingClientRect().height,padding:getComputedStyle(el).paddingBottom,photoHeight:photo.getBoundingClientRect().height,photoPadding:getComputedStyle(photo).paddingBottom,nextY:next?.getBoundingClientRect().y,nav:document.querySelector('.bottom-nav').getBoundingClientRect().y});
 const actual=measure();if(el.classList.contains('is-empty')){el.style.paddingBottom='24px';photo.style.paddingBottom='0px';}const before=measure();el.style.removeProperty('padding-bottom');photo.style.removeProperty('padding-bottom');return {actual,before};});
 assert.equal(sizes.actual.height-sizes.before.height,empty?-24:0);assert.equal(sizes.actual.photoHeight-sizes.before.photoHeight,empty?18:0);if(empty)assert.equal(sizes.actual.nextY-sizes.before.nextY,-24);assert.equal(sizes.actual.nav,sizes.before.nav);assert.equal(await section.locator('.logged-exercise-row').count()>0,!empty);
 await p.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
 if(empty){const action=section.getByRole('button',{name:'Go to Today'});await action.waitFor();await p.screenshot({path:`${out}/screenshots/progress-empty-${width}-${style}-${appearance}.png`});await action.click();await p.locator('.today-screen').waitFor();}
 results.push({width,style,appearance,empty,...sizes,result:'PASS'});await c.close();
}console.log(`PASS ${results.length}/16 empty/populated spacing cases`);}finally{await writeFile(`${out}/progress-empty-spacing-results.json`,JSON.stringify(results,null,2));await b.close();}
