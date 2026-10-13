import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {blankState,buildProgram,firstScheduledDate,currentWeekSchedule,plannedWorkoutForDate,startWorkout,serializeState,deserializeState} from './domain.js';
import {createPlanBuilderDraft,activatePlanBuilder,PLAN_EFFORT_STYLES} from './planBuilder.js';
import {calendarDayPresentation} from './workoutCalendar.js';
import {flexibleOccurrenceForDate,missedFlexibleSessions} from './flexibleWeek.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-13T12:00:00'));});
afterEach(()=>vi.useRealTimers());
function acceptedPlan(){
 const state=blankState(),answers=createPlanBuilderDraft({...state.profile,ageRange:'30–39',goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Chest','Back'],effortStyle:PLAN_EFFORT_STYLES[0],trainingSplitChoice:'recommended',trainingPreferences:'',exercisePreference:'No preference'});
 const built=buildProgram(answers);
 const next=activatePlanBuilder(state,{...built,rotationStartDate:firstScheduledDate(built)},answers,'personalized-template',()=>true);
 return {state:next,built};
}
it('Tuesday builder acceptance begins the actual A/B/C occurrences on Wednesday without a phantom Monday miss',()=>{
 const {state,built}=acceptedPlan(),before=structuredClone(state);
 expect(built.days.map(day=>[day.weekday,day.name])).toEqual([['Mon','Full Body A'],['Wed','Full Body B'],['Fri','Full Body C']]);
 expect(state.program.rotationStartDate).toBe('2026-10-14');expect(state.program.trainingBlock.startDate).toBe('2026-10-13');
 expect(currentWeekSchedule(state,'2026-10-13').map(item=>[item.scheduledDate,item.workout.name])).toEqual([['2026-10-14','Full Body A'],['2026-10-16','Full Body B']]);
 expect(plannedWorkoutForDate(state,'2026-10-12')).toBeNull();expect(flexibleOccurrenceForDate(state,'2026-10-12')).toBeNull();
 expect(plannedWorkoutForDate(state,'2026-10-14').name).toBe('Full Body A');expect(plannedWorkoutForDate(state,'2026-10-16').name).toBe('Full Body B');expect(plannedWorkoutForDate(state,'2026-10-19').name).toBe('Full Body C');
 const days=calendarDayPresentation(state,['2026-10-12','2026-10-14','2026-10-16']);
 expect(days['2026-10-12']).toMatchObject({planned:false,markers:[],statuses:[],counts:{active:0,completed:0,planned:0,missed:0},label:'rest day'});
 expect(days['2026-10-14']).toMatchObject({counts:{planned:1,missed:0},label:'1 planned workout'});expect(missedFlexibleSessions(state)).toEqual([]);
 expect(state).toEqual(before);
 const loaded=deserializeState(serializeState(state),{strict:true});expect(plannedWorkoutForDate(loaded,'2026-10-12')).toBeNull();expect(plannedWorkoutForDate(loaded,'2026-10-14').name).toBe('Full Body A');
});
it.each([undefined,null,'','not-a-date','2026-99-99','2026-02-30','2026-09-31'])('retains the legacy weekday mapping without a valid explicit anchor (%s)',anchor=>{
 const {state}=acceptedPlan();if(anchor===undefined)delete state.program.rotationStartDate;else state.program.rotationStartDate=anchor;
 expect(currentWeekSchedule(state,'2026-10-13').map(item=>[item.scheduledDate,item.workout.name])).toEqual([['2026-10-12','Full Body A'],['2026-10-14','Full Body B'],['2026-10-16','Full Body C']]);
});
it('starting Wednesday A early owns Wednesday rather than a phantom pre-start Monday',()=>{
 const {state}=acceptedPlan();state.selectedDate='2026-10-14';const template=plannedWorkoutForDate(state,state.selectedDate),program=structuredClone(state.program);
 state.activeWorkout=startWorkout(state,template);
 const occurrenceId=`${template.id}:2026-10-14`;
 expect(state.activeWorkout).toMatchObject({programDayId:template.id,canonicalPlanDate:'2026-10-14',logicalSessionId:occurrenceId,sourcePlanSlotId:occurrenceId,originalScheduledDate:'2026-10-14',workoutDateKey:'2026-10-13'});
 expect(state.program).toEqual(program);
 const loaded=deserializeState(serializeState(state),{strict:true});expect(loaded.activeWorkout).toEqual(state.activeWorkout);expect(loaded.program.rotationStartDate).toBe(program.rotationStartDate);
 expect(loaded.program.days.map(day=>[day.id,day.name,day.weekday])).toEqual(program.days.map(day=>[day.id,day.name,day.weekday]));
 expect(flexibleOccurrenceForDate(loaded,'2026-10-12')).toBeNull();expect(flexibleOccurrenceForDate(loaded,'2026-10-14')).toMatchObject({status:'active',actualPerformedDate:'2026-10-13'});
 const days=calendarDayPresentation(loaded,['2026-10-12','2026-10-13','2026-10-14']);
 expect(days['2026-10-12']).toMatchObject({statuses:[],label:'rest day'});expect(days['2026-10-13'].counts.active).toBe(1);expect(days['2026-10-14'].counts.planned).toBe(0);
});
it('keeps actual completed history before the anchor visible without recreating a scheduled occurrence',()=>{
 const {state}=acceptedPlan();state.workouts=[{id:'historical-execution',source:'freestyle',name:'Earlier workout',workoutDateKey:'2026-10-12',startedAt:new Date('2026-10-12T10:00:00').getTime(),completedAt:new Date('2026-10-12T11:00:00').toISOString(),exercises:[]}];
 const before=structuredClone(state),day=calendarDayPresentation(state,['2026-10-12'])['2026-10-12'];
 expect(day).toMatchObject({complete:true,planned:false,markers:['completed'],statuses:['completed'],counts:{completed:1,planned:0,missed:0},label:'1 completed workout'});
 expect(state).toEqual(before);expect(plannedWorkoutForDate(state,'2026-10-12')).toBeNull();
});
