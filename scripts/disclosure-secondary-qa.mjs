import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { startWorkout, completeWorkout, isoDay, weekday, weekDate } from '../src/domain.js';
const out='artifacts/disclosure-motion';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [320,390]){
 const state=createReturningUserFixture(2);state.activeWorkout=null;state.selectedDate=isoDay();state.selectedDay=weekday();
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(page, 'program'); await page.getByRole('button',{name:/Edit plan/}).click();await page.locator('.edit-plan-screen').waitFor();await page.waitForTimeout(350);
 const card=page.locator('[id^="import-exercise-"]').first(),header=card.locator('.plan-editor-summary');await header.scrollIntoViewIfNeeded();const y=(await header.boundingBox()).y;
 await header.click();await page.waitForTimeout(250);assert.ok(Math.abs((await header.boundingBox()).y-y)<1);const panel=card.locator(':scope > .rook-disclosure');assert.ok((await panel.boundingBox()).height>0);
 const picker=card.locator('.plan-editor-picker-trigger').first();await picker.click();await page.waitForTimeout(250);assert.ok(await card.getByRole('listbox').isVisible());const search=card.locator('input[type="search"]');await search.fill('press');await page.waitForTimeout(100);await search.fill('no-such-exercise');await page.waitForTimeout(100);assert.ok(await card.getByText('No exercises match your search.',{exact:true}).isVisible());await picker.click();await page.waitForTimeout(250);assert.equal(await card.getByRole('listbox').count(),0);
 await header.scrollIntoViewIfNeeded();await header.click();await card.locator('.plan-editor-fields').waitFor({state:'detached'});assert.equal((await panel.boundingBox()).height,0);assert.equal(await card.locator('.plan-editor-fields').count(),0);await page.screenshot({path:`${out}/${width}-editor-collapsed.png`});
 let completed=structuredClone(state);const day=completed.program.days.find(day=>day.weekday===weekday())||completed.program.days[0];completed.selectedDay=day.weekday;completed.selectedDate=isoDay(weekDate(day.weekday));completed.activeWorkout=startWorkout(completed,day);for(const e of completed.activeWorkout.exercises)for(const set of e.sets)Object.assign(set,{completed:true,weight:40,reps:8,rir:1});completed.activeWorkout.exercises[0].sets.push(...Array.from({length:18},(_,i)=>({...completed.activeWorkout.exercises[0].sets[0],id:`long-history-${i}`})));completed=completeWorkout(completed);
 await page.evaluate(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),completed);await page.reload({waitUntil:'networkidle'});
 // Open the completed session on its canonical selected plan date.
 await page.getByRole('button',{name:'TODAY',exact:true}).click();await page.getByRole('button',{name:'WORKOUT COMPLETE · VIEW HISTORY'}).click();
 await page.getByRole('button',{name:'EDIT',exact:true}).click();const details=page.locator('.history-edit-exercise').first(),summary=details.locator('summary');await summary.scrollIntoViewIfNeeded();const expanded=(await details.boundingBox()).height;assert.ok(expanded>844);
 await summary.click();await page.waitForTimeout(35);const mid=(await details.boundingBox()).height;console.log({expanded,mid,css:await details.evaluate(el=>({supported:CSS.supports('interpolate-size','allow-keywords'),height:getComputedStyle(el,'::details-content').height,transition:getComputedStyle(el,'::details-content').transition,visibility:getComputedStyle(el,'::details-content').contentVisibility,animations:el.getAnimations({subtree:true}).map(a=>a.transitionProperty)}))});assert.ok(mid>60&&mid<expanded);assert.equal(await details.evaluate(el=>getComputedStyle(el,'::details-content').contentVisibility),'visible');await page.screenshot({path:`${out}/${width}-history-mid-collapse.png`});await page.waitForTimeout(250);assert.ok((await details.boundingBox()).height<100);
 await summary.click();await page.waitForTimeout(250);assert.ok(Math.abs((await details.boundingBox()).height-expanded)<1);await context.close();console.log(`PASS ${width}: editor, nested dynamic picker, native long history disclosure`);
}}finally{await browser.close();}
