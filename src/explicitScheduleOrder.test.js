import {it,expect} from 'vitest';
import {blankState,buildProgram,deserializeState} from './domain.js';
import {moveWorkoutThroughWeek} from './planReorder.js';
it('retains an explicitly reordered generated week through reload without touching history',()=>{
 let s=blankState();Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:5,availableDays:['Mon','Tue','Wed','Thu','Fri'],environment:'Commercial gym',equipment:['full gym']});s.program=buildProgram(s.profile);s=deserializeState(s);
 s.program.days=moveWorkoutThroughWeek(s.program.days,s.program.days[0].id,4);s.program.scheduleOrderEdited=true;s.program.userEdited=true;
 const expected=s.program.days.map(d=>[d.id,d.weekday,d.exercises]);const restored=deserializeState(JSON.stringify(s));
 expect(restored.program.days.map(d=>[d.id,d.weekday,d.exercises])).toEqual(JSON.parse(JSON.stringify(expected)));
 expect(restored.workouts).toEqual(s.workouts);
});
