import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const out='artifacts/logged-exercises';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
try {for(const [width,appearance,style] of [[390,'light','standard'],[320,'dark','standard'],[390,'light','premium'],[390,'dark','premium']]){
 const state=createReturningUserFixture(2);Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
 await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4175');
 await page.locator('.today-screen').waitFor();await page.waitForTimeout(1000);
 const snapshot=()=>page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('lift-v2-state'));return JSON.stringify([s.program,s.workouts]);});const before=await snapshot();
 await page.getByRole('button',{name:'PROGRESS',exact:true}).click();const preview=page.locator('.logged-exercises-preview');await preview.scrollIntoViewIfNeeded();
 assert.equal(await preview.locator('.logged-exercise-row').count(),4);
 const shot=async name=>{await page.waitForTimeout(200);await page.screenshot({path:`${out}/${width}-${style}-${appearance}-${name}.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));};await shot('preview');
 await preview.getByRole('button',{name:/View all logged exercises/}).click();const sheet=page.locator('.logged-exercises-sheet');await sheet.waitFor();assert.ok(await sheet.locator('.logged-exercise-row').count()>6);await shot('all');
 const name=await sheet.locator('.logged-exercise-row strong').first().innerText();const search=sheet.getByRole('searchbox');await search.fill(name);assert.ok(await sheet.locator('.logged-exercise-row').count()>0);await sheet.locator('.logged-exercise-row').first().click();
 await page.getByRole('button',{name:'Back',exact:true}).click();await sheet.waitFor();assert.equal(await sheet.getByRole('searchbox').inputValue(),name);
 await sheet.getByRole('searchbox').fill('zzzz no matching exercise');await sheet.getByRole('status').waitFor();assert.equal(await sheet.locator('.logged-exercise-row').count(),0);await sheet.getByRole('searchbox').fill('');await shot('all-restored');
 await sheet.locator('.logged-exercise-row').last().scrollIntoViewIfNeeded();const scroll=await sheet.evaluate(e=>e.scrollTop);assert.ok(scroll>0);await sheet.locator('.logged-exercise-row').last().click();await page.getByRole('button',{name:'Back',exact:true}).click();await sheet.waitFor();assert.ok(Math.abs(await sheet.evaluate(e=>e.scrollTop)-scroll)<2,'directory scroll restored');await sheet.evaluate(e=>e.scrollTop=0);
 await sheet.getByRole('button',{name:'Close Logged exercises',exact:true}).click();assert.equal(await snapshot(),before);assert.deepEqual(errors,[]);
 console.log(`PASS ${width} ${style} ${appearance}: four recent, all, search, detail/back, no results, no mutation`);await context.close();
 }
 const state=createReturningUserFixture(0);state.workouts=[];const context=await browser.newContext({viewport:{width:320,height:844}});await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4175');await page.getByRole('button',{name:'PROGRESS',exact:true}).click();const preview=page.locator('.logged-exercises-preview');await preview.scrollIntoViewIfNeeded();await preview.getByText('No exercises logged yet',{exact:true}).waitFor();assert.equal(await preview.locator('.logged-exercise-row').count(),0);await page.screenshot({path:`${out}/320-empty.png`});await preview.getByRole('button',{name:'Go to Today',exact:true}).click();await page.locator('.today-screen').waitFor();console.log('PASS empty: no placeholder exercises, Today navigation');await context.close();
} finally {await browser.close();}
