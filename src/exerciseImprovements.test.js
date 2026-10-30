import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {exerciseImprovementHistory,improvementsForPeriod,latestImprovedExercises,improvementDateLabel} from './exerciseImprovements.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-29T12:00:00'));});
afterEach(()=>vi.useRealTimers());
const exercise=(id='bench',weight=30,reps=8,extra={})=>({id:`slot-${id}`,exerciseId:id,name:'Same name',loadRequirement:'required',repMin:6,repMax:12,sets:[{id:'s',completed:true,weight,reps}],...extra});
const workout=(date,entry,id=date)=>({id,startedAt:new Date(`${date}T09:00:00`).getTime(),completedAt:new Date(`${date}T10:00:00`).toISOString(),exercises:Array.isArray(entry)?entry:[entry]});

it('keeps the full dated gain history rather than only the latest positive comparison per exercise',()=>{
  const logs=[workout('2026-10-19',exercise()),workout('2026-10-22',exercise('bench',30,9)),workout('2026-10-26',exercise('bench',30,10)),workout('2026-10-28',exercise('bench',30,9)),workout('2026-10-29',exercise('bench',32.5,8))];
  const before=structuredClone(logs),events=exerciseImprovementHistory([...logs].reverse());
  expect(events.map(e=>[e.date,e.type,e.deltaReps||e.deltaWeight])).toEqual([['2026-10-29','weight',2.5],['2026-10-26','reps',1],['2026-10-22','reps',1]]);
  expect(logs).toEqual(before);expect(latestImprovedExercises(events)).toEqual([events[0]]);
});
it('filters this week after comparing the complete history, allowing an earlier-week baseline',()=>{
  const events=exerciseImprovementHistory([workout('2026-10-23',exercise()),workout('2026-10-26',exercise('bench',30,9))]);
  expect(improvementsForPeriod(events,'week')).toHaveLength(1);expect(events[0].previousDate).toBe('2026-10-23');
  expect(improvementsForPeriod(events,'week','2026-11-02')).toEqual([]);expect(improvementsForPeriod(events,'all','2026-11-02')).toEqual(events);
});
it('does not report a first exposure, unchanged values, lower load with more reps, or unfinished work',()=>{
  const logs=[workout('2026-10-19',exercise()),workout('2026-10-20',exercise()),workout('2026-10-21',exercise('bench',20,12)),workout('2026-10-22',exercise('bench',40,12,{sets:[{completed:false,weight:40,reps:12}]}))];
  expect(exerciseImprovementHistory(logs)).toEqual([]);
});
it('uses real training dates across a delayed finish and ignores moved plan dates and future records',()=>{
  const earlier=workout('2026-10-23',exercise()),later=workout('2026-10-25',exercise('bench',30,9));
  Object.assign(later,{canonicalPlanDate:'2026-10-29',workoutDateKey:'2026-10-29',completedAt:'2026-10-27T10:00:00Z'});
  const events=exerciseImprovementHistory([later,earlier,workout('2026-10-30',exercise('bench',40,9))]);
  expect(events).toHaveLength(1);expect(events[0].date).toBe('2026-10-25');expect(improvementsForPeriod(events,'week')).toEqual([]);
});
it('keeps exercise identities separate even when their names match',()=>{
  const events=exerciseImprovementHistory([workout('2026-10-22',[exercise('a',30,8),exercise('b',40,8)]),workout('2026-10-26',[exercise('a',30,9),exercise('b',40,10)])]);
  expect(new Set(events.map(e=>e.exerciseId))).toEqual(new Set(['a','b']));expect(latestImprovedExercises(events)).toHaveLength(2);
});
it('does not combine two occurrences of the same exercise in one workout or jump over their ambiguity',()=>{
  const logs=[workout('2026-10-19',exercise()),workout('2026-10-22',[exercise('bench',30,9),exercise('bench',40,10)]),workout('2026-10-26',exercise('bench',30,10)),workout('2026-10-28',exercise('bench',30,11))];
  const events=exerciseImprovementHistory(logs);expect(events).toHaveLength(1);expect(events[0]).toMatchObject({date:'2026-10-28',deltaReps:1});
});
it('starts a fresh comparison when logging mode or known prescription context changes',()=>{
  const side=(left,right)=>exercise('bench',30,null,{loggingMode:'per_side',sets:[{completed:true,weight:30,sides:{left:{reps:left},right:{reps:right}}}]});
  const events=exerciseImprovementHistory([workout('2026-10-19',exercise()),workout('2026-10-22',side(10,9)),workout('2026-10-26',side(9,10)),workout('2026-10-28',side(10,11))]);
  expect(events).toHaveLength(1);expect(events[0]).toMatchObject({date:'2026-10-28',deltaReps:1,loggingMode:'per_side'});
  expect(exerciseImprovementHistory([workout('2026-10-19',exercise()),workout('2026-10-26',exercise('bench',40,8,{repMin:3,repMax:5}))])).toEqual([]);
});
it('omits complex sets and does not let a heavier drop set fabricate a standard-set improvement',()=>{
  const next=exercise('bench',30,9);next.sets.push({completed:true,weight:90,reps:20,setType:'drop'});
  const events=exerciseImprovementHistory([workout('2026-10-19',exercise()),workout('2026-10-26',next)]);
  expect(events).toHaveLength(1);expect(events[0]).toMatchObject({type:'reps',deltaReps:1,weight:30});
});
it('does not cross incomplete per-side results, invalid required loads, timed work or assisted movements',()=>{
  expect(exerciseImprovementHistory([workout('2026-10-19',exercise()),workout('2026-10-22',exercise('bench',null,10)),workout('2026-10-26',exercise('bench',30,12))])).toEqual([]);
  for(const extra of [{measure:'seconds'},{exerciseId:'assisted-pull-up'},{loggingMode:'per_side',sets:[{completed:true,weight:30,sides:{left:{reps:12}}}]}])
    expect(exerciseImprovementHistory([workout('2026-10-19',exercise('bench',30,8,extra)),workout('2026-10-26',exercise('bench',40,10,extra))])).toEqual([]);
});
it('reports bodyweight rep gains and treats zero/no added load as the same optional-load setup',()=>{
  const bw=(weight,reps,loadRequirement)=>exercise('custom-bw',weight,reps,{loadRequirement});
  expect(exerciseImprovementHistory([workout('2026-10-19',bw(null,8,'none')),workout('2026-10-26',bw(null,10,'none'))])[0]).toMatchObject({type:'reps',deltaReps:2,weight:null});
  expect(exerciseImprovementHistory([workout('2026-10-19',bw(null,8,'optional')),workout('2026-10-26',bw(0,9,'optional'))])[0]).toMatchObject({type:'reps',deltaReps:1,weight:0});
});
it('honors canonical history correction/deduplication and recalculates after edits or deletion',()=>{
  const baseline=workout('2026-10-19',exercise(),'base'),stale=workout('2026-10-26',exercise('bench',30,10),'latest'),corrected=workout('2026-10-26',exercise('bench',30,8),'latest');
  expect(exerciseImprovementHistory([baseline,stale,corrected])).toEqual([]);
  const replacement=workout('2026-10-27',exercise('bench',30,9),'new');replacement.supersedesCompletionId='latest';
  expect(exerciseImprovementHistory([baseline,stale,replacement])).toHaveLength(1);
  expect(exerciseImprovementHistory([replacement])).toEqual([]);
});
it('does not infer improvements from ambiguous imported load semantics',()=>{
  const unknown=exercise('bench',40,10,{sets:[{completed:true,weight:40,reps:10,rawImport:{version:2,loadKind:'unknown'},importSetType:'Normal'}]});
  expect(exerciseImprovementHistory([workout('2026-10-19',exercise()),workout('2026-10-26',unknown)])).toEqual([]);
});
it('labels dates by the local calendar and disambiguates older years',()=>{
  expect(improvementDateLabel('2026-10-29')).toBe('Today');expect(improvementDateLabel('2026-10-28')).toBe('Yesterday');
  expect(improvementDateLabel('2026-10-25')).toContain('Oct 25');expect(improvementDateLabel('2025-10-25')).toContain('2025');
});
it('orders same-day native exposures by actual start even when finishing or import order is reversed',()=>{
  const earlier=workout('2026-10-26',exercise('bench',30,9),'morning');earlier.completedAt='2026-10-27T10:00:00Z';
  const later=workout('2026-10-26',exercise('bench',30,10),'evening');later.startedAt=new Date('2026-10-26T18:00:00').getTime();later.completedAt=new Date('2026-10-26T19:00:00').toISOString();
  const logs=[later,earlier,workout('2026-10-22',exercise())];
  expect(exerciseImprovementHistory(logs).map(event=>[event.workoutId,event.deltaReps])).toEqual([['evening',1],['morning',1]]);
});
it('does not manufacture same-day gains from date-only or identical-start records, or reach backward through ambiguity',()=>{
  for(const patch of [{historicalImport:{source:'hevy'},sourceDate:{day:'2026-10-26',precision:'date',value:'2026-10-26'},startedAt:null},{}]) {
    const first={...workout('2026-10-26',exercise('bench',30,9),'a'),...patch},second={...workout('2026-10-26',exercise('bench',30,10),'b'),...patch};
    const logs=[workout('2026-10-22',exercise()),first,second,workout('2026-10-27',exercise('bench',30,11)),workout('2026-10-28',exercise('bench',30,12))];
    expect(exerciseImprovementHistory(logs).map(event=>event.date)).toEqual(['2026-10-28']);
    expect(exerciseImprovementHistory([...logs].reverse())).toEqual(exerciseImprovementHistory(logs));
  }
});
it('supports source-backed same-provider local times but does not mix them with unknown native/import clocks',()=>{
  const imported=(hour,reps,id)=>({...workout('2026-10-26',exercise('bench',30,reps),id),historicalImport:{source:'hevy'},sourceDate:{day:'2026-10-26',precision:'datetime',zone:null,value:`2026-10-26T${hour}:00:00`},startedAt:`2026-10-26T${hour}:00:00`});
  const first=imported('09',9,'a'),second=imported('18',10,'b'),baseline=workout('2026-10-22',exercise());
  expect(exerciseImprovementHistory([second,baseline,first]).map(event=>event.workoutId)).toEqual(['b','a']);
  const native=workout('2026-10-26',exercise('bench',30,10),'native');
  expect(exerciseImprovementHistory([baseline,first,native])).toEqual([]);
});
