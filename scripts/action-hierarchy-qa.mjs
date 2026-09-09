import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,buildProgram,completeWorkout,startWorkout,isoDay,weekday} from '../src/domain.js';
import {buildBackupArchive} from '../src/backup.js';
const out='artifacts/action-hierarchy';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
try {
for(const width of [320,390,430])for(const appearance of ['light','dark'])for(const style of ['standard','premium']) {
  let state=blankState();const today=weekday();
  Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:[...new Set([today,'Tue','Sat','Mon'])].slice(0,3),sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true,rirEnabled:true,appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
  state.program=buildProgram(state.profile);state.selectedDate=isoDay();state.selectedDay=today;
  state.activeWorkout=startWorkout(state,state.program.days.find(d=>d.weekday===today));
  for(const e of state.activeWorkout.exercises)for(const s of e.sets)Object.assign(s,{weight:70,reps:8,rir:1,completed:true});
  state=completeWorkout(state);
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce',colorScheme:appearance});
  await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
  const page=await context.newPage();await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
  const prefix=`${width}-${style}-${appearance}`;
  const shot=async name=>{await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/${prefix}-${name}.png`,animations:'disabled'});};
  const red=async locator=>{const color=await locator.evaluate(e=>getComputedStyle(e).color),rgb=color.match(/[\d.]+/g).map(Number);assert.ok(rgb[0]>rgb[1]*1.3&&rgb[0]>rgb[2]*1.3,color);return color;};
  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('button',{name:'WORKOUT COMPLETE · VIEW HISTORY',exact:true}).click();
  await page.getByRole('button',{name:'EDIT',exact:true}).click();
  const save=page.getByRole('button',{name:'REVIEW CHANGES',exact:true});assert.ok(await save.isDisabled());await shot('01-history-disabled');
  await page.getByRole('textbox',{name:'Session note',exact:true}).fill('Action hierarchy QA draft');await shot('02-edit-workout-save');
  await page.getByRole('button',{name:'CANCEL',exact:true}).click();
  const keep=page.getByRole('button',{name:'KEEP EDITING',exact:true}),discard=page.getByRole('button',{name:'DISCARD CHANGES',exact:true});
  await keep.waitFor();assert.match(await keep.getAttribute('class'),/primary/);assert.equal(await page.locator('.history-correction-confirm .primary:not(:disabled)').count(),1);
  const dangerColor=await red(discard);const keepBackground=await keep.evaluate(e=>getComputedStyle(e).backgroundColor);await shot('03-discard-confirmation');
  await keep.click();assert.equal(await page.getByRole('textbox',{name:'Session note',exact:true}).inputValue(),'Action hierarchy QA draft');
  await page.getByRole('spinbutton',{name:'KG',exact:true}).first().fill('72');
  await save.click();await page.getByText('SAVE CHANGES?',{exact:true}).waitFor();await shot('04-correct-history-save');
  await page.getByRole('button',{name:'BACK TO EDIT',exact:true}).click();await page.getByRole('button',{name:'CANCEL',exact:true}).click();await discard.click();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).workouts),JSON.parse(JSON.stringify(state.workouts)));
  await page.locator('.completed-workout-detail .detail-header-close').click();await page.getByRole('button',{name:'PROFILE',exact:true}).click();
  await openProfileArea(page, 'program'); await page.getByRole('button',{name:/Edit plan/}).click();await page.locator('.sheet-action-footer').waitFor();await shot('05-edit-plan-save');await page.getByRole('button',{name:'Close edit plan',exact:true}).click();await page.locator('.modal-layer').waitFor({state:'detached'});
  await openProfileArea(page, 'data'); await page.getByRole('button',{name:/Back up ROOK/}).click();await page.getByRole('button',{name:'CREATE BACKUP',exact:true}).waitFor();await shot('06-create-backup');await page.locator('.data-backup-screen .detail-header-close').click();await page.locator('.modal-layer').waitFor({state:'detached'});
  await openProfileArea(page, 'data'); await page.getByRole('button',{name:/Restore backup/}).click();const archive=await buildBackupArchive(state,[]);await page.getByLabel('Choose ROOK backup file').setInputFiles({name:'synthetic.rook-backup.zip',mimeType:'application/zip',buffer:Buffer.from(archive.bytes)});await page.getByRole('button',{name:'RESTORE & REPLACE',exact:true}).waitFor();await shot('07-restore-confirmation');await page.locator('.restore-backup-screen .detail-header-close').click();await page.locator('.modal-layer').waitFor({state:'detached'});
  await openProfileArea(page, 'data'); await page.getByRole('button',{name:/^Delete local data/}).click();const destroy=page.getByRole('button',{name:'DELETE LOCAL DATA',exact:true});await destroy.waitFor();assert.match(await destroy.getAttribute('class'),/danger/);assert.doesNotMatch(await destroy.getAttribute('class'),/primary/);
  const destructiveBackground=await destroy.evaluate(e=>getComputedStyle(e).backgroundColor);assert.notEqual(destructiveBackground,keepBackground);
  const disabledDestructive=await destroy.evaluate(e=>{const probe=e.cloneNode(true);probe.disabled=true;probe.style.position='absolute';probe.style.visibility='hidden';e.parentElement.append(probe);const background=getComputedStyle(probe).backgroundColor;probe.remove();return background;});assert.notEqual(disabledDestructive,destructiveBackground);assert.notEqual(disabledDestructive,keepBackground);await shot('08-logout-confirmation');
  await page.locator('.logout-confirm-sheet .detail-header-close').click();
  await page.evaluate(async()=>{
    const state=JSON.parse(localStorage.getItem('lift-v2-state')),workout=state.workouts.at(-1);workout.photoId='action-photo';localStorage.setItem('lift-v2-state',JSON.stringify(state));
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('rook-workout-media',3);r.onupgradeneeded=()=>{const db=r.result,store=db.objectStoreNames.contains('photos')?r.transaction.objectStore('photos'):db.createObjectStore('photos',{keyPath:'id'});if(!store.indexNames.contains('workoutId'))store.createIndex('workoutId','workoutId');if(!store.indexNames.contains('createdAt'))store.createIndex('createdAt','createdAt');if(!db.objectStoreNames.contains('restore-snapshot'))db.createObjectStore('restore-snapshot',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise((resolve,reject)=>{const t=db.transaction('photos','readwrite');t.objectStore('photos').put({id:'action-photo',workoutId:workout.id,createdAt:workout.completedAt,width:300,height:400,mimeType:'image/svg+xml',blob:new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#315e4b"/></svg>'],{type:'image/svg+xml'})});t.oncomplete=resolve;t.onerror=()=>reject(t.error);});db.close();
  });
  await page.reload();await page.getByRole('button',{name:'PROGRESS',exact:true}).click();await page.locator('.workout-photo-entry-section').getByRole('button').click();
  await page.locator('.workout-photo-timeline-item').first().click();await page.getByRole('button',{name:'DELETE PHOTO',exact:true}).click();const photoConfirm=page.getByRole('group',{name:'Confirm photo deletion'});await photoConfirm.waitFor();await red(photoConfirm.getByRole('button',{name:'DELETE PHOTO',exact:true}));await shot('09-photo-delete-confirmation');
  results.push({width,appearance,style,dangerColor,keepBackground,destructiveBackground});await context.close();console.log(`${prefix}: safe/default, destructive, disabled, save/back, backup, logout and photo passed`);
}
await writeFile(`${out}/semantics.json`,JSON.stringify(results,null,2));
} finally {await browser.close();}
