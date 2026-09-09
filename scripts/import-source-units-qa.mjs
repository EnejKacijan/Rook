import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
const out='artifacts/import-source-units';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
for(const [width,appearance,units] of [[390,'light','kg'],[320,'dark','lb']]){
  const state=blankState();Object.assign(state.profile,{units,appearancePreference:appearance,themePreference:appearance});
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
  await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  await page.locator('.existing-plan-action').click();
  assert.equal(await page.getByRole('group',{name:'Weight units'}).count(),0);
  const notes='Monday - Push\nBench Press 3x8 185\nCable Fly 2x12 15 kg';
  await page.getByPlaceholder(/Paste your workout notes/).fill(notes);await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
  await page.getByRole('heading',{name:'What unit is this weight?',exact:true}).waitFor();
  const next=page.locator('.import-resolution .sheet-action-footer button');assert.equal(await next.isDisabled(),true);
  await page.screenshot({path:`${out}/${width}-${appearance}-unit-decision.png`});
  const active=page.locator('.import-decision-content:visible');
  await active.getByRole('button',{name:'lb',exact:true}).click();assert.equal(await next.isEnabled(),true);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state'))?.program??null),null);
  await next.click();await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();
  assert.equal(await page.getByRole('group',{name:'Weight units'}).count(),0);
  const bench=page.locator('.plan-editor-exercise').filter({hasText:'Bench Press'}).first();
  assert.match(await bench.innerText(),units==='kg'?/83\.91 kg/:/184\.99 lb/);
  await page.screenshot({path:`${out}/${width}-${appearance}-review.png`});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state'))?.program??null),null);
  await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await page.locator('.bottom-nav').waitFor();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  assert.equal(saved.profile.units,units);assert.deepEqual(saved.program.days[0].exercises[0].sets.map(s=>s.weight),[83.91,83.91,83.91]);
  assert.equal(saved.program.importMetadata.sourceNotes.map(n=>n.text).join('\n'),notes);
  await page.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(page, 'preferences'); await page.getByRole('button',{name:/Logging/}).click();
  const selector=page.locator('.unit-segmented');assert.equal(await selector.getByRole('button',{name:units,exact:true}).getAttribute('aria-pressed'),'true');
  await selector.getByRole('button',{name:units==='kg'?'lb':'kg',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).program),saved.program);
  assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width} ${units}: source choice, review, final save, shared Profile setting`);
}
}finally{await browser.close();}
