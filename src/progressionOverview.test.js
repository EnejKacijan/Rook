import {it,expect} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {selectProgressionRows,progressionSummary} from './progressionOverview.js';

function historyWith(count) {
  const state=createReturningUserFixture(2);
  state.program=null;
  state.workouts=[{...state.workouts[0],exercises:state.workouts[0].exercises.slice(0,count)}];
  return state;
}

it.each([0,1,4,5,8])('derives %i distinct progression rows from the accepted history scope',count=>{
  const state=historyWith(count),before=structuredClone(state);
  const rows=selectProgressionRows(state);
  expect(rows).toHaveLength(count);
  expect(new Set(rows.map(row=>row.exercise.exerciseId)).size).toBe(count);
  expect(progressionSummary(rows).total).toBe(count);
  expect(state).toEqual(before);
});

it('deduplicates repeated exercise history and refreshes after a set edit or deletion',()=>{
  const state=historyWith(5);
  const repeated=structuredClone(state.workouts[0]);
  repeated.id='earlier-duplicate';
  repeated.completedAt='2026-09-01T10:00:00.000Z';
  state.workouts.unshift(repeated);
  expect(selectProgressionRows(state)).toHaveLength(5);

  const edited=structuredClone(state);
  edited.workouts[1].exercises[0].sets[0].completed=false;
  expect(selectProgressionRows(edited)).toHaveLength(4);

  const deleted=structuredClone(state);
  deleted.workouts.pop();
  expect(selectProgressionRows(deleted)).toHaveLength(5); // Earlier completed session is now latest.
  deleted.workouts=[];
  expect(selectProgressionRows(deleted)).toHaveLength(0);
});

it('does not equate holding with one instruction or reuse it as the full-list count',()=>{
  const rows=[
    ...Array.from({length:17},(_,index)=>({exercise:{exerciseId:`load-${index}`},result:{type:'hold',title:'Repeat this load'}})),
    ...Array.from({length:3},(_,index)=>({exercise:{exerciseId:`confirm-${index}`},result:{type:'hold',title:'Repeat to confirm'}})),
    {exercise:{exerciseId:'progress'},result:{type:'progress',title:'Consider a small increase'}},
  ];
  expect(progressionSummary(rows)).toEqual({
    total:21,
    label:'21 exercises with progression guidance',
    breakdown:'Repeat this load: 17 · Repeat to confirm: 3 · Other next step: 1',
  });
});
