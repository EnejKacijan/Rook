import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ActiveWorkout,Today,Detail,ModalLayer} from '/src/App.jsx';
import {createReturningUserFixture} from '/src/demoFixture.js';
import {saveState,startWorkout} from '/src/domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from '/src/freestyleWorkout.js';
import {templateDraft,saveWorkoutTemplate} from '/src/savedWorkouts.js';
import {useSemanticSwipeBack} from '/src/useSemanticSwipeBack.js';
import {bindNavigationFocus} from '/src/navigationFocus.js';
import {observeVisibleViewport} from '/src/sheetVisibleViewport.js';
import '/src/styles.css';import '/src/overrides.css';import '/src/overlay.css';import '/src/calendar.css';import '/src/workout-controls.css';import '/src/onboarding-controls.css';import '/src/import-plan.css';import '/src/coach.css';import '/src/landing.css';import '/src/theme.css';import '/src/navigationFocus.css';import '/src/activeLoggerTouch.css';
if(!import.meta.env.DEV||location.origin!=='http://127.0.0.1:4198')throw Error('Isolated development review only');
const params=new URLSearchParams(location.search),mode=params.get('mode')||'standalone';
const nativeStorage=window.localStorage,prefix='rook-saved-workout-review:';
Object.defineProperty(window,'localStorage',{value:{getItem:k=>nativeStorage.getItem(prefix+k),setItem:(k,v)=>nativeStorage.setItem(prefix+k,v),removeItem:k=>nativeStorage.removeItem(prefix+k)}});
for(const k of ['rook-install-meta-v1','rook-recovery-v1','rook-restore-journal-v1'])localStorage.removeItem(k);
const theme=params.get('theme')||'standard-light';
document.documentElement.dataset.appearance=theme.endsWith('dark')?'dark':'light';
document.documentElement.dataset.style=theme.startsWith('premium')?'premium':'standard';
let initial=createReturningUserFixture(1);
initial.profile.showExerciseImages=true;
initial.profile.restTimerEnabled=false;
initial.activeWorkout=null;
const completed=initial.workouts[0];
completed.name='Upper body, controlled unilateral strength and deliberate recovery';
completed.exercises[0].exerciseId='leg-press';
completed.exercises[1].importedName='Single Arm Dumbbell Tricep Extension with a deliberate pause and controlled eccentric';
completed.reusableStructure.name=completed.name;
completed.reusableStructure.exercises[0].exerciseId='leg-press';
completed.reusableStructure.exercises[1].importedName=completed.exercises[1].importedName;
initial=saveWorkoutTemplate(initial,templateDraft(completed,initial),{id:'saved-review-template'});
if(mode==='embedded'||mode==='standalone-active')initial=addFreestyleExercise(startFreestyleWorkout(initial),'plank');
if(mode==='planned')initial.activeWorkout=startWorkout(initial,initial.program.days[0]);
saveState(initial);
bindNavigationFocus();observeVisibleViewport();
function Harness(){
  useSemanticSwipeBack();
  const background=useRef(null);
  const [state,setState]=useState(initial),[detail,setDetail]=useState(mode==='completed'?{completedWorkout:completed.id}:mode==='embedded'?{freestylePicker:true}:'saved-workouts');
  const [page,setPage]=useState('today');
  const update=(fn,options)=>setState(previous=>{const next=fn(structuredClone(previous));if(!options?.persistedState)saveState(next);return next;});
  return <><div ref={background} className="app-shell">{state.activeWorkout&&page==='workout'?<ActiveWorkout state={state} update={update} setDetail={setDetail} setPage={setPage}/>:<Today state={state} update={update} setDetail={setDetail} setPage={setPage}/>}</div>
    {detail&&<ModalLayer backgroundRef={background} close={()=>setDetail(null)}>{requestClose=><Detail detail={detail} state={state} update={update} close={requestClose} setDetail={setDetail} setPage={setPage}/>}</ModalLayer>}
    <output id="saved-proof" hidden>{JSON.stringify({active:state.activeWorkout,templates:state.savedWorkoutTemplates,workouts:state.workouts,program:state.program})}</output>
  </>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
