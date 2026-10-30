import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {FlexibleWeekSheet} from './FlexibleWeekSheet.jsx';
import {ProgramExerciseActionCard,Today} from './App.jsx';
import {combinedReviewChanges} from './CoachCombine.jsx';
import {reviewPrescription} from './reviewPrescription.js';
import {combineExample} from './combineWorkouts.fixture.js';
import {buildCombinedProposal,buildCombinedRevision,combineSources,applyCombinedProposal} from './combineWorkouts.js';
import {temporaryScheduleSummaryState} from './fixtures/temporaryScheduleSummaryState.js';
import {temporaryScheduleReview} from './flexibleWeek.js';
let root,host;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-29T12:00:00'));
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
const Header=({title})=><header>{title}</header>;
function historicalState(){
  const state=temporaryScheduleSummaryState(),sample=Object.values(state.flexibleWeek.sessions)[0];
  for(let i=0;i<8;i++){
    const date=`2026-09-${String(7+i).padStart(2,'0')}`,id=`${sample.workoutId}:${date}`;
    state.flexibleWeek.sessions[id]={...sample,id,originalDate:date,scheduledDate:date,planFingerprint:'old-plan'};
    state.workouts.push({id:`past-${i}`,logicalSessionId:id,completedAt:`${date}T13:00:00`,exercises:[]});
  }
  return state;
}
it('shows current changes first, lazily reveals compact past rows, and never writes during inspection',()=>{
  const state=historicalState(),before=structuredClone(state),update=vi.fn(),write=vi.spyOn(Storage.prototype,'setItem');
  expect(temporaryScheduleReview(state).historical).toHaveLength(8);
  act(()=>root.render(<FlexibleWeekSheet state={state} update={update} close={()=>{}} Header={Header} request={{reviewExisting:true}}/>));
  expect(host.querySelectorAll('[aria-label="Past schedule changes"]')).toHaveLength(0);
  expect(host.querySelectorAll('.flexible-schedule-changes article')).toHaveLength(2);
  expect(host.querySelector('summary').textContent).toBe('Past changes (8)');
  act(()=>host.querySelector('summary').click());
  expect(host.querySelectorAll('[aria-label="Past schedule changes"] article')).toHaveLength(8);
  expect(host.textContent).not.toContain('This change belongs to a previous plan week');
  expect(state).toEqual(before);expect(update).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();
});
it('history-only inspection directly exposes its rows, with no empty group or disabled restore',()=>{
  const state=historicalState();for(const [id,record]of Object.entries(state.flexibleWeek.sessions))if(record.planFingerprint!=='old-plan')delete state.flexibleWeek.sessions[id];
  act(()=>root.render(<FlexibleWeekSheet state={state} update={()=>{}} close={()=>{}} Header={Header} request={{reviewExisting:true}}/>));
  expect(host.querySelector('h1').textContent).toBe('Past changes');
  expect(host.querySelectorAll('[aria-label="Past schedule changes"] article')).toHaveLength(8);
  expect(host.querySelector('summary')).toBeNull();expect(host.textContent).not.toContain('EDIT SCHEDULE');expect(host.textContent).not.toContain('Restore');
});
it('Today keeps the inline move link without a persistent success notice',()=>{
  vi.setSystemTime(new Date('2026-10-01T12:00:00'));const state=temporaryScheduleSummaryState();state.selectedDate='2026-10-01';
  const view=vi.fn();act(()=>root.render(<Today state={state} update={()=>{}} setDetail={view} setPage={()=>{}}/>));
  expect(host.querySelector('.temporary-schedule-summary')).toBeNull();
  const open=[...host.querySelectorAll('button')].find(button=>button.textContent==='View change');expect(open).toBeDefined();act(()=>open.click());
  expect(view.mock.calls[0][0].flexibleWeek).toMatchObject({reviewExisting:true,focusSessionId:expect.any(String)});
});
it('recurring change preview shows the canonical targets without mutating the plan',()=>{
  const state=temporaryScheduleSummaryState(),day=state.program.days[0],before=structuredClone(state),accept=vi.fn();
  const action={type:'program-exercise-change',changes:[{workoutId:day.id,addExerciseIds:['plank'],removeExerciseIds:[]}]};
  act(()=>root.render(<ProgramExerciseActionCard state={state} action={action} onAccept={accept}/>));
  expect(host.textContent).toContain('Weekly plan · Updates future workouts');expect(host.querySelector('.program-change-add small').textContent).toMatch(/sets.*sec/);
  expect(state).toEqual(before);expect(accept).not.toHaveBeenCalled();
});
it('initial combinations compare both sources, while revisions show changes from the accepted workout',()=>{
  vi.setSystemTime(new Date('2026-09-12T12:00:00'));let state=combineExample();
  const initial=buildCombinedProposal(state,{sourceIds:combineSources(state).filter(source=>source.status==='missed').map(source=>source.logicalSessionId),minutes:45}).proposal;
  const initialRows=combinedReviewChanges(state,initial),all=state.program.days.flatMap(day=>day.exercises);
  const omitted=all.filter(exercise=>!initial.workout.exercises.some(after=>after.exerciseId===exercise.exerciseId));
  expect(omitted.length).toBeGreaterThan(0);
  for(const exercise of omitted)expect(initialRows).toContainEqual(expect.objectContaining({id:exercise.exerciseId,detail:'Omitted today'}));
  state=applyCombinedProposal(state,initial,()=>true);
  const proposal=buildCombinedRevision(state,{base:state.todayAdaptation,minutes:60}).proposal,rows=combinedReviewChanges(state,proposal);
  const changed=proposal.workout.exercises.filter(after=>initial.workout.exercises.find(before=>before.id===after.id)?.sets.length!==after.sets.length);
  expect(changed.length).toBeGreaterThan(0);
  for(const exercise of changed){const before=initial.workout.exercises.find(item=>item.id===exercise.id);if(before)expect(rows).toContainEqual(expect.objectContaining({id:exercise.id,detail:`${before.sets.length} → ${exercise.sets.length} sets`}));}
  expect(rows.some(row=>row.detail==='Omitted today')).toBe(false);expect(proposal.sourceSessions).toEqual(initial.sourceSessions);
});
it('combined review hides unchanged targets but exposes a changed rest prescription',()=>{
  vi.setSystemTime(new Date('2026-09-12T12:00:00'));const state=combineExample();
  const proposal=buildCombinedProposal(state,{sourceIds:combineSources(state).filter(source=>source.status==='missed').map(source=>source.logicalSessionId),minutes:45}).proposal;
  const exercise=proposal.workout.exercises[0],id=exercise.exerciseId;
  expect(combinedReviewChanges(state,proposal).find(row=>row.id===id).targets).toBeUndefined();
  exercise.restSeconds+=30;
  expect(combinedReviewChanges(state,proposal).find(row=>row.id===id).targets).toContain('150 sec rest');
});
it('compact prescriptions retain distinct set loads and target units',()=>{
  const exercise={exerciseId:'barbell-bench-press',repMin:8,repMax:8,targetRir:2,sets:[{reps:8,weight:40},{reps:8,weight:35}]};
  const text=reviewPrescription(exercise,{units:'kg'});expect(text).toContain('Set 1:');expect(text).toContain('40 kg');expect(text).toContain('35 kg');expect(text).toContain('2 RIR');
  expect(reviewPrescription({...exercise,sets:[{reps:8,weight:null}]})).not.toContain('Load not specified');
});
