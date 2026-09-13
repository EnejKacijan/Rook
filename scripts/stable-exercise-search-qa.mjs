import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { startFreestyleWorkout, addFreestyleExercise } from '../src/freestyleWorkout.js';
import { blankState, buildProgram, weekday, WEEKDAYS, isoDay } from '../src/domain.js';
import { startFreestyle } from './qa-current-navigation.mjs';

const before = process.env.ROOK_QA_BEFORE === '1';
const only = process.env.ROOK_QA_FLOW;
const base = process.env.ROOK_QA_URL || 'http://127.0.0.1:5173';
const out = 'artifacts/stable-exercise-search';
await mkdir(out, {recursive:true});
const report=[];
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
async function open(state,width,motion='no-preference') {
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:motion,colorScheme:state.profile.appearancePreference});
  await context.addInitScript(s=>{
    if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));
    // Init scripts precede the meta viewport; don't capture its temporary 980px layout.
    const vv=new EventTarget();Object.assign(vv,{height:844,width:innerWidth,offsetTop:0,offsetLeft:0,pageTop:0,pageLeft:0,scale:1});
    Object.defineProperty(window,'visualViewport',{configurable:true,value:vv});
    window.qaViewport=(height,offsetTop=0,type='resize')=>{Object.assign(vv,{height,offsetTop,pageTop:offsetTop,width:innerWidth});vv.dispatchEvent(new Event(type));};
  },state);
  const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
  await page.goto(base);
  const cdp=await context.newCDPSession(page);
  return {context,page,cdp,errors};
}
const settled=page=>page.locator('.modal-layer').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));});
async function measure(panel) {
  return panel.evaluate(el=>{
    const rect=n=>{const r=n.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height,left:r.left,right:r.right};};
    const results=el.querySelector('[data-exercise-search-scroll]')||el;
    return {sheet:rect(el),search:rect(el.querySelector('input[type=search]')),results:rect(results),scroll:results.scrollTop,
      rows:el.querySelectorAll('.list-row,.choice-row').length,query:el.querySelector('input').value,
      outerScroll:el.scrollTop,overflow:el.scrollWidth>el.clientWidth+1,bodyY:window.scrollY,
      viewport:{height:visualViewport.height,offsetTop:visualViewport.offsetTop}};
  });
}
function same(a,b,label) {
  for(const target of ['sheet','search'])for(const field of ['top','height'])
    assert.ok(Math.abs(a[target][field]-b[target][field])<1,`${label}: ${target}.${field} moved ${a[target][field]} -> ${b[target][field]}`);
  assert.equal(b.overflow,false,label+' horizontal overflow');assert.equal(b.outerScroll,0,label+' outer scroller must stay fixed');
}
async function checkQueries(page,panel,label,capture=false) {
  const input=panel.locator('input[type=search]');await input.focus();
  // Focus now intentionally settles the same input upward for 180ms. Capture
  // the stable search baseline after that real animation, not mid-transition.
  await input.evaluate(el=>Promise.all(el.parentElement.getAnimations().map(a=>a.finished.catch(()=>{}))));
  await input.evaluate(el=>{window.qaSearchInput=el;});
  let initial;const states=[];
  for(const q of ['', 'pis', 'pist', 'zzzznomatch', '', 'pist','pis','pist']) {
    if(q==='pist'&&await input.inputValue()==='pis')await input.pressSequentially('t');else await input.fill(q);
    const m=await measure(panel);states.push(m);initial??=m;
    assert.equal(await input.evaluate(el=>el===window.qaSearchInput&&document.activeElement===el),true,label+' stable focused input');
    if(!before){same(initial,m,label);assert.ok(m.search.bottom<=m.viewport.offsetTop+m.viewport.height,label+' search above keyboard');assert.ok(m.results.height>40,label+' usable result viewport');}
    if(capture&&['pis','pist','zzzznomatch'].includes(q)&&states.length<5)
      await page.screenshot({path:`${out}/${before?'before':'after'}-${label}-${q}.png`});
  }
  report.push({label,states});
  await panel.getByRole('button',{name:'Clear search',exact:true}).tap({timeout:5000});
  assert.equal(await input.inputValue(),'');assert.equal(await input.evaluate(el=>document.activeElement===el),true);
  if(!before)same(initial,await measure(panel),label+' clear');
}
async function swipe(page,cdp,x,y,dy) {
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=12;i++){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy*i/12}]});
    await page.evaluate(()=>new Promise(requestAnimationFrame));
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
async function assertScroll(page,panel,cdp) {
  const list=panel.locator('[data-exercise-search-scroll]');await list.evaluate(el=>el.scrollTop=0);
  const box=await list.boundingBox(), m=await measure(panel);
  await swipe(page,cdp,box.x+box.width*.65,box.y+box.height-24,-Math.min(180,box.height-45));
  await page.waitForFunction(()=>document.querySelector('[data-exercise-search-scroll]')?.scrollTop>10);
  same(m,await measure(panel),'internal vertical scroll');
  assert.equal(await panel.evaluate(el=>el.classList.contains('is-dragging')),false);
  // A downward gesture in an already scrolled list must scroll, not move the sheet.
  await list.evaluate(el=>el.scrollTop=600);
  await swipe(page,cdp,box.x+box.width*.65,box.y+30,80);
  assert.ok(await list.evaluate(el=>el.scrollTop<600));same(m,await measure(panel),'downward internal scroll');
}
async function dismiss(page,panel,cdp) {
  const handle=panel.getByRole('button',{name:'Drag down or tap to close',exact:true}), b=await handle.boundingBox();
  await swipe(page,cdp,b.x+b.width*.65,b.y+16,185);
  await panel.waitFor({state:'detached'});
  assert.equal(await page.locator('.modal-layer').count(),0);
  assert.equal(await page.evaluate(()=>document.body.style.position),'');
  assert.equal(await page.locator('.app-content[inert]').count(),0);
}
try {
  const matrix=before?[[390,'light','standard','no-preference']]:
    [320,390].flatMap(w=>['light','dark'].flatMap(a=>['standard','premium'].map(s=>[w,a,s,'no-preference']))).concat([[320,'dark','standard','reduce'],[390,'light','premium','reduce']]);
  const cases=matrix.filter(parts=>!process.env.ROOK_QA_CASE||parts.join('-')===process.env.ROOK_QA_CASE);
  for(const [width,appearance,style,motion] of (only && only !== 'freestyle' ? [] : cases)) {
    let state=createReturningUserFixture(3);state.activeWorkout=null;state.activeOptionalSession=null;
    Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
    const {context,page,cdp,errors}=await open(state,width,motion);
    try {
      // Real entry, search, result tap and re-open actions; no parser/test-only picker.
      await startFreestyle(page);
      await page.getByRole('button',{name:'+ ADD EXERCISE',exact:true}).click();await settled(page);
      let panel=page.locator('.freestyle-picker');const label=`freestyle-${width}-${style}-${appearance}-${motion}`;
      await checkQueries(page,panel,label,width===390&&appearance==='light'&&style==='standard'&&motion==='no-preference');
      if(before)continue;
      assert.equal(await page.locator('html').getAttribute('data-appearance'),appearance);
      assert.equal(await page.locator('html').getAttribute('data-style'),style);
      for(const [height,offset,type] of [[420,0,'resize'],[420,95,'scroll'],[300,50,'resize'],[844,0,'resize']]) {
        await page.evaluate(([h,o,t])=>window.qaViewport(h,o,t),[height,offset,type]);
        await checkQueries(page,panel,`${label}-vv${height}+${offset}`);
        const m=await measure(panel);assert.ok(m.sheet.top>=offset-1);assert.ok(m.sheet.bottom<=offset+height+1);
        if(height===300&&width===390&&style==='standard'&&appearance==='light'&&motion==='no-preference') {
          await panel.getByRole('searchbox').fill('pist');
          await page.screenshot({path:`${out}/after-keyboard-height300-offset50.png`});
        }
      }
      if(width===390&&style==='standard'&&appearance==='light'&&motion==='no-preference') {
        await page.setViewportSize({width:844,height:390});await page.evaluate(()=>window.qaViewport(330,20));
        await checkQueries(page,panel,'freestyle-landscape');
        await page.setViewportSize({width,height:844});await page.evaluate(()=>window.qaViewport(844,0));
        await checkQueries(page,panel,'freestyle-orientation-restored');
      }
      await assertScroll(page,panel,cdp);
      await dismiss(page,panel,cdp);
      await page.getByRole('button',{name:'+ ADD EXERCISE',exact:true}).click();await settled(page);panel=page.locator('.freestyle-picker');
      await page.evaluate(()=>window.qaViewport(360,85));
      const input=panel.getByRole('searchbox');await input.fill('pist');await input.blur();await input.focus();
      const selectedName=await panel.locator('.list-row').first().locator('span').first().evaluate(el=>el.firstChild.textContent);
      await panel.locator('.list-row').first().tap();await panel.waitFor({state:'detached'});
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout?.exercises.length===1);
      const added=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exercises);
      assert.equal(added.length,1);assert.equal(await page.locator('.workout-screen').count(),1);
      // Existing post-add behavior closes. Reopening retains added-row protection.
      await page.evaluate(()=>window.qaViewport(844,0));
      const add=page.getByRole('button',{name:/ADD EXERCISE/i});
      if(await add.count()===1)await add.click();
      else throw new Error('Expected the current Add exercise action after adding');
      await settled(page);panel=page.locator('.freestyle-picker');await panel.getByRole('searchbox').fill('pist');
      assert.equal(await panel.locator('.list-row:disabled').count(),1);
      const close=panel.getByRole('button',{name:/^Close/});await close.click();await panel.waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>document.body.style.position),'');
      assert.deepEqual(errors,[]);report.push({label,add:selectedName,duplicates:0,scroll:true,drag:true,reopen:true});
      console.log('PASS',label);
    }finally{await context.close();}
  }
  if(!before && (!only || only === 'replace'))for(const width of [320,390]) {
    let state=createReturningUserFixture(3);state.activeWorkout=null;state.activeOptionalSession=null;
    state=startFreestyleWorkout(state);state=addFreestyleExercise(state,'leg-press');state.profile.appearancePreference='dark';
    const {context,page,cdp,errors}=await open(state,width);
    try {
      await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();await page.getByRole('button',{name:'Replace',exact:true}).click();
      await page.getByRole('button',{name:'Search all exercises',exact:true}).click();await settled(page);
      const panel=page.locator('.replace-sheet');await checkQueries(page,panel,`replace-${width}`);
      await page.evaluate(()=>window.qaViewport(330,60));await checkQueries(page,panel,`replace-${width}-keyboard`);
      if(width===320){await panel.getByRole('searchbox').fill('pist');await page.screenshot({path:`${out}/after-replace-keyboard-320.png`});}
      await page.getByRole('button',{name:'‹ Compatible options',exact:true}).click();
      assert.equal(await panel.evaluate(el=>el.classList.contains('exercise-search-sheet')),false);
      assert.equal(await page.locator('.modal-layer').evaluate(el=>el.style.top),'');
      await page.getByRole('button',{name:'Search all exercises',exact:true}).click();await checkQueries(page,panel,`replace-${width}-reentry`);
      await panel.getByRole('searchbox').fill('pist');await panel.locator('.choice-row').first().tap();await panel.waitFor({state:'detached'});
      assert.equal(await page.locator('.workout-screen').count(),1);assert.deepEqual(errors,[]);console.log('PASS replace',width);
    }finally{await context.close();}
  }
  if(!before && (!only || only === 'adjust'))for(const width of [320,390]) {
    const state=blankState(), today=weekday();
    Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',ageRange:'25–39',daysPerWeek:4,availableDays:[today,...WEEKDAYS.filter(d=>d!==today).slice(0,3)],sessionMinutes:90,environment:'Commercial gym',equipment:['full gym'],onboardingComplete:true,appearancePreference:'dark'});
    state.program=buildProgram(state.profile);state.selectedDate=isoDay();state.selectedDay=today;state.ai.planUpgradeDismissed=true;
    const ex=state.program.days.find(d=>d.weekday===today).exercises[0];
    Object.assign(ex,{exerciseId:'imported-custom-search-qa',exerciseSource:'imported-custom',importedName:'My Custom Press',originalImportedName:'My Custom Press',importedExercise:{id:'imported-custom-search-qa',name:'My Custom Press',pattern:null,muscles:null,equipment:null},matchStatus:'confirmed-custom'});
    state.program.source='ai-import';
    const {context,page,cdp,errors}=await open(state,width);
    try {
      await page.getByRole('button',{name:'ADJUST TODAY',exact:true}).click();
      await page.getByRole('button',{name:/Specific exercise unavailable/}).click();
      await page.getByRole('group',{name:'Unavailable exercises'}).locator('button').first().click();
      await page.getByRole('button',{name:'FIND REPLACEMENTS',exact:true}).click();
      await page.getByRole('button',{name:'Choose replacement',exact:true}).first().click();await settled(page);
      const panel=page.locator('.adjust-today-sheet');await checkQueries(page,panel,`adjust-manual-${width}`);
      await page.evaluate(()=>window.qaViewport(330,80));await checkQueries(page,panel,`adjust-manual-${width}-keyboard`);
      if(width===320){await panel.getByRole('searchbox').fill('pist');await page.screenshot({path:`${out}/after-adjust-keyboard-320.png`});}
      await panel.getByRole('searchbox').fill('pist');await panel.locator('.choice-row').first().tap();
      await page.getByText('Future workouts remain based on your original plan.').waitFor();
      assert.equal(await panel.evaluate(el=>el.classList.contains('exercise-search-sheet')),false);
      // The returned review has its own approved action-footer keyboard owner.
      // Close the simulated keyboard before checking that normal geometry returns.
      await page.evaluate(()=>window.qaViewport(844,0));
      assert.equal(await page.locator('.modal-layer').evaluate(el=>el.style.top),'');
      assert.deepEqual(errors,[]);console.log('PASS adjust manual',width);
    }finally{await context.close();}
  }
}finally{
  await writeFile(`${out}/${before?'before':'after'}${only?`-${only}`:''}-geometry.json`,JSON.stringify(report,null,2));
  await browser.close();
}
console.log(before?'Before geometry captured.':'Stable exercise-search QA passed. Real catalog + production UI; visualViewport simulated, not physical iPhone verification.');
