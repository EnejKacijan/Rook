import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const root='artifacts/sheet-action-footer'; await mkdir(root,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
try {
for(const width of [320,390,430])for(const appearance of ['light','dark'])for(const style of ['standard','premium']) {
  const state=createReturningUserFixture(3);state.activeWorkout=null;
  Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
  const context=await browser.newContext({viewport:{width,height:844},colorScheme:appearance,serviceWorkers:'block',reducedMotion:'reduce'});
  await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
  const page=await context.newPage();await page.goto('http://127.0.0.1:4173');
  await page.getByRole('button',{name:'PROFILE',exact:true}).click();
  await openProfileArea(page, 'program'); await page.getByRole('button',{name:/Edit plan/}).click();
  const sheet=page.locator('.edit-plan-screen'),footer=sheet.locator('.sheet-action-footer');
  await footer.waitFor();await page.evaluate(()=>document.fonts.ready);
  const capture=async name=>page.screenshot({path:`${root}/${width}-${style}-${appearance}-${name}.png`,animations:'disabled'});
  const geometry=async()=>footer.evaluate(f=>{const s=f.closest('main'),r=f.getBoundingClientRect(),b=f.querySelector('.button').getBoundingClientRect();return {top:r.top,bottom:r.bottom,buttonTop:b.top,buttonBottom:b.bottom,height:innerHeight,background:getComputedStyle(f).backgroundColor,overflow:s.scrollWidth-s.clientWidth};});
  for(const [name,position]of [['edit-plan-top',0],['edit-plan-middle',0.5],['edit-plan-bottom',1]]) {
    await sheet.evaluate((s,p)=>s.scrollTop=(s.scrollHeight-s.clientHeight)*p,position);
    const g=await geometry();assert.ok(g.buttonTop>=0&&g.buttonBottom<=g.height,JSON.stringify(g));assert.ok(!g.background.endsWith(', 0)'),g.background);
    // Existing full-bleed headers/pseudo surfaces may extend scrollWidth; content rows may not.
    assert.ok(await sheet.evaluate(s=>[...s.querySelectorAll('.plan-day')].every(e=>e.getBoundingClientRect().right<=s.getBoundingClientRect().right)));
    if(position===1){const clearance=await footer.evaluate(f=>f.getBoundingClientRect().top-f.previousElementSibling.getBoundingClientRect().bottom);assert.ok(clearance>=0,`Last body content clearance ${clearance}`);g.clearance=clearance;}
    results.push({width,appearance,style,name,...g});await capture(name);
  }
  const nameInput=sheet.locator('input[type="text"]').first();
  if(await nameInput.count()) {await nameInput.fill('');assert.equal(await footer.getByRole('button',{name:'SAVE CHANGES',exact:true}).isDisabled(),true);await capture('disabled-save');}
  await page.setViewportSize({width,height:480});
  await nameInput.focus();
  assert.ok(await nameInput.evaluate(e=>e.getBoundingClientRect().bottom<=e.closest('main').querySelector('.sheet-action-footer').getBoundingClientRect().top),'Focused input clears action area in keyboard-sized viewport');
  const g=await geometry();assert.ok(g.buttonBottom<=480,JSON.stringify(g));
  await page.setViewportSize({width,height:844});
  await page.addStyleTag({content:':root { --sheet-action-safe-bottom: 34px; }'});
  assert.ok(await footer.evaluate(f=>f.getBoundingClientRect().bottom-f.lastElementChild.getBoundingClientRect().bottom)>=34);
  await capture('safe-area-34');
  await context.close();console.log(`${width} ${style} ${appearance}: footer geometry passed`);
}
await writeFile(`${root}/geometry.json`,JSON.stringify(results,null,2));
} finally {await browser.close();}
