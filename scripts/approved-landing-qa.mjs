// Isolated browser contexts only; exercises the actual startup + App routes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright-core';
import {PRIMARY_KEY} from '../src/localStateStorage.js';
import {blankState,saveState} from '../src/domain.js';

const origin=process.env.ROOK_QA_URL||'http://127.0.0.1:4275';
const engine=process.argv[2]||process.env.ROOK_QA_BROWSER||'chromium';
const viewportHeight=Number(process.argv[4]||process.env.ROOK_QA_HEIGHT)||844;
const out=viewportHeight===844?'artifacts/landing-no-example':`artifacts/landing-no-example-${viewportHeight}`;
await mkdir(out,{recursive:true});
const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
const results=[];
let currentPage;
async function setup(width=390,reduced=false,style=null,appearance=null){
  const context=await browser.newContext({viewport:{width,height:viewportHeight},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'});
  if(style){
    // Legitimate incomplete first-run state with actual saved appearance only.
    // Let useResolvedTheme own DOM/theme values, including media changes in WebKit.
    const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
    const state=blankState();Object.assign(state.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
    assert.equal(saveState(state,{storage,reason:'qa-first-run-theme'}),true);
    await context.addInitScript(seed=>{if(!sessionStorage.getItem('qa-theme-seeded')){for(const [k,v] of seed)localStorage.setItem(k,v);sessionStorage.setItem('qa-theme-seeded','true');}},[...values]);
  }
  await context.addInitScript(()=>{const fetch=window.fetch;window.fetch=(url,...args)=>String(url).includes('/api/ai/status')?Promise.resolve(new Response(JSON.stringify({available:false}),{headers:{'Content-Type':'application/json'}})):fetch(url,...args);
    window.__landingZoom=[];visualViewport.addEventListener('resize',()=>window.__landingZoom.push({scale:visualViewport.scale,route:document.querySelector('.first-run-page:not([hidden])')?.dataset.firstRunPage,focus:document.activeElement?.outerHTML.slice(0,180),at:performance.now()}));
  });
  const page=await context.newPage(),errors=[];
  currentPage=page;
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);
  if(style)await page.getByRole('button',{name:'Back to plan options',exact:true}).click();
  await page.getByRole('heading',{name:'A plan that fits your week.'}).waitFor();
  await page.locator('[data-swipe-parent]').waitFor({state:'detached'});
  return {context,page,errors};
}
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const read=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),PRIMARY_KEY);
const visible=page=>page.locator('.first-run-page:not([hidden])');
try {
  for(const width of [320,390,430])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
    if((process.argv[3]||process.env.ROOK_QA_CASE)&&`${width}-${style}-${appearance}`!==(process.argv[3]||process.env.ROOK_QA_CASE))continue;
    const {context,page,errors}=await setup(width,width===320,style,appearance);
    await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
    const layout=await page.locator('.entry-screen').evaluate(n=>{
      const rect=s=>{const r=n.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
      return {scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,
        hero:rect('h1'),description:rect('.entry-content > p'),cta:rect('.entry-primary-action > button'),other:rect('.entry-secondary-routes'),
        demoCount:n.querySelectorAll('.entry-demo,.entry-example-week,.entry-example-summary,.entry-example-result,.entry-equipment-sheet').length,
        targets:[...n.querySelectorAll('button')].map(b=>({name:b.textContent,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height})),
        overflow:getComputedStyle(n).overflowY};
    });
    assert.ok(layout.scrollWidth<=layout.clientWidth);assert.equal(layout.demoCount,0);
    assert.ok(layout.targets.every(t=>t.height>=44&&t.width>=44));assert.equal(layout.overflow,'visible');
    assert.ok(layout.hero.bottom<layout.description.top&&layout.description.bottom<layout.cta.top&&layout.cta.bottom<layout.other.top);
    assert.ok(layout.cta.bottom<viewportHeight,'primary is visible in the first viewport');
    if(viewportHeight>=844)assert.ok(layout.other.top<viewportHeight,'alternatives begin in the first viewport');
    assert.ok(layout.cta.top-layout.description.bottom>=24&&layout.cta.top-layout.description.bottom<=36,'intentional hero-to-CTA spacing');
    assert.equal((await page.locator('.entry-content').innerText()).replace(/\n+/g,'\n'),`A plan that fits your week.\nTell ROOK your goal, schedule and equipment. It builds the plan around them.\nBUILD MY PLAN\nA few questions · No account needed`);
    await page.screenshot({path:`${out}/${engine}-${width}-${style}-${appearance}.png`,fullPage:true});
    assert.deepEqual(await page.evaluate(()=>({style:document.documentElement.dataset.style,appearance:document.documentElement.dataset.appearance})),{style,appearance});
    const before=await read(page);
    if(engine==='chromium'&&width===320&&style==='standard'&&appearance==='dark'){
      await page.setViewportSize({width,height:620});
      const target=await page.locator('.entry-content > p').boundingBox();
      const cdp=await context.newCDPSession(page);
      const x=target.x+target.width/2,y=target.y+target.height/2;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-step*20}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      const scroll=await page.evaluate(()=>({window:window.scrollY,root:document.scrollingElement.scrollTop,landing:document.querySelector('.entry-screen').scrollTop}));
      assert.ok(Math.max(scroll.window,scroll.root,scroll.landing)>0,`vertical swipe starting on hero copy scrolls the page: ${JSON.stringify(scroll)}`);
      assert.equal(await page.locator('.entry-demo').count(),0);
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.setViewportSize({width,height:viewportHeight});
    }
    assert.deepEqual(await read(page),before,'viewing landing does not persist anything');
    await button(page,'BUILD MY PLAN').click();await page.locator('.onboarding-personal').waitFor();
    assert.equal(await button(page,'CONTINUE').isDisabled(),true);assert.deepEqual(await read(page),before);
    await button(page,'Back to plan options').click();
    await page.getByRole('button',{name:'Bring my plan Import it, or enter it yourself.'}).click();
    await visible(page).getByRole('heading',{name:'Bring my plan'}).waitFor();
    await page.locator('[data-swipe-parent]').waitFor({state:'detached'});
    const bringBack=await page.locator('.entry-bring-plan .first-run-back-button').evaluate(node=>({
      color:getComputedStyle(node).color,height:node.getBoundingClientRect().height,
      left:node.getBoundingClientRect().left,
      path:node.querySelector('svg path')?.getAttribute('d'),
    }));
    assert.ok(bringBack.height>=44);
    if(width===390&&style==='standard'&&appearance==='dark'){
      // Full-page mobile screenshots temporarily resize the emulated viewport.
      // Capture the settled page, not the outgoing/incoming physical stack.
      await page.locator('[data-swipe-parent]').waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
      await page.screenshot({path:`${out}/${engine}-bring-plan.png`,fullPage:true});
    }
    await page.getByRole('button',{name:'Import a plan From a file or another app.'}).click();
    const input=visible(page).locator('textarea').first();await input.fill('Monday: Upper\nBench Press 3x8');
    await button(page,'Back to start').click();await visible(page).getByRole('heading',{name:'Bring my plan'}).waitFor();
    await page.locator('[data-swipe-parent]').waitFor({state:'detached'});
    await page.getByRole('button',{name:'Import a plan From a file or another app.'}).click();
    assert.equal(await input.inputValue(),'Monday: Upper\nBench Press 3x8');await button(page,'Back to start').click();
    await page.locator('[data-swipe-parent]').waitFor({state:'detached'});
    await page.getByRole('button',{name:'Enter it myself Build your weekly program day by day.'}).click();
    await page.getByLabel('Weekly plan name').fill('My retained weekly draft');
    await button(page,'Back to start').click();await visible(page).getByRole('heading',{name:'Bring my plan'}).waitFor();
    await button(page,'Back to start').click();await page.getByRole('heading',{name:'A plan that fits your week.'}).waitFor();
    assert.equal(await page.evaluate(()=>visualViewport.scale),1,'rapid child/parent Back taps must not double-tap zoom');
    const recoveryBefore=await page.evaluate(()=>Object.fromEntries(['rook-install-meta-v1','rook-recovery-v1','rook-restore-journal-v1'].map(key=>[key,localStorage.getItem(key)])));
    await button(page,'Restore').click();await page.getByRole('button',{name:'Back to start'}).waitFor();
    await page.locator('[data-swipe-parent]').waitFor({state:'detached'});
    const restoreBack=await page.locator('.restore-backup-screen .first-run-back-button').evaluate(node=>({
      color:getComputedStyle(node).color,height:node.getBoundingClientRect().height,
      left:node.getBoundingClientRect().left,
      path:node.querySelector('svg path')?.getAttribute('d'),
    }));
    assert.deepEqual(restoreBack,bringBack,`${width}/${style}/${appearance}: first-run Back presentation`);
    if(width===390&&style==='standard'&&appearance==='dark'){
      await page.locator('[data-swipe-parent]').waitFor({state:'detached'});
      await page.screenshot({path:`${out}/${engine}-restore-first-run.png`});
    }
    await button(page,'Back to start').click();await page.getByRole('heading',{name:'A plan that fits your week.'}).waitFor();
    assert.deepEqual(await page.evaluate(()=>Object.fromEntries(['rook-install-meta-v1','rook-recovery-v1','rook-restore-journal-v1'].map(key=>[key,localStorage.getItem(key)]))),recoveryBefore,'viewing Restore does not mutate recovery metadata');
    assert.deepEqual(await read(page),before);assert.deepEqual(errors,[]);
    results.push({width,style,appearance,layout,routes:'builder / bring / import / scratch / restore Back / draft return PASS',landing:'no demo or example; no primary writes or builder answers'});
    console.log('PASS',engine,width,style,appearance);await context.close();
  }
  for(const flow of ['saved','freestyle']){
    const {page,context,errors}=await setup();
    await page.getByRole('button',{name:flow==='saved'?'Create a workout Save a session to repeat anytime.':'Freestyle Start empty. Add exercises as you go.'}).click();
    if(flow==='saved'){
      await page.getByRole('heading',{name:'Build your workout',exact:true}).waitFor();
      assert.equal(await page.locator('.saved-workouts.edit-plan-screen').count(),1);
      assert.equal(await read(page),null,'opening editor has no durable first-run write');
      await button(page,'Back to start').click();await page.getByRole('heading',{name:'A plan that fits your week.'}).waitFor();
      assert.equal(await read(page),null,'Back from editor has no durable first-run write');
      await page.getByRole('button',{name:'Create a workout Save a session to repeat anytime.'}).click();
      await page.getByRole('button',{name:/Add first exercise/}).click();
      await page.locator('input[aria-label^="Search exercise"]').fill('plank');
      await page.getByRole('option',{name:'Plank',exact:true}).click();
      page.once('dialog',dialog=>dialog.dismiss());
      await button(page,'Back to start').click();
      assert.equal(await visible(page).getAttribute('data-first-run-page'),'create-workout','discard dismissal retains the editor');
      await button(page,'REVIEW WORKOUT').click();await button(page,'SAVE WORKOUT').click();
      const state=await read(page);assert.equal(state.profile.preferredTrainingStyle,'own-workouts');assert.equal(state.profile.onboardingComplete,true);
      assert.equal(state.program,null);assert.equal(state.savedWorkoutTemplates.length,1);assert.equal(state.activeWorkout,null);
      await page.reload();await page.getByRole('button',{name:/New workout, 1 exercise, open saved workout/}).waitFor();
      assert.equal((await read(page)).savedWorkoutTemplates[0].id,state.savedWorkoutTemplates[0].id);
    }else{
      await page.getByRole('heading',{name:'Start a freestyle workout?'}).waitFor();
      await page.locator('[data-swipe-parent]').waitFor({state:'detached'});
      await page.screenshot({path:`${out}/${engine}-freestyle-confirm.png`});
      assert.equal(await read(page),null,'opening confirmation has no durable first-run write');
      await button(page,'Back to start').click();await page.getByRole('heading',{name:'A plan that fits your week.'}).waitFor();
      assert.equal(await read(page),null,'Back from confirmation has no durable first-run write');
      await page.getByRole('button',{name:'Freestyle Start empty. Add exercises as you go.'}).click();
      await button(page,'START FREESTYLE').click();
      await page.getByRole('heading',{name:'No exercises yet',exact:true}).waitFor();
      const state=await read(page);assert.equal(state.activeWorkout.source,'freestyle');assert.equal(state.activeWorkout.exercises.length,0);assert.equal(state.program,null);
      await page.reload();await page.getByRole('button',{name:/Resume/i}).first().waitFor();
      assert.equal((await read(page)).activeWorkout.id,state.activeWorkout.id);
      await page.getByRole('button',{name:/Resume/i}).first().click();
      await page.getByRole('button',{name:'Workout options'}).click();
      await page.getByRole('button',{name:'Cancel workout'}).click();
      await page.getByRole('button',{name:'Start freestyle workout'}).waitFor();
      const cancelled=await read(page);assert.equal(cancelled.activeWorkout,null);assert.equal(cancelled.workouts.length,0);
      assert.equal(cancelled.profile.onboardingComplete,true);assert.equal(cancelled.profile.preferredTrainingStyle,'freestyle');
      await page.getByRole('button',{name:'Start freestyle workout'}).click();
      await page.getByRole('button',{name:'+ ADD EXERCISE'}).click();
      await page.locator('input[aria-label^="Search exercise"]').fill('plank');
      await page.locator('input[aria-label^="Search exercise"]').evaluate(input=>input.blur());
      await page.getByText('Plank',{exact:true}).click();
      await page.getByRole('button',{name:'Start with this exercise'}).click();
      await page.getByRole('button',{name:'Workout options'}).click();
      await page.getByRole('button',{name:'Cancel workout'}).click();
      await page.getByRole('heading',{name:'Cancel workout?'}).waitFor();
      await page.getByRole('button',{name:'KEEP WORKOUT'}).click();
      assert.ok((await read(page)).activeWorkout);
      await page.getByRole('button',{name:'Workout options'}).click();
      await page.getByRole('button',{name:'Cancel workout'}).click();
      await page.getByRole('button',{name:'CANCEL WORKOUT'}).click();
      assert.equal((await read(page)).activeWorkout,null);assert.equal((await read(page)).workouts.length,0);
    }
    assert.deepEqual(errors,[]);results.push({flow,result:'PASS'});console.log('PASS',engine,flow);await context.close();
  }
}catch(error){
  if(currentPage&&!currentPage.isClosed()){
    await writeFile(`${out}/${engine}-pre-screenshot-failure.json`,JSON.stringify(await currentPage.evaluate(()=>{
      const b=document.querySelector('.entry-screen .restore-backup-action'),r=b?.getBoundingClientRect();
      return {zoom:window.__landingZoom,rect:r?.toJSON(),viewport:{width:innerWidth,height:innerHeight,x:scrollX,y:scrollY,visual:{x:visualViewport.offsetLeft,y:visualViewport.offsetTop,width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale}},hit:r&&document.elementsFromPoint(r.x+r.width/2,r.y+r.height/2).map(e=>e.outerHTML.slice(0,200)),animations:document.getAnimations().length};
    }),null,2));
    await currentPage.screenshot({path:`${out}/${engine}-failure.png`,fullPage:true});
    await writeFile(`${out}/${engine}-failure.json`,JSON.stringify(await currentPage.evaluate(()=>({html:document.body.innerHTML,geometry:[...document.querySelectorAll('.entry-top,.restore-backup-action')].map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {html:n.outerHTML.slice(0,300),rect:r.toJSON(),pointer:s.pointerEvents,style:s.cssText,hit:document.elementsFromPoint(r.x+r.width/2,r.y+r.height/2).map(e=>e.outerHTML.slice(0,120))};}),animations:document.getAnimations().map(a=>({state:a.playState,target:a.effect?.target?.outerHTML.slice(0,300)}))})),null,2));
  }
  throw error;
}finally{await writeFile(`${out}/${engine}-results.json`,JSON.stringify(results,null,2));await browser.close();}
