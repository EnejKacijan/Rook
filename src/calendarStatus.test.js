import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {calendarDayPresentation,calendarDayStates,compactCalendarMarkers} from './workoutCalendar.js';
import {calendarStatusFixture,calendarStatusDate as day} from './calendarStatus.fixture.js';
import {flexibleOccurrenceForDate,proposeFlexibleWeek,applyFlexibleWeek} from './flexibleWeek.js';
import {startWorkout,completeWorkout,plannedWorkoutForDate,deserializeState,serializeState,adaptedTemplateForToday} from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';
import {buildCombinedProposal,applyCombinedProposal} from './combineWorkouts.js';
import {completedWorkoutsForDate} from './completedWorkoutsForDate.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date(`${day}T12:00:00`));});
afterEach(()=>vi.useRealTimers());
const present=(state,date=day)=>calendarDayPresentation(state,[date])[date];
it.each([
  [[],[]],[['planned'],['planned']],[['missed'],['planned']],
  [['missed','planned','completed'],['completed']],[['completed','active','planned','missed'],['active']],
])('chooses one visual priority independent of status order: %j',(statuses,expected)=>{
  const before=[...statuses];expect(compactCalendarMarkers(statuses)).toEqual(expected);expect(statuses).toEqual(before);
});
it.each([['completed-freestyle',1],['multiple-completed',2]])('retains completed + independent planned, then missed truth for %s',(kind,count)=>{
  const state=calendarStatusFixture(kind),before=JSON.stringify(state),occurrence=flexibleOccurrenceForDate(state,day);
  expect(present(state)).toMatchObject({markers:['completed'],statuses:['completed','planned'],counts:{active:0,completed:count,planned:1,missed:0}});
  expect(flexibleOccurrenceForDate(state,day)).toEqual(occurrence);
  vi.setSystemTime(new Date('2026-09-22T12:00:00'));
  expect(present(state)).toMatchObject({markers:['completed'],statuses:['completed','missed'],counts:{active:0,completed:count,planned:0,missed:1},label:`${count} completed workout${count===1?'':'s'}, 1 missed workout`});
  expect(flexibleOccurrenceForDate(state,day)).toMatchObject({logicalSessionId:occurrence.logicalSessionId,status:'missed',completedWorkout:null});
  expect(completedWorkoutsForDate(state.workouts,day)).toHaveLength(count);expect(JSON.stringify(state)).toBe(before);
});
it('counts four completed executions under one active dot, then falls back on finish',()=>{
  let state=calendarStatusFixture('multiple-completed');
  const finish=()=>{
    Object.assign(state.activeWorkout.exercises[0].sets[0],{completed:true,reps:45});state=completeWorkout(state);
  };
  for(let i=0;i<2;i++){state=addFreestyleExercise(startFreestyleWorkout(state),'plank');finish();}
  state=addFreestyleExercise(startFreestyleWorkout(state),'plank');
  const history=structuredClone(state.workouts),before=JSON.stringify(state);
  expect(present(state)).toMatchObject({markers:['active'],counts:{active:1,completed:4,planned:1,missed:0},label:'1 workout in progress, 4 completed workouts, 1 planned workout'});
  expect(state.workouts).toEqual(history);expect(JSON.stringify(state)).toBe(before);
  finish();expect(present(state)).toMatchObject({markers:['completed'],counts:{active:0,completed:5,planned:1,missed:0}});
  expect(state.workouts.filter(w=>history.some(prior=>prior.id===w.id))).toEqual(history);
});
it('keeps the existing missed-only ring with a truthful accessible description',()=>{
  const state=calendarStatusFixture();vi.setSystemTime(new Date('2026-09-22T12:00:00'));
  expect(present(state)).toMatchObject({markers:['planned'],statuses:['missed'],counts:{active:0,completed:0,planned:0,missed:1},label:'1 missed workout'});
});
it('Thu Sep 24 performed Sat Sep 26 fulfils the source once, while independent Thursday work retains its own credit',()=>{
 vi.setSystemTime(new Date('2026-09-26T12:00:00'));
 let s=createReturningUserFixture(0);s.program.trainingBlock.startDate='2026-09-14';s.workouts=[];s.selectedDate='2026-09-24';
 const source=flexibleOccurrenceForDate(s,s.selectedDate);expect(source.status).toBe('missed');
 s.activeWorkout=startWorkout(s,plannedWorkoutForDate(s,s.selectedDate));
 s.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>Object.assign(set,{completed:true,reps:8,weight:20})));
 s=completeWorkout(s);const original=JSON.stringify(s);
 expect(flexibleOccurrenceForDate(s,'2026-09-24')).toMatchObject({status:'completed',logicalSessionId:source.logicalSessionId});
 expect(present(s,'2026-09-24').markers).not.toContain('completed');expect(present(s,'2026-09-24').markers).not.toContain('planned');
 expect(present(s,'2026-09-26').markers).toContain('completed');
 expect(completedWorkoutsForDate(s.workouts,'2026-09-24')).toHaveLength(0);expect(completedWorkoutsForDate(s.workouts,'2026-09-26')).toHaveLength(1);
 expect(JSON.stringify(s)).toBe(original);
 s.workouts.push({id:'independent-thursday',source:'freestyle',name:s.workouts[0].name,startedAt:'2026-09-24T12:00:00',completedAt:'2026-09-24T13:00:00',exercises:[]});
 expect(present(s,'2026-09-24').markers).toContain('completed');expect(completedWorkoutsForDate(s.workouts,'2026-09-24')).toHaveLength(1);
 expect(flexibleOccurrenceForDate(s,'2026-09-17').status).not.toBe('completed');
});
it.each([
  ['planned',['planned']],['active-planned',['active']],['completed',['completed']],
  ['active-freestyle',['active']],['completed-freestyle',['completed']],
  ['active-planned-completed',['active']],['active-completed',['active']],
  ['multiple-completed',['completed']],['all-three',['active']],
])('%s projects canonical independent contexts without changing any data',(kind,markers)=>{
  const state=calendarStatusFixture(kind),before=JSON.stringify(state),dayState=present(state);
  expect(dayState.markers).toEqual(markers);expect(new Set(dayState.markers).size).toBe(markers.length);
  expect(dayState.markers.length).toBeLessThanOrEqual(1);expect(JSON.stringify(state)).toBe(before);
  if(kind.includes('freestyle')||kind==='all-three')expect(flexibleOccurrenceForDate(state,day).status).toBe('planned');
  if(kind==='all-three')expect(dayState.label).toBe('1 workout in progress, 1 completed workout, 1 planned workout');
});
it('leaves an empty day empty and future planned day unresolved',()=>{
  const s=calendarStatusFixture();expect(present(s,'2026-09-22')).toMatchObject({markers:[],label:'rest day'});
  expect(present(s,'2026-09-23')).toMatchObject({markers:['planned'],label:'1 planned workout'});
});
it('replaces the same occurrence through planned → active → completed, including reload',()=>{
  let s=calendarStatusFixture();const id=flexibleOccurrenceForDate(s,day).logicalSessionId;
  expect(present(s).markers).toEqual(['planned']);s.activeWorkout=startWorkout(s,plannedWorkoutForDate(s,day));
  expect(present(s).markers).toEqual(['active']);s.activeWorkout.exercises[0].sets[0].completed=true;s=completeWorkout(s);
  expect(present(s).markers).toEqual(['completed']);expect(present(deserializeState(serializeState(s))).markers).toEqual(['completed']);
  expect(flexibleOccurrenceForDate(s,day).logicalSessionId).toBe(id);expect(s.workouts).toHaveLength(1);
});
it('keeps fulfilment on the owner date without projecting activity onto that date',()=>{
  const s=calendarStatusFixture('performed-elsewhere'),before=JSON.stringify(s);
  expect(present(s,'2026-09-14')).toMatchObject({markers:[],label:'workout performed elsewhere'});
  expect(present(s,day).markers).toEqual(['completed']);
  expect(calendarDayStates(s,['2026-09-14'])['2026-09-14'].complete).toBe(false);
  expect(flexibleOccurrenceForDate(s,'2026-09-14').status).toBe('completed');
  expect(flexibleOccurrenceForDate(s,day).status).toBe('planned');expect(s.workouts).toHaveLength(1);expect(JSON.stringify(s)).toBe(before);
});
it('moves only the occurrence ring; completion resolves the canonical source and destination without copying history',()=>{
  let s=calendarStatusFixture('moved');expect(present(s).markers).toEqual([]);expect(present(s,'2026-09-22').markers).toEqual(['planned']);
  vi.setSystemTime(new Date('2026-09-22T12:00:00'));s.selectedDate='2026-09-22';s.activeWorkout=startWorkout(s,plannedWorkoutForDate(s,s.selectedDate));s.activeWorkout.exercises[0].sets[0].completed=true;s=completeWorkout(s);
  expect(present(s).markers).toEqual([]);expect(present(s,'2026-09-22').markers).toEqual(['completed']);expect(s.workouts).toHaveLength(1);
});
it('never matches ambiguous legacy history by name, or links freestyle to a planned occurrence',()=>{
  const s=calendarStatusFixture();s.workouts=[{id:'legacy',name:s.program.days[0].name,completedAt:`${day}T10:00:00`}];
  expect(present(s).markers).toEqual(['completed']);expect(flexibleOccurrenceForDate(s,day).status).toBe('planned');
});
it('keeps an overnight active freestyle on its performed date, independently of selected date',()=>{
  const s=calendarStatusFixture('active-freestyle');s.activeWorkout.startedAt=new Date('2026-09-20T23:50:00').getTime();
  expect(present(s,'2026-09-20').markers).toEqual(['active']);expect(present(s).markers).toEqual(['planned']);
});
it('replaces only an optional strength preparation matched by its ID',()=>{
  const s=calendarStatusFixture(),optional={id:'opt',kind:'Strength',status:'planned',date:day,workout:{exercises:[]}};s.optionalSessions=[optional];
  s.activeWorkout={id:'active-opt',optionalSessionId:'opt',startedAt:`${day}T12:00:00`};
  expect(present(s).markers).toEqual(['active']);
  s.workouts=[{...s.activeWorkout,completedAt:`${day}T13:00:00`}];s.activeWorkout=null;
  expect(present(s).markers).toEqual(['completed']);
});
it('does not keep a repeat preparation ring alongside its own active session',()=>{
  const s=calendarStatusFixture();s.todayAdaptation={schemaVersion:1,id:'repeat',mode:'repeat',date:'2026-09-22'};
  expect(present(s,'2026-09-22').markers).toEqual(['planned']);
  s.activeWorkout={id:'active-repeat',source:'repeat',adjustment:{...s.todayAdaptation},startedAt:'2026-09-22T12:00:00'};
  expect(present(s,'2026-09-22').markers).toEqual(['active']);expect(present(s).markers).toEqual(['planned']);
});
it('does not treat two missing optional/repeat IDs as proof of activity or completion',()=>{
  const s=calendarStatusFixture();s.optionalSessions=[{kind:'Strength',status:'planned',date:'2026-09-22',workout:{exercises:[]}}];
  s.todayAdaptation={schemaVersion:1,mode:'repeat',date:'2026-09-22'};s.workouts=[{completedAt:'2026-09-20T12:00:00'}];
  expect(present(s,'2026-09-22').markers).toEqual(['planned']);
});
it('keeps skipped occurrences out of the status slot',()=>{
  const s=calendarStatusFixture(),occurrence=flexibleOccurrenceForDate(s,day);
  const result=applyFlexibleWeek(s,proposeFlexibleWeek(s,{mode:'skip',sessionId:occurrence.logicalSessionId}));
  expect(result.status).toBe('applied');expect(present(result.state).markers).toEqual([]);
});
it('uses combined reservations and resolution links without reviving source obligations',()=>{
  vi.setSystemTime(new Date('2026-09-18T12:00:00'));
  let s=createReturningUserFixture(2);Object.assign(s,{workouts:[],activeWorkout:null,todayAdaptation:null,flexibleWeek:null,weekScheduleOverrides:{},workoutOccurrenceOverrides:{},selectedDate:'2026-09-18'});s.program.trainingBlock.startDate='2026-09-01';
  const sources=['2026-09-15','2026-09-17'].map(date=>flexibleOccurrenceForDate(s,date).logicalSessionId);
  const proposal=buildCombinedProposal(s,{sourceIds:sources,minutes:60});expect(proposal.status).toBe('ready');
  s=applyCombinedProposal(s,proposal.proposal,()=>true);
  expect(present(s,'2026-09-17').markers).toEqual([]);expect(present(s,'2026-09-18').markers).toEqual(['planned']);
  s.activeWorkout=startWorkout(s,adaptedTemplateForToday(s));expect(present(s,'2026-09-18').markers).toEqual(['active']);
  s.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>Object.assign(set,{completed:true,reps:8,weight:20})));s=completeWorkout(s);
  expect(present(s,'2026-09-17').markers).toEqual([]);expect(present(s,'2026-09-18').markers).toEqual(['completed']);expect(s.workouts).toHaveLength(1);
});
