import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
const out='artifacts/starting-point';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const [width,appearance,style] of [[390,'light','standard'],[320,'dark','standard'],[390,'dark','premium']]){
const state=blankState();Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4175');await page.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();
const next=page.getByRole('button',{name:'CONTINUE',exact:true});assert.equal(await next.isDisabled(),true);assert.equal(await page.getByRole('button',{name:'kg',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.onboarding-footer .bottom-back').count(),0);
assert.match(await page.locator('.onboarding-content').textContent(),/Age helps ROOK.*training setup/);
await page.waitForTimeout(350);await page.screenshot({path:`${out}/${width}-${style}-${appearance}-empty.png`});
await page.locator('[aria-controls="age-range-options"]').click();await page.getByRole('option',{name:'18–29',exact:true}).click();
assert.equal(await next.isEnabled(),true);await page.waitForTimeout(350);await page.screenshot({path:`${out}/${width}-${style}-${appearance}-selected.png`});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const r=await next.boundingBox();assert.ok(r.y+r.height<=844);
await page.getByRole('button',{name:'lb',exact:true}).click();await next.click();assert.equal(await page.getByRole('button',{name:'Back',exact:true}).count(),1);await page.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await page.getByRole('button',{name:'lb',exact:true}).getAttribute('aria-pressed'),'true');
await page.getByRole('button',{name:'Back to plan options',exact:true}).click();await page.getByRole('button',{name:'BUILD MY PLAN',exact:true}).waitFor();await page.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();assert.equal(await page.getByRole('button',{name:'lb',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await next.isDisabled(),true);
console.log(`PASS ${width} ${style} ${appearance}`);await context.close();
}}finally{await browser.close();}
