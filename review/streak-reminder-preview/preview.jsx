import {scopedStorage,scopedDatabases} from '../theme-preview/isolation.js';
if(!import.meta.env.DEV||import.meta.env.MODE!=='theme-preview'||import.meta.env.VITE_ROOK_ACCOUNT_SYNC_ROLLOUT!=='false')throw Error('Isolated synthetic review only.');
// Synthetic weekend-reminder states on the real app. Dates are relative to the
// browser clock, so a review harness can pin Friday, Saturday, Sunday or Monday.
const query=new URLSearchParams(location.search),scenario=query.get('scenario')||'rest',profile=query.get('profile')||'a';
const prefix=`rook-streak-reminder-preview:${scenario}:${profile}:`;
const originals=Object.fromEntries(['localStorage','sessionStorage','indexedDB'].map(key=>[key,Object.getOwnPropertyDescriptor(window,key)]));
// Optional dev-only local calendar clock. This does not change the computer's
// clock and keeps elapsed workout time moving during interactive review.
const OriginalDate=window.Date,clockDay=query.get('day');
if(/^\d{4}-\d{2}-\d{2}$/.test(clockDay||'')){
  const fixed=new OriginalDate(`${clockDay}T12:00:00`).getTime(),epoch=performance.now();
  if(Number.isFinite(fixed))window.Date=class extends OriginalDate{
    constructor(...args){super(...(args.length?args:[fixed+performance.now()-epoch]));}
    static now(){return fixed+performance.now()-epoch;}
  };
}
const blocked=query.get('storage')==='blocked';
// Fixture records live only in memory, so a full localhost storage quota never
// requires clearing user data. Keep only synthetic presentation receipts in
// this tab's name for reload checks (bounded; never sent to a server).
const receiptKey='rook-streak-presentation-v1',receiptTag='rook-streak-reminder-synthetic:';
let receipts={};try{if(window.name.startsWith(receiptTag))receipts=JSON.parse(window.name.slice(receiptTag.length));}catch{/* Empty review tab. */}
const memory=()=>{const values=new Map();return {get length(){return values.size;},key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(String(key),String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};};
const remember=value=>{delete receipts[prefix];if(value!==null)receipts[prefix]=value;while(Object.keys(receipts).length>8)delete receipts[Object.keys(receipts)[0]];window.name=receiptTag+JSON.stringify(receipts);};
const scoped=()=>{const inner=scopedStorage(memory(),prefix);if(typeof receipts[prefix]==='string')inner.setItem(receiptKey,receipts[prefix]);return {
  get length(){return inner.length;},key:index=>inner.key(index),getItem:key=>inner.getItem(key),
  setItem:(key,value)=>{if(blocked&&key===receiptKey)throw new DOMException('Synthetic quota','QuotaExceededError');inner.setItem(key,value);if(key===receiptKey)remember(String(value));},
  removeItem:key=>{inner.removeItem(key);if(key===receiptKey)remember(null);},clear:()=>{inner.clear();remember(null);}
};};
for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{configurable:true,value:scoped()});
Object.defineProperty(window,'indexedDB',{configurable:true,value:scopedDatabases(window.indexedDB,prefix)});
const React=await import('react'),{createRoot}=await import('react-dom/client');
const {combineExample}=await import('/src/combineWorkouts.fixture.js');
const {serializeState,deserializeState,isoDay,weekKey,weekday,estimateWorkoutMinutes,startWorkout,startOptionalSession,exerciseCatalog}=await import('/src/domain.js');
const {addCalendarDays}=await import('/src/flexibleWeek.js');
const {savePersonalThemePreference}=await import('/src/personalThemePreference.js');
const log=(day,id,name='Upper')=>{const start=new Date(`${day}T09:00:00`).getTime();
  return {id,name,status:'completed',startedAt:start,completedAt:new Date(start+45*60000).toISOString(),utcOffsetMinutesAtStart:new Date(start).getTimezoneOffset(),exercises:[{id:`${id}-x`,exerciseId:'leg-press',name:'Leg Press',sets:[{id:`${id}-s`,completed:true,reps:8,weight:60}]}]};};
