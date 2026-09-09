import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const out='artifacts/navigation-arrow-color';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const state=createReturningUserFixture(3);state.activeWorkout=null;Object.assign(state.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
 const page=await context.newPage();await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173');
 const check=async name=>{
  const arrows=await page.locator('button').evaluateAll(buttons=>buttons.filter(b=>/[‹›←→]/.test(b.textContent)&&b.getBoundingClientRect().height>0).map(b=>({label:b.getAttribute('aria-label')||b.textContent.trim(),color:getComputedStyle(b).color,fill:getComputedStyle(b).webkitTextFillColor})));
  assert.ok(arrows.length,`${name}: arrow controls exist`);
  for(const arrow of arrows){assert.equal(arrow.fill,arrow.color);const rgb=arrow.color.match(/\d+/g).map(Number);assert.ok(!(rgb[2]>rgb[0]+40&&rgb[2]>rgb[1]+20),`${name}: unexpected blue ${JSON.stringify(arrow)}`);}
  await page.screenshot({path:`${out}/${style}-${appearance}-${name}.png`,animations:'disabled'});
  console.log(style,appearance,name,arrows);
 };
 await check('today');await page.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(page, 'program'); await page.getByRole('button',{name:/^Edit plan/}).click();await check('edit-plan');await page.getByRole('button',{name:'Close edit plan',exact:true}).click();
 await openProfileArea(page, 'program'); await page.getByRole('button',{name:/Replace plan/}).click();await page.getByRole('button',{name:/Import from Notes|Import a different plan/}).click();await check('import-entry');
 await page.getByPlaceholder(/Paste your workout notes/).fill('Monday\nBench Press 3x8 or Incline Dumbbell Press 3x10');await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();await page.locator('.import-resolution').waitFor();await check('import-decision');
 await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByPlaceholder(/Paste your workout notes/).waitFor();await context.close();
}}finally{await browser.close();}
