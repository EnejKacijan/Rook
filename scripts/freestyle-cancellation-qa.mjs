import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const out='artifacts/freestyle-cancellation',results=[];
const resultFile=process.env.QA_WIDTH?`results-${process.env.QA_WIDTH}.json`:'results.json';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const selector='.freestyle-cancel-confirm';
async function state(page){return page.evaluate(async()=>structuredClone((await import('/src/domain.js')).loadState()));}
async function geometry(page){return page.locator(selector).evaluate(panel=>{
  const box=n=>n.getBoundingClientRect().toJSON(),buttons=[...panel.querySelectorAll('.workout-confirm-actions button')];
  const workout=document.querySelector('[data-active-workout]');
  return {panel:box(panel),buttons:buttons.map(n=>({...box(n),text:n.textContent,background:getComputedStyle(n).backgroundColor})),
    paddingBottom:parseFloat(getComputedStyle(panel).paddingBottom),scrollWidth:panel.scrollWidth,clientWidth:panel.clientWidth,documentWidth:document.documentElement.scrollWidth,horizontalOverflow:panel.scrollWidth>panel.clientWidth||document.documentElement.scrollWidth>innerWidth,
    backgroundInert:workout.inert,backgroundHidden:workout.getAttribute('aria-hidden'),focus:document.activeElement.textContent,
    roles:document.querySelectorAll('[role=dialog]').length};
});}
function verify(g){assert.equal(g.horizontalOverflow,false,JSON.stringify(g));assert.equal(g.backgroundInert,true);assert.equal(g.backgroundHidden,'true');assert.equal(g.roles,1);
  assert.ok(g.buttons.every(b=>b.height>=44&&b.width>=44&&b.left>=g.panel.left&&b.right<=g.panel.right));
  assert.ok(g.buttons[0].right<=g.buttons[1].left);assert.notEqual(g.buttons[0].background,g.buttons[1].background);
  assert.ok(g.buttons.at(-1).bottom<=g.panel.bottom-g.paddingBottom+1);
}
async function scrolls(page){return page.evaluate(()=>[document.scrollingElement,...document.querySelectorAll('.app-content,[data-active-workout],.workout-motion-boundary,.exercise-panel')].map(n=>({class:n.className,top:n.scrollTop})));}
async function gesture(page,from,to,cancel=false){
  const cdp=await page.context().newCDPSession(page),point=(x,y)=>({x,y,id:1});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(...from)]});
  for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(from[0]+(to[0]-from[0])*i/10,from[1]+(to[1]-from[1])*i/10)]});await page.evaluate(()=>new Promise(requestAnimationFrame));}
  await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();
}
try{
for(const width of process.env.QA_WIDTH?[Number(process.env.QA_WIDTH)]:[320,390,430])for(const theme of process.env.QA_THEME?[process.env.QA_THEME]:['light','dark','premium-light','premium-dark']){
  const key=`${width}-${theme}`,reduced=width===430,context=await browser.newContext({viewport:{width,height:740},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'});
  await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
  await page.goto('http://127.0.0.1:4198/scripts/exercise-preview-review.html');
  await page.locator('#preview-qa>summary').click();await page.locator('#fixture').selectOption('Queued');await page.locator('#reset').click();
  await page.locator('#preview-qa>summary').click();await page.locator('#theme').selectOption(theme);await page.locator('#preview-qa>summary').click();
  if(reduced){await page.locator('#preview-qa>summary').click();await page.locator('#reduced').click();}
  if(width===390)await page.addStyleTag({content:'.freestyle-cancel-confirm { --sheet-action-safe-bottom:34px !important; }'});
  await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).tap();
  for(let i=0;i<5;i++)await page.getByRole('button',{name:'+ ADD SET',exact:true}).tap();
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>document.getAnimations().every(a=>a.playState==='finished'));
  const input=page.locator('input[aria-label="Weight in kg for set 1"]');await input.fill('142,5');
  const pending=await state(page),oldInput=await input.elementHandle(),trigger=page.locator('[data-freestyle-cancel]');
  await trigger.scrollIntoViewIfNeeded();const beforeScroll=await scrolls(page);
  const open=async()=>{await trigger.evaluate(n=>n.addEventListener('pointerdown',()=>window.__cancelTapScroll=scrollY,{once:true,capture:true}));await trigger.tap();await page.waitForFunction(()=>document.activeElement?.hasAttribute('data-sheet-initial-focus'));await page.waitForFunction(()=>document.querySelector('.freestyle-cancel-confirm').getAnimations().every(a=>a.playState==='finished'));};
  const safeClosed=async()=>{await page.locator(selector).waitFor({state:'detached'});await page.waitForFunction(()=>document.activeElement?.hasAttribute('data-freestyle-cancel'));assert.deepEqual((await state(page)).activeWorkout,pending.activeWorkout);assert.deepEqual(await scrolls(page),beforeScroll);};
  await open();const g=await geometry(page);verify(g);assert.equal(g.focus,'KEEP WORKOUT');assert.deepEqual((await state(page)).activeWorkout,pending.activeWorkout);
  assert.equal(g.paddingBottom,width===390?54:20);
  const openingScroll={before:beforeScroll,tap:await page.evaluate(()=>window.__cancelTapScroll),lockedTop:await page.evaluate(()=>document.body.style.top)};
  assert.equal(await input.inputValue(),'142,5');await page.screenshot({path:`${out}/${key}.png`});
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'CANCEL WORKOUT');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Back');
  await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'CANCEL WORKOUT');
  // Stress wrapping without changing product copy or storing fixture data.
  await page.locator(selector).evaluate(p=>{p.querySelector('.primary').textContent='KEEP THIS FREESTYLE WORKOUT';p.querySelector('.danger').textContent='CANCEL THIS FREESTYLE WORKOUT';p.querySelector('p').textContent+=' Representative longer localized explanatory text without changing session data.';});
  const long=await geometry(page);verify(long);await page.locator(`${selector} .primary`).tap();await safeClosed();
  assert.equal(await input.evaluate((n,original)=>n===original,oldInput),true);assert.equal(await input.inputValue(),'142,5');
  const dismissals=[];
  for(const method of ['Back','Escape','handle','backdrop','drag','edge']){
    await open();const r=await page.locator(selector).boundingBox();
    if(method==='Back')await page.getByRole('button',{name:'Back',exact:true}).tap();
    if(method==='Escape')await page.keyboard.press('Escape');
    if(method==='handle')await page.getByRole('button',{name:'Drag down or tap to close',exact:true}).tap();
    if(method==='backdrop')await page.touchscreen.tap(width/2,Math.max(40,r.y-30));
    if(method==='drag')await gesture(page,[width/2,r.y+18],[width/2,r.y+148]);
    if(method==='edge')await gesture(page,[3,r.y+r.height/2],[width-30,r.y+r.height/2]);
    await safeClosed();dismissals.push(method);
  }
  await open();const r=await page.locator(selector).boundingBox();await gesture(page,[width/2,r.y+18],[width/2,r.y+70],true);
  assert.equal(await page.locator(selector).isVisible(),true);assert.deepEqual((await state(page)).activeWorkout,pending.activeWorkout);
  // Existing sheet gestures suppress the trailing click for 350ms after a drag.
  await page.waitForTimeout(400);
  await page.getByRole('button',{name:'KEEP WORKOUT',exact:true}).tap();await safeClosed();
  // Raw draft retained across safe dismissal still uses the normal commit path.
  await input.fill('62.5');await input.press('Enter');await page.waitForFunction(async()=>(await import('/src/domain.js')).loadState().activeWorkout.exercises[0].sets[0].weight===62.5);
  const beforeCancel=await state(page);await open();await page.getByRole('button',{name:'CANCEL WORKOUT',exact:true}).tap();
  await page.locator(selector).waitFor({state:'detached'});await page.getByRole('button',{name:'TODAY',exact:true}).waitFor();
  const afterCancel=await state(page);assert.equal(afterCancel.activeWorkout,null);assert.deepEqual(afterCancel.program,beforeCancel.program);assert.deepEqual(afterCancel.workouts,beforeCancel.workouts);
  assert.deepEqual(errors,[]);results.push({key,reduced,safeAreaSimulation:width===390?34:0,geometry:g,longCopyGeometry:long,dismissals,openingScroll,rawDraftPreserved:true,scrollPreserved:true,confirmedCancel:true});
  await writeFile(`${out}/${resultFile}`,JSON.stringify(results,null,2));console.log(`${key}: layout, focus, raw draft, scroll, ${dismissals.join('/')}, cancel, history/plan preservation passed`);await context.close();
}
}finally{await browser.close();}
