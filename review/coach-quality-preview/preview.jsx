import {scopedStorage,scopedDatabases} from '../theme-preview/isolation.js';
if(!import.meta.env.DEV||import.meta.env.MODE!=='theme-preview'||import.meta.env.VITE_ROOK_ACCOUNT_SYNC_ROLLOUT!=='false')throw Error('Isolated local preview only.');
const query=new URLSearchParams(location.search),scenario=query.get('scenario')||'occupied',fixture=query.get('fixture')||'v1';
const prefix=`rook-coach-quality-preview:${scenario}:${fixture}:`;
const originals=Object.fromEntries(['localStorage','sessionStorage','indexedDB'].map(key=>[key,Object.getOwnPropertyDescriptor(window,key)]));
for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{configurable:true,value:scopedStorage(window[key],prefix)});
Object.defineProperty(window,'indexedDB',{configurable:true,value:scopedDatabases(window.indexedDB,prefix)});
const React=await import('react'),{createRoot}=await import('react-dom/client');
const {coachQualityFixture}=await import('/src/coachQuality.fixture.js');
const {coachCombineReply}=await import('/src/coachCombine.js');
const {serializeState,readStartupState,deserializeState}=await import('/src/domain.js');
const {createCoachDayContext,coachDayStarter}=await import('/src/coachDayContext.js');
const {addCalendarDays}=await import('/src/flexibleWeek.js');
const {isoDay,weekKey}=await import('/src/domain.js');
const {applyCoachRequestResult}=await import('/src/coachRequestResult.js');
if(!localStorage.getItem('lift-v2-state')){
  let state=coachQualityFixture({todayThird:scenario==='occupied'});state.profile.appearancePreference=query.get('appearance')==='light'?'light':'dark';state.profile.themePreference=state.profile.appearancePreference;state.profile.stylePreference='standard';state=deserializeState(serializeState(state),{strict:true});
  let message=scenario==='time'?'Združi oba zamujena treninga':scenario==='sources'?'Združi mi dva workouta':'Združi mi moj Push in Pull, imam eno uro';
  let requestContext;
  if(scenario==='context'){requestContext=createCoachDayContext(state,weekKey());state.coachConversationMeta[state.activeCoachConversationId].dayContext=requestContext;message=`${coachDayStarter(requestContext)}Združi ta trening s Pull, 60 min`;}
  const content=scenario==='context'?message.slice(coachDayStarter(requestContext).length):message;
  const reply=await coachCombineReply(state,content,{language:'Slovenian',anchorSessionId:requestContext?.occurrenceId});
  state.conversations=[{id:'coach-quality-example',conversationId:state.activeCoachConversationId,user:message,reply,createdAt:Date.now(),...(requestContext?{requestContext}:{})}];
  if(scenario==='correction'){
    const first={id:'old-weekly-review',conversationId:state.activeCoachConversationId,user:'Združi mi dva workouta',reply:{text:'Predlog za pregled tedna.',action:{type:'week-schedule-change',changes:[]}},createdAt:Date.now()-60000};
    state.conversations=[first,{id:'coach-quality-example',conversationId:state.activeCoachConversationId,user:message,reply:null,coachRequestId:'synthetic-correction',createdAt:Date.now()}];
    state=applyCoachRequestResult(state,{profileId:state.profile.id,entryId:'coach-quality-example',conversationId:state.activeCoachConversationId,requestId:'synthetic-correction'},{reply:{...reply,supersededEntryIds:[first.id]}});
  }
  localStorage.setItem('lift-v2-state',serializeState(state));
}
const {Coach,Today,Progress,Profile,ActiveWorkout,Complete,Detail,ModalLayer,SheetHeader,BottomNav,useLiftState}=await import('/src/App.jsx');
const {PersonalThemesProvider,usePersonalThemes}=await import('/src/PersonalThemesContext.jsx');
const {useResolvedTheme}=await import('/src/useResolvedTheme.js');
const {bindNavigationFocus}=await import('/src/navigationFocus.js');
const {bindPressFeedback}=await import('/src/pressFeedback.js');
const {observeVisibleViewport}=await import('/src/sheetVisibleViewport.js');
for(const name of ['styles','overrides','overlay','calendar','workout-controls','onboarding-controls','import-plan','coach','landing','theme','navigationFocus','activeLoggerTouch','standalonePageZoom','pressFeedback','uiReadability','typography'])await import(/* @vite-ignore */`/src/${name}.css`);
const releases=[bindNavigationFocus(),bindPressFeedback(),observeVisibleViewport()],startup=readStartupState();
function Preview(){
  const[state,update]=useLiftState(startup),[page,setPage]=React.useState('coach'),[detail,setDetail]=React.useState(null),[closing,setClosing]=React.useState(false),background=React.useRef(null),themes=usePersonalThemes();
  const[coachEntry,setCoachEntry]=React.useState(null);
  const openAskCoach=date=>{setCoachEntry(createCoachDayContext(state,date));setDetail(null);setPage('coach');};
  const consumeCoachEntry=id=>setCoachEntry(current=>current?.id===id?null:current);
  useResolvedTheme(state.profile.appearancePreference,state.profile.stylePreference,themes.renderedPersonalTheme);
  React.useEffect(()=>setClosing(false),[detail]);
  const props={state,update,setPage,setDetail};
  const content=page==='today'?<Today {...props}/>:page==='progress'?<Progress {...props}/>:page==='profile'?<Profile {...props} onLogout={()=>{}}/>:page==='workout'?<ActiveWorkout {...props}/>:page==='complete'?<Complete {...props}/>:<Coach {...props} availability={{state:'ready'}} entryIntent={coachEntry} onEntryHandled={consumeCoachEntry}/>;
  return <div className="app-shell"><div className="app-content" ref={background}>{content}{(!detail||closing)&&!['workout','complete'].includes(page)&&<BottomNav page={page} setPage={setPage}/>}</div>
    {detail&&<ModalLayer backgroundRef={background} close={()=>setDetail(null)} onCloseStart={()=>setClosing(true)}><Detail {...props} detail={detail} close={()=>setDetail(null)} onAskCoach={openAskCoach}/></ModalLayer>}
  </div>;
}
const root=createRoot(document.getElementById('root'));root.render(<PersonalThemesProvider Modal={ModalLayer} Header={SheetHeader}><Preview/></PersonalThemesProvider>);
if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();releases.forEach(release=>release?.());for(const[key,descriptor]of Object.entries(originals)){if(descriptor)Object.defineProperty(window,key,descriptor);}});
