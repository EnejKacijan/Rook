import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {openProfileArea} from './qa-current-navigation.mjs';
const before=process.argv.includes('--before'),out=process.env.QA_OUTPUT_DIR||'artifacts/sheet-entry-motion',results=[];
const height=Number(process.env.QA_HEIGHT||844),widths=process.env.QA_WIDTH?[Number(process.env.QA_WIDTH)]:[320,390,430];
await mkdir(out,{recursive:true});
// Historical copy/date snapshots are only comparable when explicitly selected.
// Motion, ownership and current-state preservation always run without them.
const baseline=!before&&process.env.QA_BASELINE?JSON.parse(await readFile(process.env.QA_BASELINE,'utf8')):[];
const browser=await chromium.launch({channel:'chrome',headless:true});
const selectors={today:'.today-actions-sheet',restrictions:'.training-restrictions-screen',changePlan:'.change-plan-sheet',workout:'.active-workout-options-sheet',exercise:'.active-exercise-options-sheet',confirmation:'.freestyle-cancel-confirm',search:'.freestyle-queue-picker',finish:'.workout-confirm:not(.freestyle-cancel-confirm)',plate:'.plate-calculator-sheet'};
const settled=page=>page.waitForFunction(()=>!document.getAnimations().some(a=>['running','paused'].includes(a.playState)&&a.effect.getTiming().iterations!==Infinity));
async function prepare(page,name){
  if(name==='finish')return page.getByRole('button',{name:'Finish',exact:true});
  if(name==='plate')return page.getByRole('button',{name:/Open plate calculator/});
  if(name==='today')return page.getByRole('button',{name:'Today options',exact:true});
  if(name==='restrictions'||name==='changePlan'){
    await openProfileArea(page,name==='restrictions'?'training':'program');await settled(page);
    return page.getByRole('button',{name:name==='restrictions'?/^Training restrictions/:/^Replace plan/});
  }
  return page.getByRole('button',{name:{workout:'Workout options',exercise:'Exercise options',confirmation:'Cancel workout',search:'+ ADD EXERCISE'}[name],exact:true});
}
async function capture(page,trigger,selector){
  await trigger.scrollIntoViewIfNeeded();
  await page.evaluate(selector=>{
    window.sheetProbe={frames:[],done:false,started:0,longStart:window.sheetLongTasks.length};
    document.addEventListener('click',()=>{window.sheetProbe.started=performance.now();},{once:true,capture:true});
    const observer=new MutationObserver(()=>{
      const panel=document.querySelector(selector);if(!panel)return;observer.disconnect();
      const layer=panel.closest('.modal-layer'),start=performance.now(),box=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
      window.sheetProbe.mountDelay=start-window.sheetProbe.started;
      window.sheetProbe.animation=panel.getAnimations().map(a=>({name:a.animationName,timing:a.effect.getTiming(),frames:a.effect.getKeyframes()}));
      const frame=()=>{
        const s=getComputedStyle(panel),l=getComputedStyle(layer);
        window.sheetProbe.frames.push({time:performance.now()-start,transform:s.transform,opacity:s.opacity,backdrop:l.backgroundColor,rect:box(panel),scrollX,scrollY,layerTop:layer.scrollTop,overflow:document.documentElement.scrollWidth>innerWidth});
        const moving=panel.getAnimations().some(a=>['running','paused'].includes(a.playState)&&a.effect.getTiming().iterations!==Infinity);
        if(performance.now()-start<300 || moving&&performance.now()-start<1500)requestAnimationFrame(frame);else{
          window.sheetProbe.final={rect:box(panel),padding:[s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft],maxHeight:s.maxHeight,overflow:[s.overflowX,s.overflowY],text:panel.innerText,handleCount:panel.querySelectorAll('[aria-label="Drag down or tap to close"]').length};
          window.sheetProbe.done=true;
        }
      };frame();
    });observer.observe(document.body,{childList:true,subtree:true});
  },selector);
  await trigger.tap();await page.waitForFunction(()=>window.sheetProbe.done);
  return page.evaluate(()=>({...window.sheetProbe,longTasks:window.sheetLongTasks.slice(window.sheetProbe.longStart)}));
}
async function close(page,name){
  const panel=page.locator(selectors[name]);
  if(name==='confirmation')await panel.getByRole('button',{name:'KEEP WORKOUT',exact:true}).tap();
  else if(name==='finish')await panel.getByRole('button',{name:'KEEP TRAINING',exact:true}).tap();
  else await panel.locator('.detail-header-close,.sheet-close').first().tap();
  await panel.waitFor({state:'detached'});await settled(page);
  assert.equal(await page.locator('.modal-layer').count(),0);
  assert.equal(await page.evaluate(()=>document.body.style.position),'');
  assert.equal(await page.locator('.app-content[inert]').count(),0);
}
function y(transform){if(transform==='none')return 0;const n=transform.slice(transform.indexOf('(')+1,-1).split(',').map(Number);return n.length===16?n[13]:n[5];}
function verify(probe,key,reduced){
  const {frames,final}=probe,last=frames.at(-1);
  assert.equal(y(last.transform),0,key);assert.equal(Number(last.opacity),1,key);assert.equal(final.handleCount,1,key);
  assert.ok(frames.every(f=>!f.overflow&&f.scrollX===frames[0].scrollX&&f.scrollY===frames[0].scrollY&&f.layerTop===0),`${key} document/layer stability`);
  assert.ok(frames.every(f=>Math.abs(f.rect.height-final.rect.height)<.1&&Math.abs(f.rect.width-final.rect.width)<.1),`${key} stable size`);
  if(!before){
    if(baseline.length){const old=baseline.find(r=>r.key===key.replace('-reduced','-motion'));assert.ok(old,key);
    assert.deepEqual(final,old.probe.final,`${key} unchanged final geometry/content/scroll ownership`);}
    if(reduced){assert.ok(frames.every(f=>y(f.transform)===0&&Number(f.opacity)===1),key);assert.equal(probe.animation.length,0,key);}
    else{
      assert.ok(probe.animation[0].timing.duration>=160&&probe.animation[0].timing.duration<=240,key);assert.equal(probe.animation[0].frames[0].easing,'cubic-bezier(0.2, 0, 0, 1)',key);
      assert.ok(frames[0].rect.y>=height,`${key} starts fully below viewport`);
      assert.ok(frames.every(f=>y(f.transform)>=0),key);
      assert.ok(frames.every(f=>Number(f.opacity)===1),`${key} no opacity masking`);
      for(let i=1;i<frames.length;i++)assert.ok(y(frames[i].transform)<=y(frames[i-1].transform)+.1,`${key} continuous entry`);
    }
  }
}
async function dragAndRapid(page,name,trigger,reduced){
  const selector=selectors[name],panel=page.locator(selector);
  await trigger.tap();await panel.waitFor();await settled(page);
  assert.equal(y(await panel.evaluate(n=>getComputedStyle(n).transform)),0,'drag starts at zero');
  const handle=panel.getByRole('button',{name:'Drag down or tap to close',exact:true}),r=await handle.boundingBox(),cdp=await page.context().newCDPSession(page),point=d=>({x:r.x+r.width/2,y:r.y+14+d,id:1});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(0)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(24)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await settled(page);
  assert.ok(Math.abs(y(await panel.evaluate(n=>getComputedStyle(n).transform)))<.1,'cancelled drag returns to zero');
  // The shared drag correctly suppresses synthetic clicks for 350ms after
  // release. Escape tests dismissal here without mistaking that guard for a bug.
  await page.keyboard.press('Escape');await panel.waitFor({state:'detached'});await settled(page);
  // Escape immediately during entry, then reopen. No stale exit or inline transform may survive.
  for(let i=0;i<2;i++){
    await trigger.tap();await page.keyboard.press('Escape');await panel.waitFor({state:'detached'});
    await trigger.tap();await settled(page);
    assert.equal(await panel.evaluate(n=>n.style.transform),'');assert.equal(y(await panel.evaluate(n=>getComputedStyle(n).transform)),0);
    await close(page,name);
  }
  await cdp.detach();
}
try{
for(const width of widths)for(const theme of ['standard-light','standard-dark','premium-light','premium-dark'])for(const reduced of before?[false]:[false,true]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'}),page=await context.newPage(),errors=[];
  await page.clock.setFixedTime(new Date('2026-09-21T12:00:00'));
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
  await page.addInitScript(()=>{window.sheetLongTasks=[];new PerformanceObserver(list=>window.sheetLongTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:false});});
  for(const active of [false,true,'finish','plate']){
    await page.goto(`http://127.0.0.1:4198/scripts/sheet-entry-motion-review.html?theme=${theme}${active?'&active=1':''}${typeof active==='string'?`&kind=${active}`:''}`);await page.getByRole('button',{name:'TODAY',exact:true}).waitFor();
    if(active)await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).tap();await settled(page);
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
    for(const name of typeof active==='string'?[active]:active?['workout','exercise','confirmation','search']:['today','restrictions','changePlan']){
      const key=`${width}-${theme}-${name}-${reduced?'reduced':'motion'}`,trigger=await prepare(page,name),probe=await capture(page,trigger,selectors[name]);
      await writeFile(`${out}/last-probe.json`,JSON.stringify({key,probe},null,2));verify(probe,key,reduced);
      if(!before&&width===390&&theme==='premium-dark'&&!reduced)await page.screenshot({path:`${out}/${name}.png`});
      await close(page,name);
      if(!before&&theme==='standard-light'&&(name==='today'||name==='workout'||name==='search'))await dragAndRapid(page,name,trigger,reduced);
      const latest=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
      for(const field of ['activeWorkout','workouts','program','profile'])assert.deepEqual(latest[field],saved[field],`${key}: ${field} unchanged`);
      results.push({key,probe});
    }
  }
  assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width} ${theme} ${reduced?'reduced':'motion'}: 9 sheet surfaces`);
}
}finally{await writeFile(`${out}/${before?'before':'results'}.json`,JSON.stringify(results,null,2));await browser.close();}
console.log(`PASS ${results.length} sheet/width/theme/motion cases.`);
