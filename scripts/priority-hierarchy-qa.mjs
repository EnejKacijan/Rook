import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
const out='artifacts/priority-hierarchy';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const [width,appearance,style] of [[390,'light','standard'],[320,'dark','standard'],[390,'dark','premium']]){
const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
const state=blankState();Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(process.env.ROOK_QA_URL || 'http://127.0.0.1:4175');await page.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();
const next=()=>page.getByRole('button',{name:'CONTINUE',exact:true}).click();
await page.getByRole('combobox',{name:'Age range'}).click();await page.getByRole('option',{name:'18–29',exact:true}).click();await next();
await page.getByRole('button',{name:'Build muscle',exact:true}).click();await page.getByRole('button',{name:/^Beginner/}).click();
await page.getByRole('button',{name:'3 days',exact:true}).click();await page.getByLabel('Any day works').check();await page.getByRole('button',{name:'60 min',exact:true}).click();await next();
await page.getByRole('button',{name:'Commercial gym',exact:true}).click();await next();
const root=page.locator('.onboarding-priorities'),help=root.locator('.physique-review-entry'),content=root.locator('.onboarding-content'),footer=root.locator('.onboarding-footer');await root.waitFor();await page.waitForTimeout(350);
const shot=async name=>{await page.waitForTimeout(200);await page.screenshot({path:`${out}/${width}-${style}-${appearance}-${name}.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);};
assert.equal(await root.getByText('Balanced plan',{exact:true}).count(),0);assert.equal(await root.getByText('No muscle group gets extra weekly volume.',{exact:true}).count(),0);
const order=await root.evaluate(e=>{const help=e.querySelector('.physique-review-entry').getBoundingClientRect(),choices=e.querySelector('.priority-choice-groups').getBoundingClientRect(),footer=e.querySelector('.onboarding-footer').getBoundingClientRect();return {helpTop:help.top,helpBottom:help.bottom,choicesTop:choices.top,footerTop:footer.top};});assert.ok(order.helpTop>=0&&order.helpBottom<order.footerTop&&order.helpBottom<=order.choicesTop);
await shot('balanced');
await help.click();await page.locator('.physique-review-screen').waitFor();await page.getByRole('button',{name:'SKIP',exact:true}).click();await root.waitFor();
await root.getByRole('button',{name:'Chest',exact:true}).click();await content.getByRole('button',{name:'Back',exact:true}).click();
assert.equal(await root.getByRole('button',{name:'Chest',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await content.getByRole('button',{name:'Back',exact:true}).getAttribute('aria-pressed'),'true');
await root.getByRole('button',{name:'Shoulders',exact:true}).dispatchEvent('click');assert.notEqual(await root.getByRole('button',{name:'Shoulders',exact:true}).getAttribute('aria-pressed'),'true');
await content.evaluate(e=>e.scrollTop=0);await shot('two-priorities');
await root.getByRole('button',{name:'Balanced',exact:true}).click();assert.equal(await root.locator('.priority-selection-summary').count(),0);
// Simulate enlarged text without shrinking controls or changing production CSS.
await page.setViewportSize({width,height:568});await root.evaluate(e=>{for(const n of e.querySelectorAll('h1,p,strong,small,.eyebrow'))n.style.fontSize=`${parseFloat(getComputedStyle(n).fontSize)*2}px`;});
await content.evaluate(e=>e.scrollTop=0);await shot('large-text-top');
const last=root.getByRole('button',{name:'Abs / core',exact:true});await last.scrollIntoViewIfNeeded();await page.waitForTimeout(200);
const lastBox=await last.boundingBox(),footerBox=await footer.boundingBox();assert.ok(lastBox.y>=0&&lastBox.y+lastBox.height<=footerBox.y+1,'final emphasis row clears footer');assert.ok(await content.evaluate(e=>e.scrollHeight>e.clientHeight&&e.scrollTop>0),'short enlarged layout scrolls');
await shot('large-text-bottom');await next();await page.getByText('STEP 7/8',{exact:true}).waitFor();
console.log(`PASS ${width} ${style} ${appearance}: help above choices, optional return, max-two, Balanced, sticky footer, 200% text/short-height scroll, Continue`);await context.close();
}}finally{await browser.close();}
