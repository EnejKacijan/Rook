import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {openProfileArea} from './qa-current-navigation.mjs';

const url=process.env.ROOK_QA_URL||'http://127.0.0.1:5173';
const part=process.env.ROOK_QA_PART||'all';
const out='artifacts/PHOTO-ONBOARDING-REVIEW';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
const button=(p,name)=>p.getByRole('button',{name,exact:true});
const waitStep=(p,n)=>p.waitForFunction(n=>document.querySelector('.step-count')?.textContent===`STEP ${n}/8`,n);
async function open(state,width=390,motion='no-preference',height=844){
 const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:motion,serviceWorkers:'block',acceptDownloads:true});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(url);return{page,context,errors};
}
async function swipe(p,x,y,dy){const cdp=await p.context().newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy*i/6}]});await p.waitForTimeout(16);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
async function measureChoice(p,label,next,activation='tap'){
 const choice=typeof label==='string'?button(p,label):label;await choice.scrollIntoViewIfNeeded();
 await p.evaluate(()=>{window.selectionFrames=[];window.measureSelection=true;const tick=()=>{window.selectionFrames.push({time:performance.now(),step:document.querySelector('.step-count')?.textContent,selected:[...document.querySelectorAll('.selected-option')].map(e=>e.textContent.trim()),fill:document.querySelector('.selected-option')&&getComputedStyle(document.querySelector('.selected-option')).backgroundColor});if(window.measureSelection)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
 if(activation==='keyboard'){await choice.focus();await p.keyboard.press('Enter');}else await choice.tap();await waitStep(p,next);
 return p.evaluate(()=>{window.measureSelection=false;const f=window.selectionFrames;return{frames:f,selectedFrames:f.filter(x=>x.selected.length).length};});
}
async function scrollPosition(p){return p.evaluate(()=>({page:document.scrollingElement.scrollTop,root:document.querySelector('.onboarding').scrollTop}));}
async function footer(p){return p.evaluate(()=>{const r=document.querySelector('.onboarding-footer>.primary').getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:innerHeight};});}
async function resetScroll(p){await p.evaluate(()=>{document.scrollingElement.scrollTo({top:0,behavior:'instant'});document.querySelector('.onboarding').scrollTo({top:0,behavior:'instant'});});}
async function exposeDurationOnly(p){await button(p,'60 min').evaluate(e=>{const r=e.getBoundingClientRect();document.scrollingElement.scrollTo({top:document.scrollingElement.scrollTop+Math.max(0,r.bottom-innerHeight+12),behavior:'instant'});});}
async function onboarding(width,appearance,style,motion){
 const state=blankState();Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 const run=await open(state,width,motion,width===320?640:844),p=run.page;
 await p.getByRole('combobox',{name:'Age range'}).click();await p.getByRole('option',{name:'18–29',exact:true}).click();await button(p,'CONTINUE').click();await waitStep(p,2);
 // A scroll starting on an option must not activate it.
 const rect=await button(p,'Build muscle').boundingBox();await swipe(p,rect.x+30,rect.y+30,-100);await waitStep(p,2);assert.equal(await button(p,'Build muscle').getAttribute('aria-pressed'),'false');
 await button(p,'Build muscle').focus();await waitStep(p,2);
 const goal=await measureChoice(p,'Build muscle',3);assert.ok(goal.selectedFrames>0,JSON.stringify(goal));
 // A trailing second click cannot activate the incoming step.
 await p.locator('.onboarding-experience .onboarding-option').first().dispatchEvent('click',{detail:2});await waitStep(p,3);
 await p.waitForTimeout(360); // between independent QA choices, not scroll acceptance
 const exp=p.locator('.onboarding-experience .onboarding-option').first();
 const experience=await measureChoice(p,exp,4,'keyboard');assert.ok(experience.selectedFrames>0,JSON.stringify(experience));
 for(const [measurement,step] of [[goal,2],[experience,3]]){
  const frames=measurement.frames.filter(f=>f.step===`STEP ${step}/8`&&f.selected.length);
  measurement.selectedPaintMs=frames.at(-1).time-frames[0].time;
  if(motion==='no-preference')assert.ok(measurement.selectedPaintMs>=100&&measurement.selectedPaintMs<800,JSON.stringify(measurement));
 }
 assert.equal(await button(p,'CONTINUE').isEnabled(),false);
 const entryPosition=await scrollPosition(p);await p.waitForTimeout(250);assert.deepEqual(await scrollPosition(p),entryPosition);
 // Invalid availability: duration alone must not reveal or navigate.
 await button(p,'4 days').click();await resetScroll(p);
 await button(p,'60 min').scrollIntoViewIfNeeded();const invalidBefore=await scrollPosition(p);await button(p,'60 min').tap();await p.waitForTimeout(250);assert.deepEqual(await scrollPosition(p),invalidBefore);assert.equal(await button(p,'CONTINUE').isEnabled(),false);
 await p.getByLabel('Any day works').check();await resetScroll(p);await p.waitForTimeout(200);assert.deepEqual(await scrollPosition(p),{page:0,root:0});
 // Scroll only enough to tap duration; do not pre-scroll the CTA into view.
 await exposeDurationOnly(p);const before=await footer(p);const beforeScroll=await scrollPosition(p);await button(p,'60 min').tap();
 await p.waitForFunction(()=>{const r=document.querySelector('.onboarding-footer>.primary').getBoundingClientRect();return r.bottom<=innerHeight-10 && r.top>=0;});
 const after=await footer(p),afterScroll=await scrollPosition(p);assert.ok(after.bottom<=after.height-10,JSON.stringify(after));await waitStep(p,4);
 if(before.bottom<=before.height-12)assert.deepEqual(afterScroll,beforeScroll);
 else {assert.ok(afterScroll.page+afterScroll.root>beforeScroll.page+beforeScroll.root);await p.waitForTimeout(220);const settled=await footer(p);assert.ok(Math.abs(settled.bottom-(settled.height-12))<2,JSON.stringify(settled));}
 await p.screenshot({path:`${out}/schedule-${width}-${style}-${appearance}-${motion}.png`});
 // Manual upward scrolling owns input after reveal, no repeated assist.
 await swipe(p,width/2,220,160);await resetScroll(p);await button(p,'45 min').scrollIntoViewIfNeeded();const repeatBefore=await scrollPosition(p);await button(p,'45 min').tap();await p.waitForTimeout(250);assert.deepEqual(await scrollPosition(p),repeatBefore);
 await button(p,'CONTINUE').click();await waitStep(p,5);await button(p,'Back').click();await waitStep(p,4);await p.waitForTimeout(220);assert.deepEqual(await scrollPosition(p),{page:0,root:0});assert.equal(await button(p,'45 min').getAttribute('aria-pressed'),'true');
 // Back preserves both accepted auto-advance choices and does not replay them.
 await button(p,'Back').click();await waitStep(p,3);await p.waitForTimeout(220);assert.equal(await p.locator('.onboarding-experience .selected-option').count(),1);
 await button(p,'Back').click();await waitStep(p,2);await p.waitForTimeout(220);assert.equal(await button(p,'Build muscle').getAttribute('aria-pressed'),'true');
 // Cancel an in-flight acknowledgement with Back; late work cannot advance.
 await button(p,'Build muscle').dispatchEvent('click',{detail:1});await button(p,'Back').dispatchEvent('click');await waitStep(p,1);await p.waitForTimeout(250);await waitStep(p,1);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(run.errors,[]);
 const result={kind:'onboarding',width,appearance,style,motion,goal,experience,before,after,beforeScroll,afterScroll,pass:true};results.push(result);console.log(`PASS onboarding ${width} ${appearance} ${style} ${motion}`);await run.context.close();
}

async function seedPhotos(p,workouts){await p.evaluate(async workouts=>{
 const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;canvas.getContext('2d').fillRect(0,0,32,32);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('rook-workout-media',3);r.onupgradeneeded=()=>{const d=r.result;const s=d.createObjectStore('photos',{keyPath:'id'});s.createIndex('workoutId','workoutId');s.createIndex('createdAt','createdAt');d.createObjectStore('restore-snapshot',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 await new Promise((resolve,reject)=>{const t=db.transaction('photos','readwrite');for(const w of workouts)if(w.photoId)t.objectStore('photos').put({id:w.photoId,workoutId:w.id,createdAt:w.completedAt,width:32,height:32,mimeType:'image/png',blob});t.oncomplete=resolve;t.onerror=()=>reject(t.error);});db.close();
},workouts);}
const summary=p=>p.locator('.workout-photo-entry-card strong');
async function count(p,n){await p.waitForFunction(n=>document.querySelector('.workout-photo-entry-card strong')?.textContent===(n?`${n} private photo${n===1?'':'s'}`:'No workout photos yet'),n);}
async function timeline(p,n){await p.locator('.workout-photo-entry-card').click();await p.waitForFunction(n=>document.querySelectorAll('.workout-photo-timeline-item').length===n,n);if(!n)await p.getByText('No workout photos yet.',{exact:true}).waitFor();}
async function deleteFirst(p){await p.locator('.workout-photo-timeline-item').first().click();await button(p,'DELETE PHOTO').click();await p.getByRole('group',{name:'Confirm photo deletion'}).getByRole('button',{name:'DELETE PHOTO',exact:true}).click();}
async function photos(width,appearance,style){
 const state=createReturningUserFixture(2);state.activeWorkout=null;
 state.workouts=state.workouts.slice(0,2);state.workouts.forEach((w,i)=>{w.photoId=`consistency-${i}`;w.exercises=[];});
 Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 const run=await open(state,width),p=run.page;await seedPhotos(p,state.workouts);
 await button(p,'PROGRESS').click();await count(p,2);await p.getByText('No exercises logged yet',{exact:true}).waitFor();
 await p.locator('.workout-photo-entry-card').scrollIntoViewIfNeeded();await p.screenshot({path:`${out}/photos-${width}-${style}-${appearance}.png`});
 await timeline(p,2);await button(p,'Close workout photos').click();await count(p,2);await p.reload();await button(p,'PROGRESS').click();await count(p,2);
 await timeline(p,2);await deleteFirst(p);await p.waitForFunction(()=>document.querySelectorAll('.workout-photo-timeline-item').length===1);await button(p,'Close workout photos').click();await count(p,1);
 // Production photo picker save / failed save, followed by return to Progress.
 await timeline(p,1);await p.locator('.workout-photo-timeline-item').click();await button(p,'VIEW WORKOUT').click();await p.getByText('Workout details',{exact:true}).waitFor();
 const picker=p.getByLabel('Change workout photo');await picker.setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')});await p.getByText('Photo couldn’t be saved. Your workout was saved.',{exact:true}).waitFor();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7mcAAAAASUVORK5CYII=','base64');
 await picker.setInputFiles({name:'new-photo.png',mimeType:'image/png',buffer:png});await p.getByText('Photo saved with this workout.',{exact:true}).waitFor();
 // Delete through workout details, then save the first photo from its real picker.
 await p.locator('.workout-photo-memory').getByRole('button',{name:'DELETE',exact:true}).click();await p.getByRole('group',{name:'Confirm photo deletion'}).getByRole('button',{name:'DELETE PHOTO',exact:true}).click();await p.getByLabel('Add workout photo').waitFor();await count(p,0);
 await p.getByLabel('Add workout photo').setInputFiles({name:'first-photo.png',mimeType:'image/png',buffer:png});await p.getByText('Photo saved with this workout.',{exact:true}).waitFor();await count(p,1);
 const close=p.locator('.modal-layer').getByRole('button',{name:/^Close/}).first();await close.click();await count(p,1);
 await timeline(p,1);await deleteFirst(p);await p.getByText('No workout photos yet.',{exact:true}).waitFor();await button(p,'Close workout photos').click();await count(p,0);
 await p.reload();await button(p,'PROGRESS').click();await count(p,0);assert.deepEqual(run.errors,[]);results.push({kind:'photos',width,appearance,style,pass:true});console.log(`PASS photos ${width} ${appearance} ${style}`);await run.context.close();
}
async function failures(){
 const s=createReturningUserFixture(1),run=await open(s),p=run.page;await button(p,'PROGRESS').click();await count(p,0);
 await button(p,'TODAY').click();
 await p.evaluate(()=>{window.originalPhotoOpen=indexedDB.open.bind(indexedDB);indexedDB.open=(name,...args)=>{if(name==='rook-workout-media')throw new DOMException('QA read denied','UnknownError');return window.originalPhotoOpen(name,...args);};});
 await button(p,'PROGRESS').click();await p.getByText('Workout photos unavailable',{exact:true}).waitFor();assert.notEqual(await summary(p).textContent(),'No workout photos yet');
 await p.locator('.workout-photo-entry-card').click();await p.getByText(/Workout photos couldn’t be read on this device/).waitFor();assert.equal(await p.getByText('No workout photos yet.',{exact:true}).count(),0);
 await p.evaluate(()=>indexedDB.open=window.originalPhotoOpen);await button(p,'Try again').click();await p.getByText('No workout photos yet.',{exact:true}).waitFor();await button(p,'Close workout photos').click();await count(p,0);await run.context.close();results.push({kind:'read-failure-retry',pass:true});console.log('PASS read failure/retry');
}
async function restore(){
 const s=createReturningUserFixture(1);s.workouts=s.workouts.slice(0,1);s.workouts[0].photoId='restore-photo';s.workouts[0].exercises=[];
 const run=await open(s),p=run.page;await seedPhotos(p,s.workouts);await button(p,'PROGRESS').click();await count(p,1);
 await button(p,'PROFILE').click();await openProfileArea(p,'data');await p.getByRole('button',{name:/Back up ROOK/}).click();await button(p,'CREATE BACKUP').click();await button(p,'SAVE BACKUP').waitFor();const download=p.waitForEvent('download');await button(p,'SAVE BACKUP').click();const path=await(await download).path();await button(p,'Close Back up ROOK').click();
 await button(p,'PROGRESS').click();await timeline(p,1);await deleteFirst(p);await p.getByText('No workout photos yet.',{exact:true}).waitFor();await button(p,'Close workout photos').click();await count(p,0);
 await button(p,'PROFILE').click();await openProfileArea(p,'data');await p.getByRole('button',{name:/Restore backup/}).click();await p.getByLabel('Choose ROOK backup file').setInputFiles(path);await p.getByRole('heading',{name:'ROOK backup',exact:true}).waitFor();await button(p,'RESTORE & REPLACE').click();await p.getByRole('heading',{name:'ROOK has been restored.',exact:true}).waitFor();await button(p,'Close Restore backup').click();await button(p,'PROGRESS').click();await count(p,1);await timeline(p,1);await p.locator('.workout-photo-timeline-item img.is-ready').waitFor();assert.deepEqual(run.errors,[]);await run.context.close();results.push({kind:'real-backup-restore',pass:true});console.log('PASS real backup restore');
}
async function retainedReadFailure(){
 const s=createReturningUserFixture(1);s.workouts=s.workouts.slice(0,1);s.workouts[0].photoId='retained-photo';
 const run=await open(s),p=run.page;await seedPhotos(p,s.workouts);await button(p,'PROGRESS').click();await count(p,1);await button(p,'TODAY').click();
 await p.evaluate(()=>{window.originalPhotoOpen=indexedDB.open.bind(indexedDB);indexedDB.open=()=>{throw new DOMException('QA denied','UnknownError');};});
 await button(p,'PROGRESS').click();await count(p,1);await p.locator('.workout-photo-entry-card').click();await p.getByText(/Workout photos couldn’t be read on this device/).waitFor();assert.equal(await p.getByText('No workout photos yet.',{exact:true}).count(),0);
 await p.evaluate(()=>indexedDB.open=window.originalPhotoOpen);await button(p,'Try again').click();await p.locator('.workout-photo-timeline-item img.is-ready').waitFor();await button(p,'Close workout photos').click();await count(p,1);
 results.push({kind:'retained-count-read-failure-retry',pass:true});console.log('PASS retained count / read failure / image retry');await run.context.close();
}
async function interruptReveal(){
 const run=await open(blankState(),320,'no-preference',640),p=run.page;
 await p.getByRole('combobox',{name:'Age range'}).click();await p.getByRole('option',{name:'18–29',exact:true}).click();await button(p,'CONTINUE').click();await button(p,'Build muscle').tap();await waitStep(p,3);await p.waitForTimeout(360);await p.locator('.onboarding-experience .onboarding-option').first().tap();await waitStep(p,4);
 await button(p,'4 days').click();await p.getByLabel('Any day works').check();await resetScroll(p);await exposeDurationOnly(p);const before=await scrollPosition(p);await button(p,'60 min').tap();
 await p.waitForFunction(before=>document.scrollingElement.scrollTop>before.page,before);
 await swipe(p,160,230,180);await p.waitForTimeout(250);const after=await scrollPosition(p);assert.ok(after.page<before.page,JSON.stringify({before,after}));
 await waitStep(p,4);const settled=await scrollPosition(p);await p.waitForTimeout(220);assert.deepEqual(await scrollPosition(p),settled);
 results.push({kind:'interrupt-active-native-reveal',before,after,pass:true});console.log('PASS interruption of active smooth reveal');await run.context.close();
}
try{
 if(part==='all')for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
  for(const motion of ['no-preference','reduce'])await onboarding(width,appearance,style,motion);
  await photos(width,appearance,style);
 }
 await failures();await restore();await retainedReadFailure();await interruptReveal();
}finally{await writeFile(`${out}/browser-results${part==='all'?'':'-'+part}.json`,JSON.stringify({url,physicalIphone:false,results},null,2));await browser.close();}
