import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const out='artifacts/saved-workouts-polish',results=[];
const sessionOnly=process.argv.includes('--session-contracts-only');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const proof=async page=>JSON.parse(await page.locator('#saved-proof').textContent());
const stable=async page=>page.waitForFunction(()=>[...document.querySelectorAll('.modal-layer>.screen')].every(n=>n.getAnimations().every(a=>a.playState==='finished')));
const savedBack=page=>page.locator('.saved-workouts>.detail-header .detail-header-back, .freestyle-queue-picker>.detail-header .detail-header-back');
async function options(page,action){
  await page.getByRole('button',{name:'Saved workout options',exact:true}).tap();
  await stable(page);
  if(action){await page.getByRole('dialog',{name:'Saved workout options',exact:true}).getByRole('button',{name:action,exact:true}).click();await page.locator('.saved-template-options').waitFor({state:'detached'});}
}
async function gesture(page,from,to){
  const session=await page.context().newCDPSession(page);
  const point=(x,y)=>({x,y,id:1});
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(...from)]});
  for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(from[0]+(to[0]-from[0])*i/8,from[1]+(to[1]-from[1])*i/8)]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
}
try{
if(!sessionOnly)for(const width of process.env.QA_WIDTH?[Number(process.env.QA_WIDTH)]:[320,390,430])for(const theme of process.env.QA_THEME?[process.env.QA_THEME]:['standard-light','standard-dark','premium-light','premium-dark'])for(const mode of process.env.QA_MODE?[process.env.QA_MODE]:['completed','standalone','embedded']){
  const key=`${width}-${theme}-${mode}`,reduced=width===430&&theme==='premium-dark';
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'});
  await context.addInitScript(()=>{const match=window.matchMedia.bind(window);window.matchMedia=q=>{const media=match(q);if(q==='(display-mode: standalone)')Object.defineProperty(media,'matches',{value:true});return media;};});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
  await page.goto(`${process.env.ROOK_QA_URL||'http://127.0.0.1:4198'}/scripts/saved-workout-review.html?mode=${mode}&theme=${theme}`);
  await page.locator('#saved-proof').waitFor({state:'attached'});const initial=await proof(page);
  if(mode==='completed'){await page.getByRole('button',{name:'Workout options',exact:true}).click();await page.getByRole('button',{name:'Save as template',exact:true}).click();}
  else{
    if(mode==='embedded')await page.getByRole('button',{name:'Saved workouts',exact:true}).click();
    await page.locator('.saved-workout-list .list-row').click();
  }
  await stable(page);
  const preview=page.locator('.saved-workout-preview');
  const primary=preview.locator('.button.primary');
  if(mode==='completed'){
    assert.equal(await page.getByRole('button',{name:'Saved workout options',exact:true}).count(),0);
    const edit=page.getByRole('button',{name:'Edit exercises',exact:true});
    await primary.scrollIntoViewIfNeeded();
    const geometry=await page.evaluate(()=>{const box=s=>document.querySelector(s).getBoundingClientRect(),edit=box('.saved-template-save-actions>.text-button'),note=box('.saved-template-copy-note'),save=box('.saved-template-save-actions>.primary');return {editHeight:edit.height,noteGap:edit.top-note.bottom,saveGap:save.top-edit.bottom,saveHeight:save.height};});
    assert.ok(geometry.editHeight>=44,key);assert.ok(geometry.noteGap>=16&&geometry.noteGap<=20,JSON.stringify(geometry));assert.ok(geometry.saveGap>=8&&geometry.saveGap<=12,JSON.stringify(geometry));assert.ok(geometry.saveHeight>=44);
    const scroll=await preview.evaluate(n=>n.scrollTop),originalList=await page.locator('.saved-template-exercises').innerText();
    await edit.tap();await page.getByRole('button',{name:'REVIEW TEMPLATE',exact:true}).waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await page.locator('.saved-template-exercises').innerText(),originalList);assert.deepEqual(await proof(page),initial);
    assert.ok(Math.abs(await preview.evaluate(n=>n.scrollTop)-scroll)<2,'create Edit/Cancel restores preview scroll');
    await page.screenshot({path:`${out}/${key}.png`});results.push({key,reduced,...geometry});
    if(width===390&&theme==='standard-light'){
      await edit.tap();await page.getByRole('button',{name:'REVIEW TEMPLATE',exact:true}).click();await page.getByLabel('Template name',{exact:true}).fill('Created from completed workout');await page.getByRole('button',{name:'Save template',exact:true}).click();
      await page.waitForFunction(()=>JSON.parse(document.querySelector('#saved-proof').textContent).templates.length===2);
      const saved=await proof(page);assert.equal(saved.templates[1].revision,1);assert.deepEqual(saved.workouts,initial.workouts);assert.deepEqual(saved.active,initial.active);
    }
  }else{
    assert.equal(await page.getByRole('button',{name:'Rename',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Edit exercises',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Delete template',exact:true}).count(),0);
    const trigger=page.getByRole('button',{name:'Saved workout options',exact:true}),box=await trigger.boundingBox();assert.ok(box.width>=44&&box.height>=44,key);
    assert.match(await primary.innerText(),mode==='embedded'?/^Add \d+ exercises to Up Next$/:/^Start workout$/);
    await options(page);const panel=page.locator('.saved-template-options');
    const geometry=await panel.evaluate(n=>({paddingBottom:parseFloat(getComputedStyle(n).paddingBottom),scrollOwners:[...document.querySelectorAll('.modal-layer>.screen,[data-exercise-search-scroll]')].filter(e=>!e.closest('[inert],[hidden]')&&e.scrollHeight>e.clientHeight+2&&getComputedStyle(e).overflowY==='auto').length,bottom:n.getBoundingClientRect().bottom,deleteColor:getComputedStyle(n.querySelector('.danger-text')).color,normalColor:getComputedStyle(n.querySelector('.list-row')).color}));
    assert.ok(geometry.paddingBottom>=20);assert.ok(geometry.scrollOwners<=1);assert.ok(geometry.bottom<=845);assert.notEqual(geometry.deleteColor,geometry.normalColor);
    assert.deepEqual(await proof(page),initial);await page.screenshot({path:`${out}/${key}-options.png`});
    await page.getByRole('button',{name:'Close Saved workout options',exact:true}).click();await panel.waitFor({state:'detached'});
    await page.waitForFunction(()=>document.activeElement?.matches('.saved-template-options-trigger'));assert.deepEqual(await proof(page),initial);
    await options(page,'Rename');await page.getByLabel('Template name',{exact:true}).fill('Cancelled name');await savedBack(page).click();assert.deepEqual(await proof(page),initial);
    const header=mode==='embedded'?await page.locator('.freestyle-queue-picker>.detail-header').elementHandle():null;
    await options(page,'Edit exercises');await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(await proof(page),initial);
    if(header)assert.equal(await page.locator('.freestyle-queue-picker>.detail-header').evaluate((n,old)=>n===old,header),true);
    await options(page,'Delete template');assert.deepEqual(await proof(page),initial);await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(await proof(page),initial);
    if(width===390&&theme==='standard-light'){
      for(const dismiss of ['back','backdrop','escape','drag','edge']){
        await options(page);const before=await preview.evaluate(n=>n.scrollTop),p=await panel.boundingBox();
        if(dismiss==='back')await page.getByRole('button',{name:'Back to saved workout',exact:true}).click();
        if(dismiss==='backdrop')await page.touchscreen.tap(8,p.y-15);
        if(dismiss==='escape')await page.keyboard.press('Escape');
        if(dismiss==='drag')await gesture(page,[width/2,p.y+14],[width/2,p.y+200]);
        if(dismiss==='edge')await gesture(page,[4,p.y+105],[width*.75,p.y+105]);
        await panel.waitFor({state:'detached'});await page.waitForFunction(()=>document.activeElement?.matches('.saved-template-options-trigger'));assert.equal(await preview.evaluate(n=>n.scrollTop),before);assert.deepEqual(await proof(page),initial);
      }
      await options(page,'Rename');await page.getByLabel('Template name',{exact:true}).fill('Renamed saved workout');await page.getByRole('button',{name:'Save template',exact:true}).click();
      await page.locator('.saved-workout-list .list-row').click();let saved=await proof(page);assert.equal(saved.templates[0].id,initial.templates[0].id);assert.equal(saved.templates[0].revision,2);assert.deepEqual(saved.templates[0].exercises,initial.templates[0].exercises);
      await options(page,'Edit exercises');await page.locator('[data-swipe-fallback]').first().press('Enter');await page.getByRole('button',{name:'REVIEW TEMPLATE',exact:true}).click();await page.getByRole('button',{name:'Save template',exact:true}).click();saved=await proof(page);assert.equal(saved.templates[0].revision,3);assert.equal(saved.templates[0].exercises.length,initial.templates[0].exercises.length-1);
      await page.locator('.saved-workout-list .list-row').click();await options(page,'Delete template');await page.getByRole('button',{name:'Delete template only',exact:true}).click();await page.getByText('Template deleted',{exact:true}).waitFor();saved=await proof(page);assert.equal(saved.templates.length,0);assert.deepEqual(saved.active,initial.active);assert.deepEqual(saved.workouts,initial.workouts);assert.deepEqual(saved.program,initial.program);
    }else if(mode==='embedded'){
      await savedBack(page).click();assert.equal(await page.getByRole('searchbox',{name:'Search saved workouts',exact:true}).count(),1);assert.equal(await page.locator('.freestyle-queue-picker>.detail-header strong').innerText(),'Add exercise');
    }
    results.push({key,reduced,trigger:[box.width,box.height],...geometry});
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,key);
  assert.deepEqual(await page.locator('.saved-template-title,.saved-workout-preview,.saved-template-options').evaluateAll(nodes=>nodes.filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.className)),[],key);
  assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${key}`);
}
// Explicit use actions retain the existing no-session/freestyle/planned contract.
for(const mode of ['standalone','standalone-active','planned']){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
  await page.goto(`${process.env.ROOK_QA_URL||'http://127.0.0.1:4198'}/scripts/saved-workout-review.html?mode=${mode}&theme=standard-light`);await page.locator('.saved-workout-list .list-row').click();const initial=await proof(page);
  // Emulate only the safe inset input to the existing viewport formula. The
  // shared binder supplies that property inline from env() on a real device.
  await options(page);await page.addStyleTag({content:'.saved-template-options{--sheet-action-safe-bottom:34px!important}'});
  const inset=await page.locator('.saved-template-options').evaluate(n=>({padding:parseFloat(getComputedStyle(n).paddingBottom),gap:n.getBoundingClientRect().bottom-n.lastElementChild.getBoundingClientRect().bottom}));assert.equal(inset.padding,54);assert.ok(inset.gap>=54,'simulated 34px safe inset remains below menu content');
  await page.getByRole('button',{name:'Back to saved workout',exact:true}).click();await page.locator('.saved-template-options').waitFor({state:'detached'});assert.deepEqual(await proof(page),initial);
  const duplicates=page.getByRole('checkbox',{name:/^Add (it|them) again$/});
  if(await duplicates.count())await duplicates.check();
  await page.locator('.saved-workout-preview>.button.primary').click();
  const expectedCount=(initial.active?.exercises.length||0)+initial.templates[0].exercises.length;
  await page.waitForFunction(count=>JSON.parse(document.querySelector('#saved-proof').textContent).active?.exercises.length===count,expectedCount);
  const after=await proof(page);assert.deepEqual(after.templates,initial.templates);assert.deepEqual(after.workouts,initial.workouts);assert.deepEqual(after.program,initial.program);
  if(initial.active){
    assert.equal(after.active.id,initial.active.id);assert.equal(after.active.source,initial.active.source);assert.deepEqual(after.active.exercises.slice(0,initial.active.exercises.length),initial.active.exercises);
    await page.getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual((await proof(page)).active.exercises,initial.active.exercises);
  }else assert.equal(after.active.source,'freestyle');
  results.push({key:`390-standard-light-${mode}-session-contract`,simulatedSafeInset:34});await context.close();console.log(`PASS ${mode} session contract`);
}
}finally{await writeFile(`${out}/${sessionOnly?'session-results':'results'}.json`,JSON.stringify(results,null,2));await browser.close();}
console.log(`Saved workout polish QA passed: ${results.length} mobile/theme/flow cases.`);
