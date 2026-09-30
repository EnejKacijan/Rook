import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,webkit} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {startWorkout} from '../src/domain.js';

const origin=process.env.ROOK_QA_URL||'http://127.0.0.1:4273';
const webkitEngine=process.env.ROOK_QA_BROWSER==='webkit';
const browser=await (webkitEngine?webkit:chromium).launch(webkitEngine?{headless:true}:{channel:'chrome',headless:true});
const rirOn=process.env.ROOK_QA_RIR!=='off';
const themes=[['standard','light'],['standard','dark'],['premium','light'],['premium','dark']];
try {
 for(const width of [320,390,430])for(const [style,appearance] of themes){
  if(process.env.ROOK_QA_WIDTH&&Number(process.env.ROOK_QA_WIDTH)!==width)continue;
  if(process.env.ROOK_QA_THEME&&process.env.ROOK_QA_THEME!==`${style}-${appearance}`)continue;
  const state=createReturningUserFixture(0);
  state.activeWorkout=startWorkout(state,state.program.days[0]);
  state.activeWorkout.exercises[0].loggingMode='per_side';
  state.activeWorkout.exercises[0].unilateral=true;
  if(process.env.ROOK_QA_LONG_NAME==='1')
   state.activeWorkout.exercises[0].importedName='Single-arm standing cable rear delt fly with an unusually long exercise name';
  Object.assign(state.profile,{stylePreference:style,appearancePreference:appearance,
   themePreference:style==='premium'?'premium':appearance,rirEnabled:rirOn});
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,
   reducedMotion:width===320?'reduce':'no-preference',serviceWorkers:'block'});
  await context.addInitScript(data=>localStorage.setItem('lift-v2-state',JSON.stringify(data)),state);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>route.fulfill({json:{available:false}}));
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:/resume workout/i}).first().waitFor({timeout:10000});
  await page.getByRole('button',{name:/resume workout/i}).first().click();
  const row=page.locator('.set-row.per-side').first();await row.waitFor();
  const layout=await row.evaluate(node=>{
   const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
   const buttons=[...node.querySelectorAll('.logger-load > button,.unilateral-side .stepper > button')].map(box);
   const sides=[...node.querySelectorAll('.unilateral-side')].map(box);
   const sideLabels=[...node.querySelectorAll('.unilateral-side > span')].map(element=>({
    size:getComputedStyle(element).fontSize,weight:getComputedStyle(element).fontWeight,
    spacing:getComputedStyle(element).letterSpacing}));
   return {row:box(node),buttons,sides,sideLabels,rir:node.querySelector('.rir-trigger')?box(node.querySelector('.rir-trigger')):null,
    done:box(node.querySelector('.check')),overflow:document.documentElement.scrollWidth-innerWidth};
  });
  assert.equal(layout.buttons.length,6,`${width}/${style}/${appearance} stepper count`);
  assert(layout.buttons.every(item=>item.w>=44&&item.h>=44),`${width}/${style}/${appearance} native +/- targets ${JSON.stringify(layout.buttons)}`);
  assert(layout.sides[0].right<=layout.sides[1].x+1,`${width}/${style}/${appearance} sides overlap`);
  assert(layout.sideLabels.every(label=>label.size==='12px'&&Number(label.weight)<=600),`${width}/${style}/${appearance} L/R hierarchy ${JSON.stringify(layout.sideLabels)}`);
  if(rirOn)assert(layout.rir?.right<=layout.done.x+1,`${width}/${style}/${appearance} RIR/DONE overlap`);
  else assert.equal(layout.rir,null,`${width}/${style}/${appearance} RIR should be absent`);
  assert(layout.overflow<=1,`${width}/${style}/${appearance} page overflow ${layout.overflow}`);
  if(process.env.ROOK_QA_SCREENSHOT==='1'){
   await mkdir('artifacts/non-monetization-interaction',{recursive:true});
   await row.screenshot({path:`artifacts/non-monetization-interaction/per-side-${width}-${style}-${appearance}.png`});
   if(process.env.ROOK_QA_LONG_NAME==='1')
    await page.screenshot({path:`artifacts/non-monetization-interaction/long-name-${width}-${style}-${appearance}.png`,fullPage:false});
  }
  await page.getByRole('button',{name:'Exercise options'}).click();
  await page.waitForTimeout(280);
  await page.getByRole('button',{name:/Edit logging setup/i}).click();
  await page.getByRole('button',{name:/^Total/}).click();
  // A successful current-session choice dismisses the chooser itself.
  // Do not race its exit by clicking a transient Close control.
  await page.locator('.active-logging-setup-sheet').waitFor({state:'detached'});
  assert.equal(await page.locator('.set-row.per-side').count(),0,'Total must rerender immediately');
  await page.getByRole('button',{name:'Exercise options'}).click();
  await page.waitForTimeout(280);
  await page.getByRole('button',{name:/Edit logging setup/i}).click();
  await page.getByRole('button',{name:/^Reps per side/}).click();
  await page.locator('.active-logging-setup-sheet').waitFor({state:'detached'});
  await row.waitFor();
  if(width===390&&style==='standard'&&appearance==='light'){
   const left=page.getByRole('button',{name:/Increase left reps for set 1/i});
   const right=page.getByRole('button',{name:/Increase right reps for set 1/i});
   await left.click();await right.click();await right.click();
   const values=await row.locator('.unilateral-side input').evaluateAll(inputs=>inputs.map(input=>input.value));
   assert.deepEqual(values,['1','2'],'side values remain independent');
  }
  await page.getByRole('button',{name:'Back to Today'}).click();
  const calendar=page.getByRole('button',{name:/Open calendar,/}).first();await calendar.click();
  const dialog=page.getByRole('dialog',{name:'Workout calendar'});await dialog.waitFor();
  // Allow the shared sheet entrance to finish before measuring its hit surface.
  await page.waitForTimeout(280);
  const viewport=dialog.locator('.month-calendar-viewport');
  const before=await dialog.locator('h2').innerText();
  const beforeHeight=await viewport.evaluate(node=>node.getBoundingClientRect().height);
  const initialTrack=await dialog.locator('.month-calendar-pages').evaluate(node=>({transform:node.style.transform,
    current:node.querySelectorAll('.month-calendar-grid')[1].getBoundingClientRect().left}));
  const prior=await dialog.getByRole('button',{name:'Previous month'}).isEnabled();
  const next=await dialog.getByRole('button',{name:'Next month'}).isEnabled();
  assert(prior||next,'calendar must have an adjacent supported month');
  const dx=prior?1:-1,rect=await viewport.boundingBox(),session=webkitEngine?null:await context.newCDPSession(page);
  const x=rect.x+rect.width/2,y=rect.y+Math.min(95,rect.height/2),id=1;
  if(webkitEngine){await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx*rect.width*.5,y+2,{steps:4});}
  else {await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id}]});
   await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*rect.width*.5,y:y+2,id}]});}
  // Measure the rendered pointer position, not a coalesced intermediate event.
  // The pointer is still held; this does not wait for a release/settle animation.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const during=await dialog.evaluate(node=>{
   const pages=node.querySelectorAll('.month-calendar-grid');
   return {transform:node.querySelector('.month-calendar-pages').style.transform,
    pages:pages.length,current:pages[1].getBoundingClientRect().left,
    adjacent:pages[0].getBoundingClientRect().right};
  });
  assert.equal(during.pages,3);
  assert.match(during.transform,/translate3d\(/);
  assert.notEqual(during.transform,initialTrack.transform,`${width}/${style}/${appearance} month track did not move before release`);
  assert(Math.abs(during.current-initialTrack.current)>=rect.width*.3,`${width}/${style}/${appearance} current month did not follow finger: ${JSON.stringify({initialTrack,during})}`);
  if(webkitEngine)await page.mouse.up();
  else await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(260);
  assert.notEqual(await dialog.locator('h2').innerText(),before,'month flick should commit');
  const afterHeight=await viewport.evaluate(node=>node.getBoundingClientRect().height);
  assert(Math.abs(afterHeight-beforeHeight)<=1,`${width}/${style}/${appearance} month row-count height changed ${beforeHeight} -> ${afterHeight}`);
  assert.deepEqual(errors,[],`${width}/${style}/${appearance} page errors`);
  console.log(`PASS ${width} ${style}/${appearance}: six 44px targets, mode switch, no overflow, direct calendar drag`);
  await context.close();
 }
} finally {await browser.close();}
