import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { openProfileArea, startFreestyle } from './qa-current-navigation.mjs';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/search-footer/qa';
await mkdir(out,{recursive:true});
const base=process.env.QA_URL||'http://127.0.0.1:4177',results=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
const settle=p=>p.evaluate(async()=>{
 await window.qaViewTransition;
 await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));
 await new Promise(resolve=>requestAnimationFrame(resolve));
});
async function open(width,style,appearance,mode){
 const seed=mode==='scratch'?null:createReturningUserFixture(3);
 if(seed){seed.activeWorkout=null;seed.activeOptionalSession=null;Object.assign(seed.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});}
 if(mode==='edit') { seed.program.days[0].exercises=seed.program.days[0].exercises.slice(0,6);seed.program.days[0].exercises.forEach(exercise=>delete exercise.supersetId); }
 const video=width===390&&style==='standard'&&appearance==='dark';
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference',...(video?{recordVideo:{dir:out,size:{width,height:844}}}:{})});
 await context.addInitScript(seed=>{
   if(seed&&!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(seed));
   const v=new EventTarget();Object.assign(v,{height:844,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{value:v,configurable:true});
   window.qaViewport=(height,offsetTop=0)=>{Object.assign(v,{height,offsetTop});v.dispatchEvent(new Event('resize'));};
   // ViewTransition starts its React update on a future frame. Waiting only on
   // current DOM animations can read the pre-add count before that update runs.
   const start=document.startViewTransition?.bind(document);
   if(start)document.startViewTransition=change=>{const tx=start(change);window.qaViewTransition=tx.finished.catch(()=>{});return tx;};
 },seed);
 const p=await context.newPage(),errors=[];p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
 if(process.env.QA_DEBUG)await p.addInitScript(()=>{
   window.qaEvents=[];document.addEventListener('click',event=>window.qaEvents.push({type:'click',t:performance.now(),target:event.target.outerHTML.slice(0,300),button:event.target.closest('button')?.textContent}),true);
   const start=document.startViewTransition?.bind(document);
   if(start)document.startViewTransition=change=>{window.qaEvents.push({type:'start',t:performance.now()});const tx=start(()=>{window.qaEvents.push({type:'update',t:performance.now()});return change();});tx.finished.then(()=>window.qaEvents.push({type:'finish',t:performance.now()}));return tx;};
 });
 await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto(base);
 const cdp=await context.newCDPSession(p);await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{bottom:34}});
 return {context,p,errors,video};
}
async function sample(p,root){return root.evaluate(root=>{
 const rect=n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};
 const footer=root.querySelector('.sheet-action-footer');
 return {root:rect(root),footer:rect(footer),button:rect(footer.querySelector('button')),scroll:root.scrollTop,content:root.scrollHeight,doc:scrollY,viewport:visualViewport.height,offset:visualViewport.offsetTop,
   transform:getComputedStyle(root).transform,rootMargin:getComputedStyle(root).margin,layerScroll:root.parentElement.scrollTop,layerOverflow:getComputedStyle(root.parentElement).overflow,layer:root.parentElement.className,layerStyle:root.parentElement.style.cssText,layerRect:rect(root.parentElement),layerTransform:getComputedStyle(root.parentElement).transform,layerPadding:getComputedStyle(root.parentElement).padding};
});}
async function beginFrames(root){await root.evaluate(root=>{
 window.qaFrames=[];window.qaFramesRunning=true;window.qaRoot??=root;window.qaList??=root.querySelector('.plan-editor');window.qaFooter??=root.querySelector('.sheet-action-footer');
 const frame=()=>{const f=root.querySelector('.sheet-action-footer').getBoundingClientRect(),b=root.querySelector('.sheet-action-footer button').getBoundingClientRect();window.qaFrames.push({t:performance.now(),bottom:f.bottom,buttonBottom:b.bottom,height:f.height,viewport:visualViewport.height,offset:visualViewport.offsetTop,scroll:root.scrollTop,doc:scrollY});if(window.qaFramesRunning)requestAnimationFrame(frame);};requestAnimationFrame(frame);
});}
async function finishFrames(p,root){await settle(p);await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return root.evaluate(root=>{window.qaFramesRunning=false;if(root!==window.qaRoot||root.querySelector('.plan-editor')!==window.qaList||root.querySelector('.sheet-action-footer')!==window.qaFooter)throw Error('Remounted editor/footer');return window.qaFrames;});}
function anchored(value){assert.ok(Math.abs(value.footer.bottom-value.viewport-value.offset)<1,JSON.stringify(value));assert.equal(value.doc,0);}
try{
 for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
  for(const mode of ['search','scratch','edit']){
   if(process.env.QA_MODE&&process.env.QA_MODE!==mode)continue;
   const key=`${mode}-${width}-${style}-${appearance}`;
   if(process.env.QA_KEY&&process.env.QA_KEY!==key)continue;
   const {context,p,errors,video}=await open(width,style,appearance,mode);
   try{
    if(mode==='search'){
      await startFreestyle(p);await p.getByRole('button',{name:'+ ADD EXERCISE',exact:true}).click();await settle(p);
      const panel=p.locator('.freestyle-picker'),input=panel.getByRole('searchbox');
      await panel.evaluate(root=>{window.qaInput=root.querySelector('input');window.qaNormal={sheet:root.getBoundingClientRect().top,search:window.qaInput.getBoundingClientRect().top};window.qaSearchFrames=[];window.qaSearchSampling=true;const frame=()=>{window.qaSearchFrames.push({t:performance.now(),y:window.qaInput.getBoundingClientRect().top,query:window.qaInput.value,focused:document.activeElement===window.qaInput});if(window.qaSearchSampling)requestAnimationFrame(frame);};requestAnimationFrame(frame);});
      if(video)await p.screenshot({path:`${out}/${key}-normal.png`});
      await input.tap();await input.pressSequentially('p');
      assert.equal(await input.inputValue(),'p'); // Input works while the settle is running.
      await settle(p);
      const focus=await panel.evaluate(root=>({same:window.qaInput===root.querySelector('input'),focused:root.classList.contains('is-search-focused'),delta:window.qaNormal.search-window.qaInput.getBoundingClientRect().top,sheetDelta:root.getBoundingClientRect().top-window.qaNormal.sheet}));
      assert.ok(focus.same&&focus.focused);assert.equal(focus.delta,16);assert.equal(focus.sheetDelta,0);
      await p.evaluate(()=>window.qaViewport(420,75));await settle(p);
      const fixed=await input.boundingBox();
      for(const query of ['pis','pist','zzzznomatch','']){
        if(query)await input.fill(query);else await panel.getByRole('button',{name:'Clear search',exact:true}).tap();
        assert.equal(await input.evaluate(el=>el===window.qaInput&&document.activeElement===el),true);
        assert.equal(await input.inputValue(),query);assert.ok(await panel.evaluate(el=>el.classList.contains('is-search-focused')));
        const rect=await input.boundingBox();assert.ok(Math.abs(rect.y-fixed.y)<1);assert.ok(rect.y+rect.height<=495);
      }
      if(video)await p.screenshot({path:`${out}/${key}-focused-keyboard.png`});
      await input.fill('row');await p.evaluate(()=>window.qaViewport(844,0));await settle(p);
      assert.equal(await panel.evaluate(el=>el.classList.contains('is-search-focused')),false);assert.equal(await input.inputValue(),'row');
      await input.evaluate(el=>el.setSelectionRange(1,2));
      await input.tap();await settle(p);assert.ok(await panel.evaluate(el=>el.classList.contains('is-search-focused')));
      await input.evaluate(el=>el.setSelectionRange(1,2));await p.evaluate(()=>window.qaViewport(420,75));await settle(p);
      assert.deepEqual(await input.evaluate(el=>[el.selectionStart,el.selectionEnd]),[1,2],'Viewport/layout preserves selection');
      await panel.getByRole('button',{name:/^Close/}).click();await panel.waitFor({state:'detached'});
      const frames=await p.evaluate(()=>{window.qaSearchSampling=false;return window.qaSearchFrames;});
      results.push({key,focus,frames});
    }else{
      if(mode==='scratch'){
        await p.getByRole('button',{name:/Start from scratch/i}).click();
        for(const day of (width===320?['Mon']:['Mon','Wed','Fri']))await p.getByRole('button',{name:day,exact:true}).click();
        await p.getByRole('button',{name:'CONTINUE',exact:true}).click();
        await p.evaluate(({style,appearance})=>Object.assign(document.documentElement.dataset,{style,appearance}),{style,appearance});
      }else{await openProfileArea(p,'program');await p.getByRole('button',{name:/^Edit plan/}).click();}
      const root=p.locator(mode==='scratch'?'.scratch-editor-screen':'.edit-plan-screen');await root.waitFor();await settle(p);
      if(mode==='edit'&&width===390){await root.getByRole('button',{name:'Expand Edit plan to full screen',exact:true}).click();await settle(p);}
      const day=root.locator('[data-reorder-workout-section]').first(),samples=[];
      anchored(await sample(p,root));
      if(mode==='scratch')assert.equal(await root.getByRole('button',{name:'USE THIS PLAN',exact:true}).isDisabled(),true);
      for(const query of (mode==='scratch'?['Bench Press','Row','Leg Press']:[''])){
        const count=await day.locator('.plan-editor-exercise').count();
        await day.getByRole('button',{name:/\+ Add (first )?exercise/i}).click();await day.getByRole('searchbox').fill(query);
        assert.equal(await root.evaluate(el=>el.classList.contains('is-search-focused')||el.classList.contains('exercise-search-sheet')),false,'Inline editors must not get focused-picker layout');
        await p.evaluate(()=>window.qaViewport(420,75));
        const before=await sample(p,root);anchored(before);await beginFrames(root);
        await day.getByRole('option').first().click();await p.waitForFunction(({selector,count})=>document.querySelector(selector).querySelector('[data-reorder-workout-section]').querySelectorAll('.plan-editor-exercise').length===count,{selector:mode==='scratch'?'.scratch-editor-screen':'.edit-plan-screen',count:count+1});
        const frames=await finishFrames(p,root),after=await sample(p,root);anchored(after);
        if(mode==='scratch')assert.equal(await root.getByRole('button',{name:'USE THIS PLAN',exact:true}).isDisabled(),width!==320,'Readiness rules remain unchanged');
        assert.equal(after.button.bottom,before.button.bottom,'Add preserves CTA position, including readiness changes');
        assert.ok(frames.every(f=>Math.abs(f.bottom-f.viewport-f.offset)<1&&f.doc===0),'No transient footer jump');
        await p.evaluate(()=>window.qaViewport(844,0));await settle(p);anchored(await sample(p,root));
        const card=day.locator('.plan-editor-exercise').last();await card.locator('.plan-editor-summary').click();await settle(p);
        await beginFrames(root);await card.getByRole('button',{name:'REMOVE',exact:true}).click();
        await p.waitForFunction(({selector,count})=>document.querySelector(selector).querySelector('[data-reorder-workout-section]').querySelectorAll('.plan-editor-exercise').length===count,{selector:mode==='scratch'?'.scratch-editor-screen':'.edit-plan-screen',count});
        const removedFrames=await finishFrames(p,root);anchored(await sample(p,root));
        assert.equal(await day.locator('.plan-editor-exercise').count(),count);
        assert.ok(removedFrames.every(f=>Math.abs(f.bottom-f.viewport-f.offset)<1&&f.doc===0));
        samples.push({query,before,after,frames,removedFrames});
        if(mode==='scratch'){ // Accumulate a real long workout for subsequent adds.
          await day.getByRole('button',{name:/\+ Add (first )?exercise/i}).click();await day.getByRole('searchbox').fill(query);await day.getByRole('option').first().click();await settle(p);
        }
      }
      if(mode==='scratch'){
        const count=await root.locator('.plan-editor-exercise').count();
        await root.getByRole('button',{name:'Back to plan setup',exact:true}).click();await p.getByRole('button',{name:'CONTINUE',exact:true}).click();await root.waitFor();await settle(p);
        assert.equal(await root.locator('.plan-editor-exercise').count(),count);assert.ok(await root.evaluate(el=>el===window.qaRoot));anchored(await sample(p,root));
      }
      if(video)await p.screenshot({path:`${out}/${key}-final.png`});
      await root.evaluate(el=>el.scrollTop=el.scrollHeight);await settle(p);
      assert.ok(await root.evaluate(el=>el.querySelector('.plan-editor').getBoundingClientRect().bottom<=el.querySelector('.sheet-action-footer').getBoundingClientRect().top+1),'Last content remains scrollable above the reserved footer');
      anchored(await sample(p,root));
      assert.equal(await root.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
      results.push({key,samples,retainedEditor:true});
    }
    assert.deepEqual(errors,[]);console.log('PASS',key);
   }catch(error){await p.screenshot({path:`${out}/failure-${key}.png`});if(process.env.QA_DEBUG)console.log(JSON.stringify({events:await p.evaluate(()=>window.qaEvents),errors},null,2));throw error;}
   finally{const path=video?await p.video().path():null;await context.close();if(path)results.push({key,video:path});}
  }
 }
}finally{await browser.close();await writeFile(`${out}/results${process.env.QA_MODE?`-${process.env.QA_MODE}`:''}.json`,JSON.stringify(results,null,2));}
