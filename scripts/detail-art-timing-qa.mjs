import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const before=process.argv.includes('--before'),out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW';await mkdir(`${out}/traces`,{recursive:true});
const b=await chromium.launch({channel: 'chrome',headless:true}),results=[];
try{for(const width of before?[390]:[320,390])for(const style of before?['standard']:['standard','premium'])for(const appearance of before?['dark']:['light','dark']){
 const s=createReturningUserFixture(1);s.workouts=[{id:'art-qa',name:'Legs',status:'completed',completedAt:new Date().toISOString(),exercises:['leg-press-calf-raise','barbell-bench-press','leg-press'].map((exerciseId,i)=>({id:`art-${i}`,exerciseId,repMin:8,repMax:12,sets:[{id:'set',weight:60,reps:10,completed:true,planned:true}]}))}];
 s.workouts[0].canonicalPlanDate='2026-09-08';s.workouts[0].workoutDateKey='2026-09-08';
 Object.assign(s.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
 const c=await b.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'});await c.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},s);
 const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');await p.getByRole('button',{name:'PROGRESS',exact:true}).click();
 for(const index of [0,0,1,2,0]){
  if(index===0&&results.filter(r=>r.width===width&&r.style===style&&r.appearance===appearance).length===4){await p.reload();await p.getByRole('button',{name:'PROGRESS',exact:true}).click();}
  const rows=p.locator('.logged-exercise-row');await rows.nth(index).waitFor();
  await p.evaluate(()=>{window.artFrames=[];window.artStart=performance.now();const sample=()=>{const e=document.querySelector('.exercise-detail-art');if(e){const r=e.getBoundingClientRect();window.artFrames.push({t:performance.now()-window.artStart,complete:e.complete&&e.naturalWidth>0,src:e.currentSrc||e.src,y:r.y,width:r.width,height:r.height});}if(performance.now()-window.artStart<650)requestAnimationFrame(sample);};requestAnimationFrame(sample);});
  await rows.nth(index).click();await p.locator('.exercise-detail-art').waitFor();await p.waitForTimeout(700);
  const data=await p.evaluate(()=>({frames:window.artFrames,resources:performance.getEntriesByType('resource').filter(r=>r.name.includes('wg-')).map(r=>({name:r.name,start:r.startTime-window.artStart,duration:r.duration,bytes:r.transferSize}))}));
  assert.ok(data.frames.length);assert.ok(data.frames.some(f=>f.complete));
  const first=data.frames[0],ready=data.frames.find(f=>f.complete);const result={width,style,appearance,index,firstFrame:first.t,ready:ready.t,blankMs:ready.t-first.t,...data};results.push(result);
  console.log(JSON.stringify({width,style,appearance,index,first:first.t,ready:ready.t,blankMs:result.blankMs}));
  if(!before){assert.ok(result.blankMs<150,'no long empty illustration tile');assert.ok(data.frames.every(f=>Math.abs(f.width-first.width)<1&&Math.abs(f.height-first.height)<1),'fixed illustration geometry (subpixel animation rounding allowed)');}
  await p.screenshot({path:`${out}/screenshots/art-timing-${before?'before':'after'}-${width}-${style}-${appearance}-${index}.png`});await p.keyboard.press('Escape');await p.locator('.exercise-detail-art').waitFor({state:'detached'});
 }
 await c.close();
}}finally{await b.close();await writeFile(`${out}/traces/detail-art-${before?'before':'after'}.json`,JSON.stringify(results,null,2));}
