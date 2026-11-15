import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,buildProgram,deserializeState,exerciseName} from '../src/domain.js';
import {applyTodayAdjustment,createManualTodayPreparation} from '../src/adjustToday.js';
import {applyFlexibleWeek,flexibleSessions,proposeFlexibleWeek} from '../src/flexibleWeek.js';
import {openProfileArea} from './qa-current-navigation.mjs';

const date='2026-10-24';
const origin=process.env.ROOK_QA_URL||'http://127.0.0.1:4400';
const planSource=process.env.ROOK_QA_PLAN_SOURCE;
const out='artifacts/plan-move-recovery';await mkdir(out,{recursive:true});
function fixture(appearance,style){
  let state=blankState();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true,appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance,showExerciseImages:false});
  state.program=buildProgram(state.profile);state.program.trainingBlock.startDate='2026-10-19';state.program.rotationStartDate='2026-10-19';
  if(planSource)state.program.source=planSource;
  state.selectedDate=date;state.selectedDay='Sat';state=deserializeState(state);
  const friday=flexibleSessions(state,date).find(item=>item.originalDate==='2026-10-23');
  const proposal=proposeFlexibleWeek(state,{mode:'move',sessionId:friday.logicalSessionId,toDate:date},date);
  // These are normally set by the saved Move and Adjust Today transactions.
  assert.equal(proposal.status,'ready');
  const move={...proposal, today:date};
  const RealDate=globalThis.Date;
  class FixedDate extends RealDate {constructor(...args){super(...(args.length?args:[`${date}T12:00:00`]));}static now(){return new RealDate(`${date}T12:00:00`).valueOf();}}
  try {
    globalThis.Date=FixedDate;
    const result=applyFlexibleWeek(state,move);assert.equal(result.status,'applied');state=result.state;
    const draft=createManualTodayPreparation(state,date);draft.workout.exercises[0].sets[0].weight=43;
    const edited=applyTodayAdjustment(state,draft);assert.equal(edited.status,'applied');state=edited.state;
  }finally {globalThis.Date=RealDate;}
  const day=state.program.days.find(item=>item.id===friday.workoutId),exercise=day.exercises[0];
  const sets=exercise.sets.map((set,index)=>({...set,id:`prior-set-${index}`,completed:true,weight:61-index,reps:8}));
  state.workouts=[{id:'prior-workout',name:day.name,completedAt:'2026-10-16T12:00:00.000Z',performedDate:'2026-10-16',exercises:[{...exercise,sets}]}];
  return {state,dayId:day.id,entryId:exercise.id,entryName:exerciseName(exercise),prior:sets.map(set=>set.weight)};
}

const browser=await chromium.launch({channel:'chrome'});
try{
  for(const width of [320,390,430])for(const appearance of ['light','dark'])for(const style of ['standard','premium']){
    const scenario=`${width}-${style}-${appearance}`;
    if(process.env.ROOK_QA_CASE&&process.env.ROOK_QA_CASE!==scenario)continue;
    const key=planSource?`${scenario}-${planSource}`:scenario;
    const {state,dayId,entryId,entryName,prior}=fixture(appearance,style);
    const context=await browser.newContext({viewport:{width,height:width===320?650:844},isMobile:true,hasTouch:true,colorScheme:appearance,reducedMotion:'reduce',serviceWorkers:'block'});
    try{
      await context.addInitScript(state=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(state));},state);
      const page=await context.newPage();await page.clock.setFixedTime(new Date(`${date}T12:00:00`));
      await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));const errors=[];page.on('pageerror',error=>errors.push(error.message));
      const button=(name,scope=page)=>scope.getByRole('button',{name,exact:true});
      const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
      await page.goto(origin);
      await button('PROFILE').click();await openProfileArea(page,'program');await page.getByRole('button',{name:/Edit plan/}).click();
      const editor=page.locator('.edit-plan-screen'),entry=editor.locator(`[id="import-exercise-${entryId}"]`);
      await button(`Edit ${entryName}`,entry).click();
      const weights=entry.getByRole('region',{name:`Weights for ${entryName}`});
      await weights.locator('summary').filter({hasText:'Last logged'}).click();
      await weights.getByText(/Set 1 · 61 kg/).waitFor();
      await weights.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${key}-weights.png`});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const storedBefore=await read();
      await button('Use last logged weights',weights).click();await button('Undo weight change',weights).click();
      await button('Use last logged weights',weights).click();
      assert.deepEqual((await read()).program,storedBefore.program,'copy changes only the draft until Save');
      await button('SAVE TO WEEKLY PLAN',editor).click();await editor.waitFor({state:'detached'});
      await button('TODAY').click();
      const review=page.locator('.schedule-attention-open');await review.click();
      const sheet=page.locator('.flexible-week-sheet');await button('Review this move',sheet).click();
      await sheet.locator('summary').filter({hasText:'Your one-off adjustment'}).click();
      await page.screenshot({path:`${out}/${key}-review.png`});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const keepAdjustment=appearance==='dark';
      await button(keepAdjustment?'KEEP DATE AND ADJUSTMENT':'KEEP DATE, USE UPDATED PLAN',sheet).click();
      await sheet.getByText('MOVED',{exact:true}).waitFor();await button('Close Schedule changes',sheet).click();
      await sheet.waitFor({state:'detached'});await review.waitFor({state:'detached'});
      await page.reload();await button('START WORKOUT').waitFor();
      const saved=await read();assert.equal(saved.todayAdaptation?.workout.exercises[0].sets[0].weight,keepAdjustment?43:undefined);
      assert.deepEqual(saved.program.days.find(item=>item.id===dayId).exercises[0].sets.map(set=>set.weight),prior);
      assert.equal(saved.workouts.length,1);assert.deepEqual(errors,[]);
      console.log(`${key}: draft weights/undo, plan save, moved-workout review and reload passed.`);
    }finally{await context.close();}
  }
}finally{await browser.close();}
