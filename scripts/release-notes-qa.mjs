// Current successor to pre-optional, ungrouped import scripts. Synthetic source
// fixtures only; no excluded local baseline JSON or arbitrary first-match picks.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {hybridOwnerNotes} from '../src/hybridImportFixture.js';
import {deserializeState} from '../src/domain.js';
import {buildWeeklyPlanExport} from '../src/workoutExport.js';
const out='artifacts/release-2026-09-13/notes';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[],base=process.env.ROOK_QA_URL||'http://127.0.0.1:4177';let page;
const btn=(p,name)=>p.getByRole('button',{name,exact:true}),read=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference',timezoneId:'Europe/Ljubljana'});
 page=await context.newPage();page.setDefaultTimeout(12000);await page.clock.setFixedTime(new Date('2026-09-11T12:00:00+02:00'));
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/ai/status',r=>r.fulfill({json:{available:true}}));
 await page.route('**/api/ai',r=>{const input=r.request().postDataJSON();requests.push(input);assert.equal(input.operation,'interpret-import');return r.fulfill({json:{data:{fragments:input.payload.fragments.map(f=>({id:f.id,kind:'exercise',nameQuote:'dipsi',facts:[{kind:'optional',value:'true',evidence:'Po želji'},{kind:'failure',value:'true',evidence:'do failure'}]}))}}});});
 await page.goto(base);await page.locator('.existing-plan-action').click();
 await page.getByPlaceholder(/Paste your workout notes/).fill(hybridOwnerNotes);const before=await page.evaluate(()=>localStorage.getItem('lift-v2-state'));
 await btn(page,'CREATE PREVIEW').click();await btn(page,'INTERPRET WITH AI').waitFor();assert.equal(requests.length,0);await btn(page,'INTERPRET WITH AI').click();
 const root=page.locator('.import-resolution'),active=()=>root.locator('.import-decision-content:visible');await root.waitFor();
 await page.evaluate(t=>{Object.assign(document.documentElement.dataset,t);window.__vv=(height,offsetTop=0)=>{for(const[k,v]of Object.entries({height,offsetTop,scale:1}))Object.defineProperty(visualViewport,k,{configurable:true,value:v});visualViewport.dispatchEvent(new Event('resize'));};},{style,appearance});
 const groups=[];let actionTime=Date.parse('2026-09-11T12:00:00+02:00');
 while(await root.count()){
  // Model separate intentional decisions across the existing double-tap guard,
  // without sleeping or changing the production transition duration.
  await page.clock.setFixedTime(new Date(actionTime+=1000));
  const groupId=await active().getAttribute('data-review-group'),a=root.locator(`[data-review-group="${groupId}"]`),title=await a.locator('h1').innerText();groups.push(title);console.log('GROUP',groups.length,title);assert.ok(groups.length<=6,'no mandatory catalog-only groups');
  if(groups.length===1){
   assert.deepEqual(await a.locator('h2').allTextContents(),['Top set','Working sets']);assert.match(await a.locator('.import-group-source').innerText(),/2 warm up seta/);
   const working=a.getByRole('region',{name:'Working sets',exact:true});
   const member=await working.count()?working:a.locator('[data-review-exercise][aria-label="Working sets"]');
   const max=member.getByLabel('Reviewed Max reps',{exact:true});await max.focus();await page.evaluate(()=>__vv(400,70));await frames(page);
   const box=await max.boundingBox(),footer=await root.locator('footer').boundingBox();assert.ok(box.y>=70&&box.y+box.height<footer.y,'keyboard field visible');
   await max.fill('10');await max.press('Enter');await page.evaluate(()=>__vv(844));
   if(style==='standard'&&appearance==='dark')await page.screenshot({path:`${out}/${width}-group.png`});
  }
  for(const member of await a.locator('[data-review-exercise]').all()){
   const name=await member.getAttribute('aria-label');
   // The approved selected-state checkmark is CSS-generated accessible text.
   const include=member.getByRole('button',{name:/INCLUDE IN THIS PLAN/});if(await include.count()){await include.click();assert.equal(await include.getAttribute('aria-pressed'),'true');}
   const search=member.getByPlaceholder('Search exercises',{exact:true});
   if(await search.isVisible().catch(()=>false)){
    const selected=/shoulder/i.test(name)?'Dumbbell Shoulder Press':/dipsi|Unresolved/i.test(name)?'Dip':'Rope Tricep Pushdown';
    await search.fill(selected);await page.clock.setFixedTime(new Date(actionTime+=1000));await btn(member,selected).click();
   }
   for(const [label,value]of [['Sets','3'],['Min reps','8'],['Max reps','10']]){
    const field=member.getByLabel(`Reviewed ${label}`,{exact:true});if(await field.isVisible().catch(()=>false)&&await field.inputValue()==='')await field.fill(value);
   }
  }
  // A genuine exercise-choice-only decision advances directly by design.
  if(await active().getAttribute('data-review-group')!==groupId)continue;
  const day=a.getByLabel('Workout day',{exact:true});if(await day.count())await day.selectOption('Fri');
  const next=root.locator('footer button.primary');assert.equal(await next.isEnabled(),true,await a.innerText());
  assert.equal(await page.evaluate(()=>localStorage.getItem('lift-v2-state')),before);
  await next.click();
 }
 assert.equal(groups.length,6);await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();assert.equal(requests.length,1);assert.equal(requests[0].payload.fragments.length,1);assert.equal(requests[0].payload.profile,undefined);
 const optional=btn(page,'Review exercise matches · Optional');assert.equal(await optional.count(),1);
 // Open/leave without accepting any suggestion. It must not modify the draft.
 await optional.click();await page.getByRole('region',{name:'Optional exercise matches'}).waitFor();assert.match(await page.locator('.import-group-source').innerText(),/Chest flys/);
 await btn(page,'CHOOSE ANOTHER').click();const search=page.getByLabel('Search exercise matches');await search.fill('Cable Fly');await page.evaluate(()=>__vv(420,50));await frames(page);
 const searchBox=await search.boundingBox(),footer=await page.locator('.import-resolution footer').boundingBox();assert.ok(searchBox.y>=50&&searchBox.y+searchBox.height<footer.y,'optional search reuses keyboard layout');
 await page.evaluate(()=>__vv(844));await btn(page,'Back').click();
 assert.equal(await page.evaluate(()=>localStorage.getItem('lift-v2-state')),before);await btn(page,'USE THIS PLAN').click();await page.locator('.bottom-nav').waitFor();
 const saved=await read(page),ex=saved.program.days[0].exercises;
 assert.equal(ex.length,12);assert.equal(ex[0].importRole,'Top set');assert.equal(ex[1].importRole,'Working sets');assert.equal(ex[1].repMin,3);assert.equal(ex[1].repMax,10);
 const fly=ex.find(e=>e.importedName==='Chest flys');assert.ok(fly);assert.equal(fly.matchStatus,'original');assert.equal(fly.sets.length,4);assert.equal(fly.repMin,null);assert.equal(fly.repMax,null);
 assert.ok(ex.every(e=>e.targetRir==null&&e.sets.every(s=>s.weight==null&&!s.completed)));assert.equal(ex[4].sets[0].setType,'drop');assert.equal(ex[8].sets[0].setType,'drop');
 assert.equal(saved.program.days[0].warmupPlan.items[0].sets,2);assert.equal(saved.program.days[0].warmupPlan.items[0].seconds,null);assert.deepEqual(saved.program.importMetadata.pendingHybrid,[]);
 await page.reload();await page.locator('.bottom-nav').waitFor();assert.deepEqual((await read(page)).program,saved.program);
 const text=buildWeeklyPlanExport({state:deserializeState(saved),date:'2026-09-11',includeNotes:true}).text;
 assert.match(text,/Top set/);assert.match(text,/Working sets/);assert.match(text,/DROP/);assert.match(text,/Chest flys/);assert.doesNotMatch(text,/RIR 0/);
 await btn(page,'START WORKOUT').click();await page.locator('.workout-screen').waitFor();const running=(await read(page)).activeWorkout;
 assert.equal(running.exercises.length,12);assert.equal(running.exercises[2].repMin,null);assert.equal(running.exercises[2].sets.length,4);
 assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 results.push({width,style,appearance,groups,optionalSkipped:true,reload:true,active:true,export:true,keyboard:'simulated visualViewport'});console.log('PASS',width,style,appearance);await context.close();
}}catch(error){if(page&&!page.isClosed()){await page.screenshot({path:`${out}/failure.png`});await writeFile(`${out}/failure.txt`,await page.locator('body').innerText());await writeFile(`${out}/failure-dom.html`,await page.content());}throw error;}
finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
