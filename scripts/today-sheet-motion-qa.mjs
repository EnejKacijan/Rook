import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright-core';
const before=process.argv.includes('--before'),quick=process.argv.includes('--quick'),only320=process.argv.includes('--width-320'),engine=process.argv.includes('--webkit')?'webkit':'chromium';
const out='artifacts/today-sheet-motion',results=[];await mkdir(out,{recursive:true});
const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
const baseline=before?[]:JSON.parse(await readFile(`${out}/before-chromium.json`,'utf8'));
const settled=page=>page.waitForFunction(()=>!document.getAnimations().some(a=>['running','paused'].includes(a.playState)&&a.effect.getTiming().iterations!==Infinity));
const selector='.today-actions-sheet';
async function capture(page,trigger){
 await trigger.scrollIntoViewIfNeeded();
 await page.evaluate(()=>{
  const probe=window.todayMotion={frames:[],done:false,mounts:0,events:[],start:0,commits:window.sheetCommits.length};
  document.addEventListener('click',()=>probe.start=performance.now(),{once:true,capture:true});
  const observer=new MutationObserver(()=>{
   const panel=document.querySelector('.today-actions-sheet');if(!panel||probe.panel===panel)return;
   probe.mounts++;probe.panel=panel;if(probe.mounts>1)return;
   const layer=panel.parentElement,start=performance.now();probe.mount=start-probe.start;
   probe.animation=panel.getAnimations().map(a=>({name:a.animationName,timing:a.effect.getTiming(),frames:a.effect.getKeyframes()}));
   const record=event=>{if(event.target===panel||event.target===layer)probe.events.push({type:event.type,name:event.animationName,time:performance.now()-probe.start});};
   layer.addEventListener('animationstart',record);layer.addEventListener('animationend',record);
   const snapshot=()=>{const p=getComputedStyle(panel),l=getComputedStyle(layer),r=panel.getBoundingClientRect();return {time:performance.now()-probe.start,top:r.top,bottom:r.bottom,height:r.height,width:r.width,transform:p.transform,opacity:p.opacity,scrim:l.backgroundColor,scrollY,layerScroll:layer.scrollTop,todayScroll:document.querySelector('.today-screen').scrollTop,content:panel.innerText};};
   const frame=()=>{probe.frames.push(snapshot());if(performance.now()-start<340)requestAnimationFrame(frame);else{
    probe.final=snapshot();probe.commits=window.sheetCommits.slice(probe.commits);probe.longTasks=window.sheetLongTasks.filter(t=>t.start+t.duration>=probe.start&&t.start<performance.now());
    probe.duration=getComputedStyle(panel).animationDuration;probe.done=true;observer.disconnect();delete probe.panel;
   }};frame();
  });observer.observe(document.body,{childList:true,subtree:true});
 });
 await trigger.tap();await page.waitForFunction(()=>window.todayMotion.done);return page.evaluate(()=>window.todayMotion);
}
function verify(p,key,reduced){
 assert.equal(p.mounts,1,key);const f=p.frames,end=p.final;
 assert.equal(end.transform,'none',key);assert.ok(f.every(v=>Math.abs(v.height-end.height)<.1&&Math.abs(v.width-end.width)<.1),`${key} stable dimensions`);
 assert.ok(f.every(v=>v.layerScroll===0&&v.todayScroll===f[0].todayScroll&&v.scrollY===f[0].scrollY),`${key} stable scroll owners`);
 assert.ok(f.every(v=>v.content===end.content),`${key} no stale/intermediate action list`);
 if(before)return;
 const old=baseline.find(v=>v.key===key.replace('-reduced','-motion'));
 if(old&&engine==='chromium')for(const field of ['height','width','top','content'])assert.equal(end[field],old.probe.final[field],`${key}: ${field} unchanged`);
 if(reduced){assert.equal(p.animation.length,0,key);assert.ok(f.every(v=>v.transform==='none'&&v.opacity==='1'),key);return;}
 assert.equal(p.animation.length,1,key);assert.equal(p.animation[0].name,'rook-sheet-enter',key);
 assert.ok(f[0].top>=844,`${key} fully offscreen at mount: ${f[0].top}`);
 assert.ok(f[1].top>=844,`${key} first presentation frame must not skip entry: ${f[1].top}`);
 assert.ok(f.every(v=>v.opacity==='1'),`${key} no panel opacity masking`);
 for(let i=1;i<f.length;i++)assert.ok(f[i].top<=f[i-1].top+.1,`${key} monotonic entry`);
 assert.equal(p.events.filter(e=>e.name==='rook-sheet-enter'&&e.type==='animationstart').length,1,key);
 assert.equal(p.events.filter(e=>e.name==='rook-sheet-backdrop-in'&&e.type==='animationstart').length,1,key);
 const starts=p.events.filter(e=>e.type==='animationstart');assert.ok(Math.abs(starts[0].time-starts[1].time)<2,`${key} coherent scrim start`);
 assert.ok(p.animation[0].timing.duration>=160&&p.animation[0].timing.duration<=240,key);
}
async function close(page){
 await page.locator(selector+' .detail-header-close').tap();await page.locator(selector).waitFor({state:'detached'});await settled(page);
 assert.equal(await page.locator('.modal-layer').count(),0);await page.locator('.app-content[inert]').waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>document.body.style.position),'');
}
try{
 for(const width of quick?[390]:only320?[320]:[320,390,430])for(const theme of quick?['premium-dark']:['standard-light','standard-dark','premium-light','premium-dark'])for(const reduced of before?[false]:[false,true]){
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
  await page.addInitScript(()=>{window.sheetLongTasks=[];if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(l=>window.sheetLongTasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask'});});
  // Full flow matrix in Chromium; WebKit repeats every flow in Premium Dark
  // plus first-frame entry/close in all other themes at every width/motion setting.
  const entryOnly=engine==='webkit'&&theme!=='premium-dark';
  for(const kind of entryOnly?['planned']:['planned','completed','moved']){
   await page.goto(`http://127.0.0.1:4198/scripts/today-sheet-motion-review.html?theme=${theme}&${kind}=1`);const trigger=page.getByRole('button',{name:'Today options',exact:true});await trigger.waitFor();await settled(page);
   for(const flow of entryOnly?['unchanged']:kind==='planned'?['unchanged','rapid','slow']:['unchanged','rapid']){
    if(flow==='rapid')for(const day of (kind==='planned'?['Fri','Wed','Tue']:kind==='moved'?['Tue','Wed','Fri']:['Fri','Wed','Thu']))await page.locator(`.week-strip button[aria-label^="${day} "]`).tap();
    if(flow==='slow'){await page.locator('.week-strip button[aria-label^="Thu "]').tap();await page.waitForTimeout(280);}
    const selected=await page.locator('.week-strip [aria-pressed="true"]').getAttribute('aria-label');
    const key=`${width}-${theme}-${kind}-${flow}-${reduced?'reduced':'motion'}`,probe=await capture(page,trigger);results.push({key,selected,probe});verify(probe,key,reduced);
    if(!before&&width===390&&theme==='premium-dark'&&!reduced)await page.screenshot({path:`${out}/${engine}-${kind}-${flow}.png`});
    await close(page);
   }
  }
  assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${engine} ${width} ${theme} ${reduced?'reduced':'motion'}`);
 }
}finally{await browser.close();await writeFile(`${out}/${before?'before':'results'}-${engine}${quick?'-quick':only320?'-320':''}.json`,JSON.stringify(results,null,2));}
console.log(`PASS ${results.length} Today motion cases`);
