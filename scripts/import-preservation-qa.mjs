import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
import {complexPreservationNotes} from '../src/importPreservationFixture.js';
const out='artifacts/import-preservation';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const [width,appearance,style] of [[390,'light','standard'],[320,'dark','standard'],[390,'light','premium'],[390,'dark','premium']]){
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
 const initial=blankState();initial.profile.units='lb';Object.assign(initial.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},initial);
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
 await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(complexPreservationNotes);
 await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();await page.locator('.import-decision-content:visible').waitFor();
 const prefix=`${out}/${width}-${style}-${appearance}`,use=page.getByRole('button',{name:'USE THIS PLAN',exact:true});
 assert.equal(await use.count(),0);assert.equal(await page.getByText('CONFIRM ALL OUTCOMES',{exact:false}).count(),0);
 await page.screenshot({path:`prefix-initial.png`.replace('prefix',prefix)});
 const alternative=page.getByRole('button',{name:/^Leg Press · 3 × 9 · 155 kg$/});await alternative.scrollIntoViewIfNeeded();await page.screenshot({path:`${prefix}-decision.png`});await alternative.click();
 await page.getByRole('button',{name:'CONTINUE',exact:true}).click();
 for(let i=0;i<2;i++){
  const choice=page.locator('.import-decision-content:visible');assert.equal(await choice.count(),1);
  assert.equal(await choice.getByLabel('Reviewed Min reps',{exact:true}).inputValue(),'');
  await choice.getByLabel('Reviewed Min reps',{exact:true}).fill('8');await choice.getByLabel('Reviewed Max reps',{exact:true}).fill('10');
  await page.getByRole('button',{name:'CONTINUE',exact:true}).click();
 }
 for(let i=0;i<3;i++){await page.waitForTimeout(400);await page.getByRole('button',{name:'KEEP AS CUSTOM',exact:true}).click();}
 await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();
 await use.scrollIntoViewIfNeeded();assert.equal(await use.isEnabled(),true);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state'))?.program??null),null);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${prefix}-ready.png`});
 await use.click();await page.locator('.bottom-nav').waitFor();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));const source=saved.program.importMetadata.sourceNotes.map(note=>note.text).join('\n');
 for(const line of complexPreservationNotes.split('\n').filter(line=>line.trim()))assert.ok(source.includes(line));
 assert.equal(saved.program.days.length,5);assert.deepEqual(errors,[]);
 await context.close();console.log(`${width} ${style} ${appearance}: direct decisions, preserved source, ready/apply and no overflow passed`);
}}finally{await browser.close();}
