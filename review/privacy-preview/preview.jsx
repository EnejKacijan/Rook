import {scopedStorage,scopedDatabases} from '../theme-preview/isolation.js';
if(!import.meta.env.DEV||import.meta.env.MODE!=='theme-preview'||import.meta.env.VITE_ROOK_ACCOUNT_SYNC_ROLLOUT!=='false')throw Error('Isolated local preview only.');
const query=new URLSearchParams(location.search),prefix='rook-privacy-preview:v1:';
const originals=Object.fromEntries(['localStorage','sessionStorage','indexedDB'].map(key=>[key,Object.getOwnPropertyDescriptor(window,key)]));
const memory=()=>{const values=new Map();return {get length(){return values.size;},key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(String(key),String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};};
for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{configurable:true,value:scopedStorage(memory(),prefix)});
Object.defineProperty(window,'indexedDB',{configurable:true,value:scopedDatabases(window.indexedDB,prefix)});
const React=await import('react'),{createRoot}=await import('react-dom/client');
const {Profile,EntryLanding,ModalLayer,SheetHeader,Detail}=await import('/src/App.jsx');
const {AIDataConsent}=await import('/src/AIDataConsent.jsx'),{requireAiConsent}=await import('/src/privacyPreferences.js');
const {combineExample}=await import('/src/combineWorkouts.fixture.js');
const {PersonalThemesProvider,usePersonalThemes}=await import('/src/PersonalThemesContext.jsx');
const {useResolvedTheme}=await import('/src/useResolvedTheme.js');
const {savePersonalThemePreference}=await import('/src/personalThemePreference.js');
savePersonalThemePreference({basePalette:'forest',appearance:query.get('appearance')==='light'?'light':'dark',paletteCustomizations:{}});
for(const name of ['styles','overrides','overlay','calendar','workout-controls','onboarding-controls','import-plan','coach','landing','theme','navigationFocus','activeLoggerTouch','standalonePageZoom','pressFeedback','uiReadability','typography'])await import(/* @vite-ignore */`/src/${name}.css`);
const {bindNavigationFocus}=await import('/src/navigationFocus.js'),{bindPressFeedback}=await import('/src/pressFeedback.js'),{observeVisibleViewport}=await import('/src/sheetVisibleViewport.js');
const releases=[bindNavigationFocus(),bindPressFeedback(),observeVisibleViewport()];
function Preview(){
 const [state,setState]=React.useState(combineExample),[detail,setDetail]=React.useState(null),[message,setMessage]=React.useState(''),background=React.useRef(null),themes=usePersonalThemes();
 useResolvedTheme(query.get('appearance')==='light'?'light':'dark','standard',themes.renderedPersonalTheme);
 const update=fn=>setState(previous=>fn(structuredClone(previous)));
 return <><details style={{padding:'8px 16px'}}><summary>Synthetic review controls</summary><button onClick={async()=>{try{await requireAiConsent();setMessage('Consent accepted. Preview only: no AI request sent.');}catch{setMessage('AI declined. No data sent.');}}}>Test AI consent</button><p role="status">{message}</p></details><div className="app-shell"><div ref={background} className="app-content">{query.get('scenario')==='entry'?<EntryLanding personalize={()=>{}} ownWorkouts={()=>{}} trainFreestyle={()=>{}} bringPlan={()=>{}} restoreBackup={()=>{}} signIn={()=>{}}/>:<Profile state={state} update={update} setDetail={setDetail} onLogout={()=>setDetail('logout-confirm')}/>}</div>{detail&&<ModalLayer backgroundRef={background} close={()=>setDetail(null)}><Detail detail={detail} state={state} update={update} close={()=>setDetail(null)} setDetail={setDetail}/></ModalLayer>}</div></>;
}
const root=createRoot(document.getElementById('root'));root.render(<PersonalThemesProvider Modal={ModalLayer} Header={SheetHeader}><AIDataConsent Modal={ModalLayer} Header={SheetHeader}><Preview/></AIDataConsent></PersonalThemesProvider>);
if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();releases.forEach(release=>release?.());for(const[key,descriptor]of Object.entries(originals))if(descriptor)Object.defineProperty(window,key,descriptor);});
