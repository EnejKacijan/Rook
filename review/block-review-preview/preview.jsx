import {scopedStorage,scopedDatabases} from '../theme-preview/isolation.js';
if(!import.meta.env.DEV||import.meta.env.MODE!=='theme-preview'||import.meta.env.VITE_ROOK_ACCOUNT_SYNC_ROLLOUT!=='false')throw Error('Isolated local preview only.');
const params=new URLSearchParams(location.search),prefix=`rook-block-review-preview:${params.get('fixture')||'v1'}:`;
const originals=Object.fromEntries(['localStorage','sessionStorage','indexedDB'].map(key=>[key,Object.getOwnPropertyDescriptor(window,key)]));
// Large, regenerable history samples stay in memory, without filling or
// clearing any existing browser storage. Reload intentionally resets this demo.
const memoryStorage=()=>{const values=new Map();return {get length(){return values.size;},key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(String(key),String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};};
for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{configurable:true,value:scopedStorage(memoryStorage(),prefix)});
Object.defineProperty(window,'indexedDB',{configurable:true,value:scopedDatabases(window.indexedDB,prefix)});
const React=await import('react'),{createRoot}=await import('react-dom/client');
const D=await import('/src/domain.js');
const {prescribeTrainingBlockWorkout,advanceTrainingBlockAfterWorkout}=await import('/src/trainingBlocks.js');
const {normalizePlanHistoryState}=await import('/src/planHistory.js');
const {normalizeGymProfilesState}=await import('/src/gymProfiles.js');
const themeDate=params.get('palette')==='halloween'?()=>new Date('2026-10-28T12:00:00'):undefined;
if(themeDate){
  const {savePersonalThemePreference}=await import('/src/personalThemePreference.js');
  const {prepareSeasonalThemeSelection}=await import('/src/seasonalThemeLifecycle.js');
  savePersonalThemePreference(prepareSeasonalThemeSelection({basePalette:'halloween',appearance:params.get('appearance')==='light'?'light':'dark'},themeDate()));
}
if(!localStorage.getItem(D.STORAGE_KEY)){
  const state=D.blankState();
  Object.assign(state.profile,{id:'synthetic-block-review',name:'Demo',goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true,rirEnabled:true,appearancePreference:params.get('appearance')==='light'?'light':'dark',themePreference:params.get('appearance')==='light'?'light':'dark',stylePreference:'standard'});
  state.program=D.buildProgram(state.profile);state.program.trainingBlock.startDate='2026-07-27';
  normalizeGymProfilesState(state);normalizePlanHistoryState(state,'2026-07-27T08:00:00Z');
  const block=state.program.trainingBlock;
  for(const week of block.weeks){block.currentWeek=week.weekNumber;for(const[index,day]of state.program.days.entries()){
    const workout=prescribeTrainingBlockWorkout(state,day),date=new Date('2026-07-27T12:00:00Z');
    date.setUTCDate(date.getUTCDate()+(week.weekNumber-1)*7+index*2);
    state.workouts.push({...workout,id:`synthetic-${week.weekNumber}-${index}`,programDayId:day.id,completedAt:date.toISOString(),canonicalPlanDate:date.toISOString().slice(0,10),sourcePlanSlotId:workout.trainingBlock.blockWorkoutId,exercises:workout.exercises.map(exercise=>({...exercise,sets:exercise.sets.map(set=>({...set,weight:60,reps:exercise.repMax,rir:exercise.targetRir,planned:true,completed:true}))}))});
  }}
  advanceTrainingBlockAfterWorkout(state,state.workouts.at(-1));
  state.selectedDate=D.isoDay();state.selectedDay=D.weekday();state.ai.planUpgradeDismissed=true;
  localStorage.setItem(D.STORAGE_KEY,D.serializeState(state));
}
const {RookRoot}=await import('/src/App.jsx');
for(const name of ['styles','overrides','overlay','calendar','workout-controls','onboarding-controls','import-plan','coach','landing','theme','navigationFocus','activeLoggerTouch','standalonePageZoom','pressFeedback','uiReadability','typography'])await import(/* @vite-ignore */`/src/${name}.css`);
const {bindNavigationFocus}=await import('/src/navigationFocus.js'),{bindPressFeedback}=await import('/src/pressFeedback.js'),{observeVisibleViewport}=await import('/src/sheetVisibleViewport.js');
const releases=[bindNavigationFocus(),bindPressFeedback(),observeVisibleViewport()],root=createRoot(document.getElementById('root'));
root.render(<RookRoot themeOptions={themeDate?{now:themeDate}:undefined}/>);
if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();releases.forEach(release=>release?.());for(const[key,descriptor]of Object.entries(originals))if(descriptor)Object.defineProperty(window,key,descriptor);});
