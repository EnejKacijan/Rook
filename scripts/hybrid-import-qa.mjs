import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {hybridOwnerNotes} from '../src/hybridImportFixture.js';
import {buildWeeklyPlanExport} from '../src/workoutExport.js';
import {deserializeState,startWorkout} from '../src/domain.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/hybrid-import';await mkdir(`${out}/screenshots`,{recursive:true});
const live=process.env.ROOK_HYBRID_LIVE==='1';
const cases=live?[{width:390,style:'standard',appearance:'dark'}]:[320,390].flatMap(width=>['standard','premium'].flatMap(style=>['light','dark'].map(appearance=>({width,style,appearance}))));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--overscroll-history-navigation=0']}),results=[];let page,diagnostics;
try{for(const [index,t]of cases.entries()){
 const context=await browser.newContext({viewport:{width:t.width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await context.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{value:true});});
 page=await context.newPage();page.setDefaultTimeout(15000);const errors=[],requests=[],responses=[];
 diagnostics={requests,responses};
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().endsWith('/api/ai'))requests.push(r.postDataJSON());});
 page.on('response',async r=>{if(r.url().endsWith('/api/ai'))responses.push({status:r.status(),body:await r.json().catch(()=>null)});});
 if(!live)await page.route('**/api/ai',route=>{const b=route.request().postDataJSON();assert.equal(b.operation,'interpret-import');return route.fulfill({json:{data:{fragments:b.payload.fragments.map(f=>({id:f.id,kind:'exercise',nameQuote:'dipsi',facts:[{kind:'optional',value:'true',evidence:'Po želji'},{kind:'failure',value:'true',evidence:'do failure'}]}))}}});});
 await context.tracing.start({snapshots:true,screenshots:false});await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4175',{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(hybridOwnerNotes);
 const before=await page.evaluate(()=>localStorage.getItem('lift-v2-state'));
 await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
 await page.getByRole('button',{name:'INTERPRET WITH AI',exact:true}).waitFor();assert.equal(requests.length,0);
 assert.equal(await page.getByPlaceholder(/Paste your workout notes/).inputValue(),hybridOwnerNotes);
 await page.evaluate(t=>Object.assign(document.documentElement.dataset,{style:t.style,appearance:t.appearance}),t);
 await page.screenshot({path:`${out}/screenshots/${live?'live':index}-consent.png`});
 await page.getByRole('button',{name:'INTERPRET WITH AI',exact:true}).click();
 await page.locator('.import-resolution').waitFor({timeout:100000});
 assert.equal(requests.length,1);assert.equal(requests[0].payload.fragments.length,1);assert.equal(requests[0].payload.profile,undefined);
 assert.equal(requests[0].payload.fragments[0].text,'Po želji še na koncu do failure dipsi');
 assert.equal(await page.evaluate(()=>localStorage.getItem('lift-v2-state')),before);
 const decisions=[];let matchAt=0,restoreOptional=false,restoredOptional=false;
 for(let n=0;n<65&&await page.locator('.import-resolution').count();n++){
   const root=page.locator('.import-resolution'),active=root.locator('.import-decision-content:visible');
   const label=await active.locator('h1').innerText(),source=await active.locator('blockquote').innerText();decisions.push({label,source});
   if(await active.getByRole('button',{name:'INCLUDE IN THIS PLAN',exact:true}).count()){
     restoreOptional=index===2&&!restoredOptional&&/Plate front raises/.test(source);
     await active.getByRole('button',{name:index===1||restoreOptional?'KEEP IN SOURCE NOTES ONLY':'INCLUDE IN THIS PLAN',exact:true}).click();
   }else if(await active.locator('.plan-import-prescription').count()){
     for(const [field,value]of [['Sets','3'],['Min reps','8'],['Max reps','10']]){
       const input=active.getByLabel(`Reviewed ${field}`,{exact:true});
       if(await input.count()&&await input.isEditable())await input.fill(value);
     }
   }else if(await active.getByLabel('Workout day',{exact:true}).count())await active.getByLabel('Workout day',{exact:true}).selectOption('Fri');
   else if(await active.getByLabel('Reviewed RIR',{exact:true}).count())await active.getByLabel('Reviewed RIR',{exact:true}).selectOption('');
   else if(await active.getByPlaceholder('Search exercises',{exact:true}).count()){
     const name=/dipsi/.test(source)?'Dip':/triceps/i.test(source)?'Triceps Pushdown':/shoulder press/i.test(source)?'Shoulder Press':/incline.*masini/i.test(source)?'Incline Machine Press':/lateral/i.test(source)?'Lateral Raise':/flys/i.test(source)?'Cable Fly':/incline/i.test(source)?'Incline Bench Press':/bench/i.test(source)?'Bench Press':'Plate Front Raise';
     await active.getByPlaceholder('Search exercises',{exact:true}).fill(name);
     const option=active.locator('.import-resolution-options button').first();await option.waitFor();
     if(Date.now()-matchAt<360)await page.waitForTimeout(360-(Date.now()-matchAt));
     await option.click();matchAt=Date.now();continue;
   }else throw new Error(`Unhandled decision ${label}: ${source}`);
   const next=root.locator('.sheet-action-footer button.primary');assert.equal(await next.isEnabled(),true,`${label} / ${source}`);
   if(n===0)await page.screenshot({path:`${out}/screenshots/${live?'live':index}-clarification.png`});
   await next.click();
   if(restoreOptional){
     await root.getByRole('button',{name:'Back',exact:true}).click();
     assert.match(await root.locator('.import-decision-content:visible blockquote').innerText(),/Plate front raises/);
     await root.locator('.import-decision-content:visible').getByRole('button',{name:'INCLUDE IN THIS PLAN',exact:true}).click();
     await root.locator('.sheet-action-footer button.primary').click();restoreOptional=false;restoredOptional=true;
   }
 }
 await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('lift-v2-state')),before);
 assert.equal(requests.length,1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:`${out}/screenshots/${live?'live':index}-review.png`});
 // Existing match-to-Apply double-tap protection is intentionally preserved.
 if(Date.now()-matchAt<360)await page.waitForTimeout(360-(Date.now()-matchAt));
 await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await page.locator('.bottom-nav').waitFor();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 assert.equal(saved.program.days.length,1);assert.equal(saved.program.days[0].weekday,'Fri');assert.deepEqual(saved.program.importMetadata.pendingHybrid,[]);
 const ex=saved.program.days[0].exercises;assert.equal(ex.length,index===1?10:12);assert.equal(ex[0].sets.length,1);assert.equal(ex[1].sets.length,3);assert.equal(ex[1].repMin,3);assert.equal(ex[1].repMax,10);
 assert.equal(ex[0].importRole,'Top set');assert.equal(ex[1].importRole,'Working sets');assert.equal(ex[6].sets.length,3);
 assert.ok(ex.every(e=>e.targetRir==null&&e.sets.every(s=>s.weight==null&&!s.completed)));
 assert.equal(saved.program.days[0].warmupPlan.items[0].sets,2);assert.equal(saved.program.days[0].warmupPlan.items[0].seconds,null);
 await page.reload();await page.locator('.bottom-nav').waitFor();const reloaded=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 await writeFile(`${out}/${live?'live':index}-persistence.json`,JSON.stringify({saved:saved.program,reloaded:reloaded.program},null,2));
 assert.ok(JSON.stringify(reloaded.program)===JSON.stringify(saved.program),'program changed on reload; see persistence artifact');
 const state=deserializeState(reloaded),text=buildWeeklyPlanExport({state,date:'2026-09-07',includeNotes:true}).text;
 assert.ok(text.includes('Top set')&&text.includes('Working sets')&&text.includes('DROP'));assert.ok(!text.includes('RIR 0'));
 const active=startWorkout(state,state.program.days[0]);assert.equal(active.exercises[0].importRole,'Top set');assert.equal(active.exercises[1].repMin,3);
 await page.getByRole('button',{name:'START WORKOUT',exact:true}).click();
 await page.locator('.workout-screen').waitFor();
 const running=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout);
 assert.equal(running.exercises.length,ex.length);assert.equal(running.exercises[0].importRole,'Top set');assert.equal(running.exercises[1].importRole,'Working sets');assert.equal(running.exercises[1].repMin,3);
 await page.evaluate(t=>Object.assign(document.documentElement.dataset,{style:t.style,appearance:t.appearance}),t);
 await page.screenshot({path:`${out}/screenshots/${live?'live':index}-active.png`});
 assert.deepEqual(errors,[]);await context.tracing.stop({path:`${out}/${live?'live':index}.zip`});
 results.push({...t,live,result:'PASS',decisions,requests,responses,export:text,exerciseBlocks:ex.length,transaction:true,reload:true,active:true});
 await context.close();console.log(`PASS ${live?'LIVE':index}: ${t.width} ${t.style}/${t.appearance}, ${decisions.length} decisions, ${ex.length} accepted blocks`);
}}catch(error){await page?.screenshot({path:`${out}/screenshots/${live?'live':'matrix'}-failure.png`}).catch(()=>{});console.error(await page?.locator('body').innerText().catch(()=>''));throw error;}
finally{await browser.close();await writeFile(`${out}/${live?'live-results':'browser-results'}.json`,JSON.stringify({results,diagnostics},null,2));}
