import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { startWorkout, isoDay } from '../src/domain.js';
import { flexibleSessions, addCalendarDays } from '../src/flexibleWeek.js';
import { openAdjustWeek } from './qa-current-navigation.mjs';
const out='artifacts/ROOK-FINAL-HARDENING';
await mkdir(`${out}/screenshots`,{recursive:true});
const group=process.env.ROOK_FINAL_GROUP||'notes';
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
const settle=page=>page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
try {for(const width of [320,390])for(const appearance of ['light','dark'])for(const style of ['standard','premium']){
 const state=JSON.parse(JSON.stringify(createReturningUserFixture(3)));state.selectedDate=isoDay();
 Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance,showExerciseImages:true});
 if(group==='notes')state.activeWorkout=startWorkout(state,state.program.days[0]);else state.activeWorkout=null;
 if(group==='visual')state.workouts.at(-1).photoId='final-photo';
 if(group==='coach'){
  state.coachDraft='Keep my unsent draft exactly.';state.activeCoachConversationId='final-thread-0';
  state.conversations=Array.from({length:18},(_,i)=>Array.from({length:8},(_,j)=>({id:`final-${i}-${j}`,conversationId:`final-thread-${i}`,user:j?`Follow up ${j}`:`Conversation ${i}`,reply:{text:'Saved response. '.repeat(18)},createdAt:Date.now()-i*86400000+j*1000}))).flat();
 }
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'});
 await context.addInitScript(state=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(state));
  Object.defineProperty(navigator,'standalone',{value:true,configurable:true});
  const viewport=new EventTarget();Object.assign(viewport,{height:844,width:innerWidth,offsetTop:0,offsetLeft:0,scale:1});
  Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
  window.testViewport=(height,offsetTop=0,scale=1,event='resize')=>{Object.assign(viewport,{height,offsetTop,scale});viewport.dispatchEvent(new Event(event));};
 },state);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.setDefaultTimeout(10000);
 await page.route('**/api/**',r=>r.fulfill({json:{available:group==='coach'}}));await page.goto('http://127.0.0.1:4173');
 await page.getByRole('button',{name:'TODAY',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>[document.documentElement.dataset.appearance,document.documentElement.dataset.style]),[appearance,style]);
 if(group==='notes'){
  await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();
  const options=page.getByRole('button',{name:'Exercise options',exact:true}),menu=page.locator('.active-exercise-options-sheet'),note=page.locator('.exercise-note-sheet');
  const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  for(let cycle=0;cycle<3;cycle++){
   await options.click();await menu.waitFor();await settle(page);
   assert.equal(await menu.getByRole('button',{name:'Drag down or tap to close'}).count(),1);
   assert.equal(await menu.getByRole('button',{name:'Close',exact:true}).count(),1);
   const action=menu.getByRole('button',{name:cycle?'Edit note':'Add note',exact:true});
   const row=await action.evaluate(e=>({height:e.getBoundingClientRect().height,bg:getComputedStyle(e).backgroundColor,helper:e.querySelector('small')!==null}));
   assert.ok(row.height>=44&&row.height<60);assert.equal(row.bg,'rgba(0, 0, 0, 0)');assert.equal(row.helper,false);
   assert.ok(await action.evaluate(e=>{const text=e.firstElementChild,probe=document.createElement('span');probe.style.color='var(--rook-secondary)';e.append(probe);const match=getComputedStyle(text).color===getComputedStyle(probe).color;probe.remove();return match;}),'note foreground uses its semantic secondary token');
   if(!cycle)await page.screenshot({path:`${out}/screenshots/options-${width}-${appearance}-${style}.png`});
   await action.click();await note.waitFor();await settle(page);
   const input=note.getByRole('textbox');await input.focus();
   await note.evaluate(e=>window.noteIdentity=e);
   for(const [height,offset,scale,event]of [[420,0,1,'resize'],[420,180,1,'scroll'],[350,100,1.15,'resize'],[844,0,1,'resize'],[400,80,1,'resize']]){
    await page.evaluate(args=>window.testViewport(...args),[height,offset,scale,event]);
    const bounds=await note.evaluate(e=>{const p=e.getBoundingClientRect(),x=e.querySelector('.sheet-close').getBoundingClientRect(),s=e.querySelector('.exercise-note-save').getBoundingClientRect();return {same:e===window.noteIdentity,top:p.top,bottom:p.bottom,xTop:x.top,xBottom:x.bottom,saveTop:s.top,saveBottom:s.bottom,layerTop:parseFloat(e.parentElement.style.top)};});
    assert.ok(bounds.same);assert.equal(bounds.layerTop,offset);assert.ok(bounds.xTop>=offset&&bounds.xBottom<=offset+height);assert.ok(bounds.saveTop>=offset&&bounds.saveBottom<=offset+height);
   }
   const text=`Personal reminder ${cycle}\nKeep setup consistent.\nNo text loss.`;await input.fill(text);
   await page.screenshot({path:`${out}/screenshots/notes-keyboard-${width}-${appearance}-${style}.png`});
   await note.getByRole('button',{name:'SAVE',exact:true}).evaluate(e=>{e.click();e.click();});await note.waitFor({state:'detached'});
   await page.evaluate(()=>window.testViewport(844));
   await options.click();await menu.getByRole('button',{name:'Edit note',exact:true}).click();await note.waitFor();await settle(page);
   assert.equal(await input.inputValue(),text);await input.fill('Unsaved replacement');await input.focus();await page.evaluate(()=>window.testViewport(390,130));
   await note.getByRole('button',{name:'Close',exact:true}).click();await note.waitFor({state:'detached'});await page.evaluate(()=>window.testViewport(844));
  }
  await options.click();await menu.waitFor();await settle(page);
  const handle=menu.getByRole('button',{name:'Drag down or tap to close'});
  await handle.evaluate(e=>{const r=e.getBoundingClientRect(),send=(type,y)=>{const t=new Touch({identifier:1,target:e,clientX:r.x+60,clientY:y});e.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[t],changedTouches:[t]}));};send('touchstart',r.y+20);send('touchmove',r.y+230);send('touchend',r.y+230);});
  await menu.waitFor({state:'detached'});assert.equal(await page.locator('.modal-layer').count(),0);assert.equal(await page.evaluate(()=>document.body.style.position),'');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  assert.deepEqual(saved.workouts,initial.workouts);assert.deepEqual(saved.activeWorkout.exercises.map(e=>e.sets),initial.activeWorkout.exercises.map(e=>e.sets));
  await page.reload();await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();await options.click();await menu.getByRole('button',{name:'Edit note',exact:true}).click();await note.waitFor();
  assert.equal(await note.getByRole('textbox').inputValue(),'Personal reminder 2\nKeep setup consistent.\nNo text loss.');
  await note.getByRole('button',{name:'Close',exact:true}).click();await note.waitFor({state:'detached'});
  const weight=page.getByLabel('Weight in kg for set 1',{exact:true}),originalWeight=await weight.inputValue();await weight.fill('42.5');await weight.press('Tab');
  await page.getByRole('button',{name:'Workout options',exact:true}).click();const workoutOptions=page.locator('.active-workout-options-sheet');await workoutOptions.waitFor();
  assert.equal(await workoutOptions.getByRole('button',{name:'Drag down or tap to close'}).count(),1);assert.equal(await workoutOptions.getByRole('button',{name:'Close',exact:true}).count(),1);
  await workoutOptions.getByRole('button',{name:'Drag down or tap to close'}).click();await workoutOptions.waitFor({state:'detached'});assert.equal(await page.locator('.modal-layer').count(),0);
  await weight.fill(originalWeight);await weight.press('Tab');
  results.push({width,appearance,style,cycles:3,viewportPanZoomRestoration:true,reload:true,workoutResultsUnchanged:true,passed:true});
 }else if(group.startsWith('illustration')){
  await page.getByRole('button',{name:'PROGRESS',exact:true}).click();
  for(const index of [0,0,1]){
   const row=page.locator('.logged-exercise-row').nth(index);await row.scrollIntoViewIfNeeded();
   await page.evaluate(()=>{
    window.artFrames=[];const start=performance.now();let frames=0;
    const sample=()=>{const img=document.querySelector('.exercise-detail-art'),panel=img?.closest('main');
     if(panel){const r=panel.getBoundingClientRect();window.artFrames.push({at:performance.now()-start,src:!!img.getAttribute('src'),complete:img.complete,naturalWidth:img.naturalWidth,decoding:img.decoding,visible:r.top<innerHeight&&r.bottom>0});}
     if(++frames<30)requestAnimationFrame(sample);
    };requestAnimationFrame(sample);
   });
   await row.click();const art=page.locator('.exercise-detail-art-button'),sheet=art.locator('xpath=ancestor::main[1]');await art.waitFor();await settle(page);
   await page.waitForFunction(()=>window.artFrames.length>=4);const frames=await page.evaluate(()=>window.artFrames);
   assert.ok(frames.every(f=>f.src));
   await sheet.evaluate(e=>{window.artParent=e;window.artStarts=0;e.addEventListener('animationstart',event=>{if(event.target===e)window.artStarts++;});});
   for(const action of ['x','escape','browser']){
    const before=await sheet.evaluate(e=>{e.scrollTop=Math.min(80,e.scrollHeight-e.clientHeight);const r=e.getBoundingClientRect();window.documentScrolls=0;window.originalScrollTo=window.scrollTo;window.scrollTo=(...args)=>{window.documentScrolls++;return window.originalScrollTo(...args);};return {y:r.y,h:r.height,scroll:e.scrollTop};});
    await art.evaluate(e=>e.click());await page.locator('.exercise-visual-viewer').waitFor();await settle(page);
    if(action==='x')await page.getByRole('button',{name:'Close visual viewer'}).click();
    else if(action==='escape')await page.keyboard.press('Escape');else await page.goBack();
    await page.locator('.exercise-visual-viewer').waitFor({state:'detached'});
    const after=await sheet.evaluate(e=>{const r=e.getBoundingClientRect();window.scrollTo=window.originalScrollTo;return {same:e===window.artParent,connected:e.isConnected,y:r.y,h:r.height,scroll:e.scrollTop,starts:window.artStarts,documentScrolls:window.documentScrolls,inert:e.inert};});
    assert.ok(after.same&&after.connected&&!after.inert);assert.equal(after.scroll,before.scroll);assert.equal(after.y,before.y);assert.equal(after.h,before.h);assert.equal(after.starts,0);
    if(group==='illustration')assert.equal(after.documentScrolls,0,'nested viewer must not restore/reposition the already-locked document');
    results.push({width,appearance,style,index,action,frames,before,after,passed:true});
   }
   await page.screenshot({path:`${out}/screenshots/${group}-${width}-${appearance}-${style}.png`});
   await sheet.locator('.detail-header-close').click();await art.waitFor({state:'detached'});
  }
 }else if(group==='visual'){
  await page.getByRole('button',{name:'PROGRESS',exact:true}).click();
  const all=page.locator('.logged-exercises-all');await all.scrollIntoViewIfNeeded();
  const action=await all.evaluate(e=>({border:getComputedStyle(e).borderBottomWidth,weight:getComputedStyle(e).fontWeight,text:getComputedStyle(e.firstElementChild).color,accent:getComputedStyle(document.documentElement).getPropertyValue('--rook-accent').trim()}));
  assert.equal(action.border,'0px');assert.ok(Number(action.weight)>=600);assert.equal(await all.locator('span').count(),2);
  await page.screenshot({path:`${out}/screenshots/view-all-${width}-${appearance}-${style}.png`});await all.click();await page.locator('.logged-exercises-sheet').waitFor();await page.keyboard.press('Escape');
  const originalPhoto=await page.evaluate(async id=>{
   const canvas=document.createElement('canvas');canvas.width=600;canvas.height=900;const ctx=canvas.getContext('2d');ctx.fillStyle='#597269';ctx.fillRect(0,0,600,900);ctx.fillStyle='#b6c0b9';ctx.fillRect(120,120,360,660);
   const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg'));
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('rook-workout-media',3);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('photos',{keyPath:'id'});s.createIndex('workoutId','workoutId');s.createIndex('createdAt','createdAt');r.result.createObjectStore('restore-snapshot',{keyPath:'id'});};});
   await new Promise((resolve,reject)=>{const t=db.transaction('photos','readwrite');t.objectStore('photos').put({id:'final-photo',workoutId:id,blob,mimeType:'image/jpeg',width:600,height:900,createdAt:new Date().toISOString()});t.oncomplete=resolve;t.onerror=()=>reject(t.error);});db.close();return Array.from(new Uint8Array(await blob.arrayBuffer()));
  },state.workouts.at(-1).id);
  await page.reload();await page.getByRole('button',{name:'PROGRESS',exact:true}).click();await page.locator('.workout-photo-entry-card').click();await page.locator('.workout-photo-timeline-item img.is-ready').waitFor();await page.locator('.workout-photo-timeline-item').click();
  const viewer=page.locator('.workout-photo-viewer');await viewer.waitFor();await settle(page);
  const geometry=await viewer.evaluate(e=>{const x=e.querySelector('.workout-photo-viewer-close').getBoundingClientRect(),del=e.querySelector('.workout-photo-delete').getBoundingClientRect(),img=e.querySelector('img').getBoundingClientRect();return {x:{top:x.top,right:x.right,width:x.width,height:x.height},deleteBottom:del.bottom,imageHeight:img.height,paddingBottom:getComputedStyle(e).paddingBottom};});
  assert.ok(geometry.x.top>=12&&geometry.x.width>=44&&geometry.x.height>=44);assert.ok(geometry.x.right<=width-17);assert.ok(geometry.deleteBottom<=824);assert.ok(geometry.imageHeight>300);
  await page.screenshot({path:`${out}/screenshots/photo-${width}-${appearance}-${style}.png`});
  await page.evaluate(()=>{navigator.canShare=()=>true;navigator.share=async({files})=>{window.finalSavedPhoto=Array.from(new Uint8Array(await files[0].arrayBuffer()));};});
  await page.getByRole('button',{name:'SAVE PHOTO',exact:true}).click();await page.waitForFunction(()=>window.finalSavedPhoto);assert.deepEqual(await page.evaluate(()=>window.finalSavedPhoto),originalPhoto);
  await page.getByRole('button',{name:'DELETE PHOTO',exact:true}).click();await page.getByRole('button',{name:'KEEP PHOTO',exact:true}).click();await page.getByRole('button',{name:'Close workout photo',exact:true}).click();await viewer.waitFor({state:'detached'});await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'TODAY',exact:true}).click();await openAdjustWeek(page);await page.getByRole('button',{name:/^Move a workout/}).click();
  const chooser=page.locator('.flexible-workout-list');await chooser.waitFor();await settle(page);
  const expected=flexibleSessions(state,isoDay()).filter(s=>['planned','missed','optional'].includes(s.status)&&s.scheduledDate<=addCalendarDays(isoDay(),13));
  assert.deepEqual(await chooser.locator('[data-session-id]').evaluateAll(es=>es.map(e=>e.dataset.sessionId)),expected.map(s=>s.logicalSessionId));
  const heights=await chooser.locator('button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));assert.ok(heights.every(h=>h>=56&&h<=64),JSON.stringify(heights));
  await page.screenshot({path:`${out}/screenshots/schedule-${width}-${appearance}-${style}.png`});
  await chooser.locator('button').first().click();await page.getByRole('heading',{name:`Move ${expected[0].workout.name}`,exact:true}).waitFor();await page.getByRole('button',{name:/^Back/}).click();await chooser.waitFor();await page.getByRole('button',{name:'Close Adjust week',exact:true}).click();
  const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.deepEqual(persisted.workouts,state.workouts);assert.deepEqual(persisted.flexibleWeek,state.flexibleWeek);
  results.push({width,appearance,style,action,geometry,candidateCount:expected.length,heights,saveOriginalPhotoBytes:true,passed:true});
 }else if(group==='coach'){
  await page.getByRole('button',{name:'COACH',exact:true}).click();const content=page.locator('.coach-content-surface'),history=page.locator('.coach-history-surface'),input=page.getByRole('textbox',{name:'Ask Coach'});
  await input.waitFor();assert.equal(await input.inputValue(),state.coachDraft);
  const beforeNavigation=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  const cdp=await context.newCDPSession(page),nav=await page.locator('.bottom-nav').boundingBox();
  const swipe=async(surface,{dx=width*.6,dy=0,cancel=false,shot=false}={})=>{
   const r=await surface.boundingBox(),x=r.x+5,y=r.y+180;
   if(process.env.ROOK_FINAL_DEBUG)console.log('swipe-start',await page.evaluate(({x,y})=>({x,y,target:document.elementFromPoint(x,y)?.outerHTML.slice(0,250),focus:document.activeElement?.outerHTML.slice(0,140),inert:[...document.querySelectorAll('[inert]')].map(e=>e.className),selection:String(getSelection())}),{x,y}));
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/6,y:y+dy*i/6}]});await page.waitForTimeout(18);}
   if(shot)await page.screenshot({path:`${out}/screenshots/coach-drag-${width}-${appearance}-${style}.png`});
   const transform=await surface.evaluate(e=>getComputedStyle(e).transform);assert.deepEqual(await page.locator('.bottom-nav').boundingBox(),nav);
   if(process.env.ROOK_FINAL_DEBUG)console.log('swipe-held',transform,await page.evaluate(()=>document.documentElement.dataset.edgeBackActive));
   await page.waitForTimeout(120);await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await page.waitForFunction(()=>!document.documentElement.dataset.edgeBackActive);return transform;
  };
  await page.evaluate(()=>{window.finalPopstates=0;addEventListener('popstate',()=>window.finalPopstates++);history.pushState({finalQA:true},'', '?final-coach');});
  const length=await page.evaluate(()=>history.length);
  for(let cycle=0;cycle<3;cycle++){
   await page.getByRole('button',{name:'Conversation history',exact:true}).click();await history.waitFor();await settle(page);
   await page.locator('.coach-history-scroll').evaluate(e=>{e.scrollTop=360;});await page.waitForTimeout(40);
   await history.evaluate(e=>window.historyParent=e);
   await swipe(history,{dx:25});assert.ok(await history.isVisible());await swipe(history,{dx:10,dy:130});assert.ok(await history.isVisible());
   await page.locator('.coach-history-group button').nth(5+cycle).click();await history.waitFor({state:'hidden'});await page.getByRole('button',{name:'Back to conversation history',exact:true}).waitFor();
   const scroll=await page.locator('.coach-history-scroll').evaluate(e=>e.scrollTop);
   const beforeScroll=await page.locator('.coach-scroll').evaluate(e=>{e.scrollTop=220;return e.scrollTop;});
   const transform=await swipe(content,{cancel:true,shot:true});assert.equal(transform==='none',width===320);assert.ok(await page.getByRole('button',{name:'Back to conversation history',exact:true}).isVisible());assert.equal(await page.locator('.coach-scroll').evaluate(e=>e.scrollTop),beforeScroll);assert.ok(await history.isHidden());
   await swipe(content);await history.waitFor({state:'visible'});await settle(page);
   assert.ok(await history.evaluate(e=>e===window.historyParent));assert.ok(Math.abs(await page.locator('.coach-history-scroll').evaluate(e=>e.scrollTop)-scroll)<2);assert.equal(await page.locator('.coach-input textarea').inputValue(),state.coachDraft);
   await swipe(history);await history.waitFor({state:'detached'});assert.equal(await page.getByRole('button',{name:'Back to conversation history',exact:true}).count(),0);
  }
  assert.equal(await page.evaluate(()=>window.finalPopstates),0,'PWA Back never also traverses browser history');
  await page.getByRole('button',{name:'Conversation history',exact:true}).click();await settle(page);await page.evaluate(()=>Object.defineProperty(navigator,'standalone',{value:false,configurable:true}));await swipe(history);assert.ok(await history.isVisible());await page.getByRole('button',{name:'Back to Coach',exact:true}).click();
  assert.ok(await page.evaluate(()=>window.finalPopstates)<=1,'browser-owned gesture cannot double Back');
  assert.equal(await page.evaluate(()=>history.length),length);
  // Native browser edge history may already have consumed the earlier probe.
  await page.evaluate(()=>history.pushState({finalBackProbe:true},'', '?final-back-probe'));await page.goBack();await content.waitFor();assert.equal(await input.inputValue(),state.coachDraft);
  const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.deepEqual(persisted.conversations,beforeNavigation.conversations);assert.deepEqual(persisted.workouts,beforeNavigation.workouts);assert.deepEqual(persisted.program,beforeNavigation.program);
  assert.ok(await content.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  results.push({width,appearance,style,cycles:3,historyIdentity:true,draft:true,scroll:true,browserGuard:true,navStable:true,passed:true});
 }
 assert.deepEqual(errors,[]);console.log(`PASS ${group} ${width} ${appearance} ${style}`);await context.close();
}}finally{await browser.close();await writeFile(`${out}/${group}-results.json`,JSON.stringify(results,null,2));}
