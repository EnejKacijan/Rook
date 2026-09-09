import assert from 'node:assert/strict';
import { configureNewFeatureReview } from './new-feature-review-capture.mjs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { buildBackupArchive } from '../src/backup.js';

const out='artifacts/workout-photo-compare';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
configureNewFeatureReview(browser, '02-workout-photo-compare');
function fixture(count,appearance='light',style='standard',sameDate=false){
  const state=createReturningUserFixture(2);state.activeWorkout=null;
  Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
  state.workouts=Array.from({length:count},(_,i)=>{const date=new Date('2026-09-05T12:00:00');date.setDate(date.getDate()-(sameDate?0:i*3));const day=date.toISOString().slice(0,10);return {id:`photo-workout-${i}`,photoId:`photo-${i}`,name:i<2?'Upper B':i===2?'Lower Body — Single-Leg Strength and Conditioning':'Full Body',canonicalPlanDate:day,workoutDateKey:day,completedAt:`${day}T18:00:00.000Z`,durationSeconds:3600,exercises:[{id:`exercise-${i}`,exerciseId:'barbell-bench-press',repMin:6,repMax:8,sets:[{id:`set-${i}`,weight:70,reps:8,rir:1,completed:true,planned:true}]}]};});return state;
}
async function seed(page,state,mixed=false,corrupt=false){
  await page.evaluate(async({workouts,mixed,corrupt})=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('rook-workout-media',3);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('photos',{keyPath:'id'});s.createIndex('workoutId','workoutId');s.createIndex('createdAt','createdAt');r.result.createObjectStore('restore-snapshot',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    // Synthetic, non-personal test media. Never a user's private photo.
    const samples=[];
    for(let i=0;i<3;i++){
      const landscape=mixed==='landscape'||mixed&&i===1;
      const width=landscape?900:600,height=landscape?500:800;
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const c=canvas.getContext('2d');
      c.fillStyle=['#b4c3ba','#c8bbb0','#acb6c7'][i];c.fillRect(0,0,width,height);
      c.fillStyle='#333c38';c.fillRect(0,height*.7,width,height*.3);
      c.strokeStyle='#677a6e';c.lineWidth=12;c.strokeRect(width*.15,height*.12,width*.7,height*.55);
      c.fillStyle='#263b32';c.fillRect(width*.2,height*.4,width*.6,12);c.fillRect(width*.23,height*.34,24,height*.17);c.fillRect(width*.73,height*.34,24,height*.17);
      c.strokeStyle='#e7ede9';c.lineWidth=4;c.strokeRect(4,4,width-8,height-8);
      c.fillStyle='#fff';c.font='22px sans-serif';c.fillText('SYNTHETIC QA IMAGE',18,height-22);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));samples.push({blob,width,height});
    }
    const tx=db.transaction('photos','readwrite'),store=tx.objectStore('photos');store.clear();
    for(const [i,w] of workouts.entries()){const sample=samples[i%3];store.put({id:w.photoId,workoutId:w.id,createdAt:w.completedAt,width:sample.width,height:sample.height,mimeType:'image/jpeg',blob:corrupt&&i===0?new Blob(['broken'],{type:'image/jpeg'}):sample.blob});}
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  },{workouts:state.workouts,mixed,corrupt});
}
async function open(state,width=390,options={}){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',colorScheme:state.profile.appearancePreference});
  await context.addInitScript(s=>{
    if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));
    window.photoURLs={created:0,revoked:0};const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=blob=>{window.photoURLs.created++;return create(blob);};URL.revokeObjectURL=url=>{window.photoURLs.revoked++;revoke(url);};
  },state);
  const page=await context.newPage(),errors=[],outgoing=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')outgoing.push(r.url());});
  await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
  await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});await seed(page,state,options.mixed,options.corrupt);await page.reload({waitUntil:'networkidle'});
  return {context,page,errors,outgoing};
}
async function timeline(page){await page.getByRole('button',{name:'PROGRESS',exact:true}).click();await page.locator('.workout-photo-entry-card').click();await page.getByRole('heading',{name:'Your training, over time.'}).waitFor();}
async function enter(page){await page.locator('.workout-photo-compare-entry').click();await page.getByRole('heading',{name:'Choose a photo'}).waitFor();}
async function selectTwo(page,second=1){const tiles=page.locator('.workout-photo-compare-screen .workout-photo-timeline-item');await tiles.nth(0).click();await tiles.nth(second).click();}
async function compare(page){await page.getByRole('button',{name:'COMPARE PHOTOS',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('.photo-compare-inspect img')].length===2&&[...document.querySelectorAll('.photo-compare-inspect img')].every(i=>i.complete&&i.naturalWidth));}
const shot=async(page,name)=>{await page.waitForTimeout(180);await page.screenshot({path:`${out}/${name}.png`});};
async function verify(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const boxes=await page.locator('.photo-compare-frame').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {y:r.y,w:r.width,h:r.height};}));assert.deepEqual(boxes[0],boxes[1]);assert.equal(await page.locator('.photo-compare-inspect img').first().evaluate(i=>getComputedStyle(i).objectFit),'contain');}
try{
for(const width of [320,390,430])for(const appearance of ['light','dark'])for(const style of ['standard','premium']){
  const state=fixture(6,appearance,style),run=await open(state,width),{page,context}=run,key=`${width}-${style}-${appearance}`;
  await timeline(page);await page.locator('.workout-photo-compare-entry:not([disabled])').waitFor();await shot(page,`${key}-entry`);await enter(page);await shot(page,`${key}-choose-first`);
  await page.locator('.workout-photo-compare-screen .workout-photo-timeline-item').first().click();assert.equal(await page.locator('.photo-compare-selection-mark').textContent(),'✓','selection does not imply display order');await shot(page,`${key}-choose-second`);
  const disabledColors=await page.locator('.photo-compare-selection-footer .primary').evaluate(button=>{const probe=document.createElement('span');probe.style.color='var(--rook-disabled-surface)';document.body.append(probe);const expected=getComputedStyle(probe).color;probe.remove();return {disabled:button.disabled,actual:getComputedStyle(button).backgroundColor,expected};});
  assert.equal(disabledColors.disabled,true);assert.equal(disabledColors.actual,disabledColors.expected,key+' neutral disabled surface');
  await page.locator('.workout-photo-compare-screen .workout-photo-timeline-item').nth(1).click();await shot(page,`${key}-two-selected`);assert.equal(await page.locator('.photo-compare-selection-footer .primary').isDisabled(),false);assert.notEqual(await page.locator('.photo-compare-selection-footer .primary').evaluate(b=>getComputedStyle(b).backgroundColor),disabledColors.expected);await compare(page);await verify(page);await shot(page,`${key}-portrait-pair`);
  const before=await page.evaluate(()=>({...window.photoURLs}));await page.locator('.photo-compare-inspect').first().click();await page.getByRole('dialog',{name:'Workout photo',exact:true}).waitFor();await shot(page,`${key}-existing-viewer`);assert.deepEqual(await page.evaluate(()=>window.photoURLs),before,'viewer reuses existing URL');await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'Workout photo',exact:true}).waitFor({state:'detached'});await page.waitForTimeout(250);assert.equal(await page.locator('.workout-photo-compare-screen').count(),1,'Escape closes only the inspected photo, not comparison');
  await page.getByRole('button',{name:'Close photo comparison',exact:true}).click();await page.locator('.workout-photo-compare-screen').waitFor({state:'detached'});
  await page.waitForFunction(()=>window.photoURLs.created===window.photoURLs.revoked);assert.deepEqual(run.errors,[]);assert.deepEqual(run.outgoing,[],'no image/network POST');await context.close();console.log(`${key}: selection, balanced pair, viewer, URL cleanup passed`);
}
for(const scenario of ['zero','one','many','mixed','landscape','different-workout','same-date','corrupt','single-usable','missing','corrupt-selected','delete-selected','offline']){
  const count=scenario==='zero'?0:scenario==='one'?1:scenario==='single-usable'?2:scenario==='many'?300:3;
  const run=await open(fixture(count,'light','standard',scenario==='same-date'),320,{mixed:scenario==='landscape'?'landscape':scenario==='mixed',corrupt:['corrupt','single-usable'].includes(scenario)}),{page,context}=run;
  await timeline(page);
  if(count<2){assert.equal(await page.locator('.workout-photo-compare-entry').count(),0);await shot(page,`320-${scenario}`);}
  else if(scenario==='single-usable'){
    await page.locator('.workout-photo-timeline-item.is-unavailable').waitFor();assert.equal(await page.locator('.workout-photo-compare-entry').isDisabled(),true);await shot(page,'320-single-usable');
  }else if(scenario==='corrupt'){
    await page.locator('.workout-photo-timeline-item.is-unavailable').waitFor();await page.locator('.workout-photo-compare-entry:not([disabled])').waitFor();await enter(page);assert.equal(await page.locator('.workout-photo-timeline-item').first().isDisabled(),true);await shot(page,'320-corrupt-unselectable');
  }else{
    await enter(page);await selectTwo(page,scenario==='different-workout'?2:1);
    if(scenario==='many')assert.ok((await page.evaluate(()=>window.photoURLs.created))<50,'hundreds of originals are not materialized to enter selection');
    if(['missing','corrupt-selected'].includes(scenario)){
      await page.evaluate(async corrupt=>{const db=await new Promise(resolve=>{const r=indexedDB.open('rook-workout-media',3);r.onsuccess=()=>resolve(r.result);});const tx=db.transaction('photos','readwrite'),store=tx.objectStore('photos');if(corrupt){const r=store.get('photo-0');r.onsuccess=()=>store.put({...r.result,blob:new Blob(['broken'],{type:'image/jpeg'})});}else store.delete('photo-0');await new Promise(resolve=>tx.oncomplete=resolve);db.close();},scenario==='corrupt-selected');
      await page.getByRole('button',{name:'COMPARE PHOTOS',exact:true}).click();await page.getByText('This photo is no longer available.',{exact:true}).waitFor();await shot(page,`320-${scenario}`);await page.getByRole('button',{name:'Choose another',exact:true}).click();await page.getByRole('heading',{name:'Choose another photo'}).waitFor();
    }else{
      if(scenario==='offline')await context.setOffline(true);await compare(page);await verify(page);await shot(page,`320-${scenario}`);
      if(scenario==='delete-selected'){
        await page.locator('.photo-compare-inspect').first().click();await page.getByRole('button',{name:'DELETE PHOTO',exact:true}).click();await shot(page,'320-delete-confirm');
        await page.evaluate(()=>{window.originalPhotoDelete=IDBObjectStore.prototype.delete;IDBObjectStore.prototype.delete=function(){throw new DOMException('QA storage failure','InvalidStateError');};});
        await page.getByRole('group',{name:'Confirm photo deletion'}).getByRole('button',{name:'DELETE PHOTO',exact:true}).click();await page.getByRole('dialog',{name:'Workout photo',exact:true}).getByRole('alert').waitFor();await shot(page,'320-delete-retry-error');
        assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')))).workouts.filter(w=>w.photoId).length,count);
        await page.evaluate(()=>IDBObjectStore.prototype.delete=window.originalPhotoDelete);
        await page.getByRole('group',{name:'Confirm photo deletion'}).getByRole('button',{name:'DELETE PHOTO',exact:true}).click();await page.getByText('This photo is no longer available.',{exact:true}).waitFor();const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.equal(state.workouts.length,count);assert.equal(state.workouts.filter(w=>w.photoId).length,count-1);await shot(page,'320-deleted-selected');
      }
    }
  }
  if(scenario==='same-date'){
    await page.reload({waitUntil:'networkidle'});await timeline(page);await enter(page);await page.getByRole('heading',{name:'Choose a photo'}).waitFor();assert.equal(await page.locator('[aria-pressed="true"]').count(),0,'no persisted comparison selection');
  }
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.outgoing,[]);await context.close();console.log(`${scenario}: passed`);
}
// Archive original media and restore it into an actually clean browser context.
{
  const run=await open(fixture(2)),{page}=run;
  const original=await page.evaluate(async()=>{const state=JSON.parse(localStorage.getItem('lift-v2-state'));const db=await new Promise(resolve=>{const r=indexedDB.open('rook-workout-media',3);r.onsuccess=()=>resolve(r.result);});const records=await new Promise(resolve=>{const r=db.transaction('photos').objectStore('photos').getAll();r.onsuccess=()=>resolve(r.result);});db.close();return {state,photos:await Promise.all(records.map(async r=>({...r,blob:undefined,bytes:[...new Uint8Array(await r.blob.arrayBuffer())]})))};});
  const photos=original.photos.map(({bytes,...r})=>({...r,blob:new Blob([new Uint8Array(bytes)],{type:r.mimeType})}));const archive=await buildBackupArchive(original.state,photos);await run.context.close();
  const clean=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),restored=await clean.newPage();await restored.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));await restored.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});await restored.locator('.restore-backup-action').click();await restored.getByLabel('Choose ROOK backup file').setInputFiles({name:'photo-compare.zip',mimeType:'application/zip',buffer:Buffer.from(archive.bytes)});await restored.getByRole('button',{name:'RESTORE & REPLACE',exact:true}).click();await restored.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state')||'{}').workouts?.length===2);await restored.reload({waitUntil:'networkidle'});await timeline(restored);await enter(restored);await selectTwo(restored);await compare(restored);await verify(restored);await shot(restored,'390-backup-restored-pair');await clean.close();console.log('clean-profile ZIP/media restore and comparison: passed');
}
}finally{await browser.close();}
