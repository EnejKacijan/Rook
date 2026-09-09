import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState } from '../src/domain.js';
const out='artifacts/session-duration';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
for(const width of [320,390,430])for(const appearance of ['light','dark'])for(const style of ['standard','premium']){
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
 const state=blankState();Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
 const page=await context.newPage();await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
 await page.goto('http://127.0.0.1:4173');await page.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();
 await page.getByRole('combobox',{name:'Age range'}).click();await page.getByRole('option',{name:'18–29'}).click();
 await page.getByRole('button',{name:'CONTINUE',exact:true}).click();await page.getByRole('button',{name:'Build muscle',exact:true}).click();await page.getByRole('button',{name:/^Beginner/}).click();
 await page.getByRole('button',{name:'3 days',exact:true}).click();await page.getByLabel('Any day works').check();
 for(const minutes of [30,45,60,75,90,120]){const option=page.getByRole('button',{name:`${minutes} min`,exact:true});await option.click();assert.equal(await option.getAttribute('aria-pressed'),'true');}
 await page.getByText('ROOK may finish sooner.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'CONTINUE',exact:true}).click();await page.getByRole('button',{name:'Back',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'120 min',exact:true}).getAttribute('aria-pressed'),'true');
 const geometry=await page.locator('.schedule-duration .onboarding-option').evaluateAll(nodes=>nodes.map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,overflow:e.scrollWidth>e.clientWidth})));
 assert.ok(geometry.every(r=>r.width>=44&&r.height>=44&&!r.overflow));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.evaluate(async()=>{await document.fonts.ready;document.getAnimations().forEach(a=>a.finish());window.scrollTo(0,0);document.querySelector('.onboarding').scrollTop=0;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await page.screenshot({path:`${out}/${width}-${style}-${appearance}.png`});
 await context.close();console.log(`${width}-${style}-${appearance}: passed`);
}
}finally{await browser.close();}
