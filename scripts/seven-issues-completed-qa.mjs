import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {webkit,chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {startWorkout,completeWorkout,plannedWorkoutForDate,serializeState,STORAGE_KEY} from '../src/domain.js';
import {startFreestyleWorkout} from '../src/freestyleWorkout.js';
const out='artifacts/seven-issues',reports=[];await mkdir(out,{recursive:true});
function completed(theme){
 let s=createReturningUserFixture(0);s.workouts=[];s.program.days.find(d=>d.weekday==='Sat').weekday='Fri';s.profile.availableDays=s.profile.availableDays.map(d=>d==='Sat'?'Fri':d);s.program.trainingBlock.startDate='2026-09-14';s.selectedDate='2026-09-24';s.ai.planUpgradeDismissed=true;
 Object.assign(s.profile,{stylePreference:theme.startsWith('premium')?'premium':'standard',appearancePreference:theme.endsWith('dark')?'dark':'light',themePreference:theme.startsWith('premium')?'premium':theme});
 s.activeWorkout=startWorkout(s,plannedWorkoutForDate(s,s.selectedDate));s.activeWorkout.startedAt=new Date('2026-09-26T12:00:00').getTime();
 const template=s.activeWorkout.exercises[0];
 s.activeWorkout.exercises=['weighted','bodyweight','timed','per-side','added'].map((kind,i)=>({...structuredClone(template),id:`qa-${i}`,exerciseId:kind==='timed'?'plank':kind==='bodyweight'?'pull-up':'barbell-bench-press',importedName:`QA ${kind} exercise with a longer descriptive name`,loggingMode:kind==='per-side'?'per_side':'normal',sessionAdded:kind==='added',repMin:15,repMax:15,targetRir:4,sets:[10,7,6].map((reps,j)=>({id:`qa-${i}-${j}`,completed:true,reps:kind==='timed'?45:reps,weight:70,rir:null,...kind==='per-side'?{sides:{left:{reps},right:{reps:reps-1}}}:{}}))}));
 s=completeWorkout(s);s.selectedDate='2026-09-24';s.selectedDay='Thu';return s;
}
const browser=await webkit.launch({headless:true});
try{for(const width of [320,390,430])for(const theme of ['light','dark','premium-light','premium-dark']){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});const state=completed(theme);
 await context.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key:STORAGE_KEY,value:serializeState(state)});
 const page=await context.newPage();page.setDefaultTimeout(10000);await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4198');
 const source=page.locator('.week-strip button[aria-label^="Thu "]'),actual=page.locator('.week-strip button[aria-label^="Sat "]');
 await source.waitFor();
 assert.equal(await page.locator('html').getAttribute('data-appearance'),theme.endsWith('dark')?'dark':'light');
 assert.equal(await page.locator('html').getAttribute('data-style'),theme.startsWith('premium')?'premium':'standard');
 assert.equal(await source.locator('.completed-dot').count(),0);assert.match(await source.getAttribute('aria-label'),/workout performed elsewhere/);assert.equal(await actual.locator('.completed-dot').count(),1);
 await source.tap();await page.getByText('Performed Saturday, Sep 26',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'START WORKOUT',exact:true}).count(),0);
 await page.screenshot({path:`${out}/dates-${width}-${theme}-source.png`});
 await page.locator('.week-calendar-trigger').tap();const month=page.locator('.month-calendar-screen');await month.waitFor();
 assert.equal(await month.locator('[data-date="2026-09-24"] .is-completed').count(),0);assert.equal(await month.locator('[data-date="2026-09-26"] .is-completed').count(),1);
 await page.screenshot({path:`${out}/dates-${width}-${theme}-month.png`});await page.getByRole('button',{name:'Close calendar',exact:true}).tap();await month.waitFor({state:'detached'});
 await actual.tap();const rows=page.locator('.exercise-preview .exercise-list-row');await rows.first().waitFor();
 const summaries=await rows.locator('.navigation-row-end').allTextContents();assert.equal(summaries.length,5);assert.equal(summaries[0],'10 / 7 / 6 reps');assert.equal(summaries[1],'10 / 7 / 6 reps');assert.equal(summaries[2],'45 / 45 / 45 sec');assert.match(summaries[3],/L 10 · R 9/);assert.equal(summaries[4],'10 / 7 / 6 reps');
 await rows.first().scrollIntoViewIfNeeded();const layout=await rows.evaluateAll(nodes=>nodes.map(n=>{const a=n.querySelector('.navigation-row-start')||n.firstElementChild,b=n.querySelector('.navigation-row-end'),ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return {width:n.clientWidth,scroll:n.scrollWidth,overlap:Math.min(ar.right,br.right)-Math.max(ar.left,br.left)>.5&&Math.min(ar.bottom,br.bottom)-Math.max(ar.top,br.top)>.5};}));
 assert.ok(layout.every(r=>!r.overlap&&r.scroll<=r.width),JSON.stringify(layout));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:`${out}/completed-${width}-${theme}.png`});await page.reload();await page.locator('.week-strip .completed-dot').waitFor();assert.equal(await page.locator('.week-strip .completed-dot').count(),1);
 reports.push({width,theme,summaries,layout});await writeFile(`${out}/completed-dates.json`,JSON.stringify(reports,null,2));console.log(`PASS ${width} ${theme}: source/actual/month/completed rows/reload`);await context.close();
}}finally{await browser.close();}
// Built PWA: known first-window art is cached after first open and works offline.
const chrome=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await chrome.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});let s=startFreestyleWorkout(createReturningUserFixture(0));s.ai.planUpgradeDismissed=true;
 await context.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key:STORAGE_KEY,value:serializeState(s)});
 const page=await context.newPage();page.setDefaultTimeout(12000);await page.goto('http://127.0.0.1:4175');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
 const open=async()=>{await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();await page.getByRole('button',{name:'+ ADD EXERCISE',exact:true}).click();await page.locator('.queue-search-row img').first().waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.queue-search-row img')].slice(0,3).every(i=>i.complete&&i.naturalWidth>0));};
 await open();const sources=await page.locator('.queue-search-row img').evaluateAll(es=>es.slice(0,3).map(i=>i.src));await page.waitForFunction(async sources=>{const matches=await Promise.all(sources.map(src=>caches.match(src)));return matches.every(Boolean);},sources);
 await context.setOffline(true);await page.reload();await open();assert.deepEqual(await page.locator('.queue-search-row img').evaluateAll(es=>es.slice(0,3).map(i=>i.src)),sources);
 await page.screenshot({path:`out/pwa-offline-picker.png`.replace('out/',out+'/')});await writeFile(`${out}/offline-art.json`,JSON.stringify({cachedFirstWindow:sources.length,offlineLoaded:true},null,2));console.log('PASS PWA cached picker artwork offline');await context.close();
}finally{await chrome.close();}
