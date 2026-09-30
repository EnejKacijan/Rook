import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright-core';
import {blankState,buildProgram,isoDay,startWorkout,weekday} from '../src/domain.js';

const url=process.env.ROOK_QA_URL||'http://127.0.0.1:4273';
const today=weekday();
const fixture=()=>{
 const state=blankState();
 Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,
  availableDays:[today,...['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].filter(day=>day!==today).slice(0,2)],
  sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],
  onboardingComplete:true,rirEnabled:true,restTimerEnabled:false,recommendedWarmupsEnabled:false});
 state.program=buildProgram(state.profile);state.selectedDate=isoDay();state.selectedDay=today;
 state.activeWorkout=startWorkout(state,state.program.days.find(day=>day.weekday===today));
 state.activeWorkout.exercises=state.activeWorkout.exercises.slice(0,3);
 return state;
};

for(const [engine,browserType,options] of [
 ['Chrome',chromium,{channel:'chrome',headless:true}],
 ['WebKit',webkit,{headless:true}],
]){
 const browser=await browserType.launch(options);
 try{
  for(const width of [320,390]){
   const initial=fixture(),first=initial.activeWorkout.exercises[0].id,second=initial.activeWorkout.exercises[1].id;
   const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
   await context.addInitScript(state=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(state));},initial);
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(url,{waitUntil:'networkidle'});
   await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();
   const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
   const originalProgram=(await stored()).program;
   await page.getByRole('button',{name:'Exercise options',exact:true}).click();
   await page.getByRole('button',{name:'Move to Up Next',exact:true}).click();
   assert.deepEqual((await stored()).activeWorkout.exercises.slice(0,2).map(entry=>entry.id),[second,first]);
   await page.reload({waitUntil:'networkidle'});
   await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();
   assert.deepEqual((await stored()).activeWorkout.exercises.slice(0,2).map(entry=>entry.id),[second,first]);
   await page.getByRole('button',{name:'Exercise options',exact:true}).click();
   await page.getByRole('button',{name:'Remove from this workout',exact:true}).click();
   assert.equal((await stored()).activeWorkout.exercises[0].id,first);
   await page.getByRole('button',{name:'Undo',exact:true}).click();
   assert.equal((await stored()).activeWorkout.exercises[0].id,second);
   assert.deepEqual((await stored()).program,originalProgram);
   assert.deepEqual(errors,[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   console.log(`${engine} ${width}: current move, reload, remove, Undo, plan isolation OK`);
   await context.close();
  }
 }finally{await browser.close();}
}
