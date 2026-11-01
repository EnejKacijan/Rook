import {scopedStorage,scopedDatabases} from '../theme-preview/isolation.js';
if(!import.meta.env.DEV||import.meta.env.MODE!=='theme-preview'||import.meta.env.VITE_ROOK_ACCOUNT_SYNC_ROLLOUT!=='false')throw Error('Isolated synthetic review only.');
const query=new URLSearchParams(location.search),prefix='rook-streak-detail-review:v1:';
const originals=Object.fromEntries(['localStorage','sessionStorage','indexedDB'].map(key=>[key,Object.getOwnPropertyDescriptor(window,key)]));
const memory=()=>{const values=new Map();return {get length(){return values.size;},key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(String(key),String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};};
for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{configurable:true,value:scopedStorage(memory(),prefix)});
Object.defineProperty(window,'indexedDB',{configurable:true,value:scopedDatabases(window.indexedDB,prefix)});
const React=await import('react'),{createRoot}=await import('react-dom/client');
const {Profile,ModalLayer,SheetHeader}=await import('/src/App.jsx');
const {combineExample}=await import('/src/combineWorkouts.fixture.js');
const {weekKey}=await import('/src/domain.js'),{addCalendarDays}=await import('/src/flexibleWeek.js');
const {PersonalThemesProvider,usePersonalThemes}=await import('/src/PersonalThemesContext.jsx');
const {useResolvedTheme}=await import('/src/useResolvedTheme.js');
const {savePersonalThemePreference}=await import('/src/personalThemePreference.js');
const appearance=query.get('appearance')==='light'?'light':'dark';
savePersonalThemePreference({basePalette:query.get('palette')||'forest',appearance,paletteCustomizations:{}});
for(const name of ['styles','overrides','overlay','calendar','workout-controls','onboarding-controls','import-plan','coach','landing','theme','navigationFocus','activeLoggerTouch','standalonePageZoom','pressFeedback','uiReadability','typography'])await import(/* @vite-ignore */`/src/${name}.css`);
if(query.get('text')==='200')document.documentElement.style.fontSize='200%';
const {bindNavigationFocus}=await import('/src/navigationFocus.js'),{bindPressFeedback}=await import('/src/pressFeedback.js'),{observeVisibleViewport}=await import('/src/sheetVisibleViewport.js');
const releases=[bindNavigationFocus(),bindPressFeedback(),observeVisibleViewport()];
function fixture(){
 const state=combineExample(),scenario=query.get('scenario')||'gap',offsets=scenario==='empty'?[]:scenario==='one'?[0]:scenario==='open'?[-14,-7]:scenario==='large'?Array.from({length:104},(_,index)=>-index*7):[-35,-28,-21,-7,0];
 state.profile.name='Demo';state.workouts=offsets.map((offset,index)=>{
  const day=addCalendarDays(weekKey(),offset),dayStart=new Date(`${day}T00:00:00`).getTime(),end=Math.min(new Date(`${day}T12:00:00`).getTime(),Date.now()),start=Math.max(dayStart,end-60000);
  return {id:`streak-review-${index}`,name:'Demo workout',status:'completed',startedAt:start,completedAt:new Date(end).toISOString(),utcOffsetMinutesAtStart:new Date(start).getTimezoneOffset(),exercises:[{sets:[{completed:true,reps:8,weight:0}]}]};
 });state.activeWorkout=null;state.optionalSessions=[];return state;
}
function Preview(){const [state]=React.useState(fixture),themes=usePersonalThemes();useResolvedTheme(appearance,'standard',themes.renderedPersonalTheme);
 return <div className="app-shell"><div className="app-content"><Profile state={state} update={()=>{}} setDetail={()=>{}} setPage={()=>{}}/></div></div>;
}
const root=createRoot(document.getElementById('root'));root.render(<PersonalThemesProvider Modal={ModalLayer} Header={SheetHeader}><Preview/></PersonalThemesProvider>);
if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();releases.forEach(release=>release?.());for(const[key,descriptor]of Object.entries(originals))if(descriptor)Object.defineProperty(window,key,descriptor);});