if(query.get('fresh')==='1')localStorage.clear();
if(!localStorage.getItem('lift-v2-state')){
  let state=combineExample();const monday=weekKey(),today=isoDay();
  Object.assign(state.profile,{id:`synthetic-streak-reminder-${profile}`,name:profile==='a'?'Demo':'Second demo'});
  // Plan started a month ago so this week's Mon/Wed sessions can be missed.
  state.program.trainingBlock.startDate=addCalendarDays(monday,-28);state.program.trainingBlock.currentWeek=5;state.program.rotationStartDate=addCalendarDays(monday,-28);
  state.selectedDate=today;state.selectedDay=weekday();
  if(scenario==='planned'){
    const day={...structuredClone(state.program.days[1]),id:'lower-source',weekday:weekday(),name:'Lower',workoutName:'Lower',nameEdited:true};
    day.exercises=day.exercises.slice(0,3).map((exercise,index)=>({...exercise,id:`lower-${index}`,sets:exercise.sets.slice(0,3).map((set,i)=>({...set,id:`lower-${index}-${i}`}))}));
    day.estimatedMinutes=estimateWorkoutMinutes(day,state.profile);state.program.days.push(day);
  }
  state.profile.daysPerWeek=state.program.days.length;state.profile.availableDays=state.program.days.map(day=>day.weekday);
  const weeks={none:[],zero:[],broken:[-28,-21]}[scenario]??[-14,-7];
  state.workouts=weeks.map((offset,index)=>log(addCalendarDays(monday,offset+1),`synthetic-history-${index}`));
  // Opt-in chart review data only; these records never use real app storage.
  if(query.get('e1rm')==='1'){
    const exercise=state.program.days[0].exercises[0];
    for(const [index,weight] of [20,22.5,25,27.5,30].entries()){
      const workout=log(addCalendarDays(monday,-35+index*7),`synthetic-e1rm-${index}`,'Push');
      workout.exercises=[{...structuredClone(exercise),id:`synthetic-e1rm-exercise-${index}`,name:exerciseCatalog[exercise.exerciseId].name,
        sets:[{...exercise.sets[0],id:`synthetic-e1rm-set-${index}`,completed:true,reps:8,weight}]}];
      state.workouts.push(workout);
    }
  }
  if(scenario==='earned')state.workouts.push(log(addCalendarDays(monday,2),'synthetic-this-week','Pull'));
  if(scenario==='lastweek')state.workouts.push({...log(addCalendarDays(monday,-1),'synthetic-late'),completedAt:new Date().toISOString()});
  if(scenario==='active')state.activeWorkout=startWorkout(state,state.program.days[0]);
  if(scenario==='stale'){state.activeWorkout=startWorkout(state,state.program.days[0]);const start=new Date(`${addCalendarDays(monday,-2)}T18:00:00`).getTime();Object.assign(state.activeWorkout,{startedAt:start,utcOffsetMinutesAtStart:new Date(start).getTimezoneOffset(),workoutDateKey:addCalendarDays(monday,-2)});}
  if(scenario==='optional')state=startOptionalSession(state,{kind:'Mobility',activity:'Mobility flow',duration:15,intensity:'Easy'},Date.now()-300000);
  if(scenario==='noplan')state.profile.preferredTrainingStyle='freestyle';
  if(scenario==='none'){state.profile.onboardingComplete=true;}
  state=deserializeState(state,{strict:true});localStorage.setItem('lift-v2-state',serializeState(state));
  savePersonalThemePreference({basePalette:query.get('palette')||'forest',appearance:query.get('appearance')==='light'?'light':'dark',paletteCustomizations:{}});
}
const {RookRoot}=await import('/src/App.jsx');
const {bindNavigationFocus}=await import('/src/navigationFocus.js'),{bindPressFeedback}=await import('/src/pressFeedback.js'),{observeVisibleViewport}=await import('/src/sheetVisibleViewport.js');
for(const name of ['styles','overrides','overlay','calendar','workout-controls','onboarding-controls','import-plan','coach','landing','theme','navigationFocus','activeLoggerTouch','standalonePageZoom','pressFeedback','uiReadability','typography'])await import(/* @vite-ignore */`/src/${name}.css`);
if(query.get('text')==='200')document.documentElement.style.fontSize='200%';
const releases=[bindNavigationFocus(),bindPressFeedback(),observeVisibleViewport()];
const root=createRoot(document.getElementById('root'));root.render(<RookRoot/>);
if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();releases.forEach(release=>release?.());window.Date=OriginalDate;for(const[key,descriptor]of Object.entries(originals))if(descriptor)Object.defineProperty(window,key,descriptor);});
