import {scopedStorage,scopedDatabases} from '../theme-preview/isolation.js';
if(!import.meta.env.DEV||import.meta.env.MODE!=='theme-preview'||import.meta.env.VITE_ROOK_ACCOUNT_SYNC_ROLLOUT!=='false')throw Error('Isolated local preview only.');
const query=new URLSearchParams(location.search),scenario=query.get('scenario')||'two',fixture=query.get('fixture')||'v1';
const prefix=`rook-missed-recovery-preview:${scenario}:${fixture}:`;
const originals=Object.fromEntries(['localStorage','sessionStorage','indexedDB'].map(key=>[key,Object.getOwnPropertyDescriptor(window,key)]));
for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{configurable:true,value:scopedStorage(window[key],prefix)});
Object.defineProperty(window,'indexedDB',{configurable:true,value:scopedDatabases(window.indexedDB,prefix)});
const React=await import('react'),{createRoot}=await import('react-dom/client');
const {combineExample}=await import('/src/combineWorkouts.fixture.js');
const {serializeState,deserializeState,isoDay,weekKey,weekday,estimateWorkoutMinutes,startWorkout}=await import('/src/domain.js');
const {savePersonalThemePreference}=await import('/src/personalThemePreference.js');
if(!localStorage.getItem('lift-v2-state')){
  let state=combineExample();
  Object.assign(state.profile,{id:'synthetic-missed-recovery-review',name:'Demo',appearancePreference:query.get('appearance')==='light'?'light':'dark'});
  state.program.trainingBlock.startDate=weekKey();state.program.trainingBlock.currentWeek=1;state.program.rotationStartDate=weekKey();state.selectedDate=isoDay();state.selectedDay=weekday();
  if(['today','three','one','none','completed','active'].includes(scenario)){
    const day={...structuredClone(state.program.days[1]),id:'lower-source',weekday:scenario==='three'?'Tue':weekday(),name:'Lower',workoutName:'Lower',nameEdited:true};
    day.exercises=day.exercises.slice(0,3).map((exercise,index)=>({...exercise,id:`lower-${index}`,exerciseId:['leg-press','seated-leg-curl','standing-calf-raise-machine'][index],sets:exercise.sets.slice(0,3).map((set,i)=>({...set,id:`lower-${index}-${i}`}))}));
    day.estimatedMinutes=estimateWorkoutMinutes(day,state.profile);state.program.days.push(day);state.profile.daysPerWeek=3;state.profile.availableDays=state.program.days.map(day=>day.weekday);
  }
  if(scenario==='one')state.program.days=state.program.days.filter(day=>day.id!=='pull-source');
  if(scenario==='none')state.program.days=state.program.days.filter(day=>day.id==='lower-source');
  if(query.get('long')==='1'){state.program.days[0].name='Push — chest, shoulders and triceps';state.program.days[0].workoutName=state.program.days[0].name;}
  state.profile.daysPerWeek=state.program.days.length;state.profile.availableDays=state.program.days.map(day=>day.weekday);
  if(scenario==='completed')state.optionalSessions=[{id:'synthetic-conditioning-completed',date:isoDay(),kind:'Conditioning',intent:'conditioning',activity:'Rower',format:'steady',duration:20,intensity:'Moderate',elapsedSeconds:1200,status:'completed',startedAt:Date.now()-1800000,completedAt:new Date(Date.now()-600000).toISOString()}];
  if(scenario==='active')state.activeWorkout=startWorkout(state,state.program.days.find(day=>day.id==='lower-source'));
  state=deserializeState(state,{strict:true});localStorage.setItem('lift-v2-state',serializeState(state));
  savePersonalThemePreference({basePalette:query.get('palette')==='halloween'?'halloween':'forest',appearance:query.get('appearance')==='light'?'light':'dark',paletteCustomizations:{}});
}
const {RookRoot}=await import('/src/App.jsx');
const {bindNavigationFocus}=await import('/src/navigationFocus.js');
const {bindPressFeedback}=await import('/src/pressFeedback.js');
const {observeVisibleViewport}=await import('/src/sheetVisibleViewport.js');
for(const name of ['styles','overrides','overlay','calendar','workout-controls','onboarding-controls','import-plan','coach','landing','theme','navigationFocus','activeLoggerTouch','standalonePageZoom','pressFeedback','uiReadability','typography'])await import(/* @vite-ignore */`/src/${name}.css`);
const releases=[bindNavigationFocus(),bindPressFeedback(),observeVisibleViewport()];
const root=createRoot(document.getElementById('root'));root.render(<RookRoot/>);
if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();releases.forEach(release=>release?.());for(const [key,descriptor]of Object.entries(originals)){if(descriptor)Object.defineProperty(window,key,descriptor);}});
