import {describe,it,expect} from 'vitest';
import {completionRecognition} from './completionRecognition.js';
const exercise=(weight=70,reps=8,extra={})=>({exerciseId:'bench',sets:[{id:'set',completed:true,weight,reps}],...extra});
const workout=(id='new',extra={})=>({id,completedAt:`2026-09-${id==='new'?'07':'01'}T12:00:00Z`,status:'completed',exercises:[exercise()],...extra});
const options={eligible:()=>true};
const result=(current,prior)=>completionRecognition(current,prior,options);
describe('completion recognition is factual and read-only',()=>{
 it('groups a same-load rep best and an estimated 1RM best from one set',()=>{
  const old=workout('old',{exercises:[exercise(70,7)]});
  const current=workout();
  expect(result(current,[old])).toEqual({type:'pr',byExercise:new Map([[current.exercises[0],[
   {weight:70,reps:8,setIndex:0,previousReps:7,estimate:{current:88.67,previous:86.33}},
  ]]])});
 });
 it('shows a heavier set with more reps against its previous heaviest set',()=>{
  const old=workout('old',{exercises:[exercise(80,8)]});
  const current=workout('new',{exercises:[exercise(85,10)]});
  expect(result(current,[old]).byExercise.get(current.exercises[0])).toEqual([
   {weight:85,reps:10,setIndex:0,previousHeaviest:{weight:80,reps:8},estimate:{current:113.33,previous:101.33}},
  ]);
 });
 it('places the gain on the first eligible winning set when the same load and reps repeat',()=>{
  const old=workout('old',{exercises:[exercise(80,8)]});
  const entry=exercise(85,10);
  const logged=entry.sets[0];
  entry.sets=[{...logged,completed:false},{...logged,setType:'amrap'},logged,{...logged,id:'repeat'}];
  const current=workout('new',{exercises:[entry]});
  expect(result(current,[old]).byExercise.get(entry)).toEqual([
   {weight:85,reps:10,setIndex:2,previousHeaviest:{weight:80,reps:8},estimate:{current:113.33,previous:101.33}},
  ]);
 });
 it('attributes each best to the log row that contains the winning set',()=>{
  const squat={exerciseId:'squat'};
  const old=workout('old',{exercises:[exercise(80,8),exercise(75,8),exercise(65,10),exercise(95,3,squat)]});
  const current=workout('new',{exercises:[
   exercise(85,12),exercise(90,3),exercise(90,5),exercise(75,9),
   exercise(75,10),exercise(65,11),exercise(75,10),exercise(100,4,squat),
  ]});
  const bests=result(current,[old]).byExercise;
  expect(current.exercises.flatMap((entry,index)=>bests.has(entry)?[index]:[])).toEqual([0,2,4,5,7]);
  expect([...bests.values()].map(sets=>sets[0])).toMatchObject([
   {weight:90,reps:5,previousHeaviest:{weight:80,reps:8}},
   {weight:75,reps:10,previousReps:8},
   {weight:65,reps:11,previousReps:10},
   {weight:85,reps:12,estimate:{current:119,previous:101.33}},
   {weight:100,reps:4,previousHeaviest:{weight:95,reps:3}},
  ]);
 });
 it('keeps the best valid estimate even if the heaviest set exceeds the estimate rep range',()=>{
  const current=workout('new',{exercises:[exercise(90,15),exercise(90,10)]});
  const old=workout('old',{exercises:[exercise(80,8)]});
  const bests=result(current,[old]).byExercise;
  expect(bests.get(current.exercises[0])).toEqual([{weight:90,reps:15,setIndex:0,previousHeaviest:{weight:80,reps:8}}]);
  expect(bests.get(current.exercises[1])).toEqual([{weight:90,reps:10,setIndex:0,estimate:{current:120,previous:101.33}}]);
 });
 it('does not award ties or a first exposure, including varying sets',()=>{expect(result(workout(),[workout('old')])).toBeNull();const first=workout();first.exercises[0].sets.push({completed:true,weight:80,reps:8});expect(result(first,[])).toBeNull();});
 it('recognizes only saved comparable sets when a workout ends early',()=>{
  const actual=exercise(85,10);
  actual.sets.push({completed:false,weight:200,reps:10});
  const current=workout('new',{status:'ended-early',endedEarly:true,exercises:[actual]});
  const old=workout('old',{exercises:[exercise(80,8)]});
  expect(result(current,[old]).byExercise.get(actual).map(set=>set.weight)).toEqual([85]);
 });
 it('never recognizes empty, unfinished or imported completions',()=>{for(const patch of [{completedAt:null},{historicalImport:{}},{exercises:[]},{exercises:[{exerciseId:'bench',sets:[{completed:false}]}]}])expect(result(workout('new',patch),[workout('old',{exercises:[exercise(60,7)]})])).toBeNull();});
 it('excludes drop/rest-pause/AMRAP sets and per-side comparisons',()=>{for(const type of ['drop','rest_pause','amrap']){const e=exercise();e.sets[0].setType=type;expect(result(workout('new',{exercises:[e]}),[workout('old',{exercises:[exercise(60,7)]})])).toBeNull();}expect(result(workout('new',{exercises:[exercise(70,8,{loggingMode:'per_side'})]}),[workout('old')])).toBeNull();});
 it('requires explicit catalog eligibility for optional/bodyweight/timed/assisted work',()=>{expect(completionRecognition(workout(),[workout('old',{exercises:[exercise(60,7)]})])).toBeNull();expect(completionRecognition(workout(),[workout('old')],{eligible:()=>false})).toBeNull();});
 it('does not compare a normal log to previous per-side observations',()=>{expect(result(workout(),[workout('old',{exercises:[exercise(60,7,{loggingMode:'per_side'})]})])).toBeNull();});
 it('ignores self/future observations and uses corrected baseline values',()=>{const current=workout();expect(result(current,[current,workout('future',{completedAt:'2026-10-01T12:00:00Z',exercises:[exercise(60,7)]})])).toBeNull();const old=workout('old');expect(result(current,[old])).toBeNull();old.exercises[0].sets[0].reps=7;expect(result(current,[old]).byExercise.get(current.exercises[0])[0].previousReps).toBe(7);});
 it('can use comparable imported prior history without replaying the import',()=>{expect(result(workout(),[workout('old',{historicalImport:{},exercises:[exercise(60,7)]})]).type).toBe('pr');});
 it('shows only exact sparse count thresholds, de-duplicating and ignoring empty history',()=>{const history=Array.from({length:9},(_,i)=>workout(String(i)));expect(result(workout(),history)).toEqual({type:'milestone',count:10,label:'10 workouts logged'});expect(result(workout(),[...history,history[0],workout('empty',{exercises:[]})]).count).toBe(10);expect(result(workout(),history.slice(1))).toBeNull();});
 it('prioritizes records above a milestone without changing history or session',()=>{const history=Array.from({length:9},(_,i)=>workout(String(i),{exercises:[exercise(60,7)]})),current=workout();const before=JSON.stringify({history,current});expect(result(current,history).type).toBe('pr');expect(JSON.stringify({history,current})).toBe(before);expect(result(current,history)).toEqual(result(current,history));});
});
