import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState,buildProgram,isoDay,weekday } from '../src/domain.js';
import { prescribeTrainingBlockWorkout,advanceTrainingBlockAfterWorkout,resolveTrainingBlockSkips } from '../src/trainingBlocks.js';
import { normalizePlanHistoryState } from '../src/planHistory.js';
import { normalizeGymProfilesState } from '../src/gymProfiles.js';
import { nextBlockReplacementChoices,proposeNextBlock,applyNextBlock } from '../src/blockReview.js';
import { buildBackupArchive,parseBackupArchive } from '../src/backup.js';
const out='artifacts/block-review';await mkdir(out,{recursive:true});
function fixture({lowData=false,replacement=false,appearance='light',style='standard'}={}){
 const s=blankState();Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true,rirEnabled:true,appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});s.program=buildProgram(s.profile);s.program.trainingBlock.startDate='2026-07-27';normalizeGymProfilesState(s);normalizePlanHistoryState(s,'2026-07-27T08:00:00Z');
 const b=s.program.trainingBlock;for(const week of b.weeks){b.currentWeek=week.weekNumber;for(const [index,day] of s.program.days.entries()){
 const w=prescribeTrainingBlockWorkout(s,day),date=new Date('2026-07-27T12:00:00Z');date.setUTCDate(date.getUTCDate()+(week.weekNumber-1)*7+index*2);s.workouts.push({...w,id:`history-${week.weekNumber}-${index}`,programDayId:day.id,completedAt:date.toISOString(),canonicalPlanDate:date.toISOString().slice(0,10),sourcePlanSlotId:w.trainingBlock.blockWorkoutId,flexibleWeekMoved:week.weekNumber===2,exercises:w.exercises.map(e=>({...e,sets:e.sets.map(set=>({...set,weight:60,reps:e.repMax,rir:e.targetRir,planned:true,completed:!lowData||week.weekNumber===1}))})),endedEarly:lowData&&week.weekNumber!==1});}}
 if(replacement){const day=s.program.days[0],exercise=day.exercises[0],candidate=nextBlockReplacementChoices(s,exercise)[0];assert.ok(candidate);for(const w of s.workouts.filter(w=>w.programDayId===day.id&&!w.trainingBlock.plannedDeload).slice(0,4))w.exercises.find(e=>e.id===exercise.id).exerciseId=candidate.id;}
 advanceTrainingBlockAfterWorkout(s,s.workouts.at(-1));s.selectedDate=isoDay();s.selectedDay=weekday();return s;
}
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
try{
for(const width of process.env.ROOK_QA_EXTRAS_ONLY?[]:[320,390,430])for(const appearance of ['light','dark'])for(const style of ['standard','premium']){
 const seed=fixture({appearance,style,replacement:true}),errors=[];
 const context=await browser.newContext({viewport:{width,height:844},colorScheme:appearance,serviceWorkers:'block'});await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},seed);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
 const shot=async name=>{await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${out}/${width}-${style}-${appearance}-${name}.png`});};
 await shot('01-complete-entry');await page.getByRole('button',{name:'REVIEW BLOCK',exact:true}).click();await shot('02-summary');
 await page.getByRole('button',{name:'Exercise outcomes',exact:true}).click();await shot('03-outcomes');await page.getByRole('button',{name:'Back',exact:true}).click();
 await page.getByRole('button',{name:'REVIEW NEXT BLOCK',exact:true}).click();await shot('04-next-review');
 const replacement=page.locator('.block-next-change').filter({has:page.getByRole('button',{name:'Choose another replacement',exact:true})}).first();await replacement.scrollIntoViewIfNeeded();await shot('05-replacement-keep');
 assert.equal(await replacement.getByRole('radio',{name:'Keep current',exact:true}).isChecked(),true);
 await replacement.getByRole('button',{name:'Choose another replacement',exact:true}).click();await shot('06-replacement-search');const searchBox=await page.getByRole('searchbox',{name:'Search next-block replacements'}).boundingBox();assert.ok(searchBox.height>=48&&searchBox.height<=52,'single-line mobile search height');await page.locator('.block-review-sheet .choice-row').first().click();
 const screen=page.locator('.block-review-sheet');await screen.evaluate(el=>el.scrollTop=el.scrollHeight);await shot('07-long-review-bottom');
 const footer=page.locator('.block-review-sheet .flexible-week-footer');const last=page.locator('.block-next-content > p').last();assert.ok((await last.boundingBox()).y+(await last.boundingBox()).height <=(await footer.boundingBox()).y+2,'last review explanation clears footer');
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));await page.getByRole('button',{name:'START NEXT BLOCK',exact:true}).click();await shot('08-new-block');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.equal(saved.program.trainingBlock.currentWeek,1);assert.notEqual(saved.program.trainingBlock.id,before.program.trainingBlock.id);assert.equal(saved.planVersions.length,before.planVersions.length+1);assert.deepEqual(saved.workouts,before.workouts);
 await page.reload({waitUntil:'networkidle'});assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')))).program.trainingBlock.id,saved.program.trainingBlock.id);
 await page.getByRole('button',{name:'PROFILE',exact:true}).click();await page.getByRole('button',{name:/Training block/}).click();await page.locator('.training-block-history-count .list-row').first().click();await shot('09-old-block');assert.equal(await page.getByRole('button',{name:'START NEXT BLOCK',exact:true}).count(),0);assert.deepEqual(errors,[]);await context.close();console.log(`${width} ${style} ${appearance}: review, replacement, apply/reload and historical block passed`);
}
for(const scenario of ['insufficient','persistence','stale','offline','repeat']){
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),seed=fixture({lowData:scenario==='insufficient'});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},seed);
 const page=await context.newPage();await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});await page.getByRole('button',{name:'REVIEW BLOCK',exact:true}).click();
 if(scenario==='offline')await context.setOffline(true);
 await page.getByRole('button',{name:scenario==='repeat'?'REPEAT BLOCK':'REVIEW NEXT BLOCK',exact:true}).click();
 if(scenario==='persistence')await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('QA quota','QuotaExceededError');};});
 if(scenario==='stale'){
  // Review regeneration on a different day is also a stale proposal.
  await page.clock.install({time:new Date(Date.now()+86400000*8)});
 }
 if(scenario==='persistence'||scenario==='stale'){await page.getByRole('button',{name:'START NEXT BLOCK',exact:true}).click();await page.getByRole('alert').waitFor();const alertBox=await page.getByRole('alert').boundingBox();assert.ok(alertBox.y>=0&&alertBox.y+alertBox.height<844,'failure explanation is immediately visible');assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')))).program.trainingBlock.id,seed.program.trainingBlock.id);}
 await page.waitForTimeout(350);await page.screenshot({path:`${out}/390-${scenario}.png`});
 if(scenario==='offline'||scenario==='repeat') {await page.getByRole('button',{name:'START NEXT BLOCK',exact:true}).click();assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')))).program.trainingBlock.currentWeek,1);}
 await context.close();console.log(`${scenario}: passed`);
}
for(const scenario of ['not-now','active']){
 const seed=fixture();if(scenario==='active')seed.activeWorkout={...structuredClone(seed.workouts.at(-1)),id:'active-qa',completedAt:null};
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),seed);const page=await context.newPage();await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'PROFILE',exact:true}).click();await page.getByRole('button',{name:/Training block/}).click();await page.getByRole('button',{name:'REVIEW BLOCK',exact:true}).click();
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 if(scenario==='not-now'){await page.getByRole('button',{name:'NOT NOW',exact:true}).click();const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.deepEqual(after.program,before.program);assert.deepEqual(after.planVersions,before.planVersions);}
 else{await page.getByRole('button',{name:'REVIEW NEXT BLOCK',exact:true}).click();assert.equal(await page.getByRole('button',{name:'START NEXT BLOCK',exact:true}).isDisabled(),true);await page.getByText('Finish the active workout before starting the next block.',{exact:true}).waitFor();}
 await page.waitForTimeout(350);await page.screenshot({path:`${out}/390-${scenario}.png`});await context.close();console.log(`${scenario}: passed`);
}
for(const applied of [false,true]){
 let seed=fixture();if(applied)seed=applyNextBlock(seed,proposeNextBlock(seed)).state;
 const archive=await buildBackupArchive(seed,[]),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
 await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
 await page.locator('.restore-backup-action').click();await page.getByLabel('Choose ROOK backup file').setInputFiles({name:'block-review-backup.zip',mimeType:'application/zip',buffer:Buffer.from(archive.bytes)});
 await page.getByRole('button',{name:'RESTORE BACKUP',exact:true}).click();
 await page.waitForFunction(id=>JSON.parse(localStorage.getItem('lift-v2-state')||'{}').program?.trainingBlock?.id===id,seed.program.trainingBlock.id);
 const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state'))),durable=JSON.parse(JSON.stringify((await parseBackupArchive(archive.bytes)).state));assert.deepEqual(restored.program.trainingBlock,durable.program.trainingBlock);assert.deepEqual(restored.completedTrainingBlocks,durable.completedTrainingBlocks);assert.deepEqual(restored.workouts,durable.workouts);
 await page.screenshot({path:`${out}/390-clean-restore-${applied?'applied':'pending'}.png`});await context.close();console.log(`clean device ZIP restore ${applied?'applied':'pending'}: passed`);
}
for(const scenario of ['final-pending','final-carried','final-skipped','long-names']){
 const seed=fixture(),block=seed.program.trainingBlock;
 if(scenario!=='long-names'){
  const last=seed.workouts.pop();block.completed=false;block.completedAt=null;seed.completedTrainingBlocks=[];
  if(scenario==='final-carried'){last.flexibleWeekMoved=true;last.completedAt='2026-09-08T12:00:00Z';seed.workouts.push(last);advanceTrainingBlockAfterWorkout(seed,last);}
  if(scenario==='final-skipped')resolveTrainingBlockSkips(seed,[{id:'qa-skip',blockId:block.id,blockWeekNumber:6,workoutId:last.programDayId,skipped:true,originalDate:'2026-09-04'}]);
 }else{block.name='Full Body Strength and Hypertrophy — Carefully Reviewed Long Block Name';seed.program.days[0].name='Monday Upper Body and Posterior Chain — Long Workout Name';}
 const width=scenario==='long-names'?320:390,context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),seed);const page=await context.newPage();await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
 if(scenario==='final-pending'){assert.equal(await page.getByRole('button',{name:'REVIEW BLOCK',exact:true}).count(),0);await page.screenshot({path:`${out}/390-final-week-today.png`});await page.getByRole('button',{name:'PROFILE',exact:true}).click();await page.getByRole('button',{name:/Training block/}).click();}
 else await page.getByRole('button',{name:'REVIEW BLOCK',exact:true}).click();
 await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${out}/${width}-${scenario}.png`});await context.close();console.log(`${scenario}: passed`);
}
}finally{await browser.close();}
