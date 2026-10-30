import {expect,it} from 'vitest';
import {coachActionWithinScope} from './coachIntent.js';
const schedule=count=>({type:'week-schedule-change',changes:Array.from({length:count},()=>({}))});
it.each([
  ['Move Push to Sunday',schedule(1),true],
  ['Move Push to Sunday',schedule(2),false],
  ['Swap Monday and Friday',schedule(2),true],
  ['Swap Monday and Friday',schedule(3),false],
  ['Rearrange my week; I am available Friday and Sunday',schedule(3),true],
  ['Združi oba zamujena treninga',schedule(2),false],
  ['I have an hour today',schedule(2),false],
  ['Can you review my week?',schedule(2),false],
  ['Remove this exercise today',{type:'program-exercise-change'},false],
  ['Remove it from my recurring plan',{type:'program-exercise-change'},true],
  ['Combine Push and Pull',{type:'add-today-workout'},false],
  ['Combine Push and Pull',{type:'combine-workouts'},true],
  ['Explain how to combine workouts',null,true],
])('keeps the requested scope for %s', (message,action,allowed)=>expect(coachActionWithinScope(action,message)).toBe(allowed));
