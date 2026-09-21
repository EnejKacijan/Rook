import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {calendarDayPresentation,calendarDayStates} from './workoutCalendar.js';
import {calendarStatusFixture,calendarStatusDate as day} from './calendarStatus.fixture.js';
import {flexibleOccurrenceForDate,proposeFlexibleWeek,applyFlexibleWeek} from './flexibleWeek.js';
import {startWorkout,completeWorkout,plannedWorkoutForDate,deserializeState,serializeState,adaptedTemplateForToday} from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';
import {buildCombinedProposal,applyCombinedProposal} from './combineWorkouts.js';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date(`${day}T12:00:00`));});
afterEach(()=>vi.useRealTimers());
const present=(state,date=day)=>calendarDayPresentation(state,[date])[date];
it.each([
  ['planned',['planned']],['active-planned',['active']],['completed',['completed']],
  ['active-freestyle',['active']],['completed-freestyle',['completed','planned']],
  ['active-planned-completed',['active']],['active-completed',['active']],
  ['multiple-completed',['completed','planned']],['all-three',['active']],
])('%s projects canonical independent contexts without changing any data',(kind,markers)=>{
  const state=calendarStatusFixture(kind),before=JSON.stringify(state),dayState=present(state);
  expect(dayState.markers).toEqual(markers);expect(new Set(dayState.markers).size).toBe(markers.length);
  expect(dayState.markers.length).toBeLessThanOrEqual(2);expect(JSON.stringify(state)).toBe(before);
  if(kind.includes('freestyle')||kind==='all-three')expect(flexibleOccurrenceForDate(state,day).status).toBe('planned');
  if(kind==='all-three')expect(dayState.label).toBe('workout in progress, completed workout, planned workout');
});
it('leaves an empty day empty and future planned day unresolved',()=>{
  const s=calendarStatusFixture();expect(present(s,'2026-09-22')).toMatchObject({markers:[],label:'rest day'});
  expect(present(s,'2026-09-23')).toMatchObject({markers:['planned'],label:'planned workout'});
});
it('replaces the same occurrence through planned → active → completed, including reload',()=>{
  let s=calendarStatusFixture();const id=flexibleOccurrenceForDate(s,day).logicalSessionId;
  expect(present(s).markers).toEqual(['planned']);s.activeWorkout=startWorkout(s,plannedWorkoutForDate(s,day));
  expect(present(s).markers).toEqual(['active']);s.activeWorkout.exercises[0].sets[0].completed=true;s=completeWorkout(s);
  expect(present(s).markers).toEqual(['completed']);expect(present(deserializeState(serializeState(s))).markers).toEqual(['completed']);
  expect(flexibleOccurrenceForDate(s,day).logicalSessionId).toBe(id);expect(s.workouts).toHaveLength(1);
});
it('reflects fulfilment on the owner date while keeping the one factual performed record on its real date',()=>{
  const s=calendarStatusFixture('performed-elsewhere'),before=JSON.stringify(s);
  expect(present(s,'2026-09-14').markers).toEqual(['completed']);
  expect(present(s,day).markers).toEqual(['completed','planned']);
  expect(calendarDayStates(s,['2026-09-14'])['2026-09-14'].complete).toBe(false);
  expect(flexibleOccurrenceForDate(s,'2026-09-14').status).toBe('completed');
  expect(flexibleOccurrenceForDate(s,day).status).toBe('planned');expect(s.workouts).toHaveLength(1);expect(JSON.stringify(s)).toBe(before);
});
it('moves only the occurrence ring; completion resolves the canonical source and destination without copying history',()=>{
  let s=calendarStatusFixture('moved');expect(present(s).markers).toEqual([]);expect(present(s,'2026-09-22').markers).toEqual(['planned']);
  vi.setSystemTime(new Date('2026-09-22T12:00:00'));s.selectedDate='2026-09-22';s.activeWorkout=startWorkout(s,plannedWorkoutForDate(s,s.selectedDate));s.activeWorkout.exercises[0].sets[0].completed=true;s=completeWorkout(s);
  expect(present(s).markers).toEqual(['completed']);expect(present(s,'2026-09-22').markers).toEqual(['completed']);expect(s.workouts).toHaveLength(1);
});
it('never matches ambiguous legacy history by name, or links freestyle to a planned occurrence',()=>{
  const s=calendarStatusFixture();s.workouts=[{id:'legacy',name:s.program.days[0].name,completedAt:`${day}T10:00:00`}];
  expect(present(s).markers).toEqual(['completed','planned']);expect(flexibleOccurrenceForDate(s,day).status).toBe('planned');
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
  expect(present(s).markers).toEqual(['completed','planned']);
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
  expect(present(s,'2026-09-17').markers).toEqual(['completed']);expect(present(s,'2026-09-18').markers).toEqual(['completed']);expect(s.workouts).toHaveLength(1);
});
