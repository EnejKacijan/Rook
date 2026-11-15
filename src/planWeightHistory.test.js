import {expect,it} from 'vitest';
import {planWeightHistory} from './planWeightHistory.js';

const set=(weight,extra={})=>({weight,reps:8,completed:true,...extra});
const exercise=(sets,extra={})=>({id:'entry',exerciseId:'barbell-bench-press',sets,...extra});
const workout=(day,entry,id=day)=>({id,completedAt:`${day}T12:00:00Z`,exercises:[entry]});

it('orders performed history, ignores other variants and copies mixed loads with exact precision',()=>{
  const plan=exercise([set(40),set(40)]);
  const history=[workout('2026-10-12',exercise([set(62.37),set(60)])),workout('2026-10-01',exercise([set(51),set(49)])),
    workout('2026-10-13',exercise([set(75)],{exerciseId:'dumbbell-bench-press'}))];
  const result=planWeightHistory(history,plan);
  expect(result.rows.map(row=>row.date)).toEqual(['2026-10-12','2026-10-01']);
  expect(result.reusable).toEqual([62.37,60]);
  expect(plan.sets.map(set=>set.weight)).toEqual([40,40]);
});

it.each([
  [set(45)],
  [set(45),set(null)],
  [set(45),set(42,{completed:false})],
  [set(45),set(42,{rawImport:{version:2,loadKind:'assisted'}})],
  [set(45),set(42,{setType:'drop'})],
])('keeps incomplete or incompatible working loads for reference only (%j)',(...sets)=>{
  const result=planWeightHistory([workout('2026-10-13',exercise(sets))],exercise([set(40),set(40)]));
  expect(result.rows).toHaveLength(1);
  expect(result.reusable).toBeNull();
});

it('does not suggest unilateral loads across sides or auto-match ambiguous entries in one workout',()=>{
  const sides={left:{weight:20,reps:8,completed:true},right:{weight:25,reps:8,completed:true}};
  const previous=exercise([set(null,{sides})],{loggingMode:'per_side'});
  const plan=exercise([set(null)],{loggingMode:'per_side'});
  expect(planWeightHistory([workout('2026-10-13',previous)],plan)).toMatchObject({rows:[{entry:previous}],reusable:null});
  const ambiguous=workout('2026-10-13',{...previous,id:'first'});
  ambiguous.exercises.push({...previous,id:'second'});
  expect(planWeightHistory([ambiguous],plan).rows).toEqual([]);
});
