import {scopedStorage,scopedDatabases} from '../theme-preview/isolation.js';
if(!import.meta.env.DEV||import.meta.env.MODE!=='theme-preview'||import.meta.env.VITE_ROOK_ACCOUNT_SYNC_ROLLOUT!=='false')throw Error('Local synthetic preview only');
const params=new URLSearchParams(location.search),scenario=params.get('scenario')||'profile',mode=params.get('mode')==='light'?'light':'dark',key=`${scenario}:${mode}:${params.get('fixture')||'v1'}:layout-v2`;
const prefix='rook-weekly-streak-preview:';
for(const name of ['localStorage','sessionStorage'])Object.defineProperty(window,name,{configurable:true,value:scopedStorage(window[name],prefix)});
Object.defineProperty(window,'indexedDB',{configurable:true,value:scopedDatabases(window.indexedDB,prefix)});
const React=await import('react'),{createRoot}=await import('react-dom/client');
const D=await import('/src/domain.js'),{createReturningUserFixture}=await import('/src/demoFixture.js');
const {RookRoot}=await import('/src/App.jsx');
for(const name of ['styles','overrides','overlay','calendar','workout-controls','onboarding-controls','import-plan','coach','landing','theme','navigationFocus','activeLoggerTouch','standalonePageZoom','pressFeedback','uiReadability','typography'])await import(`/src/${name}.css`);
const {bindNavigationFocus}=await import('/src/navigationFocus.js'),{bindPressFeedback}=await import('/src/pressFeedback.js'),{observeVisibleViewport}=await import('/src/sheetVisibleViewport.js');
bindNavigationFocus();bindPressFeedback();observeVisibleViewport();
if(params.get('text')==='200')document.documentElement.style.fontSize='200%';
function fixture(){
  let state=createReturningUserFixture(3),now=Date.now();
  Object.assign(state.profile,{name:'Demo',appearancePreference:mode,themePreference:mode,stylePreference:'standard'});state.ai={...state.ai,planUpgradeDismissed:true};
  const day=state.program.days[0],active=D.startWorkout(state,day);
  active.startedAt=now-30*60000;active.updatedAt=now;active.lastMeaningfulWorkoutActivityAt=now;active.warmupSkipped=true;active.rampUpSkipped=true;
  active.exercises.forEach(exercise=>exercise.sets.forEach(set=>Object.assign(set,{completed:true,reps:8,weight:30,completedAt:now-60000})));
  state.activeWorkout=active;
  if(scenario!=='finish'){
    const monday=new Date();monday.setDate(monday.getDate()-((monday.getDay()+6)%7));monday.setHours(10,30,0,0);
    const endedAt=Math.min(monday.getTime(),now-1000);active.startedAt=endedAt-30*60000;
    state=D.completeWorkout(state,{endedAt,durationSeconds:1800,timingReviewedAt:now});
  }
  if(scenario==='rest'){
    const allowed=D.WEEKDAYS.filter(value=>value!==D.weekday());
    state.program.days.forEach((workout,index)=>workout.weekday=allowed[index]);state.program.userEdited=true;
    state.profile.availableDays=state.program.days.map(workout=>workout.weekday);
  }
  if(scenario==='empty'){state.workouts=[];state.activeWorkout=null;}
  if(scenario==='large'){
    const sample=state.workouts.at(-1),monday=new Date();monday.setDate(monday.getDate()-((monday.getDay()+6)%7));monday.setHours(10,30,0,0);
    state.workouts=Array.from({length:104},(_,index)=>{const date=new Date(monday);date.setDate(date.getDate()-index*7);const workout=structuredClone(sample);
      Object.assign(workout,{id:`streak-size-sample-${index}`,startedAt:date.getTime()-30*60000,completedAt:date.toISOString(),utcOffsetMinutesAtStart:date.getTimezoneOffset()});
      workout.exercises=workout.exercises.slice(0,1).map(exercise=>({...exercise,sets:exercise.sets.slice(0,1)}));
      delete workout.historicalImport;delete workout.sourceDate;return workout;});
  }
  if(scenario==='open')state.workouts=state.workouts.filter(workout=>D.workoutPerformedDate(workout)<D.weekKey());
  state.selectedDate=D.isoDay();state.selectedDay=D.weekday();return state;
}
if(localStorage.getItem('fixture-key')!==key){
  localStorage.clear();localStorage.setItem(D.STORAGE_KEY,D.serializeState(fixture()));localStorage.setItem('fixture-key',key);
}
createRoot(document.getElementById('root')).render(<RookRoot/>);
