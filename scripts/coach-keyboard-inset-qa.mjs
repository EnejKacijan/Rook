import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';

const before = process.argv.includes('--before');
const out = 'artifacts/COACH-KEYBOARD-INSET';
await mkdir(out, {recursive: true});
const browser = await chromium.launch({channel: 'chrome', headless: true});
const results = [];
const frames = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
async function measure(p) {
  return p.evaluate(() => {
    const box = selector => {
      const e = document.querySelector(selector), c = getComputedStyle(e), r = e.getBoundingClientRect();
      return {top:r.top, bottom:r.bottom, height:r.height, paddingBottom:parseFloat(c.paddingBottom), marginBottom:parseFloat(c.marginBottom), display:c.display, position:c.position, scrollTop:e.scrollTop, clientHeight:e.clientHeight, scrollHeight:e.scrollHeight};
    };
    const root=box('.coach-screen'), composer=box('.coach-input'), input=box('.coach-input textarea'), nav=box('.bottom-nav');
    const visibleBottom=visualViewport.height+visualViewport.offsetTop;
    return {visibleBottom, viewport:{height:visualViewport.height, offset:visualViewport.offsetTop, layoutHeight:innerHeight}, root, composer, input, nav, transcript:box('.coach-scroll'),
      focused:document.activeElement===document.querySelector('.coach-input textarea'), keyboardState:document.querySelector('.coach-screen').getAttribute('data-coach-keyboard-open'),
      viewportToRoot:visibleBottom-root.bottom, rootToComposer:root.bottom-composer.bottom, composerToInput:composer.bottom-input.bottom, totalInputGap:visibleBottom-input.bottom,
      documentY:scrollY, documentPadding:parseFloat(getComputedStyle(document.body).paddingBottom), footerCount:document.querySelector('.coach-screen').querySelectorAll('.sheet-action-footer').length,
      safeToken:document.querySelector('.coach-screen').style.getPropertyValue('--sheet-action-safe-bottom'), navToken:getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-total-height')};
  });
}
function keyboard(m) {
  assert.equal(m.rootToComposer,0,'keyboard must replace the entire nav footprint');
  assert.equal(m.viewportToRoot,0,'visible viewport is applied exactly once');
  assert.equal(m.totalInputGap,8,'existing 8px action spacing token');
  assert.equal(m.nav.height,0,'keyboard hides nav independently of textarea focus');
  assert.equal(m.documentY,0);
}
try {
  for(const width of before?[390]:[320,390]) for(const style of before?['standard']:['standard','premium']) for(const appearance of before?['dark']:['light','dark']) {
    const state=createReturningUserFixture(1);state.activeWorkout=null;state.ai.planUpgradeDismissed=true;
    state.activeCoachConversationId='qa-keyboard';state.conversations=Array.from({length:20},(_,i)=>({id:`q-${i}`,conversationId:'qa-keyboard',user:`Question ${i}`,reply:{text:'Synthetic answer without plan changes. '.repeat(9),action:null},createdAt:Date.now()-i*1000}));
    Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
    const c=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',colorScheme:appearance,reducedMotion:width===320?'reduce':'no-preference'});
    await c.addInitScript(({state,standalone})=>{
      if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(state));
      if(standalone)Object.defineProperty(navigator,'standalone',{value:true});
      // Contract emulation only, never a claim of physical keyboard/accessory QA.
      const vv=new EventTarget();let height=null;Object.assign(vv,{offsetTop:0,offsetLeft:0,scale:1});
      Object.defineProperties(vv,{height:{get:()=>height??innerHeight},width:{get:()=>innerWidth}});
      Object.defineProperty(window,'visualViewport',{value:vv,configurable:true});
      window.qaKeyboard=(h,offset=0,notify=true)=>{height=h;vv.offsetTop=offset;if(notify)vv.dispatchEvent(new Event('resize'));};
    },{state,standalone:style==='premium'});
    const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.route('**/api/ai/status',r=>r.fulfill({json:{available:true}}));
    await p.route('**/api/ai',r=>r.fulfill({json:{data:{text:'Keyboard QA reply.',action:null}}}));
    try {
      await p.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:5173');await p.getByRole('button',{name:'COACH',exact:true}).click();
      // Deliberately nonzero safe area tests double-reservation. 34 is fixture data,
      // not an iPhone constant in production. Browser env() is zero in this runner.
      await p.addStyleTag({content:':root { --rook-nav-safe-bottom: 34px; --bottom-nav-total-height: calc(var(--bottom-nav-height) + var(--rook-nav-safe-bottom)) !important; }'});
      await p.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.coach-screen')).paddingBottom)===document.querySelector('.bottom-nav').getBoundingClientRect().height);
      await frames(p);
      const input=p.getByLabel('Ask Coach'), samples={closed:await measure(p)};
      await input.fill('Retained draft\nSecond line');await p.evaluate(()=>qaKeyboard(500,40));await frames(p);samples.open=await measure(p);
      if(!before)keyboard(samples.open);
      // Focus loss and keyboard resize are separate browser events.
      await input.evaluate(e=>e.blur());await frames(p);samples.blurredStillOpen=await measure(p);
      await p.screenshot({path:`${out}/${before?'before':'after'}-${width}-${style}-${appearance}-focus-handoff.png`,clip:{x:0,y:0,width,height:samples.blurredStillOpen.visibleBottom}});
      if(!before)keyboard(samples.blurredStillOpen);
      await input.focus();await p.evaluate(()=>qaKeyboard(844));await frames(p);samples.closedStillFocused=await measure(p);
      if(!before){assert.equal(samples.closedStillFocused.rootToComposer,samples.closed.rootToComposer);assert.equal(samples.closedStillFocused.nav.height,samples.closed.nav.height);}
      const repeats=[];
      for(let i=0;i<3;i++) {
        await p.evaluate(()=>qaKeyboard(500,40));await frames(p);const withoutAccessory=await measure(p);
        await p.evaluate(()=>qaKeyboard(456,25));await frames(p);const withAccessory=await measure(p);
        if(!before){keyboard(withoutAccessory);keyboard(withAccessory);}
        repeats.push({withoutAccessory,withAccessory});
        await p.evaluate(()=>qaKeyboard(844));await frames(p);
        if(!before)assert.equal((await measure(p)).rootToComposer,samples.closed.rootToComposer);
      }
      samples.repeats=repeats;
      await p.evaluate(()=>qaKeyboard(456,25));await frames(p);
      await input.fill(Array.from({length:10},(_,i)=>`Multiline draft ${i}`).join('\n'));await frames(p);samples.multiline=await measure(p);
      if(!before){keyboard(samples.multiline);assert.ok(samples.multiline.input.scrollHeight>samples.multiline.input.clientHeight);}
      await p.getByLabel('Send message',{exact:true}).tap();await p.getByText('Keyboard QA reply.',{exact:true}).waitFor();await frames(p);samples.sent=await measure(p);
      if(!before){keyboard(samples.sent);assert.equal(await input.inputValue(),'');assert.ok(await input.evaluate(e=>e===document.activeElement));}
      // A suspended page need not receive all intermediate viewport events.
      for(const height of [844,480]) {
        await p.evaluate(h=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));qaKeyboard(h,0,false);Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'));},height);
        await frames(p);const m=await measure(p);samples[`foreground-${height}`]=m;
        if(!before){if(height===480)keyboard(m);else assert.equal(m.rootToComposer,samples.closed.rootToComposer);}
      }
      if(!before)assert.deepEqual(errors,[]);
      results.push({width,style,appearance,standaloneEmulated:style==='premium',passed:!before,samples,errors});
      console.log(JSON.stringify({width,style,appearance,before,geometry:Object.fromEntries(Object.entries(samples).filter(([,v])=>v.totalInputGap!==undefined).map(([k,v])=>[k,{nav:v.rootToComposer,padding:v.composerToInput,gap:v.totalInputGap}]))}));
    } finally {await c.close();}
  }
} finally {await browser.close();await writeFile(`${out}/${before?'before':'after'}-geometry.json`,JSON.stringify(results,null,2));}
