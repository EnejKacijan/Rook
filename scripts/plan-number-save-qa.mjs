import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {for(const width of [320,390]) {
 const state=createReturningUserFixture(3);state.activeWorkout=null;
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
 const page=await context.newPage();await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173');
 const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 const open=async()=>{await page.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(page, 'program'); await page.getByRole('button',{name:/^Edit plan/}).click();await page.locator('.plan-editor-summary').first().click();};
 await open();const before=await stored();
 const first=before.program.days[0].exercises[0],input=page.getByLabel(/^Sets for/).first();
 const count=await input.inputValue();await input.fill('');await input.type(count);
 await input.hover();await page.mouse.wheel(0,80);assert.equal(await input.inputValue(),count);assert.equal(await input.evaluate(e=>e===document.activeElement),true,'scrolling does not blur or change count');
 // Deliberately bypass focus/blur: tests the explicit Save snapshot boundary.
 await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).evaluate(e=>e.click());
 await page.locator('.edit-plan-screen').waitFor({state:'detached'});
 const same=await stored();assert.deepEqual(same.program.days.flatMap(d=>d.exercises),before.program.days.flatMap(d=>d.exercises),'clear/retype preserves every set ID, metadata and prescription');
 await open();const current=page.getByLabel(/^Sets for/).first();await current.fill('2');
 await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).evaluate(e=>e.click());await page.locator('.edit-plan-screen').waitFor({state:'detached'});
 const decreased=(await stored()).program.days.flatMap(d=>d.exercises).find(e=>e.id===first.id);assert.deepEqual(decreased.sets,first.sets.slice(0,2),'intentional decrease preserves surviving set metadata');
 await open();await page.getByLabel(/^Sets for/).first().fill('4');
 await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).evaluate(e=>e.click());await page.locator('.edit-plan-screen').waitFor({state:'detached'});
 const increased=(await stored()).program.days.flatMap(d=>d.exercises).find(e=>e.id===first.id);assert.equal(increased.sets.length,4);assert.deepEqual(increased.sets.slice(0,2),decreased.sets);assert.ok(increased.sets.slice(2).every(s=>!s.completed));assert.equal((await stored()).program.userEdited,true);
 const saved=(await stored()).program;await open();await page.getByLabel(/^Sets for/).first().fill('5');await page.getByRole('button',{name:'Close edit plan',exact:true}).click();await page.locator('.edit-plan-screen').waitFor({state:'detached'});assert.deepEqual((await stored()).program,saved,'cancel cannot persist a pending field');
 console.log(`PASS ${width}: metadata, focused programmatic save, intentional resize, wheel, cancel`);await context.close();
}}finally{await browser.close();}
