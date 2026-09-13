import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,deserializeState} from '../src/domain.js';
import {openProfileArea} from './qa-current-navigation.mjs';

const exitQA=process.argv.includes('--exit-toggle');
const dir=`artifacts/ROOK-BASELINE-CORRECTION-REVIEW/${exitQA?'preview-reorder-exit':'preview-reorder-mode'}`;
await mkdir(dir,{recursive:true});
const before=process.argv.includes('--before'), smoke=process.argv.includes('--smoke');
const caseFilter=process.argv.find(arg=>arg.startsWith('--case='))?.slice(7);
let server,base=process.env.ROOK_QA_URL||'http://127.0.0.1:4177';
if(before){
  // Serve the exact task-start copies without swapping dirty working-tree files.
  const {createServer}=await import('vite');
  server=await createServer({server:{host:'127.0.0.1',port:4188,strictPort:true},plugins:[{name:'qa-task-start-snapshot',enforce:'pre',async load(id){
    if(id.replaceAll('\\','/').endsWith('/src/App.jsx'))return readFile(`${dir}/App.before.jsx`,'utf8');
    if(id.replaceAll('\\','/').endsWith('/src/import-plan.css'))return readFile(`${dir}/import-plan.before.css`,'utf8');
  }}]});await server.listen();base='http://127.0.0.1:4188';
}
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
let page;
const settle=p=>p.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
const cases=before||smoke?[{width:390,style:'standard',appearance:'dark',days:5,motion:'no-preference'}]:
  [320,390].flatMap((width,w)=>['standard','premium'].flatMap((style,s)=>['light','dark'].map((appearance,a)=>({width,style,appearance,days:exitQA?[5,6][(w+s+a)%2]:[2,5,6][(w*4+s*2+a)%3],motion:a?'reduce':'no-preference'}))));
