import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
const out='artifacts/onboarding-auto-advance';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const [width,appearance] of [[390,'light'],[320,'dark']]){
const state=blankState();Object.assign(state.profile,{appearancePreference:appearance,themePreference:appearance,stylePreference:'standard'});
const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4175');await page.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();await page.getByRole('combobox',{name:'Age range'}).click();await page.getByRole('option',{name:'18–29',exact:true}).click();await page.getByRole('button',{name:'CONTINUE',exact:true}).click();
const step=async n=>assert.equal(await page.locator('.step-count').textContent(),`STEP ${n}/8`);
const shot=async name=>{await page.waitForTimeout(350);await page.screenshot({path:`${out}/${width}-${appearance}-${name}.png`});};
const baseline=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
await shot('goal');
for(const goal of ['Build muscle','Get stronger','Lose fat','General fitness','Athletic performance']){
assert.equal(await page.getByRole('button',{name:'CONTINUE',exact:true}).count(),0);
await page.getByRole('button',{name:goal,exact:true}).evaluate(e=>{e.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));e.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:2}));});await step(3);
await page.getByRole('button',{name:'Back',exact:true}).click();await step(2);assert.equal(await page.getByRole('button',{name:goal,exact:true}).getAttribute('aria-pressed'),'true');
}
await page.getByRole('button',{name:'Build muscle',exact:true}).click();await shot('experience');
for(const experience of ['Beginner','Intermediate','Advanced']){
const button=page.getByRole('button',{name:new RegExp(`^${experience}`)});await button.evaluate(e=>{e.click();e.click();});await step(4);
await page.getByRole('button',{name:'Back',exact:true}).click();await step(3);assert.equal(await page.getByRole('button',{name:new RegExp(`^${experience}`)}).getAttribute('aria-pressed'),'true');
}
// A trailing double-click arriving on the newly rendered step must not advance it.
await page.getByRole('button',{name:/^Beginner/}).evaluate(e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:2})));await step(3);
await page.getByRole('button',{name:/^Beginner/}).click();await shot('schedule');await page.getByRole('button',{name:'3 days',exact:true}).click();await page.getByLabel('Any day works').check();await page.getByRole('button',{name:'60 min',exact:true}).click();await page.getByRole('button',{name:'CONTINUE',exact:true}).click();
for(const location of ['Commercial gym','Home gym','Both']){await page.locator('.setup-environment').getByRole('button',{name:location,exact:true}).click();await step(5);assert.equal(await page.getByRole('button',{name:'CONTINUE',exact:true}).count(),1);}
await page.locator('.setup-environment').getByRole('button',{name:'Commercial gym',exact:true}).click();await shot('setup');await page.getByRole('button',{name:'CONTINUE',exact:true}).click();await page.getByRole('button',{name:'Balanced',exact:true}).click();await page.getByRole('button',{name:'CONTINUE',exact:true}).click();await step(7);await page.getByRole('button',{name:/Balanced starting point/}).click();await step(7);await shot('volume');
const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));if(saved)assert.deepEqual({profile:saved.profile,program:saved.program},{profile:baseline.profile,program:baseline.program});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
console.log(`PASS ${width} ${appearance}`);await context.close();
}}finally{await browser.close();}
