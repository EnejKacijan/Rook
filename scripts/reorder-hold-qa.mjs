import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
await mkdir('artifacts/seven-issues',{recursive:true});
try{
 for(const width of [320,390,430])for(const theme of ['light','dark','premium-light','premium-dark']){
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,reducedMotion:theme==='premium-light'?'reduce':'no-preference'});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:4198/scripts/initial-reorder-review.html?case=${theme.startsWith('premium')?'freestyle':'active'}&long&rir`);
  await page.locator('.up-next-queue').waitFor();
  await page.locator('#reorder-qa summary').click();await page.locator('#theme').selectOption(theme);await page.locator('#reorder-qa').evaluate(n=>n.hidden=true);
  const queue=page.locator('.up-next-queue'),handles=queue.locator('.rook-reorder-handle'),cdp=await context.newCDPSession(page);
  const send=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:['touchEnd','touchCancel'].includes(type)?[]:[{x,y}],modifiers:0});
  const proof=()=>page.locator('#domain-proof').evaluate(n=>JSON.parse(n.textContent));
  await handles.nth(2).scrollIntoViewIfNeeded();
  let box=await handles.nth(2).boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  const before=await proof();
  await send('touchStart',x,y);await page.waitForTimeout(100);await send('touchEnd',x,y);
  assert.equal(await page.locator('.queue-reorder-preview').count(),0);assert.deepEqual(await proof(),before);
  const documentBefore=await page.evaluate(()=>scrollY),scrollBefore=await queue.evaluate(n=>n.scrollTop);
  await send('touchStart',x,y);
  for(let i=1;i<=8;i++){await send('touchMove',x,y-i*14);await page.waitForTimeout(16);}
  await send('touchEnd',x,y-112);await page.waitForTimeout(180);
  assert.equal(await page.locator('.queue-reorder-preview').count(),0);assert.deepEqual(await proof(),before);
  const documentAfter=await page.evaluate(()=>scrollY),scrollAfter=await queue.evaluate(n=>n.scrollTop);assert.ok(scrollAfter+documentAfter>scrollBefore+documentBefore,'native handle/page scrolling before hold');
  // Stop inertia, then hold a visible handle still before starting to drag.
  await page.waitForTimeout(650);await queue.evaluate(n=>n.scrollTop=0);await handles.nth(2).scrollIntoViewIfNeeded();
  box=await handles.nth(2).boundingBox();x=box.x+box.width/2;y=box.y+box.height/2;
  await send('touchStart',x,y);await page.waitForTimeout(200);assert.equal(await page.locator('.queue-reorder-preview').count(),0);
  await page.waitForTimeout(140);assert.equal(await page.locator('.queue-reorder-preview').count(),1);
  for(let i=1;i<=8;i++){await send('touchMove',x,y-i*13);await page.waitForTimeout(16);}
  assert.equal(await page.locator('.queue-reorder-preview').count(),1);
  await send('touchEnd',x,y-104);await page.waitForTimeout(220);
  const after=await proof();assert.notDeepEqual(after.session.exercises.map(e=>e.id),before.session.exercises.map(e=>e.id));
  assert.deepEqual(after.plan,before.plan);assert.equal(after.session.id,before.session.id);assert.deepEqual(after.session.exercises[0],before.session.exercises[0]);
  assert.deepEqual(after.session.exercises.map(e=>e.id).sort(),before.session.exercises.map(e=>e.id).sort());
  assert.equal(await page.locator('.queue-reorder-preview').count(),0);
  // Cancel after pickup, including near-edge auto-scroll. No new domain order.
  await handles.nth(1).scrollIntoViewIfNeeded();box=await handles.nth(1).boundingBox();x=box.x+box.width/2;y=box.y+box.height/2;
  await send('touchStart',x,y);await page.waitForTimeout(340);assert.equal(await page.locator('.queue-reorder-preview').count(),1);
  const q=await queue.boundingBox(),edge=Math.min(q.y+q.height-12,780),oldScroll=await queue.evaluate(n=>n.scrollTop);
  await send('touchMove',x,edge);await page.waitForTimeout(250);const autoScroll=await queue.evaluate(n=>n.scrollTop);
  await send('touchCancel',x,edge);await page.waitForTimeout(200);assert.equal(await page.locator('.queue-reorder-preview').count(),0);assert.deepEqual(await proof(),after);
  results.push({width,theme,scrollBefore,scrollAfter,oldScroll,autoScroll});console.log(`PASS native touch ${width} ${theme}`);
  await context.close();
 }
}finally{await browser.close();}
await writeFile('artifacts/seven-issues/reorder.json',JSON.stringify(results,null,2));
