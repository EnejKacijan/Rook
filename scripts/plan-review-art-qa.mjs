import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState } from '../src/domain.js';
const out=process.env.ART_PLAN_QA_DIR||'artifacts/plan-review-art';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [320,390,430])for(const appearance of ['light','dark'])for(const style of ['standard','premium']){
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
 const state=blankState();Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173');const next=()=>page.getByRole('button',{name:'CONTINUE',exact:true}).click();
  if(await page.getByRole('button',{name:'BUILD MY PLAN',exact:true}).isVisible())await page.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();
  await page.getByRole('combobox',{name:'Age range'}).click();await page.getByRole('option',{name:'18–29'}).click();await next();
 await page.getByRole('button',{name:'Build muscle',exact:true}).click();
 // Existing choice steps protect against accidental double taps for 350ms.
 await page.waitForTimeout(360);
 await page.getByRole('button',{name:/^Beginner/}).click();
 await page.getByRole('button',{name:'3 days',exact:true}).click();await page.getByLabel('Any day works').check();await page.getByRole('button',{name:'60 min',exact:true}).click();await next();
 await page.getByRole('button',{name:'Commercial gym',exact:true}).click();await next();await page.getByRole('button',{name:'Balanced',exact:true}).click();await next();await page.getByRole('button',{name:/Balanced starting point/}).click();await next();
 await page.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();await page.getByRole('heading',{name:'Your week is ready.'}).waitFor({timeout:30000});
 const row=page.locator('.plan-editor-summary').filter({has:page.locator('.plan-review-illustration')}).first();await row.scrollIntoViewIfNeeded();
 await row.locator('img').evaluate(img=>img.decode());await row.evaluate(e=>e.scrollIntoView({block:'start'}));await page.evaluate(()=>document.getAnimations().forEach(a=>a.finish()));
 assert.ok(await row.locator('img').evaluate(img=>img.naturalWidth>0));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:`${out}/${width}-${style}-${appearance}-collapsed.png`});
 await row.click();const expanded=page.locator('.plan-review-illustration.is-expanded img');await expanded.waitFor();await expanded.scrollIntoViewIfNeeded();await expanded.evaluate(img=>img.decode());
 assert.equal(await expanded.getAttribute('src'),await row.locator('img').getAttribute('src'));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.evaluate(()=>document.getAnimations().forEach(a=>a.finish()));await page.screenshot({path:`${out}/${width}-${style}-${appearance}-expanded.png`});
 await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state'))?.profile?.onboardingComplete);
 assert.equal(await page.locator('.plan-review-illustration').count(),0);
 await context.close();console.log(`${width}-${style}-${appearance}: passed`);
}}finally{await browser.close();}
