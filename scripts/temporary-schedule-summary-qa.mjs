import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright-core';
import {temporaryScheduleSummaryState} from '../src/fixtures/temporaryScheduleSummaryState.js';
import {openAdjustWeek} from './qa-current-navigation.mjs';

const origin=process.env.ROOK_QA_URL||'http://127.0.0.1:4273',engine=process.env.ROOK_QA_BROWSER||'chrome';
const out='artifacts/temporary-schedule-summary',results=[];await mkdir(out,{recursive:true});
const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
const settle=page=>page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
try{
 for(const width of [320,390,430])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
  const label=`${width}-${style}-${appearance}`,reduce=width===320;
  if(process.env.ROOK_QA_CASE&&process.env.ROOK_QA_CASE!==label)continue;
  const state=temporaryScheduleSummaryState();Object.assign(state.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:reduce?'reduce':'no-preference'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await context.addInitScript(state=>{
    const RealDate=Date,fixed=RealDate.parse('2026-09-29T12:00:00');
    window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
    if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(state));
   },state);
   await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
   const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
   const load=async()=>{await page.reload();await page.locator('.today-hero').waitFor();};
   const inject=async value=>{await page.evaluate(value=>localStorage.setItem('lift-v2-state',JSON.stringify(value)),value);await load();};
   const summary=page.locator('.temporary-schedule-summary'),region=page.locator('.temporary-schedule-disclosure');
   await page.goto(origin);await summary.waitFor();await settle(page);
   // The mocked startup capability request is independent of Hide. Establish
   // its settled state before comparing the complete persisted snapshot.
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state'))?.ai?.available===false);
   const before=await read();assert.match(await summary.innerText(),/2 workouts moved/);assert.doesNotMatch(await summary.innerText(),/REVIEW/);
   assert.equal(await page.locator('html').getAttribute('data-style'),style);assert.equal(await page.locator('html').getAttribute('data-appearance'),appearance);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const targets=await summary.locator('button').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));
   targets.forEach(b=>assert.ok(b.w>=44&&b.h>=44));
   if(width===390)await page.screenshot({path:`${out}/${engine}-${label}-valid.png`});
   await summary.getByRole('button',{name:'View schedule',exact:true}).click();
   assert.match(await page.locator('.flexible-week-sheet').innerText(),/All moved workouts have a destination. No action is needed./);
   assert.equal(await page.locator('.flexible-week-sheet h1').innerText(),'Temporary schedule');
   await page.getByRole('button',{name:'DONE',exact:true}).click();await page.locator('.modal-layer').waitFor({state:'detached'});
   assert.equal(await summary.isVisible(),true);assert.deepEqual((await read()).flexibleWeek,before.flexibleWeek);
   // Exercise the actual Hide handler, pause its real WAAPI animation, then
   // sample measured height and following content at deterministic times.
   const motion=await page.evaluate(async()=>{
    const node=document.querySelector('.temporary-schedule-disclosure');
    const below=node.nextElementSibling||node.parentElement.querySelector('.today-hero');
    const top=()=>below.getBoundingClientRect().top;
    const initial={height:node.getBoundingClientRect().height,below:top(),week:document.querySelector('.week-strip').getBoundingClientRect().top};
    node.querySelector('[aria-label="Hide temporary schedule summary"]').click();await new Promise(r=>requestAnimationFrame(r));
    const animations=node.getAnimations();animations.forEach(a=>a.pause());const samples=[];
    for(const time of [0,40,100,180]){animations.forEach(a=>a.currentTime=time);samples.push({time,height:node.getBoundingClientRect().height,below:top()});}
    const durations=animations.map(a=>a.effect.getTiming().duration);animations.forEach(a=>a.play());return {initial,samples,durations};
   });
   if(reduce)assert.equal(motion.durations.length,0);
   else{assert.ok(motion.durations.includes(200));for(let i=1;i<motion.samples.length;i++){
    assert.ok(motion.samples[i].height<motion.samples[i-1].height,'continuous height collapse');
    assert.ok(motion.samples[i].below<motion.samples[i-1].below,'following content moves continuously');
   }}
   await settle(page);await summary.waitFor({state:'detached'});
   assert.equal((await region.boundingBox()).height,0);
   const hidden=await read();assert.deepEqual({...hidden,dismissedTemporarySchedule:null},{...before,dismissedTemporarySchedule:null});
   await load();assert.equal(await summary.count(),0);
   // The same management entry remains reachable, without adding navigation.
   await openAdjustWeek(page);await page.getByRole('button',{name:/View current schedule/}).click();
   assert.match(await page.locator('.flexible-week-sheet').innerText(),/No action is needed/);
   await page.getByRole('button',{name:'DONE',exact:true}).click();await page.locator('.modal-layer').waitFor({state:'detached'});
   assert.equal(await summary.count(),0);
   await openAdjustWeek(page);await page.getByRole('button',{name:/My available days changed/}).click();
   const dates=['2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03'];
   const selected=await page.locator('[data-available-date][aria-pressed="true"]').evaluateAll(nodes=>nodes.map(n=>n.dataset.availableDate));
   for(const date of selected)if(!dates.includes(date))await page.locator(`[data-available-date="${date}"]`).click();
   for(const date of dates)if(!selected.includes(date))await page.locator(`[data-available-date="${date}"]`).click();
   await page.getByRole('button',{name:'REVIEW SCHEDULE',exact:true}).click();await page.getByRole('button',{name:'USE THIS SCHEDULE',exact:true}).click();
   await page.locator('.modal-layer').waitFor({state:'detached'});await summary.waitFor();
   const changed=await read();assert.equal(changed.flexibleWeek.revision,hidden.flexibleWeek.revision+1);
   await summary.getByRole('button',{name:'Hide temporary schedule summary',exact:true}).click();await settle(page);await summary.waitFor({state:'detached'});
   const hiddenNew=await read(),unresolved=structuredClone(hiddenNew);
   Object.values(unresolved.flexibleWeek.sessions)[0].planFingerprint='synthetic-stale-reference';await inject(unresolved);
   await summary.waitFor();assert.match(await summary.innerText(),/1 workout still needs a date/);assert.match(await summary.innerText(),/SCHEDULE NEEDS ATTENTION/);
   assert.equal(await summary.getByRole('button',{name:'Hide temporary schedule summary',exact:true}).count(),0);
   if(width===390&&appearance==='dark')await page.screenshot({path:`${out}/${engine}-${label}-unresolved.png`});
   await summary.getByRole('button',{name:'REVIEW SCHEDULE',exact:true}).click();assert.match(await page.locator('.flexible-week-sheet').innerText(),/1 workout needs attention/);
   await page.getByRole('button',{name:'DONE',exact:true}).click();await page.locator('.modal-layer').waitFor({state:'detached'});
   await inject({...hiddenNew,flexibleWeek:null});assert.equal(await region.count(),0);
   const recreated=structuredClone(hiddenNew);Object.values(recreated.flexibleWeek.sessions).forEach(record=>record.updatedAt='2026-09-29T15:00:00.000Z');
   await inject(recreated);await summary.waitFor();assert.match(await summary.innerText(),/View schedule/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
   results.push({label,status:'passed',reduce,motion});console.log(`${engine} ${label} passed`);
  }catch(error){await page.screenshot({path:`${out}/${engine}-${label}-failure.png`});results.push({label,status:'failed',error:error.message});throw error;}
  finally{await context.close();}
 }
}finally{await browser.close();await writeFile(`${out}/${engine}.json`,JSON.stringify(results,null,2));}
