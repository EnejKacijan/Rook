import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,buildProgram} from '../src/domain.js';
import {missedFlexibleSessions,flexibleSessions} from '../src/flexibleWeek.js';
const today='2026-09-08',out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';await mkdir(out,{recursive:true});
const b=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const s=blankState();Object.assign(s.profile,{onboardingComplete:true,daysPerWeek:2,availableDays:['Mon','Thu'],goal:'Build muscle',experience:'Intermediate',environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],sessionMinutes:60,appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});s.program=buildProgram(s.profile);s.program.trainingBlock.startDate='2026-09-07';s.selectedDate=today;s.selectedDay='Tue';
 s.program.days.forEach(d=>d.exercises.forEach(e=>{e.loggingMode='normal';e.sets?.forEach(set=>set.weightProvenance=null);}));
 const c=await b.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});const p=await c.newPage();await p.clock.setFixedTime(new Date('2026-09-08T12:00:00'));
 await c.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},s);await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');
 const stored=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));const before=await stored(),id=missedFlexibleSessions(before,today)[0].logicalSessionId;
 const entry=p.getByRole('button',{name:'Reschedule missed session',exact:true});await entry.click();await p.locator('[data-move-date]').first().click();await p.getByRole('heading',{name:'Review your schedule',exact:true}).waitFor();assert.deepEqual((await stored()).flexibleWeek,before.flexibleWeek);await p.getByRole('button',{name:'CANCEL',exact:true}).click();await p.locator('.flexible-week-sheet').waitFor({state:'detached'});
 await entry.click();
 if(width===320){await p.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='lift-v2-state')throw new Error('QA storage failure');return window.originalSetItem.call(this,k,v);};});await p.getByRole('button',{name:'Skip this session',exact:true}).click();await p.getByRole('alert').filter({hasText:'still missed'}).waitFor();assert.deepEqual((await stored()).flexibleWeek,before.flexibleWeek);await p.evaluate(()=>Storage.prototype.setItem=window.originalSetItem);}
 await p.getByRole('button',{name:'Skip this session',exact:true}).click();await p.locator('.flexible-week-sheet').waitFor({state:'detached'});assert.equal(await entry.count(),0);assert.equal(await p.getByRole('button',{name:'USE THIS SCHEDULE',exact:true}).count(),0);
 await p.screenshot({path:`${out}/missed-skip-${width}-${style}-${appearance}.png`});await p.reload();await p.locator('.today-screen').waitFor();const after=await stored();assert.equal(missedFlexibleSessions(after,today).length,0);assert.deepEqual(after.program,before.program);assert.deepEqual(after.workouts,before.workouts);assert.deepEqual(after.profile,before.profile);
 const others=s=>flexibleSessions(s,today).filter(r=>r.logicalSessionId!==id).map(r=>[r.logicalSessionId,r.scheduledDate]);assert.deepEqual(others(after),others(before));assert.equal(await entry.count(),0);
 console.log(`PASS ${width} ${style} ${appearance}: direct skip, reload, isolation, move review${width===320?', failure/retry':''}`);await c.close();
}}finally{await b.close();}
