import assert from 'node:assert/strict';
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {chromium, webkit} from 'playwright-core';

const phase = process.env.QA_PHASE || 'before';
const out = `artifacts/completed-note-keyboard/${phase}`;
await mkdir(out, {recursive:true});
const reports = [];
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function run(browser, engine, width, theme, reduced, position) {
  const context = await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'});
  const page = await context.newPage(), errors = [];
  if(process.env.QA_OLD_HELPER)await page.route('**/src/sheetVisibleViewport.js*',async route=>route.fulfill({contentType:'text/javascript',body:await readFile(process.env.QA_OLD_HELPER,'utf8')}));
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const vv = new EventTarget();
    Object.assign(vv,{height:844,offsetTop:0,scale:1});
    Object.defineProperty(window,'visualViewport',{configurable:true,value:vv});
    const originalInner = Object.getOwnPropertyDescriptor(window,'innerHeight');
    window.qaGeometry = (height, offsetTop=0, coResize=false) => {
      Object.defineProperty(window,'innerHeight',coResize?{configurable:true,value:height}:originalInner);
      if(coResize)Object.defineProperty(document.documentElement,'clientHeight',{configurable:true,value:height});
      else delete document.documentElement.clientHeight;
      Object.assign(vv,{height,offsetTop});
      vv.dispatchEvent(new Event('resize'));vv.dispatchEvent(new Event('scroll'));window.dispatchEvent(new Event('resize'));
    };
    window.qaTrace = [];
    const rect = node => {
      if(!node)return null;
      const box=node.getBoundingClientRect(),css=getComputedStyle(node);
      return {top:box.top,bottom:box.bottom,height:box.height,scrollTop:node.scrollTop,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight,
        transform:css.transform,cssTop:css.top,cssBottom:css.bottom,cssHeight:css.height,maxHeight:css.maxHeight,overflow:css.overflow,transition:css.transition,
        visible:css.getPropertyValue('--sheet-visible-height'),reference:css.getPropertyValue('--sheet-reference-height'),safe:css.getPropertyValue('--sheet-action-safe-bottom'),obscured:css.getPropertyValue('--sheet-obscured-bottom')};
    };
    window.qaSample = event => {
      const panel=document.querySelector('.completed-workout-detail');if(!panel)return;
      const layer=panel.parentElement,textarea=panel.querySelector('textarea');
      const sample={event,at:performance.now(),vv:{height:vv.height,offsetTop:vv.offsetTop},innerHeight,clientHeight:document.documentElement.clientHeight,scrollY,
        layer:rect(layer),panel:rect(panel),scroller:rect(panel),textarea:rect(textarea),focused:document.activeElement===textarea,keyboard:panel.hasAttribute('data-sheet-keyboard-open'),
        sticky:panel.querySelector('.detail-header')?.className,inert:document.querySelector('.app-shell')?.inert,
        animations:panel.getAnimations().map(a=>({name:a.animationName,time:a.currentTime,state:a.playState})),
        identity:!window.qaPanel||window.qaPanel===panel&&window.qaTextarea===textarea};
      window.qaTrace.push(sample);return sample;
    };
    for(const name of ['pointerdown','focus','focusin','scroll'])document.addEventListener(name,()=>window.qaSample(`document:${name}`),true);
    for(const name of ['resize','scroll']){vv.addEventListener(name,()=>window.qaSample(`vv:${name}:before`));window.addEventListener(name,()=>window.qaSample(`window:${name}`));}
    document.addEventListener('DOMContentLoaded',()=>{
      new MutationObserver(records=>{if(records.some(r=>r.target.matches?.('.modal-layer,.completed-workout-detail')))window.qaSample('style/attribute:after');}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['style','data-sheet-keyboard-open']});
    });
    const raf = requestAnimationFrame;
    window.requestAnimationFrame = callback => raf.call(window, time => {window.qaSample('rAF:before');callback(time);window.qaSample('rAF:after');});
  });
  await page.route('**/api/**',route=>route.fulfill({json:{available:false}}));
  await page.goto(`http://127.0.0.1:4198/scripts/completed-options-review.html?theme=${theme}`);
  const panel=page.locator('.completed-workout-detail'),note=page.getByRole('textbox',{name:'Session note'});
  await panel.waitFor();await page.waitForTimeout(350);
  const initial=JSON.parse(await page.locator('#completed-options-proof').textContent());
  await panel.evaluate((node,position)=>{
    const textarea=node.querySelector('textarea');
    if(position==='visible')node.scrollTop=Math.max(0,textarea.offsetTop-350);
    if(position==='sticky')node.scrollTop=Math.max(0,textarea.offsetTop-145);
    window.qaPanel=node;window.qaTextarea=textarea;
  },position);
  await frames(page);
  const samples=[await page.evaluate(()=>qaSample('rest'))];
  await note.tap();samples.push(await page.evaluate(()=>qaSample('focused')));
  let raceStyle;
  if(process.env.QA_RACE){
    // Explicit synthetic stress: CSS dynamic units change before the JS viewport
    // notification. This proves resilience to that ordering, NOT its occurrence
    // in the supplied physical-iPhone recording.
    raceStyle=await page.addStyleTag({content:'.modal-layer > .screen.detail-screen {max-height:calc(480px * .92)}'});
    await frames(page);samples.push(await page.evaluate(()=>qaSample('synthetic-css-before-vv')));
    await page.screenshot({path:`${out}/${engine}-${position}-css-order.png`});
  }
  for(const [height,offset] of [[760,0],[650,0],[540,0],[480,0],[480,24],[436,24],[480,0]]){
    await page.evaluate(([h,o,co])=>qaGeometry(h,o,co),[height,offset,width===320]);
    await frames(page);samples.push(await page.evaluate(()=>qaSample('step')));
  }
  if(raceStyle)await raceStyle.evaluate(node=>node.remove());
  await page.waitForTimeout(220);samples.push(await page.evaluate(()=>qaSample('settled')));
  await note.press('End');await note.pressSequentially(' keyboard QA');
  await page.screenshot({path:`${out}/${engine}-${width}-${theme}-${reduced}-${position}.png`});
  await panel.evaluate(node=>node.scrollTop+=32);await frames(page);
  for(const h of [540,650,760,844]){await page.evaluate(h=>qaGeometry(h),h);await frames(page);samples.push(await page.evaluate(()=>qaSample('closing')));}
  await page.waitForTimeout(220);samples.push(await page.evaluate(()=>qaSample('closed-focused')));
  await note.evaluate(node=>node.blur());await note.tap();
  for(const h of [760,650,540,480]){await page.evaluate(h=>qaGeometry(h),h);await frames(page);samples.push(await page.evaluate(()=>qaSample('reopen')));}
  await page.waitForTimeout(220);samples.push(await page.evaluate(()=>qaSample('reopened')));
  await note.press('End');await note.pressSequentially(' reopened');await note.evaluate(node=>node.blur());
  const final=JSON.parse(await page.locator('#completed-options-proof').textContent());
  const expected=structuredClone(initial);expected.state.workouts.find(w=>w.id===expected.detail.completedWorkout).sessionNote+=' keyboard QA reopened';
  assert.deepEqual(final,expected,'only the intended session note changed, with identical workout/history/session identity');
  const persisted=await page.evaluate(async()=>{const {loadState}=await import('/src/domain.js');return loadState();});
  assert.equal(persisted.workouts.find(w=>w.id===expected.detail.completedWorkout).sessionNote,expected.state.workouts.find(w=>w.id===expected.detail.completedWorkout).sessionNote,'note survives persistence read');
  const trace=await page.evaluate(()=>qaTrace),key=`${engine}-${width}-${theme}-${reduced}-${position}`;
  await writeFile(`${out}/${key}.json`,JSON.stringify({samples,trace,errors},null,2));
  reports.push({key,samples,errors});
  if(!phase.startsWith('before')){
    for(const s of samples){
      assert.equal(s.identity,true);assert.equal(s.scrollY,samples[0].scrollY);assert.equal(s.inert,true);assert.equal(s.layer.scrollTop,0);
      assert.ok(s.panel.top<=samples[0].panel.top+Math.max(0,s.vv.offsetTop)+1,`${key}: downward excursion ${s.panel.top}`);
      assert.ok(s.panel.bottom<=s.vv.height+s.vv.offsetTop+1,`${key}: keyboard-unsafe bottom`);
      assert.ok(s.layer.bottom>=844,`${key}: backdrop coverage`);
      assert.equal(s.animations.length,0,`${key}: entry replay`);
      if(s.event!=='rest')assert.ok(s.focused,`${key}: focus lost`);
    }
    for(const s of samples.filter(s=>['settled','reopened'].includes(s.event))){assert.ok(s.textarea.bottom<=s.panel.bottom-8,`${key}: textarea covered`);assert.ok(s.textarea.top>=s.panel.top+80,`${key}: textarea behind header`);assert.ok(s.focused);}
    assert.deepEqual(errors,[]);
    // Events before the shared writer deliberately see old geometry; assert
    // painted frame boundaries and completed style batches, not those snapshots.
    for(const s of trace.filter(s=>s.event==='rAF:after'&&s.at>=samples[1].at)){
      assert.ok(s.panel.top-s.vv.offsetTop<=samples[0].panel.top+1,`${key}: rAF excursion`);
      assert.equal(s.scrollY,samples[0].scrollY);assert.equal(s.identity,true);
    }
  }
  console.log(key,samples.map(s=>`${s.event}:${s.panel.top.toFixed(1)}/${s.panel.height.toFixed(1)}/${s.panel.scrollTop}`).join(' '));
  await context.close();
}

try{
  for(const [engine,type] of Object.entries({chromium,webkit})){
    if(process.env.QA_ENGINE&&engine!==process.env.QA_ENGINE)continue;
    const browser=await type.launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
    try{
      const cases=[];
      for(const width of (process.env.QA_MATRIX?[320,390,430]:[390]))
      for(const theme of (process.env.QA_MATRIX?['standard-light','standard-dark','premium-light','premium-dark']:['premium-dark']))
      for(const reduced of (process.env.QA_MATRIX?[false,true]:[false]))
      for(const position of (process.env.QA_MATRIX?['top','visible','sticky']:['top','sticky']))cases.push([width,theme,reduced,position]);
      for(let i=0;i<cases.length;i+=3)await Promise.all(cases.slice(i,i+3).map(args=>run(browser,engine,...args)));
    }finally{await browser.close();}
  }
}finally{await writeFile(`${out}/results.json`,JSON.stringify(reports,null,2));}
