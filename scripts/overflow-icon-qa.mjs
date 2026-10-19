import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright-core';

const phase=process.env.QA_PHASE||'after',out=`artifacts/overflow-icon/${phase}`,results=[];
await mkdir(out,{recursive:true});
const themes=['standard-light','standard-dark','premium-light','premium-dark'];
const rect=r=>({x:r.x,y:r.y,width:r.width,height:r.height});
const measure=page=>page.locator('.completed-workout-detail').evaluate(panel=>{
 const header=panel.querySelector('.detail-header'),button=header.querySelector('[aria-label="Workout options"]'),close=header.querySelector('.detail-header-close'),icon=button.querySelector('svg'),box=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};},s=getComputedStyle(button);
 const range=document.createRange();range.selectNodeContents(button);const glyph=range.getBoundingClientRect();
 return {button:box(button),close:box(close),header:box(header),title:box(header.querySelector('strong')),heading:box(panel.querySelector('h1')),handle:box(header.querySelector('.modal-drag-handle')),icon:icon?box(icon):null,paint:icon?icon.getBBox().width*icon.getBoundingClientRect().width/24:glyph.width,background:s.backgroundColor,color:s.color,border:s.borderWidth,radius:s.borderRadius,overflow:panel.scrollWidth>panel.clientWidth,aria:{label:button.getAttribute('aria-label'),popup:button.getAttribute('aria-haspopup'),expanded:button.getAttribute('aria-expanded'),iconHidden:icon?.getAttribute('aria-hidden')},circles:icon?[...icon.children].map(n=>({tag:n.tagName,fill:getComputedStyle(n).fill})):null};
});
for(const [engine,type] of Object.entries({chromium,webkit})){
 const browser=await type.launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{for(const width of [320,390,430])for(const theme of themes){
  const key=`${engine}-${width}-${theme}`,context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
  await page.goto(`http://127.0.0.1:4198/scripts/completed-options-review.html?theme=${theme}`);
  const panel=page.locator('.completed-workout-detail'),trigger=panel.locator('.completed-workout-options-trigger');await trigger.waitFor();await page.waitForTimeout(230);
  const before=await measure(page),state=await page.locator('#completed-options-proof').textContent();
  assert.ok(before.button.width>=44&&before.button.height>=44);assert.ok(before.close.width>=44&&before.close.height>=44);assert.equal(before.overflow,false);
  if(phase==='after'){
   const previous=JSON.parse(await readFile('artifacts/overflow-icon/before/results.json','utf8')).find(r=>r.key===key).geometry;
   for(const part of ['close','header','heading','handle'])assert.deepEqual(before[part],previous[part],`${key} unchanged ${part}`);
   assert.equal(before.close.x-before.button.x-before.button.width,6);assert.equal(before.button.y,before.close.y);
   assert.equal(before.icon.width,20);assert.equal(before.icon.height,20);assert.equal(before.aria.iconHidden,'true');assert.equal(before.aria.popup,'dialog');assert.equal(before.aria.expanded,'false');assert.equal(before.circles.length,3);assert.ok(before.circles.every(c=>c.tag==='circle'&&c.fill===before.color));
   assert.equal(before.icon.x+10,before.button.x+22);assert.equal(before.icon.y+10,before.button.y+22);assert.equal(before.background,'rgba(0, 0, 0, 0)');assert.equal(before.border,'0px');
   assert.ok(Math.abs(before.title.x+before.title.width/2-before.header.x-before.header.width/2)<.5);
   // Keyboard navigation uses the existing focus-visible convention.
   await page.keyboard.press('Tab');await trigger.focus();const focus=await trigger.evaluate(n=>{const s=getComputedStyle(n);return {visible:n.matches(':focus-visible'),width:s.outlineWidth,offset:s.outlineOffset,color:s.outlineColor};});assert.equal(focus.visible,true);assert.equal(focus.width,'2px');assert.equal(focus.offset,'-2px');
   if(width===390)await page.screenshot({path:`${out}/${key}-focus.png`});
   const b=await trigger.boundingBox();await page.mouse.move(b.x+22,b.y+22);await page.mouse.down();const pressed=await trigger.evaluate(n=>getComputedStyle(n).backgroundColor);assert.notEqual(pressed,before.background);if(width===390)await page.screenshot({path:`${out}/${key}-pressed.png`});await page.mouse.up();
   // Actual tap opens the same sheet; dismissal restores focus and state.
   if(await page.locator('.completed-workout-options-sheet').count()===0)await trigger.tap();const options=page.locator('.completed-workout-options-sheet');await options.waitFor();assert.equal(await trigger.getAttribute('aria-expanded'),'true');assert.deepEqual(await options.locator('.list-row').allTextContents(),['Save as template','Repeat today','Edit history','Delete workout']);await options.getByRole('button',{name:'Back to workout details',exact:true}).tap();await options.waitFor({state:'detached'});await page.waitForTimeout(40);assert.equal(await page.locator('#completed-options-proof').textContent(),state);assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert.equal(await trigger.evaluate(n=>n===document.activeElement),true);
  }
  await page.screenshot({path:`${out}/${key}.png`});assert.deepEqual(errors,[]);results.push({key,geometry:before});console.log(`PASS ${key}`);await context.close();
 }}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
}
console.log(`PASS ${results.length} completed overflow icon cases (${phase})`);
