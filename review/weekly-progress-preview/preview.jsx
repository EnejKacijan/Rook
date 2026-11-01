import {scopedStorage, scopedDatabases} from '../theme-preview/isolation.js';
if (!import.meta.env.DEV || import.meta.env.MODE !== 'theme-preview' || import.meta.env.VITE_ROOK_ACCOUNT_SYNC_ROLLOUT !== 'false') throw Error('Isolated local preview only.');
const query=new URLSearchParams(location.search), prefix=`rook-weekly-progress-preview:${query.get('fixture')||'v1'}:`;
const originals=Object.fromEntries(['localStorage','sessionStorage','indexedDB'].map(key=>[key,Object.getOwnPropertyDescriptor(window,key)]));
for(const key of ['localStorage','sessionStorage']) Object.defineProperty(window,key,{configurable:true,value:scopedStorage(window[key],prefix)});
Object.defineProperty(window,'indexedDB',{configurable:true,value:scopedDatabases(window.indexedDB,prefix)});
const React=await import('react'), {createRoot}=await import('react-dom/client');
const {combineExample}=await import('/src/combineWorkouts.fixture.js');
const {isoDay,weekKey,startWorkout,completeWorkout}=await import('/src/domain.js');
const {addCalendarDays}=await import('/src/flexibleWeek.js');
const {Progress,Profile,Today,Detail,ModalLayer,SheetHeader,BottomNav}=await import('/src/App.jsx');
const {PersonalThemesProvider,usePersonalThemes}=await import('/src/PersonalThemesContext.jsx');
const {savePersonalThemePreference}=await import('/src/personalThemePreference.js');
const {useResolvedTheme}=await import('/src/useResolvedTheme.js');
for(const name of ['styles','overrides','overlay','calendar','workout-controls','onboarding-controls','import-plan','coach','landing','theme','navigationFocus','activeLoggerTouch','standalonePageZoom','pressFeedback','uiReadability','typography']) await import(/* @vite-ignore */`/src/${name}.css`);
const {bindNavigationFocus}=await import('/src/navigationFocus.js'),{bindPressFeedback}=await import('/src/pressFeedback.js'),{observeVisibleViewport}=await import('/src/sheetVisibleViewport.js');
const releases=[bindNavigationFocus(),bindPressFeedback(),observeVisibleViewport()];
const finish=state=>{
  const next=structuredClone(state);
  next.activeWorkout.exercises.forEach(exercise=>exercise.sets.forEach(set=>{set.completed=true;set.reps=8;set.weight=20;}));
  return completeWorkout(next);
};
function fixture() {
  let state=combineExample(); const start=weekKey(), weekdays=['Mon','Tue','Wed','Thu','Fri'], sources=state.program.days;
  state.profile.id='synthetic-weekly-progress';state.profile.name='Demo';state.profile.daysPerWeek=5;state.profile.availableDays=weekdays;
  state.profile.appearancePreference=query.get('appearance')==='light'?'light':'dark';state.profile.stylePreference='standard';
  state.program.trainingBlock=null;state.program.rotationStartDate=start;state.program.createdAt=new Date(`${start}T08:00:00`).getTime();
  state.program.days=weekdays.map((weekday,index)=>({...structuredClone(sources[index%2]),id:`weekly-demo-${index}`,weekday}));
  for(let index=0;index<2;index++){
    const day=addCalendarDays(start,index);state.selectedDate=day;
    state.activeWorkout=startWorkout(state,state.program.days[index]);
    Object.assign(state.activeWorkout,{startedAt:new Date(`${day}T10:00:00`).getTime(),workoutDateKey:day});
    state=finish(state);
  }
  if(query.get('scenario')!=='idle'){
    state.selectedDate=addCalendarDays(start,2);state.activeWorkout=startWorkout(state,state.program.days[2]);
  }
  state.selectedDate=isoDay();return state;
}
savePersonalThemePreference({basePalette:query.get('palette')||'forest',appearance:query.get('appearance')==='light'?'light':'dark',paletteCustomizations:{}});
function Preview(){
  const[state,setState]=React.useState(fixture),[page,setPage]=React.useState('progress'),[detail,setDetail]=React.useState(null),background=React.useRef(null),themes=usePersonalThemes();
  useResolvedTheme(state.profile.appearancePreference,state.profile.stylePreference,themes.renderedPersonalTheme);
  const update=next=>setState(previous=>typeof next==='function'?next(structuredClone(previous)):next);
  const props={state,update,setPage,setDetail};
  const start=()=>setState(previous=>{const next=structuredClone(previous),index=Math.min(previous.workouts.length,4);next.selectedDate=addCalendarDays(weekKey(),index);next.activeWorkout=startWorkout(next,next.program.days[index]);return next;});
  return <><details style={{padding:'8px 16px',fontSize:14}}><summary>Synthetic preview controls</summary>
    <button disabled={Boolean(state.activeWorkout)||state.workouts.length>=5} onClick={start}>Start next demo session</button>{' '}
    <button disabled={!state.activeWorkout} onClick={()=>setState(finish)}>Complete demo session</button>{' '}
    <button onClick={()=>{setState(fixture());setPage('progress');}}>Reset demo</button>
  </details><div className="app-shell"><div className="app-content" ref={background}>
    {page==='profile'?<Profile {...props} onLogout={()=>{}}/>:page==='today'?<Today {...props}/>:<Progress {...props}/>}
    {!detail&&<BottomNav page={page} setPage={setPage}/>}
  </div>{detail&&<ModalLayer backgroundRef={background} close={()=>setDetail(null)}><Detail {...props} detail={detail} close={()=>setDetail(null)}/></ModalLayer>}</div></>;
}
const root=createRoot(document.getElementById('root'));root.render(<PersonalThemesProvider Modal={ModalLayer} Header={SheetHeader}><Preview/></PersonalThemesProvider>);
if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();releases.forEach(release=>release?.());for(const[key,descriptor]of Object.entries(originals))if(descriptor)Object.defineProperty(window,key,descriptor);});
