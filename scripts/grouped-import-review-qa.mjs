import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {hybridOwnerNotes} from '../src/hybridImportFixture.js';
import {buildWeeklyPlanExport} from '../src/workoutExport.js';
import {deserializeState} from '../src/domain.js';
const out='artifacts/GROUPED-IMPORT-REVIEW';await mkdir(out,{recursive:true});
const matrix=[320,390].flatMap(width=>['standard','premium'].flatMap(style=>['light','dark'].map(appearance=>({width,style,appearance}))));
const baseline=JSON.parse(await readFile('artifacts/ROOK-IMPORT-RESOLUTION-AUDIT/0-persistence.json','utf8')).saved;
// Volatile persistence IDs/timestamps are not prescriptions. All other day,
// exercise, source-span, method, warm-up and note fields are compared recursively.
function semantic(value){if(Array.isArray(value))return value.map(semantic);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k,v])=>!['id','createdAt','updatedAt','reviewParentBlockId'].includes(k)&&!(k==='importPrescriptionCorrections'&&!Object.keys(v.values).length)).map(([k,v])=>[k,semantic(v)]));return value;}
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--overscroll-history-navigation=0']});const results=[];let page;
const frames=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
try{for(const [index,t]of matrix.entries()){
 const context=await browser.newContext({viewport:{width:t.width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:index%2?'reduce':'no-preference'});
 page=await context.newPage();page.setDefaultTimeout(12000);const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/ai',route=>{const b=route.request().postDataJSON();requests.push(b);assert.equal(b.operation,'interpret-import');return route.fulfill({json:{data:{fragments:b.payload.fragments.map(f=>({id:f.id,kind:'exercise',nameQuote:'dipsi',facts:[{kind:'optional',value:'true',evidence:'Po želji'},{kind:'failure',value:'true',evidence:'do failure'}]}))}}});});
 await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:5173',{waitUntil:'domcontentloaded'});
 await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(hybridOwnerNotes);
 const before=await page.evaluate(()=>localStorage.getItem('lift-v2-state'));
 await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();await page.getByRole('button',{name:'INTERPRET WITH AI',exact:true}).click();await page.locator('.import-resolution').waitFor();
 await page.evaluate(t=>{Object.assign(document.documentElement.dataset,t);window.__nodes=new Map();window.__vv=(height,offsetTop,scale=1,event='resize')=>{for(const[k,v]of Object.entries({height,offsetTop,scale}))Object.defineProperty(visualViewport,k,{configurable:true,value:v});visualViewport.dispatchEvent(new Event(event));};},t);
 const root=page.locator('.import-resolution'),active=()=>root.locator('.import-decision-content:visible');const records=[],geometry=[];let matchAt=0;
 assert.equal(await root.locator('.plan-import-choice').count()+await root.locator('.import-resolution-match').count(),22);
 async function bounds(label){await frames(page);const m=await page.evaluate(label=>{
   const rect=e=>e?Object.fromEntries(['top','bottom','height'].map(k=>[k,e.getBoundingClientRect()[k]])):null;
   const field=document.activeElement,footer=document.querySelector('.import-resolution footer'),scroll=document.querySelector('.import-decision-scroll');
   return {label,viewport:{top:visualViewport.offsetTop,bottom:visualViewport.offsetTop+visualViewport.height,scale:visualViewport.scale},field:rect(field),labelBox:rect(field.closest('label')),footer:rect(footer),header:rect(document.querySelector('.import-decision-header')),scroll:rect(scroll),scrollTop:scroll.scrollTop,windowScroll:scrollY};
 },label);geometry.push(m);assert.ok(m.header.top>=m.viewport.top-1,JSON.stringify(m));assert.ok(Math.abs(m.footer.bottom-m.viewport.bottom)<2,JSON.stringify(m));if(m.labelBox){assert.ok(m.labelBox.top>=m.scroll.top-1&&m.field.bottom<=m.footer.top-10,JSON.stringify(m));}return m;}
 for(let n=0;n<10;n++){
   assert.equal(await root.locator('.step-count').innerText(),`STEP ${n+1}/10`);
   const a=active();records.push({title:await a.locator('h1').innerText(),members:await a.locator('[data-review-exercise]').count(),issues:await a.locator('.plan-import-choice').count()});
   if(n===0){
     assert.equal(await a.locator('h2').allTextContents().then(a=>a.join('|')),'Top set|Working sets');assert.match(await a.innerText(),/2 warm-up sets/);
     assert.match(await a.innerText(),/ROOK currently needs an upper limit/);
     const top=a.locator('[data-review-exercise]').first(),min=top.getByLabel('Reviewed Min reps',{exact:true}),max=top.getByLabel('Reviewed Max reps',{exact:true});
     await min.focus();await page.evaluate(()=>__vv(400,0));await bounds('missing reps / resize');await page.evaluate(()=>__vv(400,100,1,'scroll'));await bounds('missing reps / offset only');
     await min.fill('8');await min.press('Enter');assert.equal(await max.evaluate(e=>e===document.activeElement),true);await bounds('Next to max');await max.fill('10');await max.press('Enter');
     await page.evaluate(()=>__vv(844,0));await top.getByRole('button',{name:'Edit source values',exact:true}).click();
     const sets=top.getByLabel('Reviewed Sets',{exact:true});await sets.focus();await page.evaluate(()=>__vv(400,100));await bounds('unlocked Sets');
     await min.evaluate(e=>window.__nodes.set('min',e));await sets.fill('');assert.equal(await root.locator('footer button.primary').isDisabled(),true);await sets.fill('1');await sets.press('Enter');assert.equal(await min.evaluate(e=>window.__nodes.get('min')===e&&document.activeElement===e),true);await bounds('Sets to Min');
     const stable=await bounds('already visible');await min.focus();const stable2=await bounds('same focus no scroll');assert.equal(stable.scrollTop,stable2.scrollTop);
     for(const[h,y,s,event]of [[360,90,1.2,'resize'],[410,70,1,'resize'],[410,120,1,'scroll'],[844,0,1,'resize'],[390,85,1,'resize']]){await page.evaluate(([h,y,s,e])=>__vv(h,y,s,e),[h,y,s,event]);await bounds(`repeat ${h}/${y}/${s}`);}
     await min.press('Enter');await bounds('Min to Max');await max.press('Enter');
     await page.evaluate(()=>__vv(844,0));
     if(index===0||index===7)await page.screenshot({path:`${out}/${index}-bench-group.png`});
   }
   const members=a.locator('[data-review-exercise]');
   for(let m=0;m<await members.count();m++){
     const member=members.nth(m),sourceName=await member.getAttribute('aria-label');
     const include=member.getByRole('button',{name:'INCLUDE IN THIS PLAN',exact:true});
     if(await include.count()){
       assert.equal(await member.locator('input:visible').count(),0,'optional choice precedes dependent controls');
       if(index===2){await member.getByRole('button',{name:'KEEP IN SOURCE NOTES ONLY',exact:true}).click();assert.equal(await member.locator('input:visible').count(),0);await include.click();}
       else await include.click();
     }
     const search=member.getByPlaceholder('Search exercises',{exact:true});
     if(await search.isVisible().catch(()=>false)){
       const name=/dipsi/.test(sourceName)?'Dip':/triceps|Exercise choice/i.test(sourceName)?'Triceps Pushdown':/shoulder press/i.test(sourceName)?'Shoulder Press':/incline.*masini/i.test(sourceName)?'Incline Machine Press':/lateral/i.test(sourceName)?'Lateral Raise':/flys/i.test(sourceName)?'Cable Fly':/incline/i.test(sourceName)?'Incline Bench Press':/bench/i.test(sourceName)?'Bench Press':'Plate Front Raise';
       await search.fill(name);const option=member.locator('.import-resolution-options button').filter({hasNotText:/INCLUDE|SOURCE NOTES/}).first();await option.waitFor();
       // Existing deliberate double-tap protection applies to actual selections,
       // not keyboard geometry or scroll readiness.
       if(Date.now()-matchAt<355)await page.waitForTimeout(355-(Date.now()-matchAt));await option.click();matchAt=Date.now();
     }
     for(const [field,value]of [['Sets','3'],['Min reps','8'],['Max reps','10']]){
       const input=member.getByLabel(`Reviewed ${field}`,{exact:true});
       if(await input.isVisible().catch(()=>false))await input.fill(n===0&&m===0&&field==='Sets'?'1':value);
     }
   }
   const day=a.getByLabel('Workout day',{exact:true});if(await day.count())await day.selectOption('Fri');
   assert.equal(await root.locator('footer button.primary').isEnabled(),true,await a.innerText());assert.equal(await page.evaluate(()=>localStorage.getItem('lift-v2-state')),before);
   if(n===0){const max=a.getByLabel('Reviewed Max reps',{exact:true}).last();await max.focus();await page.evaluate(()=>__vv(400,100));await bounds('Continue keyboard open');if(index===0||index===7)await page.screenshot({path:`${out}/${index}-keyboard.png`});}
   if(n===2){
     const min=a.getByLabel('Reviewed Min reps',{exact:true}).last();await min.fill('');assert.equal(await root.locator('footer button.primary').isDisabled(),true);await min.evaluate(e=>window.__nodes.set('raw',e));
     await root.getByRole('button',{name:'Back',exact:true}).click();await root.locator('footer button.primary').click();assert.equal(await min.inputValue(),'');assert.equal(await min.evaluate(e=>window.__nodes.get('raw')===e),true);await min.fill('8');
     if(index===0||index===7)await page.screenshot({path:`${out}/${index}-incline-group.png`});
   }
   await root.locator('footer button.primary').click();
   if(n===0){assert.equal(await root.locator('.step-count').innerText(),'STEP 2/10');await page.evaluate(()=>__vv(844,0));}
 }
 await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();assert.equal(requests.length,1);assert.equal(requests[0].payload.fragments.length,1);assert.equal(requests[0].payload.profile,undefined);assert.equal(requests[0].payload.fragments[0].text,'Po želji še na koncu do failure dipsi');
 assert.equal(await page.evaluate(()=>localStorage.getItem('lift-v2-state')),before);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await page.locator('.bottom-nav').waitFor();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));await writeFile(`${out}/${index}-saved.json`,JSON.stringify(saved.program,null,2));
 assert.deepEqual(semantic(saved.program.days),semantic(baseline.days),'accepted executable day state differs from pre-grouping same-answer fixture');
 assert.deepEqual(saved.program.importMetadata.hybrid.sourceBlocks.map(b=>b.sourceSpan),baseline.importMetadata.hybrid.sourceBlocks.map(b=>b.sourceSpan));
 const scopedNotes=p=>p.importMetadata.sourceNotes.map(n=>({...n,dayId:p.days.findIndex(d=>d.id===n.dayId)}));
 assert.deepEqual(scopedNotes(saved.program),scopedNotes(baseline));assert.deepEqual(saved.program.importMetadata.pendingHybrid,[]);
 assert.equal(saved.program.days[0].exercises.length,12);assert.equal(saved.program.days[0].warmupPlan.items[0].sets,2);
 await page.reload();await page.locator('.bottom-nav').waitFor();const reloaded=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.deepEqual(reloaded.program,saved.program);
 const text=buildWeeklyPlanExport({state:deserializeState(reloaded),date:'2026-09-07',includeNotes:true}).text;
 const oldExport=buildWeeklyPlanExport({state:deserializeState({...reloaded,program:baseline}),date:'2026-09-07',includeNotes:true}).text;
 assert.equal(text,oldExport,'grouping must not change the existing same-answer plan export');
 assert.ok(text.includes('Top set')&&text.includes('Working sets')&&text.includes('DROP'));assert.ok(!text.includes('RIR 0'));
 // The preserved source was explicitly scheduled Friday. QA may run any day.
 const friday=page.locator('.week-strip button').filter({hasText:/F/}).first();
 if(await friday.count())await friday.click();
 await page.getByRole('button',{name:'START WORKOUT',exact:true}).click();await page.locator('.workout-screen').waitFor();const running=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout);
 assert.equal(running.exercises.length,12);assert.equal(running.exercises[0].importRole,'Top set');assert.equal(running.exercises[1].repMin,3);assert.equal(running.exercises[4].exerciseId,'incline-machine-press');
 assert.deepEqual(errors,[]);results.push({...t,reducedMotion:index%2===1,groups:records,geometry,semanticComparison:'equal',reload:true,activeBlocks:running.exercises.length,export:text,aiCalls:requests.length});
 await context.close();console.log(`PASS ${index}: ${t.width} ${t.style}/${t.appearance}; 10 groups, 12 blocks, keyboard labels/footer, persistence/active/export`);
}}catch(error){await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});console.error(await page?.locator('body').innerText().catch(()=>''));throw error;}finally{await browser.close();await writeFile(`${out}/browser-results.json`,JSON.stringify(results,null,2));}
