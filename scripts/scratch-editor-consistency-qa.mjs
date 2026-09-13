import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {openProfileArea} from './qa-current-navigation.mjs';

const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/scratch-picker';
await mkdir(out,{recursive:true});const results=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
const settle=async p=>p.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
try {for(const mode of ['scratch','edit'])for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const key=`${mode}-${width}-${style}-${appearance}`,s=mode==='scratch'?blankState():createReturningUserFixture(1);
 if(process.env.ROOK_QA_CASE && !key.includes(process.env.ROOK_QA_CASE))continue;
 Object.assign(s.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});s.activeWorkout=null;
 const c=await browser.newContext({viewport:{width,height:844},hasTouch:true,serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'});
 await c.addInitScript(({s,mode})=>{if(mode==='edit'&&!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));Object.defineProperty(navigator,'standalone',{value:true});},{s,mode});
 await c.addInitScript(()=>{for(const type of ['touchend','touchcancel'])window.addEventListener(type,()=>{if(document.querySelector('.plan-reorder-preview'))window.qaReorderReleasedAt=performance.now();},true);});
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173');
 const snap=async name=>{await settle(p);if(width===390||style==='standard'&&appearance==='dark')await p.screenshot({path:`${out}/${key}-${name}.png`});};
 if(mode==='scratch'){
  await p.getByRole('button',{name:/Start from scratch/}).click();for(const d of ['Mon','Tue','Thu'])await p.getByRole('button',{name:d,exact:true}).click();await p.getByRole('button',{name:'CONTINUE',exact:true}).click();
 }else{await p.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(p,'program');await p.getByRole('button',{name:/Edit plan/}).click();await p.getByRole('button',{name:'Expand Edit plan to full screen'}).click();}
 // An initial Scratch flow has no persisted profile; a blank saved profile
 // intentionally resumes onboarding. Theme-only state does not change entry.
 if(mode==='scratch')await p.evaluate(({style,appearance})=>Object.assign(document.documentElement.dataset,{style,appearance}),{style,appearance});
 const root=p.locator(mode==='scratch'?'.scratch-editor-screen':'.edit-plan-screen'),days=root.locator('[data-reorder-workout-section]'),day=days.first(),weekday=await day.getAttribute('data-day-id');
 const add=async (d,name)=>{await d.getByRole('button',{name:/\+ Add (first )?exercise/i}).click();await d.getByPlaceholder('Search exercises',{exact:true}).fill(name);await d.getByRole('option',{name,exact:true}).click();};
 if(mode==='scratch'){for(const name of ['Bench Press','Seated Cable Row','Squat'])await add(day,name);await add(days.nth(1),'Leg Curl');}
 if(width===320)await day.getByRole('textbox',{name:/workout name$/}).fill('Upper strength and technique with controlled tempo');
 const cards=day.locator('.plan-editor-exercise');assert.equal(await day.locator('.plan-editor-summary[data-reorder-kind]').count(),0);
 assert.equal(await day.locator('.plan-exercise-drag-handle').count(),await cards.count());
 await cards.first().scrollIntoViewIfNeeded();await snap('editor');
 await cards.first().locator('.plan-editor-summary').click();await settle(p);const field=cards.first().getByRole('textbox',{name:/^Sets for/});await field.fill('4');await field.press('Enter');await settle(p);
 const draftSaved=await p.evaluate(()=>localStorage.getItem('lift-v2-state'));
 // A paused touch on the card must remain scrollable, not arm a long-press reorder.
 await cards.first().locator('.plan-editor-summary').scrollIntoViewIfNeeded();let r=await cards.first().locator('.plan-editor-summary').boundingBox();const cdp=await c.newCDPSession(p);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+90,y:r.y+25}]});await p.evaluate(()=>new Promise(r=>setTimeout(r,420)));assert.equal(await p.locator('.plan-reorder-preview').count(),0);
 for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+90,y:r.y+25-i*12}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await p.locator('.plan-reorder-preview').count(),0);
 // Reordering remains available only on the dedicated handle, plus keyboard.
 await cards.first().locator('.plan-exercise-drag-handle').scrollIntoViewIfNeeded();r=await cards.first().locator('.plan-exercise-drag-handle').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+22,y:r.y+22}]});await p.locator('.plan-reorder-preview').waitFor();await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await p.locator('.plan-reorder-preview').waitFor({state:'detached'});await p.evaluate(()=>new Promise(r=>setTimeout(r,520)));
 if(width===390&&style==='standard'&&appearance==='dark'){
  await cards.first().locator('.plan-editor-summary').click();await settle(p);
  const before=await cards.evaluateAll(es=>es.map(e=>e.id));
  await cards.first().locator('.plan-exercise-drag-handle').scrollIntoViewIfNeeded();
  const from=await cards.first().locator('.plan-exercise-drag-handle').boundingBox(),to=await cards.nth(1).boundingBox(),x=from.x+22,y=from.y+22;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await p.locator('.plan-reorder-preview').waitFor();
  for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+(to.y+to.height-4-y)*i/8}]});
  await snap('drag');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.locator('.plan-reorder-preview').waitFor({state:'detached'});
  const after=await cards.evaluateAll(es=>es.map(e=>e.id));assert.ok(after.indexOf(before[0])>0);assert.deepEqual([...after].sort(),[...before].sort());assert.deepEqual(after.filter(id=>id!==before[0]),before.slice(1));
  for(let i=after.indexOf(before[0]);i>0;i--){await cards.nth(i).locator('.plan-exercise-drag-handle').focus();await p.keyboard.press('Alt+ArrowUp');await p.waitForFunction(({id,index})=>document.querySelectorAll('.plan-editor-exercise')[index]?.id===id,{id:before[0],index:i-1});}
  assert.deepEqual(await cards.evaluateAll(es=>es.map(e=>e.id)),before);
  const dayIds=await days.evaluateAll(es=>es.map(e=>e.dataset.dayId));
  await days.first().locator('.plan-workout-drag-surface').focus();await p.keyboard.press('Alt+ArrowDown');await p.waitForFunction(id=>document.querySelector('[data-reorder-workout-section]')?.dataset.dayId===id,dayIds[1]);
  await days.nth(1).locator('.plan-workout-drag-surface').focus();await p.keyboard.press('Alt+ArrowUp');await p.waitForFunction(id=>document.querySelector('[data-reorder-workout-section]')?.dataset.dayId===id,dayIds[0]);assert.deepEqual(await days.evaluateAll(es=>es.map(e=>e.dataset.dayId)),dayIds);
 }
 const ids=await cards.evaluateAll(es=>es.map(e=>e.id));await cards.nth(1).locator('.plan-exercise-drag-handle').focus();await p.keyboard.press('Alt+ArrowUp');await p.waitForFunction(id=>document.querySelector('.plan-editor-exercise').id===id,ids[1]);
 // Open/close utilities must preserve the scroller and the edited draft.
 const tools=day.locator(mode==='scratch'?'.plan-workout-reorder-bar':'.plan-workout-tools');await tools.scrollIntoViewIfNeeded();await settle(p);
 // This utility-button check follows a real drop. Respect the existing 500ms
 // post-drop click guard; scroll readiness is tested separately without waiting.
 await p.waitForFunction(()=>window.qaReorderReleasedAt==null||performance.now()-window.qaReorderReleasedAt>=500);
 await root.evaluate(e=>e.addEventListener('pointerdown',event=>{if(event.target.closest('.plan-workout-overflow'))window.workoutOptionsScroll={window:scrollY,local:e.scrollTop};},{capture:true}));
 await tools.getByRole('button',{name:/Workout options/}).click();let sheet=p.getByRole('dialog',{name:'Workout options',exact:true});await sheet.waitFor();await snap('overflow');
 const option=sheet.locator('.choice-row').first();const layout=await option.evaluate(e=>{const label=e.firstElementChild.getBoundingClientRect(),icon=e.lastElementChild.getBoundingClientRect();return {right:icon.left>=label.right,centered:Math.abs((label.top+label.bottom)/2-(icon.top+icon.bottom)/2)<2};});assert.deepEqual(layout,{right:true,centered:true});
 const scroll=await p.evaluate(()=>window.workoutOptionsScroll);
 if(mode==='scratch'){
  await sheet.getByRole('button',{name:'Copy exercises to another day',exact:true}).click();sheet=p.getByRole('dialog',{name:'Copy exercises',exact:true});await sheet.waitFor();
  assert.equal(await sheet.getByRole('radio',{name:/Mon/}).count(),0);assert.equal(await sheet.getByRole('radio',{name:/Tue/}).isDisabled(),true);assert.equal(await sheet.getByRole('button',{name:'COPY',exact:true}).isDisabled(),true);
  await sheet.getByRole('radio',{name:/Thu/}).click();await snap('copy');
  assert.equal(await sheet.getByRole('radio',{name:/Tue/}).evaluate(e=>getComputedStyle(e).opacity),'1');
  if(!await sheet.evaluate(e=>e.scrollWidth<=e.clientWidth+1)){await p.screenshot({path:out+'/copy-overflow-debug.png'});console.log(await sheet.evaluate(e=>({w:e.clientWidth,sw:e.scrollWidth,children:[...e.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>e.getBoundingClientRect().right+1).map(n=>[n.className,n.getBoundingClientRect().right])})));}assert.equal(await sheet.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
  await sheet.getByRole('button',{name:'Back to workout options'}).click();await p.getByRole('dialog',{name:'Workout options',exact:true}).waitFor();await p.getByRole('dialog').last().getByRole('button',{name:'Copy exercises to another day',exact:true}).click();
  if(width===390&&style==='standard'&&appearance==='dark'){
   const bounds=await sheet.boundingBox(),x=bounds.x+3,y=bounds.y+110;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+160*i/8,y}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.getByRole('dialog',{name:'Workout options',exact:true}).waitFor();
   assert.equal(await p.locator('.plan-copy-open').evaluate(e=>e===document.activeElement),true);
   await p.getByRole('button',{name:'Copy exercises to another day',exact:true}).click();
  }
 }
 await p.keyboard.press('Escape');await p.locator('.plan-workout-actions-sheet').waitFor({state:'detached'});await settle(p);
 assert.deepEqual(await root.evaluate(e=>({window:scrollY,local:e.scrollTop})),scroll,'cancel keeps editor scroll');assert.equal(await p.evaluate(()=>localStorage.getItem('lift-v2-state')),draftSaved);
 await tools.getByRole('button',{name:/Workout options/}).click();await p.getByRole('button',{name:'Collapse workout',exact:true}).click();await p.locator('.plan-workout-actions-sheet').waitFor({state:'detached'});assert.equal(await cards.count(),0);
 await tools.getByRole('button',{name:/Workout options/}).click();await p.getByRole('button',{name:'Expand workout',exact:true}).click();await p.locator('.plan-workout-actions-sheet').waitFor({state:'detached'});assert.ok(await cards.count()>0);
 // Shared picker fallback: one action, no card fill, 44px target, no-result context.
 await day.getByRole('button',{name:/\+ Add exercise/i}).click();let input=day.getByPlaceholder('Search exercises',{exact:true}),fallback=day.locator('.custom-exercise-fallback');
 assert.equal(await fallback.getByRole('button',{name:'Create custom exercise',exact:true}).count(),1);await input.fill('No match synthetic exercise');assert.equal(await day.getByRole('option').count(),0);await day.getByText('No matching exercises',{exact:true}).waitFor();
 const geometry=await fallback.getByRole('button').evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),probe=document.createElement('span');probe.style.color='var(--rook-accent)';e.append(probe);const accent=getComputedStyle(probe).color;probe.remove();return {h:r.height,w:r.width,bg:s.backgroundColor,border:s.borderTopWidth,color:s.color,accent};});assert.ok(geometry.h>=44&&geometry.w>=44);assert.equal(geometry.bg,'rgba(0, 0, 0, 0)');assert.equal(geometry.border,'0px');assert.equal(geometry.color,geometry.accent);
 if(process.env.ROOK_QA_CSS)console.log(await fallback.getByRole('button').evaluate(e=>{const hits=[];function scan(rules){for(const r of rules){if(r.selectorText&&r.style?.color&&e.matches(r.selectorText))hits.push([r.selectorText,r.style.color,r.style.getPropertyPriority('color')]);if(r.cssRules)scan(r.cssRules);}}for(const s of document.styleSheets)scan(s.cssRules);return hits;}));
 await snap('picker-empty');
 if(width===320&&style==='standard'&&appearance==='dark'){
  const original=await fallback.evaluate(e=>{const helper=e.firstElementChild,label=e.querySelector('button').lastChild,original=[helper.textContent,label.textContent];helper.textContent='Ne najdeš želene vaje?';label.textContent=' Ustvari svojo prilagojeno vajo';return original;});
  assert.equal(await fallback.evaluate(e=>{const b=e.querySelector('button'),r=e.getBoundingClientRect(),br=b.getBoundingClientRect();return e.scrollWidth<=e.clientWidth+1&&br.right<=r.right+1&&br.height>=44;}),true);
  await snap('picker-localized');await fallback.evaluate((e,original)=>{e.firstElementChild.textContent=original[0];e.querySelector('button').lastChild.textContent=original[1];},original);
 }
 await p.setViewportSize({width,height:500});await input.fill('Bench');await input.scrollIntoViewIfNeeded();assert.equal(await input.inputValue(),'Bench');await p.setViewportSize({width,height:844});await input.fill('');await snap('picker');
 await fallback.getByRole('button').click();await p.locator('.custom-exercise-editor').waitFor();await p.keyboard.press('Escape');await p.locator('.custom-exercise-editor').waitFor({state:'detached'});assert.ok(await input.isVisible());await day.getByRole('button',{name:'CANCEL',exact:true}).click();
 if(mode==='scratch'){
  await tools.getByRole('button',{name:/Workout options/}).click();await p.getByRole('button',{name:'Copy exercises to another day',exact:true}).click();await p.getByRole('radio',{name:/Thu/}).click();await p.getByRole('button',{name:'COPY',exact:true}).click();await p.locator('.plan-workout-actions-sheet').waitFor({state:'detached'});assert.equal(await days.nth(2).locator('.plan-editor-exercise').count(),3);
 }
 assert.equal(await root.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);await root.getByRole('button',{name:mode==='scratch'?'USE THIS PLAN':'SAVE CHANGES',exact:true}).click();await root.waitFor({state:'detached'});
 await p.reload();const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 assert.equal(saved.program.days[0].exercises[1].sets.length,4);assert.equal(saved.program.days[0].exercises[0].id,ids[1].replace('import-exercise-',''));
 if(mode==='scratch'){const a=saved.program.days[0],b=saved.program.days[2];assert.deepEqual(a.exercises.map(e=>e.exerciseId),b.exercises.map(e=>e.exerciseId));assert.deepEqual(a.exercises.map(e=>e.sets.map(s=>[s.reps,s.weight])),b.exercises.map(e=>e.sets.map(s=>[s.reps,s.weight])));assert.ok(a.exercises.every((e,i)=>e.id!==b.exercises[i].id));}
 else assert.deepEqual(saved.workouts,JSON.parse(draftSaved).workouts);
 assert.deepEqual(errors,[]);results.push({key,passed:true,handles:true,bodyScroll:true,cancelScroll:true,copy:mode==='scratch'?'copied empty only':'unavailable nonempty destinations',saveReload:true,geometry});console.log('PASS',key);await c.close();
}}finally{await browser.close();await writeFile(`${out}/${process.env.ROOK_QA_CASE ? `results-${process.env.ROOK_QA_CASE}` : 'results'}.json`,JSON.stringify(results,null,2));}
