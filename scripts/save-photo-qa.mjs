import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const s=createReturningUserFixture(1);const w=s.workouts.at(-1);w.photoId='export-photo';
 Object.assign(s.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
 const c=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce',acceptDownloads:true});
 await c.addInitScript(s=>{localStorage.setItem('lift-v2-state',JSON.stringify(s));window.shareMode='ok';navigator.canShare=()=>window.shareMode!=='fallback';navigator.share=async({files})=>{if(window.shareMode==='cancel')throw new DOMException('cancel','AbortError');if(window.shareMode==='fail')throw new Error('failed');window.sharedFile={name:files[0].name,type:files[0].type,bytes:Array.from(new Uint8Array(await files[0].arrayBuffer()))};};},s);
 const p=await c.newPage();const uploads=[];p.on('request',r=>{if(r.method()!=='GET')uploads.push(r.url());});await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');
 const original=await p.evaluate(async({id,type})=>{const {replaceWorkoutPhotos,getWorkoutPhoto}=await import('/src/workoutPhotos.js');const canvas=document.createElement('canvas');canvas.width=600;canvas.height=900;canvas.getContext('2d').fillRect(0,0,600,900);const blob=await new Promise(r=>canvas.toBlob(r,type));await replaceWorkoutPhotos([{id:'export-photo',workoutId:id,blob,mimeType:type,width:600,height:900,createdAt:new Date().toISOString()}]);const stored=await getWorkoutPhoto('export-photo');return Array.from(new Uint8Array(await stored.blob.arrayBuffer()));},{id:w.id,type:appearance==='light'?'image/jpeg':'image/png'});
 if(appearance==='dark')await p.evaluate(async()=>{const {createBackup,parseBackupArchive,commitPreparedRestore,backupFile}=await import('/src/backup.js');const state=JSON.parse(localStorage.getItem('lift-v2-state'));const archive=await createBackup(state);const prepared=await parseBackupArchive(backupFile(archive));await commitPreparedRestore(prepared,{currentState:state});});
 await p.reload();await p.getByRole('button',{name:'PROGRESS',exact:true}).click();await p.locator('.workout-photo-entry-card').click();await p.locator('.workout-photo-timeline-item img.is-ready').waitFor();await p.locator('.workout-photo-timeline-item').click();
 const save=p.getByRole('button',{name:'SAVE PHOTO',exact:true});await save.waitFor();await p.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='SAVE PHOTO')?.disabled);
 await save.click();await p.waitForFunction(()=>window.sharedFile);assert.deepEqual(await p.evaluate(()=>window.sharedFile.bytes),original);
 const bounds=await p.locator('.workout-photo-viewer-actions').boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=844,JSON.stringify(bounds));
 await p.screenshot({path:`${out}/save-photo-${width}-${style}-${appearance}.png`});
 for(const mode of ['cancel','fail','fallback']){
  await p.evaluate(m=>window.shareMode=m,mode);
  if(mode==='fallback'){const downloading=p.waitForEvent('download');await save.click();const d=await downloading;assert.deepEqual([...await readFile(await d.path())],original);assert.match(d.suggestedFilename(),/^ROOK-workout-.*\.(jpg|png)$/);}
  else {await save.click();if(mode==='fail')await p.getByText('Couldn’t save the photo. Please try again.').waitFor();}
 }
 const retained=await p.evaluate(async()=>{const {getAllWorkoutPhotos}=await import('/src/workoutPhotos.js');const photos=await getAllWorkoutPhotos();return {count:photos.length,bytes:Array.from(new Uint8Array(await photos[0].blob.arrayBuffer()))};});assert.equal(retained.count,1);assert.deepEqual(retained.bytes,original);assert.deepEqual(uploads,[]);
 await p.getByRole('button',{name:'DELETE PHOTO',exact:true}).click();await p.getByRole('button',{name:'KEEP PHOTO',exact:true}).click();await p.getByRole('button',{name:'VIEW WORKOUT',exact:true}).click();await p.getByText('Workout details',{exact:true}).waitFor();
 if(width===320&&style==='standard'&&appearance==='light')for(const corrupt of [true,false]){
  await p.evaluate(async corrupt=>{const {getAllWorkoutPhotos,replaceWorkoutPhotos}=await import('/src/workoutPhotos.js');const records=await getAllWorkoutPhotos();if(corrupt)records[0].blob=new Blob(['corrupt'],{type:'image/jpeg'});await replaceWorkoutPhotos(corrupt?records:[]);},corrupt);
  await p.reload();await p.getByRole('button',{name:'PROGRESS',exact:true}).click();await p.locator('.workout-photo-entry-card').click();await p.locator('.workout-photo-timeline-item').click();await p.getByText('Photo unavailable',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'SAVE PHOTO',exact:true}).isDisabled(),true);
 }
 console.log(`PASS ${width} ${style} ${appearance}: stored bytes, share/cancel/failure/download, retained photo, actions${appearance==='dark'?', backup round-trip':''}`);await c.close();
}}finally{await browser.close();}
