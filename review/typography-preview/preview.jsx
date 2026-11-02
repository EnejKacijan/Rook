import {scopedStorage,scopedDatabases} from '../theme-preview/isolation.js';
if(!import.meta.env.DEV||import.meta.env.MODE!=='theme-preview'||import.meta.env.VITE_ROOK_ACCOUNT_SYNC_ROLLOUT!=='false')throw Error('Isolated synthetic review only.');
const query=new URLSearchParams(location.search),screen=query.get('screen')||'today';
const originals=Object.fromEntries(['localStorage','sessionStorage','indexedDB'].map(key=>[key,Object.getOwnPropertyDescriptor(window,key)]));
const memory=()=>{const values=new Map();return{get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(String(key),String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};};
for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{configurable:true,value:scopedStorage(memory(),'rook-typography-synthetic:')});
Object.defineProperty(window,'indexedDB',{configurable:true,value:scopedDatabases(window.indexedDB,'rook-typography-synthetic:')});
const OriginalDate=window.Date,fixed=new OriginalDate('2026-10-29T12:00:00').getTime();
window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
const React=await import('react'),{createRoot}=await import('react-dom/client');
const {combineExample}=await import('/src/combineWorkouts.fixture.js');
const {startWorkout,completeWorkout,estimateWorkoutMinutes}=await import('/src/domain.js');
const {Today,Coach,Progress,Profile,ActiveWorkout,Complete,Detail,ModalLayer,SheetHeader,BottomNav,RookRoot}=await import('/src/App.jsx');
const {PersonalThemesProvider,usePersonalThemes}=await import('/src/PersonalThemesContext.jsx');
const {useResolvedTheme}=await import('/src/useResolvedTheme.js');
const {savePersonalThemePreference}=await import('/src/personalThemePreference.js');
const {bindNavigationFocus}=await import('/src/navigationFocus.js'),{bindPressFeedback}=await import('/src/pressFeedback.js'),{observeVisibleViewport}=await import('/src/sheetVisibleViewport.js');
for(const name of ['styles','overrides','overlay','calendar','workout-controls','onboarding-controls','import-plan','coach','landing','theme','navigationFocus','activeLoggerTouch','standalonePageZoom','pressFeedback','uiReadability'])await import(/* @vite-ignore */`/src/${name}.css`);
if(query.get('version')==='before')await import('./baseline-78b8866.css');else await import('/src/typography.css');
if(query.get('text')==='200')document.documentElement.style.fontSize='200%';
savePersonalThemePreference({basePalette:query.get('palette')||'forest',appearance:query.get('appearance')==='light'?'light':'dark',paletteCustomizations:{}});
function fixture(){
  let state=combineExample();
  Object.assign(state.profile,{id:'synthetic-typography',name:'Demo',daysPerWeek:5,availableDays:['Mon','Tue','Wed','Thu','Fri'],appearancePreference:query.get('appearance')==='light'?'light':'dark',stylePreference:'standard'});
  const sources=state.program.days;
  state.program.days=state.profile.availableDays.map((weekday,index)=>({...structuredClone(sources[index%2]),id:`type-day-${index}`,weekday}));
  state.program.trainingBlock.startDate='2026-10-19';state.program.rotationStartDate='2026-10-19';
  state.selectedDate='2026-10-29';state.selectedDay='Thu';
  for(const [day,index,load]of [['2026-10-19',0,20],['2026-10-26',0,22.5],['2026-10-28',2,25]]){
    state.selectedDate=day;state.activeWorkout=startWorkout(state,state.program.days[index]);
    const startedAt=new Date(`${day}T10:00:00`).getTime();
    Object.assign(state.activeWorkout,{startedAt,workoutDateKey:day});
    for(const exercise of state.activeWorkout.exercises)for(const set of exercise.sets)Object.assign(set,{completed:true,reps:8,weight:load});
    state=completeWorkout(state,{endedAt:startedAt+40*60000,durationSeconds:2400});
  }
  state.selectedDate=screen==='rest'?'2026-10-31':'2026-10-29';state.selectedDay=screen==='rest'?'Sat':'Thu';
  state.activeCoachConversationId='type-chat';state.coachConversationMeta={'type-chat':{id:'type-chat',createdAt:fixed,lastActivityAt:fixed,lastUserActivityAt:fixed,localDateStarted:'2026-10-29'}};
  state.conversations=[{id:'type-coach',conversationId:'type-chat',user:'I have 45 minutes today. What should I focus on?',reply:{text:'Start with your main lifts, then keep the accessories brief. Keep your usual working weights and leave two reps in reserve.'},createdAt:fixed}];
  if(['workout','complete'].includes(screen)){
    state.selectedDate='2026-10-29';state.activeWorkout=startWorkout(state,state.program.days[3]);
    state.activeWorkout.startedAt=fixed-15*60000;state.activeWorkout.workoutDateKey='2026-10-29';
    if(screen==='workout')Object.assign(state.activeWorkout.exercises[0].sets[0],{completed:true,reps:8,weight:25});
    if(screen==='complete'){
      for(const exercise of state.activeWorkout.exercises)for(const set of exercise.sets)Object.assign(set,{completed:true,reps:8,weight:25});
      state=completeWorkout(state,{endedAt:fixed,durationSeconds:900});
    }
  }
  state.program.days.forEach(day=>{day.estimatedMinutes=estimateWorkoutMinutes(day,state.profile);});return state;
}
function Preview(){
  const[state,setState]=React.useState(fixture),[page,setPage]=React.useState(['coach','progress','profile','workout','complete'].includes(screen)?screen:'today');
  const[detail,setDetail]=React.useState(()=>screen==='settings'?'logging':screen==='adjust'?{adjustToday:{view:'mode'}}:screen==='exercise'?{exercise:state.program.days[0].exercises[0]}:null);
  const background=React.useRef(null),themes=usePersonalThemes();
  useResolvedTheme(state.profile.appearancePreference,state.profile.stylePreference,themes.renderedPersonalTheme);
  const update=next=>setState(previous=>typeof next==='function'?next(structuredClone(previous)):next),props={state,update,setPage,setDetail};
  const content=page==='profile'?<Profile {...props} onLogout={()=>{}}/>:page==='progress'?<Progress {...props}/>:page==='coach'?<Coach {...props} availability={{state:'ready'}}/>:page==='workout'?<ActiveWorkout {...props}/>:page==='complete'?<Complete {...props}/>:<Today {...props}/>;
  return <div className="app-shell"><div className="app-content" ref={background}>{content}{!detail&&!['workout','complete'].includes(page)&&<BottomNav page={page} setPage={setPage}/>}</div>{detail&&<ModalLayer backgroundRef={background} close={()=>setDetail(null)}><Detail {...props} detail={detail} close={()=>setDetail(null)}/></ModalLayer>}</div>;
}
const releases=[bindNavigationFocus(),bindPressFeedback(),observeVisibleViewport()];
const root=createRoot(document.getElementById('root'));root.render(screen==='intro'?<RookRoot/>:<PersonalThemesProvider Modal={ModalLayer} Header={SheetHeader}><Preview/></PersonalThemesProvider>);
if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();releases.forEach(release=>release?.());window.Date=OriginalDate;for(const[key,descriptor]of Object.entries(originals))if(descriptor)Object.defineProperty(window,key,descriptor);});