async function vertical(p,cdp,selector,fromCard=false){
  const scope=p.locator(selector);
  await scope.evaluate((e,fromCard)=>{const scroller=e.scrollHeight>e.clientHeight&&/(auto|scroll)/.test(getComputedStyle(e).overflowY)?e:document.scrollingElement;window.qaScrollOwner=scroller;if(!fromCard)scroller.scrollTop=200;},fromCard);
  let x=(await p.evaluate(()=>innerWidth))*.7,y=650;
  if(fromCard){const label=scope.locator('.plan-editor-heading').first();await label.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));const b=await label.boundingBox();x=b.x+b.width*.7;y=b.y+b.height/2;}
  const initial=await p.evaluate(()=>window.qaScrollOwner.scrollTop);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*24}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await p.waitForFunction(initial=>window.qaScrollOwner.scrollTop>initial+20,initial);
  const end=await p.evaluate(()=>window.qaScrollOwner.scrollTop);assert.ok(end>initial+20);return end-initial;
}
async function drag(p,handle,target,{cancel=false,workout=false,shot}={}){
  await handle.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));const b=await handle.boundingBox();
  const cdp=await p.context().newCDPSession(p),x=b.x+b.width/2,y=b.y+b.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await p.locator('.plan-reorder-preview').waitFor();
  if(workout)assert.equal(await p.locator('.plan-editor-exercise:visible').count(),0);
  await target.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));const t=await target.boundingBox();
  const end=Math.min(700,t.y+t.height/2+32);
  for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+(end-y)*i/10}]});await p.evaluate(()=>new Promise(requestAnimationFrame));}
  if(shot)await p.screenshot({path:`${dir}/${shot}.png`});
  await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();
  await p.locator('.plan-reorder-preview').waitFor({state:'detached'});
}
try{for(const c of cases){
  if(caseFilter && `${c.width}-${c.style}-${c.appearance}`!==caseFilter)continue;
  const context=await browser.newContext({viewport:{width:c.width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:c.motion});
  const state=blankState();Object.assign(state.profile,{stylePreference:c.style,appearancePreference:c.appearance,themePreference:c.style==='premium'?'premium':c.appearance});
  await context.addInitScript(state=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(state));Object.defineProperty(navigator,'standalone',{value:true});},state);
  page=await context.newPage();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(base);
  const button=name=>page.getByRole('button',{name,exact:true}),next=()=>button('CONTINUE').click();
  if(await button('BUILD MY PLAN').isVisible())await button('BUILD MY PLAN').click();
  await page.getByRole('combobox',{name:'Age range'}).click();await page.getByRole('option',{name:'18–29'}).click();await next();
  await button('Build muscle').click();await page.waitForTimeout(360); // existing choice-step duplicate protection
  await page.getByRole('button',{name:/^Intermediate/}).click();await button(`${c.days} days`).click();await page.getByLabel('Any day works').check();await button('60 min').click();await next();
  await button('Commercial gym').click();await next();await button('Balanced').click();await next();await page.getByRole('button',{name:/Balanced (starting point|workload)/}).click();await next();
  await button('BUILD MY PLAN').click();await page.getByRole('heading',{name:'Your week is ready.',exact:true}).waitFor({timeout:45000});await settle(page);
  const tag=`${before?'before':'after'}-${c.width}-${c.style}-${c.appearance}-${c.days}days`,screen=page.locator('.generated-plan-preview'),editor=page.locator('.plan-editor');
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  const beforeStored=await stored();
  const days=editor.locator('.import-day'),dayIds=()=>days.evaluateAll(ds=>ds.map(d=>d.dataset.dayId));
  const originalDays=await dayIds(),day0=days.first(),cards=day0.locator('.plan-editor-exercise');
  const originalExercises=await cards.evaluateAll(es=>es.map(e=>e.id));
  await editor.locator('.import-plan-meta').scrollIntoViewIfNeeded();await settle(page);
  await page.screenshot({path:`${dir}/${tag}-review.png`});
  if(before){
    const row=cards.first().locator('.plan-editor-summary');await row.scrollIntoViewIfNeeded();const b=await row.boundingBox();const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+60,y:b.y+30}]});await page.locator('.plan-reorder-preview').waitFor();
    await page.screenshot({path:`${dir}/${tag}-long-press.png`});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    results.push({...c,pass:true,legacyLongPress:true});await context.close();continue;
  }
  assert.equal(await editor.locator('[data-reorder-kind]').count(),0);assert.ok(await editor.locator('img').count()>0);assert.ok(await page.getByRole('button',{name:'+ Add exercise',exact:true}).count()>0);
  const cdp=await context.newCDPSession(page),row=cards.first().locator('.plan-editor-summary');await row.scrollIntoViewIfNeeded();const b=await row.boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+60,y:b.y+30}]});await page.waitForTimeout(430);
  assert.equal(await editor.locator('.plan-reorder-preview').count(),0);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  const scrollReview=await vertical(page,cdp,'.generated-plan-preview',true);
  await row.click();await settle(page);
  const expandedId=await cards.first().getAttribute('id');
  await cards.first().evaluate(e=>{window.qaExpandedNode=e.querySelector('.plan-editor-fields');});
  await button('Reorder').click();
  assert.equal(await button('Reorder').count(),0);
  assert.equal(await editor.locator('.plan-preview-mode-status').textContent(),'Reordering');
  assert.equal(await page.getByRole('button',{name:/^Done/}).count(),1);
  assert.equal(await button('USE THIS PLAN').count(),0);
  assert.equal(await editor.locator('.plan-editor-summary-action:visible,.plan-review-illustration:visible,.plan-editor-fields:visible,.scratch-add-exercise:visible').count(),0);
  const handle=cards.first().locator('.plan-exercise-drag-handle'),handleBox=await handle.boundingBox();assert.ok(handleBox.width>=44&&handleBox.height>=44);
  const scrollMode=await vertical(page,cdp,'.generated-plan-preview',true);
  assert.equal(await editor.locator('.plan-reorder-preview').count(),0);
  await editor.locator('.import-plan-meta').scrollIntoViewIfNeeded();await settle(page);await page.screenshot({path:`${dir}/${tag}-mode.png`});
  // Two real drags. Done never ends the mode automatically after a drop.
  await drag(page,handle,cards.nth(1));
  assert.equal(await editor.locator('.plan-preview-mode-status').count(),1,'completed drag stays in reorder mode');
  assert.equal((await cards.evaluateAll(es=>es.map(e=>e.id)))[1],originalExercises[0]);
  await page.waitForTimeout(510); // existing post-drag click protection, not scroll gating
  await drag(page,cards.first().locator('.plan-exercise-drag-handle'),cards.nth(1));
  await page.waitForTimeout(510);
  // Repeat via accessible controls: the same commit handler.
  await cards.first().locator('.plan-exercise-drag-handle').focus();await page.keyboard.press('Alt+ArrowDown');await settle(page);
  const movedExercises=await cards.evaluateAll(es=>es.map(e=>e.id));assert.notDeepEqual(movedExercises,originalExercises);
  await drag(page,days.first().locator('.plan-workout-drag-surface'),days.nth(1),{workout:true,shot:`${tag}-workout-drag`});
  const movedDays=await dayIds();assert.equal(movedDays[1],originalDays[0]);
  const immediateScroll=await vertical(page,cdp,'.generated-plan-preview');
  await drag(page,days.first().locator('.plan-workout-drag-surface'),days.nth(1),{workout:true,cancel:true});assert.deepEqual(await dayIds(),movedDays);
  assert.equal(await editor.locator('.plan-preview-mode-status').count(),1,'cancelled drag stays in reorder mode');
  await vertical(page,cdp,'.generated-plan-preview');
  const interruptHandle=days.first().locator('.plan-workout-drag-surface');await interruptHandle.scrollIntoViewIfNeeded();const ib=await interruptHandle.boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:ib.x+22,y:ib.y+22}]});await page.locator('.plan-reorder-preview').waitFor();
  await interruptHandle.evaluate(e=>e.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerType:'touch',pointerId:77})));
  assert.equal(await page.locator('.plan-reorder-preview').count(),0);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await vertical(page,cdp,'.generated-plan-preview');assert.deepEqual(await dayIds(),movedDays);
  await button('Done reordering').scrollIntoViewIfNeeded();await settle(page);
  const exitLocation=await editor.locator('.plan-preview-mode-row').evaluate(row=>({top:row.getBoundingClientRect().top,bottom:row.getBoundingClientRect().bottom,position:getComputedStyle(row).position,parentPosition:getComputedStyle(row.parentElement).position}));
  if(exitQA)assert.ok(exitLocation.bottom<0,'the non-sticky top row is out of reach at the end of a long preview');
  assert.equal(await page.locator('.sheet-action-footer').getByRole('button',{name:'Done reordering',exact:true}).count(),1);
  const footerBefore=await page.locator('.sheet-action-footer').evaluate(e=>{window.qaFooter=e;return {height:e.getBoundingClientRect().height,top:e.getBoundingClientRect().top,documentScroll:scrollY};});
  await page.screenshot({path:`${dir}/${tag}-footer-mode.png`});
  await button('Done reordering').click();await settle(page);
  const footerAfter=await page.locator('.sheet-action-footer').evaluate(e=>({height:e.getBoundingClientRect().height,top:e.getBoundingClientRect().top,same:window.qaFooter===e,documentScroll:scrollY}));
  assert.equal(footerAfter.same,true);assert.equal(footerAfter.height,footerBefore.height);
  assert.ok(Math.abs(footerAfter.top-footerBefore.top)<2,'existing footer stays in place on Done');
  assert.deepEqual(await stored(),beforeStored,'Done must not persist/replace/create history');
  assert.equal(await button('Reorder').evaluate(b=>document.activeElement===b),true,'Done restores focus without scrolling to the top');
  assert.equal(await button('Done reordering').count(),0);
  assert.ok(await editor.locator('.plan-review-illustration:visible').count()>0);
  assert.ok(await editor.locator('.plan-editor-summary-action:visible').count()>0);
  assert.deepEqual(await dayIds(),movedDays);assert.equal(await editor.locator('[data-reorder-kind]').count(),0);
  assert.equal(await page.locator(`[id="${expandedId}"]`).getAttribute('class').then(s=>s.includes('is-expanded')),true);
  assert.ok(await page.evaluate(()=>window.qaExpandedNode===document.querySelector('.plan-editor-fields')),'expanded editor DOM is retained');
  await button('Reorder').click();await button('Back to onboarding').click();assert.equal(await button('Reorder').getAttribute('aria-pressed'),'false');assert.deepEqual(await dayIds(),movedDays);
  await button('Reorder').click();await screen.evaluate(e=>e.scrollTop=0);
  // Physical-input protocol, standalone flag simulated: shared swipe invokes the same header Back.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:8,y:380}]});
  for(let x=30;x<=240;x+=30)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:380}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>document.querySelector('.plan-preview-mode-row button')?.getAttribute('aria-pressed')==='false');
  assert.deepEqual(await dayIds(),movedDays);assert.deepEqual(await stored(),beforeStored);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await editor.locator('.import-plan-meta').scrollIntoViewIfNeeded();await settle(page);await page.screenshot({path:`${dir}/${tag}-done.png`});
  const expectedExerciseIds=await days.evaluateAll(ds=>Object.fromEntries(ds.map(d=>[d.dataset.dayId,[...d.querySelectorAll('.plan-editor-exercise')].map(e=>e.id.replace('import-exercise-',''))])));
  await button('USE THIS PLAN').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state')).profile.onboardingComplete);
  const accepted=await stored();assert.deepEqual(accepted.program.days.map(d=>d.id),movedDays);
  for(const d of accepted.program.days)assert.deepEqual(d.exercises.map(e=>e.id),expectedExerciseIds[d.id]);
  assert.equal('previewReordering' in accepted.program,false);
  // Startup materializes default logging mode/load provenance. Wait for it,
  // and compare its canonical shape rather than racing the first render.
  await page.reload();await page.locator('.today-screen').waitFor();
  assert.deepEqual((await stored()).program,deserializeState(structuredClone(accepted)).program);
  // Ordinary Edit Plan remains directly reorderable and receives the accepted identities.
  await openProfileArea(page,'program');await page.getByRole('button',{name:/^Edit plan/}).click();await page.locator('.edit-plan-screen').waitFor();
  assert.equal(await page.getByRole('button',{name:'Reorder',exact:true}).count(),0);assert.ok(await page.locator('.plan-exercise-drag-handle').count()>0);
  assert.deepEqual(await page.locator('[data-reorder-workout-section]').evaluateAll(ds=>ds.map(d=>d.dataset.dayId)),movedDays);
  const editFirstDay=page.locator('.edit-plan-screen .import-day').first(),editCards=editFirstDay.locator('.plan-editor-exercise');
  const editOrder=await editCards.evaluateAll(es=>es.map(e=>e.id));
  await editCards.first().locator('.plan-exercise-drag-handle').focus();await page.keyboard.press('Alt+ArrowDown');await settle(page);
  assert.equal(await editCards.nth(1).getAttribute('id'),editOrder[0]);
  await editCards.nth(1).locator('.plan-exercise-drag-handle').focus();await page.keyboard.press('Alt+ArrowUp');await settle(page);
  assert.deepEqual(await editCards.evaluateAll(es=>es.map(e=>e.id)),editOrder);
  let replacementPreview=false;
  if(smoke || c.width===390&&c.style==='premium'&&c.appearance==='dark'){
    page.once('dialog',dialog=>{assert.equal(dialog.message(),'Discard unsaved plan changes?');return dialog.accept();});
    await page.getByRole('button',{name:'Close edit plan',exact:true}).click();
    const beforeReplacement=await stored();
    await page.getByRole('button',{name:/^Replace plan/}).click();
    await page.getByRole('button',{name:/^Build a personalized plan/}).click();await button('BUILD NEW PLAN').click();
    const sheet=page.locator('.change-plan-sheet');await sheet.getByRole('button',{name:'Reorder',exact:true}).waitFor({timeout:45000});
    await sheet.getByRole('button',{name:'Reorder',exact:true}).click();
    await sheet.locator('.plan-exercise-drag-handle').first().focus();await page.keyboard.press('Alt+ArrowDown');await settle(page);
    await sheet.getByRole('button',{name:'Done reordering',exact:true}).click();assert.deepEqual(await stored(),beforeReplacement);
    await sheet.getByRole('button',{name:'Reorder',exact:true}).click();await sheet.getByRole('button',{name:'Back',exact:true}).click();
    assert.equal(await sheet.getByRole('button',{name:'Reorder',exact:true}).getAttribute('aria-pressed'),'false');
    await sheet.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('heading',{name:'Build a new personalized plan?',exact:true}).waitFor();
    assert.deepEqual(await stored(),beforeReplacement);replacementPreview=true;
  }
  assert.deepEqual(errors,[]);
  results.push({...c,pass:true,scrollReview,scrollMode,immediateScroll,exitLocation,footerBefore,footerAfter,singleDone:'existing footer',donePersisted:false,back:true,swipe:true,reload:true,editControl:true,replacementPreview});
  console.log(`PASS ${tag}`);await context.close();
}}catch(error){if(page)await page.screenshot({path:`${dir}/failure.png`}).catch(()=>{});throw error;}
finally{await writeFile(`${dir}/${before?'before':smoke?'smoke':caseFilter?`results-${caseFilter}`:'results'}.json`,JSON.stringify(results,null,2));await browser.close();await server?.close();}
