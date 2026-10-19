import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const out='artifacts/overflow-icon/consumers',results=[];await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
async function icon(button){await button.scrollIntoViewIfNeeded();return button.evaluate(n=>{const r=n.getBoundingClientRect(),svg=n.querySelector('.rook-overflow-icon'),b=svg.getBoundingClientRect();return {label:n.getAttribute('aria-label'),width:r.width,height:r.height,iconWidth:b.width,iconHeight:b.height,centerX:b.x+b.width/2-r.x-r.width/2,centerY:b.y+b.height/2-r.y-r.height/2,circles:svg.querySelectorAll('circle').length,color:getComputedStyle(n).color,fill:getComputedStyle(svg).fill,ariaHidden:svg.getAttribute('aria-hidden')};});}
function verify(value){assert.equal(value.iconWidth,20);assert.equal(value.iconHeight,20);assert.equal(value.circles,3);assert.equal(value.fill,value.color);assert.equal(value.ariaHidden,'true');assert.ok(Math.abs(value.centerX)<1&&Math.abs(value.centerY)<1,JSON.stringify(value));}
try{for(const width of [320,390,430])for(const theme of ['standard-light','standard-dark','premium-light','premium-dark']){
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'}),page=await context.newPage(),samples=[];
 await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(`http://127.0.0.1:4198/scripts/search-keyboard-review.html?theme=${theme}`);
 const today=page.getByRole('button',{name:'Today options',exact:true});samples.push(await icon(today));await today.tap();const todaySheet=page.locator('.today-actions-sheet');await todaySheet.waitFor();await todaySheet.locator('.detail-header-close').tap();await todaySheet.waitFor({state:'detached'});
 await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).tap();await page.getByRole('button',{name:'+ ADD EXERCISE',exact:true}).tap();await page.locator('.queue-add-button').first().tap();await page.locator('.freestyle-queue-picker .detail-header-close').tap();await page.locator('.freestyle-queue-picker').waitFor({state:'detached'});
 const state=await page.evaluate(()=>JSON.stringify(searchKeyboardReview.state()));
 for(const [selector,sheetSelector] of [['.workout-options-trigger','.active-workout-options-sheet'],['.exercise-options-button','.active-exercise-options-sheet']]){const button=page.locator(selector);samples.push(await icon(button));await button.tap();const sheet=page.locator(sheetSelector);await sheet.waitFor();await sheet.locator('.sheet-close').tap();await sheet.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>JSON.stringify(searchKeyboardReview.state())),state);}
 if(width===390)await page.screenshot({path:`${out}/${theme}-active.png`});
 await page.goto(`http://127.0.0.1:4198/scripts/saved-workout-review.html?theme=${theme}`);await page.locator('.saved-workout-list button').first().tap();const saved=page.locator('.saved-template-options-trigger');samples.push(await icon(saved));const savedState=await page.locator('#saved-proof').textContent();await saved.tap();await page.locator('.saved-template-options .detail-header-back').tap();await page.locator('.saved-template-options').waitFor({state:'detached'});assert.equal(await page.locator('#saved-proof').textContent(),savedState);
 if(width===390)await page.screenshot({path:`${out}/${theme}-saved.png`});
 for(const mode of ['edit','scratch']){
  await page.goto(`http://127.0.0.1:4198/scripts/reorder-review.html?case=${mode}`);await page.locator('#reorder-qa > summary').click();await page.locator('#theme').selectOption(theme.startsWith('premium')?theme:theme.endsWith('dark')?'dark':'light');await page.locator('#reorder-qa > summary').click();
  const button=page.locator('.plan-workout-overflow').first();if(!await button.isVisible())await page.locator('.plan-editor-summary').first().tap();samples.push(await icon(button));const planState=await page.locator('#domain-proof').textContent();await button.tap();const sheet=page.locator('.plan-workout-actions-sheet');await sheet.waitFor();await sheet.locator('.detail-header-close').tap();await sheet.waitFor({state:'detached'});assert.equal(await page.locator('#domain-proof').textContent(),planState);
  if(width===390)await page.screenshot({path:`${out}/${theme}-${mode}.png`});
 }
 samples.forEach(verify);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);results.push({width,theme,samples});console.log(`PASS ${width} ${theme}: Today, Active, Exercise, Saved, Plan, Scratch`);await context.close();
}}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
