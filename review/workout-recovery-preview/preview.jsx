import {scopedStorage,scopedDatabases} from '../theme-preview/isolation.js';
if(!import.meta.env.DEV||import.meta.env.MODE!=='theme-preview'||import.meta.env.VITE_ROOK_ACCOUNT_SYNC_ROLLOUT!=='false')throw Error('Isolated synthetic review only.');
const query=new URLSearchParams(location.search),prefix='rook-workout-recovery-review:v1:';
const originals=Object.fromEntries(['localStorage','sessionStorage','indexedDB'].map(key=>[key,Object.getOwnPropertyDescriptor(window,key)]));
const memory=()=>{const values=new Map();return {get length(){return values.size;},key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(String(key),String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};};
for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{configurable:true,value:scopedStorage(memory(),prefix)});
Object.defineProperty(window,'indexedDB',{configurable:true,value:scopedDatabases(window.indexedDB,prefix)});
const React=await import('react'),{createRoot}=await import('react-dom/client');
const {ActiveWorkout,Complete,ModalLayer,SheetHeader}=await import('/src/App.jsx');
const {createReturningUserFixture}=await import('/src/demoFixture.js'),{startWorkout}=await import('/src/domain.js');
const {PersonalThemesProvider,usePersonalThemes}=await import('/src/PersonalThemesContext.jsx');
const {useResolvedTheme}=await import('/src/useResolvedTheme.js'),{savePersonalThemePreference}=await import('/src/personalThemePreference.js');
const appearance=query.get('appearance')==='light'?'light':'dark';
savePersonalThemePreference({basePalette:query.get('palette')||'forest',appearance,paletteCustomizations:{}});
for(const name of ['styles','overrides','overlay','calendar','workout-controls','onboarding-controls','import-plan','coach','landing','theme','navigationFocus','activeLoggerTouch','standalonePageZoom','pressFeedback','uiReadability','typography'])await import(/* @vite-ignore */`/src/${name}.css`);
if(query.get('text')==='200')document.documentElement.style.fontSize='200%';
const {bindNavigationFocus}=await import('/src/navigationFocus.js'),{bindPressFeedback}=await import('/src/pressFeedback.js'),{observeVisibleViewport}=await import('/src/sheetVisibleViewport.js');
const releases=[bindNavigationFocus(),bindPressFeedback(),observeVisibleViewport()];
function fixture(){
 const state=createReturningUserFixture(0),legacy=query.get('legacy')==='1';
 state.profile.id='workout-recovery-synthetic';state.profile.name='Demo';state.workouts=[];
 state.activeWorkout=startWorkout(state,state.program.days[0]);state.activeWorkout.startedAt=Date.now()-4*3600000;
 state.activeWorkout.lastMeaningfulWorkoutActivityAt=legacy?null:Date.now()-200*60000;
 if(query.get('sets')!=='0')Object.assign(state.activeWorkout.exercises[0].sets[0],{completed:true,completedAt:state.activeWorkout.lastMeaningfulWorkoutActivityAt,weight:30,reps:8});
 return state;
}
function Preview(){const [state,setState]=React.useState(fixture),[page,setPage]=React.useState('workout'),themes=usePersonalThemes();useResolvedTheme(appearance,'standard',themes.renderedPersonalTheme);
 const update=fn=>setState(previous=>fn(structuredClone(previous)));
 return <div className="app-shell"><div className="app-content">{page==='complete'?<Complete state={state} update={update} setPage={setPage} setDetail={()=>{}}/>:<ActiveWorkout state={state} update={update} setPage={setPage} setDetail={()=>{}}/>}</div></div>;
}
const root=createRoot(document.getElementById('root'));root.render(<PersonalThemesProvider Modal={ModalLayer} Header={SheetHeader}><Preview/></PersonalThemesProvider>);
if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();releases.forEach(release=>release?.());for(const[key,descriptor]of Object.entries(originals))if(descriptor)Object.defineProperty(window,key,descriptor);});
