import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
import {createReturningUserFixture} from '../src/demoFixture.js';
const out='artifacts/weight-unit-entry';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
for(const [width,appearance,style] of [[320,'dark','standard'],[390,'light','standard'],[390,'dark','premium'],[390,'light','premium']]){
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
 const state=blankState();Object.assign(state.profile,{units:'lb',appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();
 const group=page.getByRole('group',{name:'Weight units'});
 assert.equal(await group.getByRole('button',{name:'lb',exact:true}).getAttribute('aria-pressed'),'true');
 await group.getByRole('button',{name:'kg',exact:true}).click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state'))?.profile.units || 'kg'),'kg');
 await group.getByRole('button',{name:'lb',exact:true}).click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:`${out}/${width}-${style}-${appearance}-onboarding.png`});
 const geometry=await page.locator('.weight-unit-choice.is-compact').evaluate(el=>{
  const label=el.querySelector('.weight-unit-label').getBoundingClientRect(),control=el.querySelector('.segmented').getBoundingClientRect();
  return {labelTop:label.top,labelBottom:label.bottom,controlTop:control.top,controlBottom:control.bottom,width:control.width,height:control.height,buttons:[...el.querySelectorAll('button')].map(button=>button.getBoundingClientRect().height)};
 });
 assert.equal(geometry.width,148);assert.equal(geometry.height,48);assert.ok(geometry.buttons.every(height=>height>=44));assert.ok(geometry.labelTop>=geometry.controlTop&&geometry.labelBottom<=geometry.controlBottom);
 await page.getByRole('combobox',{name:'Age range'}).click();await page.getByRole('option',{name:'18–29',exact:true}).click();
 await page.getByRole('button',{name:'CONTINUE',exact:true}).click();await page.getByRole('button',{name:/Back/}).click();
 assert.equal(await group.getByRole('button',{name:'lb',exact:true}).getAttribute('aria-pressed'),'true');
 await page.reload();await page.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();
 assert.equal(await group.getByRole('button',{name:'lb',exact:true}).getAttribute('aria-pressed'),'true');
 await page.reload();
 const importButton=page.locator('.existing-plan-action');
 await importButton.first().click();
 assert.equal(await group.count(),0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).profile.units),'lb');
 await page.screenshot({path:`${out}/${width}-${style}-${appearance}-import.png`});
 const returning=createReturningUserFixture(1);returning.activeWorkout=null;returning.profile.units='lb';
 await page.evaluate(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),returning);await page.reload();
 await page.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(page, 'preferences'); await page.getByRole('button',{name:/Logging/}).click();
 const logging=page.locator('.unit-segmented');assert.equal(await logging.getByRole('button',{name:'lb',exact:true}).getAttribute('aria-pressed'),'true');
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).program);
 await logging.getByRole('button',{name:'kg',exact:true}).click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).profile.units),'kg');assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).program),before);
 await context.close();console.log(`${width} ${style} ${appearance}: units, reload, initial import passed`);
}
const fresh=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
const freshPage=await fresh.newPage();await freshPage.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
await freshPage.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();
assert.equal(await freshPage.getByRole('group',{name:'Weight units'}).getByRole('button',{name:'kg',exact:true}).getAttribute('aria-pressed'),'true');
await freshPage.getByRole('combobox',{name:'Age range'}).click();await freshPage.getByRole('option',{name:'18–29',exact:true}).click();
await freshPage.getByRole('button',{name:'CONTINUE',exact:true}).click();
assert.equal(await freshPage.locator('.weight-unit-choice').count(),0,'continuing needs no unit interaction');
await fresh.close();console.log('Default kg and Continue without unit interaction passed');
}finally{await browser.close();}
