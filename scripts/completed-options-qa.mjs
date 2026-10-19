import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const out='artifacts/completed-options',results=[];await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const wait=page=>page.waitForTimeout(260);
const measure=page=>page.evaluate(()=>{
 const panel=document.querySelector('.completed-workout-detail'),header=panel.querySelector('.detail-header'),menu=panel.querySelector('[aria-label="Workout options"]'),close=header.querySelector('.detail-header-close'),title=header.querySelector('strong');
 const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
 return {menu:rect(menu),close:rect(close),title:rect(title),header:rect(header),scroll:panel.scrollTop,overflow:panel.scrollWidth>panel.clientWidth,overflowElements:[...panel.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>panel.getBoundingClientRect().right+1).slice(0,8).map(n=>({tag:n.tagName,className:n.className,box:rect(n)}))};
});
async function touch(page,start,end){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start[0],y:start[1],id:1}]});for(let step=1;step<=6;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start[0]+(end[0]-start[0])*step/6,y:start[1]+(end[1]-start[1])*step/6,id:1}]});await page.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();await wait(page);}
try{
 for(const width of [320,390,430])for(const theme of ['standard-light','standard-dark','premium-light','premium-dark'])for(const reduced of [false,true]){
  const key=`${width}-${theme}-${reduced?'reduced':'motion'}`,context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:3,reducedMotion:reduced?'reduce':'no-preference',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
  await page.goto(`http://127.0.0.1:4198/scripts/completed-options-review.html?theme=${theme}`);await page.locator('.completed-workout-detail').waitFor();await wait(page);
  const proof=async()=>JSON.parse(await page.locator('#completed-options-proof').textContent()),initial=await proof();
  const panel=page.locator('.completed-workout-detail'),trigger=page.getByRole('button',{name:'Workout options',exact:true});
  await panel.locator('.session-log-trigger').first().tap();await panel.evaluate(n=>n.scrollTop=170);await wait(page);
  const geometry=await measure(page);for(const control of [geometry.menu,geometry.close]){assert.ok(control.width>=44&&control.height>=44);}
  assert.ok(geometry.menu.right<=geometry.close.x+.1);assert.ok(Math.abs(geometry.title.x+geometry.title.width/2-(geometry.header.x+geometry.header.width/2))<1,'header title centered');assert.equal(geometry.overflow,false,JSON.stringify(geometry));
  const open=async()=>{const r=await trigger.boundingBox();await page.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);await wait(page);await page.locator('.completed-workout-options-sheet').waitFor();};
  const checkParent=async()=>{await wait(page);assert.equal(await panel.count(),1);assert.equal(await page.locator('.modal-layer').count(),1);assert.equal(await panel.evaluate(n=>n.scrollTop),geometry.scroll);assert.equal(await trigger.evaluate(n=>n===document.activeElement),true);assert.deepEqual(await proof(),initial);};
  await open();const options=page.locator('.completed-workout-options-sheet');
  const layout=await options.evaluate(n=>{const r=n.getBoundingClientRect(),style=getComputedStyle(n);return {height:r.height,bottom:r.bottom,paddingBottom:parseFloat(style.paddingBottom),overflow:n.scrollWidth>n.clientWidth,backgrounds:[...document.querySelectorAll('.modal-layer')].map(l=>getComputedStyle(l).backgroundColor),rows:[...n.querySelectorAll('.list-row')].map(b=>({text:b.textContent,height:b.getBoundingClientRect().height,color:getComputedStyle(b).color,childColor:b.firstElementChild?getComputedStyle(b.firstElementChild).color:null})),inert:document.querySelector('.completed-workout-detail').inert};});
  assert.equal(layout.overflow,false);assert.ok(layout.inert);assert.ok(layout.paddingBottom>=20);assert.ok(layout.rows.every(r=>r.height>=44));assert.equal(layout.backgrounds[0],'rgba(0, 0, 0, 0)');assert.notEqual(layout.backgrounds[1],'rgba(0, 0, 0, 0)');assert.notEqual(layout.rows[3].color,layout.rows[0].color);assert.equal(layout.rows[3].childColor,layout.rows[3].color);
  for(let i=0;i<9;i++){await page.keyboard.press('Tab');assert.equal(await options.evaluate(n=>n.contains(document.activeElement)),true,'no focus leak');}
  const beforeScroll=await panel.evaluate(n=>n.scrollTop);await page.mouse.move(width/2,120);await page.mouse.wheel(0,320);assert.equal(await panel.evaluate(n=>n.scrollTop),beforeScroll);
  await page.screenshot({path:`${out}/${key}-options.png`});await options.getByRole('button',{name:'Close Workout options',exact:true}).tap();await checkParent();
  await open();await page.keyboard.press('Escape');await checkParent();
  await open();await page.mouse.click(width/2,15);await checkParent();
  await open();let box=await options.boundingBox();await touch(page,[width/2,box.y+14],[width/2,box.y+200]);await checkParent();
  await open();box=await options.boundingBox();await touch(page,[box.x+5,box.y+110],[box.x+width*.72,box.y+110]);await checkParent();
  for(const action of ['Save as template','Edit history','Repeat today']){
   await open();await options.getByRole('button',{name:action,exact:true}).tap();await wait(page);
   assert.equal(await page.locator('.modal-layer').count(),1,'options unmounted before child');assert.equal(await panel.count(),0);
   const child=page.locator('.modal-layer > main');await child.getByRole('button',{name:'Back',exact:true}).tap();await checkParent();
   await open();await options.getByRole('button',{name:action,exact:true}).tap();await wait(page);
   box=await child.boundingBox();await touch(page,[box.x+5,box.y+105],[box.x+width*.72,box.y+105]);await checkParent();
  }
  await open();await options.getByRole('button',{name:'Delete workout',exact:true}).tap();await wait(page);assert.equal(await panel.count(),1);await page.getByRole('button',{name:'CANCEL',exact:true}).tap();await checkParent();
  await open();await options.getByRole('button',{name:'Save as template',exact:true}).tap();await wait(page);await page.getByRole('button',{name:'Save template',exact:true}).tap();await wait(page);
  const saved=await proof();assert.deepEqual(saved.detail,initial.detail);assert.deepEqual(saved.state.workouts,initial.state.workouts);assert.equal(saved.state.savedWorkoutTemplates.length,initial.state.savedWorkoutTemplates.length+1);assert.ok(await panel.getByText('Workout template saved',{exact:true}).isVisible());
  assert.deepEqual(errors,[]);results.push({key,geometry,layout});console.log(`PASS ${key}`);await context.close();
 }
 for(const theme of ['standard-light','standard-dark','premium-light','premium-dark']){
  const context=await browser.newContext({viewport:{width:320,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'}),page=await context.newPage();await page.goto(`http://127.0.0.1:4198/scripts/completed-options-review.html?theme=${theme}&active=1`);await page.getByRole('button',{name:'Workout options',exact:true}).tap();await wait(page);
  const options=page.locator('.completed-workout-options-sheet');assert.equal(await options.getByRole('button',{name:/Repeat today/}).isDisabled(),true);assert.equal(await options.getByRole('button',{name:/Delete workout/}).isDisabled(),true);assert.ok(await options.getByText('Finish your active workout before deleting history.',{exact:true}).isVisible());assert.equal(await options.evaluate(n=>n.scrollWidth>n.clientWidth),false);await page.screenshot({path:`${out}/320-${theme}-guards.png`});results.push({key:`320-${theme}-guards`});await context.close();
 }
}finally{await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
console.log(`PASS ${results.length} completed workout options cases`);
