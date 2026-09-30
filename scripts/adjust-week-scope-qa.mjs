import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright-core';
import {adjustWeekState} from '../src/fixtures/adjustWeekState.js';
import {openAdjustWeek} from './qa-current-navigation.mjs';
const out='artifacts/adjust-week-scope',origin=process.env.ROOK_QA_URL||'http://127.0.0.1:4273',engine=process.env.ROOK_QA_BROWSER||'chrome';
await mkdir(out,{recursive:true});const results=[];
let browser;
try{
 browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
 for(const width of [320,390,430])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
  const label=width+'-'+style+'-'+appearance;
  if(process.env.ROOK_QA_CASE&&process.env.ROOK_QA_CASE!==label)continue;
  const state=adjustWeekState();Object.assign(state.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await context.addInitScript(state=>{
    const RealDate=Date,fixed=RealDate.parse('2026-09-29T12:00:00');
    window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
    if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(state));
   },state);
   await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
   await page.goto(origin);await page.locator('.today-hero').waitFor();
   assert.match(await page.locator('.today-hero').innerText(),/UPPER A/);
   assert.equal(await page.locator('html').getAttribute('data-style'),style);assert.equal(await page.locator('html').getAttribute('data-appearance'),appearance);
   const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
   const before=await read();
   const unlockedPosition=await page.evaluate(()=>document.body.style.position);
   const open=async()=>{await openAdjustWeek(page);await page.getByRole('button',{name:/My available days changed/}).click();};
   const select=async dates=>{
    const selected=await page.locator('[data-available-date][aria-pressed="true"]').evaluateAll(nodes=>nodes.map(n=>n.dataset.availableDate));
    for(const date of selected)if(!dates.includes(date))await page.locator('[data-available-date="'+date+'"]').click();
    for(const date of dates)if(!selected.includes(date))await page.locator('[data-available-date="'+date+'"]').click();
   };
   const review=()=>page.getByRole('button',{name:'REVIEW SCHEDULE',exact:true}).click();
   const check=async()=>{
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.locator('.flexible-week-sheet').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
   };
   await open();assert.equal(await page.locator('[data-available-date]').count(),7);
   assert.match(await page.locator('.flexible-week-sheet [role="status"]').innerText(),/4 of 5/);
   // Five selected dates with occupied next Monday: review the conflict, don't absorb it.
   await review();assert.equal(await page.locator('.flexible-week-review article').count(),5);
   assert.match(await page.locator('.flexible-week-sheet').innerText(),/Mon, Oct 5 already has UPPER A/);
   assert.equal(await page.getByRole('button',{name:'USE THIS SCHEDULE',exact:true}).isDisabled(),true);
   const ids=await page.locator('.flexible-week-review article').evaluateAll(nodes=>nodes.map(n=>n.dataset.sessionId));
   await page.getByRole('button',{name:'EDIT DAYS',exact:true}).click();
   await select(['2026-09-29','2026-09-30','2026-10-01','2026-10-02']);
   assert.equal(await page.getByRole('button',{name:'REVIEW SCHEDULE',exact:true}).isEnabled(),true);
   await review();assert.equal(await page.locator('.flexible-week-review article').count(),5);
   assert.equal(await page.getByText('NEEDS A DAY',{exact:true}).count(),1);
   await check();
   if(width===390)await page.screenshot({path:out+'/'+label+'-partial.png'});
   await page.locator('.flexible-week-sheet').evaluate(n=>n.scrollTop=n.scrollHeight);
   const lastRow=await page.locator('.flexible-week-review article').last().boundingBox(),footer=await page.locator('.flexible-week-footer').boundingBox();
   assert.ok(lastRow.y+lastRow.height<=footer.y+1,'last unresolved row is reachable above footer');
   if(width===390&&style==='premium'&&appearance==='dark')await page.screenshot({path:out+'/'+label+'-unresolved.png'});
   await page.getByRole('button',{name:'Back',exact:true}).click();
   assert.equal(await page.locator('[data-available-date][aria-pressed="true"]').count(),4);
   await page.getByRole('button',{name:'SHOW LATER DATES',exact:true}).click();assert.equal(await page.locator('[data-available-date]').count(),14);
   await select(['2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-10']);
   await review();assert.deepEqual(await page.locator('.flexible-week-review article').evaluateAll(nodes=>nodes.map(n=>n.dataset.sessionId)),ids);
   assert.equal(await page.getByRole('button',{name:'USE THIS SCHEDULE',exact:true}).isEnabled(),true);
   await page.getByRole('button',{name:'CANCEL',exact:true}).click();await page.locator('.modal-layer').waitFor({state:'detached'});
   assert.deepEqual((await read()).flexibleWeek,before.flexibleWeek);
   await open();await select(['2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04']);
   await review();assert.equal(await page.locator('.flexible-week-review article').count(),5);assert.equal(await page.getByText('NEEDS A DAY',{exact:true}).count(),0);
   await page.getByRole('button',{name:'EDIT DAYS',exact:true}).click();
   await select(['2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04']);await review();await check();
   const reviewed=await page.locator('.flexible-week-review').innerText();
   if(width===390)await page.screenshot({path:out+'/'+label+'-ready.png'});
   await page.getByRole('button',{name:'USE THIS SCHEDULE',exact:true}).click();await page.locator('.modal-layer').waitFor({state:'detached'});
   const saved=await read();assert.deepEqual(saved.program,before.program);assert.deepEqual(saved.profile,before.profile);assert.deepEqual(saved.workouts,before.workouts);
   assert.equal(Object.keys(saved.flexibleWeek.sessions).length,5);
   assert.deepEqual(Object.keys(saved.flexibleWeek.sessions).sort(),ids.slice().sort());
   assert.deepEqual(Object.values(saved.flexibleWeek.sessions).map(s=>s.scheduledDate).sort(),['2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04']);
   assert.equal(await page.getByRole('button',{name:'VIEW DESTINATION',exact:true}).count(),1);
   assert.doesNotMatch(await page.locator('.today-screen').innerText(),/needs review|review required/i);
   await page.getByRole('button',{name:'VIEW DESTINATION',exact:true}).click();
   // Tuesday is the original NOGE A date; its canonical source link follows
   // that identity, not the UPPER A that temporarily occupied Tuesday before.
   assert.match(await page.locator('.today-hero').innerText(),/NOGE A/);
   assert.match(await page.locator('.today-hero').innerText(),/THURSDAY, OCT 1/);
   await page.reload();await page.locator('.today-hero').waitFor();assert.deepEqual((await read()).flexibleWeek,saved.flexibleWeek);
   await open();const handle=page.getByRole('button',{name:'Drag down or tap to close',exact:true});assert.equal(await handle.count(),1);
   const panel=page.locator('.flexible-week-sheet');await panel.evaluate(async n=>{await Promise.all(n.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));});
   const box=await handle.boundingBox(),x=box.x+box.width/2,y=box.y+12;
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+28,{steps:3});await page.waitForTimeout(120);
   await page.mouse.up();await page.waitForTimeout(220);assert.equal(await page.locator('.modal-layer').count(),1);
   const reset=await handle.boundingBox();await page.mouse.move(x,reset.y+12);await page.mouse.down();await page.mouse.move(x,reset.y+195,{steps:7});await page.mouse.up();
   await page.locator('.modal-layer').waitFor({state:'detached'});
   // Passive React cleanup may run just after DOM removal in WebKit.
   await page.waitForFunction(position=>document.body.style.position===position,unlockedPosition,{timeout:1500});
   assert.deepEqual((await read()).flexibleWeek,saved.flexibleWeek);assert.deepEqual(errors,[]);
   results.push({label,status:'passed',sourceCount:5,partialUnresolved:1,reviewed});console.log(label+' passed');
  }catch(error){await page.screenshot({path:out+'/'+label+'-failure.png'});results.push({label,status:'failed',error:error.message});throw error;}
  finally{await context.close();}
 }
}catch(error){if(!browser)results.push({engine,status:'environment-blocked',error:error.message});throw error;}
finally{await browser?.close();await writeFile(out+'/browser-'+engine+'.json',JSON.stringify(results,null,2));}
