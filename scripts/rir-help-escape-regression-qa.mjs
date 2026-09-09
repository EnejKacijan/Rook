import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const out='artifacts/release-regression';await mkdir(out,{recursive:true});const results=[];
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [320,390])for(const reducedMotion of ['reduce','no-preference']){
 const s=createReturningUserFixture(1);s.activeWorkout=null;s.ai.planUpgradeDismissed=true;
 const c=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',hasTouch:true,reducedMotion});await c.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),s);
 const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4190');
 await p.getByRole('button',{name:'PROFILE',exact:true}).click();await p.locator('[data-profile-area="preferences"]').click();await p.getByRole('button',{name:/Logging & increments/}).click();
 const trigger=p.getByRole('button',{name:'What is RIR?',exact:true}),units=p.locator('.unit-segmented');await units.waitFor();
 await p.evaluate(()=>{window.qaHelpWrites=0;const write=Storage.prototype.setItem;Storage.prototype.setItem=function(...args){window.qaHelpWrites++;return write.apply(this,args);};});
 await trigger.click();await p.getByRole('tooltip').waitFor();assert.equal(await trigger.evaluate(e=>document.activeElement===e),true,'noninteractive tooltip retains focus on its described trigger');
 const before=await p.evaluate(()=>localStorage.getItem('lift-v2-state'));await p.screenshot({path:`${out}/rir-escape-${width}-${reducedMotion}-before.png`});await p.keyboard.press('Escape');await p.getByRole('tooltip').waitFor({state:'detached'});await p.waitForTimeout(300);await p.screenshot({path:`${out}/rir-escape-${width}-${reducedMotion}-after.png`});
 const result={width,reducedMotion,tooltipClosed:await p.getByRole('tooltip').count()===0,loggingRemainsOpen:await units.isVisible(),stateUnchanged:await p.evaluate(()=>localStorage.getItem('lift-v2-state'))===before};
 assert.equal(await trigger.evaluate(e=>document.activeElement===e),true,'Escape restores trigger focus');
 await trigger.tap();await p.getByRole('tooltip').waitFor();await trigger.tap();await p.getByRole('tooltip').waitFor({state:'detached'});assert.equal(await units.isVisible(),true,'touch toggle keeps parent');
 await trigger.click();await p.getByRole('tooltip').waitFor();await p.getByText('Rest duration',{exact:true}).click();await p.getByRole('tooltip').waitFor({state:'detached'});assert.equal(await units.isVisible(),true,'outside click inside sheet keeps parent');
 assert.equal(await p.evaluate(()=>window.qaHelpWrites),0,'help does not persist');
 await trigger.click();await p.keyboard.press('Escape');assert.equal(await units.isVisible(),true);await p.keyboard.press('Escape');await units.waitFor({state:'detached'});
 const loggingTrigger=p.getByRole('button',{name:/Logging & increments/});
 await p.waitForFunction(element=>document.activeElement===element,await loggingTrigger.elementHandle());
 assert.equal(await loggingTrigger.evaluate(e=>document.activeElement===e),true,'parent dismissal restores originating control');
 result.secondEscapeClosesParent=true;results.push(result);await c.close();
}}finally{await browser.close();await writeFile(`${out}/rir-escape-results.json`,JSON.stringify(results,null,2));}
console.log(results);assert.ok(results.every(r=>r.tooltipClosed&&r.loggingRemainsOpen&&r.stateUnchanged),'Escape should dismiss the nested RIR tooltip without closing its parent Logging sheet');
