import {scopedStorage,scopedDatabases} from '../theme-preview/isolation.js';
import {progressionScenario} from './progressionScenarios.js';
if(!import.meta.env.DEV||import.meta.env.MODE!=='theme-preview'||import.meta.env.VITE_ROOK_ACCOUNT_SYNC_ROLLOUT!=='false')throw Error('Isolated local preview only.');
const originals=Object.fromEntries(['localStorage','sessionStorage','indexedDB'].map(key=>[key,Object.getOwnPropertyDescriptor(window,key)]));
const query=new URLSearchParams(location.search),review=query.get('review');
const prefix=`rook-plan-workout-preview-${review&&/^[a-z0-9-]{1,40}$/.test(review)?review:'v1'}:`;
for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{configurable:true,value:scopedStorage(window[key],prefix)});
Object.defineProperty(window,'indexedDB',{configurable:true,value:scopedDatabases(window.indexedDB,prefix)});
const React=await import('react'),{createRoot}=await import('react-dom/client');
const {createReturningUserFixture}=await import('/src/demoFixture.js');
const {serializeState,isoDay,weekday,weekKey,startWorkout,buildProgram,deserializeState,blankState,firstScheduledDate}=await import('/src/domain.js');
const {flexibleSessions,applyFlexibleWeek,proposeFlexibleWeek,addCalendarDays}=await import('/src/flexibleWeek.js');
const {saveWorkoutTemplate}=await import('/src/savedWorkouts.js');
const {planWorkoutChoices,resolvePlanWorkout,startPlanWorkoutExtra}=await import('/src/planWorkoutTemplates.js');
const {PERSONAL_THEME_PREFERENCE,savePersonalThemePreference}=await import('/src/personalThemePreference.js');
if(localStorage.getItem('lift-v2-state')===null){
  let state=createReturningUserFixture(2);
  state.profile.id='plan-workouts-synthetic';state.profile.name='Demo';state.profile.ageRange='30–39';
  state.profile.appearancePreference='dark';state.selectedDate=isoDay();state.selectedDay=weekday();
  if(query.get('menu')==='1'){
    const {dayOverflowFixture}=await import('/src/dayOverflow.fixture.js');
    state=dayOverflowFixture({count:2});state.profile.name='Demo';state.profile.appearancePreference='dark';
  }
  if(query.get('adjust')==='1'){
    state.workouts=[];state.todayAdaptation=null;state.activeWorkout=null;
    state.profile.availableDays=[weekday(),...['Mon','Wed','Fri'].filter(day=>day!==weekday()).slice(0,2)];state.profile.daysPerWeek=3;state.profile.sessionMinutes=60;state.profile.rirEnabled=true;
    state.program=buildProgram(state.profile);state.program.trainingBlock.startDate=isoDay();state.program.rotationStartDate=isoDay();state=deserializeState(state);
  }
  if(query.get('firstweek')==='1'){
    state=blankState();Object.assign(state.profile,{id:'first-week-synthetic',name:'Demo',goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true,appearancePreference:'dark'});
    state.program=buildProgram(state.profile);state.program.rotationStartDate=firstScheduledDate(state.program);
    state.selectedDate=isoDay();state.selectedDay=weekday();state=deserializeState(state);
  }
  if(['schedule','clutter'].includes(query.get('audit'))){
    const {addCalendarDays,flexiblePlanFingerprint}=await import('/src/flexibleWeek.js');
    state.program.trainingBlock.startDate=addCalendarDays(weekKey(),-21);state.program.rotationStartDate=state.program.trainingBlock.startDate;
    state=deserializeState(state);
    const fingerprint=flexiblePlanFingerprint(state);
    state.flexibleWeek={schemaVersion:1,revision:1,generation:'synthetic-review-audit',sessions:Object.fromEntries(state.workouts.map((w,index)=>{
      const originalDate=w.originalScheduledDate,day=state.program.days.find(d=>d.id===w.templateId)||state.program.days[index%state.program.days.length],id=`${day.id}:${originalDate}`;
      w.logicalSessionId=id;w.sourcePlanSlotId=id;
      return [id,{id,workoutId:day.id,name:day.name,originalDate,scheduledDate:addCalendarDays(originalDate,1),skipped:false,blockId:state.program.trainingBlock.id,blockWeekNumber:1,planFingerprint:index===0?'old-synthetic-plan':fingerprint,updatedAt:`${originalDate}T10:00:00.000Z`}];
    }))};
    const source=flexibleSessions(state).filter(s=>s.status==='missed').at(-1);
    if(source){const moved=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:source.logicalSessionId,toDate:isoDay()}));if(moved.status==='applied')state=moved.state;}
    if(query.get('audit')==='clutter'){const future=flexibleSessions(state).find(row=>row.status==='planned'&&row.scheduledDate>isoDay());if(future){const moved=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:future.logicalSessionId,toDate:addCalendarDays(future.scheduledDate,2)}));if(moved.status==='applied')state=moved.state;}}
  }
  if(query.get('recovery')==='1'){
    state.profile.availableDays=['Mon','Wed','Fri'];state.profile.daysPerWeek=3;
    state.program=buildProgram(state.profile);state.program.trainingBlock.startDate=weekKey();state.program.rotationStartDate=weekKey();state.workouts=[];state=deserializeState(state);
    const source=flexibleSessions(state).filter(item=>item.status==='missed').at(-1);
    if(source){const moved=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:source.logicalSessionId,toDate:isoDay()}));if(moved.status==='applied'){state=moved.state;state.program.days[0].name='Updated plan workout';}}
  }
  if(query.get('schedule')==='1'){
    // A plan already accepted at the beginning of this week, so the isolated
    // demo includes recoverable missed occurrences as well as future ones.
    state.program.trainingBlock.startDate=weekKey();state.program.rotationStartDate=weekKey();
  }
  if(query.get('history')==='varied'){
    const exerciseId=state.program.days[0].exercises[0].exerciseId;
    for(const workout of state.workouts){
      const previous=workout.exercises.find(exercise=>exercise.exerciseId===exerciseId);
      previous?.sets.forEach((set,index)=>Object.assign(set,{weight:[15,15,12.5][index]??12.5,reps:[8,7,8][index]??8}));
    }
  }
  if(query.get('long')==='1')state.program.days[0].name='Upper body strength — chest, back, shoulders and arms';
  progressionScenario(state,query.get('guidance'));
  if(query.get('stats')==='weight'){
    state.progressFocusOverrideByPlanId={...(state.progressFocusOverrideByPlanId||{}),[state.program.id]:'lose_fat'};
    state.weightTrackingEnabled=true;
    state.weightCheckins=['2026-09-21','2026-09-24','2026-09-28','2026-10-01','2026-10-05','2026-10-08','2026-10-12','2026-10-15','2026-10-19','2026-10-22','2026-10-25'].map((localDate,i)=>({id:`stat-weight-${i}`,localDate,weightKg:82-i*.15,createdAt:`${localDate}T08:00:00Z`,updatedAt:`${localDate}T08:00:00Z`}));
  }
  if(query.get('stats')==='estimate'){
    const exercise=state.program.days[0].exercises[0];
    state.workouts=[{id:'estimate-prior',workoutDateKey:'2026-10-24',completedAt:'2026-10-24T18:00:00Z',exercises:[{...structuredClone(exercise),sets:[{id:'estimate-prior-a',weight:30,reps:5,completed:true},{id:'estimate-prior-b',weight:25,reps:8,completed:true}]}]}];
    state.activeWorkout=startWorkout(state,state.program.days[0]);
    state.activeWorkout.exercises[0].sets.forEach((set,i)=>Object.assign(set,{weight:27.5,reps:9,completed:i===0}));
  }
  if(query.get('art-review')==='1'){state.program.days[0].exercises[0].exerciseId='romanian-deadlift';state.program.days[0].name='Lower B';state.program.days[0].workoutName='Lower B';}
  if(query.get('reuse')==='1'){
    state.program.days[0].name='Noge B';state.program.days[0].workoutName='Noge B';state.program.days[0].exercises.forEach(e=>{e.sets=e.sets.slice(0,2);});
    const {coachWorkoutReuseReply}=await import('/src/coachWorkoutReuse.js');
    state.activeCoachConversationId='synthetic-reuse';state.coachConversationMeta={'synthetic-reuse':{id:'synthetic-reuse',createdAt:Date.now(),lastActivityAt:Date.now(),lastUserActivityAt:Date.now(),localDateStarted:isoDay()}};
    state.conversations=[{id:'synthetic-reuse-entry',conversationId:'synthetic-reuse',createdAt:Date.now(),user:'Repeat my Noge B workout',reply:coachWorkoutReuseReply(state,'Repeat my Noge B workout')}];
  }
  const {draft}=resolvePlanWorkout(state,planWorkoutChoices(state)[0].reference);
  state=saveWorkoutTemplate(state,{...draft,name:'Quick upper body',exercises:draft.exercises.slice(0,3)},{id:'sample-saved'});
  if(['copy','repeat','lower'].includes(query.get('start'))){
    state.profile.increments.machines=2.5;
    if(query.get('start')==='copy')state=startPlanWorkoutExtra(state,{reference:planWorkoutChoices(state)[0].reference,requestId:'weight-carry-demo'});
    else state.activeWorkout=startWorkout(state,state.program.days[query.get('start')==='lower'?3:0]);
  }
  if(query.get('load')==='zero'&&state.activeWorkout){
    const exercise=state.activeWorkout.exercises[0];
    Object.assign(exercise,{exerciseId:'hip-thrust',loggingMode:'normal',loadRequirement:'required',repMin:12,repMax:12,restSeconds:90});
    delete exercise.importedExercise;delete exercise.importedName;delete exercise.originalImportedName;
    exercise.sets=exercise.sets.slice(0,2).map(set=>({...set,weight:0,reps:12,rir:null,completed:false,weightProvenance:'explicit',weightEntryMode:'manual'}));
    state.activeWorkout.exerciseIndex=0;state.activeWorkout.warmup=null;
  }
  if(['1','normal','yesterday'].includes(query.get('today-copy'))){
    state.program.trainingBlock.startDate=addCalendarDays(weekKey(),-7);state.program.rotationStartDate=state.program.trainingBlock.startDate;
    state.program.days[0].name='Upper B';state.program.days[0].workoutName='Upper B';state.program.days[0].nameEdited=true;
    state=deserializeState(serializeState(state),{strict:true});
    const source=flexibleSessions(state).find(row=>row.workoutId===state.program.days[0].id&&row.originalDate>=weekKey());
    const nextDate=addCalendarDays(isoDay(),1),moved=source&&applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:source.logicalSessionId,toDate:nextDate}));
    if(moved?.status==='applied')state=moved.state;
    if(query.get('today-copy')!=='normal'){
      const activeSource=flexibleSessions(state).find(row=>row.scheduledDate===isoDay()&&row.workoutId!==source?.workoutId);
      const activeTemplate=structuredClone(activeSource?.workout||state.program.days[2]);activeTemplate.name='Functional day';activeTemplate.workoutName='Functional day';
      const yesterday=query.get('today-copy')==='yesterday';
      state.activeWorkout=startWorkout(state,activeTemplate);state.activeWorkout.startedAt=Date.now()-(yesterday?30:6)*3600000;state.activeWorkout.lastMeaningfulWorkoutActivityAt=Date.now()-(yesterday?28:4)*3600000;
      if(yesterday){state.activeWorkout.workoutDateKey=isoDay(state.activeWorkout.startedAt);state.activeWorkout.canonicalPlanDate=state.activeWorkout.workoutDateKey;}
      const allSets=state.activeWorkout.exercises.flatMap(exercise=>exercise.sets);
      allSets.forEach((set,index)=>Object.assign(set,{weight:20,reps:10,completed:index<allSets.length-1,...(index<allSets.length-1?{completedAt:state.activeWorkout.lastMeaningfulWorkoutActivityAt}:{})}));
    }
  }
  if(['1','short'].includes(query.get('rest'))&&state.activeWorkout){
    const shortRest=query.get('rest')==='short';
    state.profile.restTimerEnabled=true;state.activeWorkout.rest=shortRest?{seconds:2,pending:true}:{seconds:180,endsAt:Date.now()+120000};
  }
  if(query.get('restnav')==='1'&&state.activeWorkout){
    state.activeWorkout.exercises[0].sets.forEach(set=>Object.assign(set,{completed:true,completedAt:Date.now()-10000,weight:set.weight??20,reps:set.reps??8}));
  }
  if(query.get('idle')==='1'){
    if(!state.activeWorkout)state=startPlanWorkoutExtra(state,{reference:planWorkoutChoices(state)[0].reference,requestId:'idle-demo'});
    const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);yesterday.setHours(18,0,0,0);
    const active=state.activeWorkout;active.startedAt=yesterday.getTime();active.workoutDateKey=isoDay(active.startedAt);active.canonicalPlanDate=active.workoutDateKey;active.lastMeaningfulWorkoutActivityAt=active.startedAt+40*60000;active.rest=null;
    Object.assign(active.exercises[0].sets[0],{completed:true,completedAt:active.lastMeaningfulWorkoutActivityAt,weight:30,reps:8});
  }
  if(query.get('applied')==='1'){
    state.activeCoachConversationId='synthetic-applied';state.coachConversationMeta={'synthetic-applied':{id:'synthetic-applied',createdAt:Date.now(),lastActivityAt:Date.now(),lastUserActivityAt:Date.now(),localDateStarted:isoDay()}};
    state.conversations=[{id:'synthetic-applied-entry',conversationId:'synthetic-applied',createdAt:Date.now(),user:'Add an optional workout.',reply:{text:'Workout prepared and applied.',action:{type:'add-today-workout',targetDate:isoDay(),name:'Example workout',exerciseIds:['plank'],minutes:30}},actionResult:{status:'applied',targetDate:isoDay(),workoutName:'Example workout'}}];
  }
  if(['swap','plan','optional','combine'].includes(query.get('audit'))){
    const audit=query.get('audit');let action;
    if(audit==='swap'){
      const rows=flexibleSessions(state).filter(row=>row.status==='planned').slice(0,2);
      action={type:'week-schedule-change',changes:rows.map((row,index)=>({workoutId:row.workoutId,fromDate:row.scheduledDate,toDate:rows[1-index].scheduledDate})),explanation:'These two sessions exchange their dates.'};
    }
    if(audit==='plan'){
      const day=state.program.days[0],source=day.exercises[0];
      const {compatibleReplacementCandidates}=await import('/src/domain.js');
      const replacement=compatibleReplacementCandidates(source,state.profile,day.exercises.map(exercise=>exercise.exerciseId))[0];
      action={type:'program-exercise-change',changes:[{workoutId:day.id,operations:[{type:'replace',exerciseEntryId:source.id,fromExerciseId:source.exerciseId,toExerciseId:replacement.id}],removeExerciseIds:[day.exercises.at(-1).exerciseId],addExerciseIds:[]}],explanation:'This updates the recurring workout in your weekly plan.'};
    }
    if(audit==='optional')action={type:'add-today-workout',targetDate:isoDay(),name:'Extra upper body',exerciseIds:['push-up','dumbbell-row','lateral-raise'],minutes:30,explanation:'A separate extra session for today.'};
    if(audit==='combine'){
      const {combineExample}=await import('/src/combineWorkouts.fixture.js');state=combineExample();state.profile.name='Demo';state.profile.id='synthetic-combine-review';state.selectedDate=isoDay();state.program.trainingBlock.startDate=weekKey();state.program.rotationStartDate=weekKey();
      const {buildCombinedProposal,combineSources}=await import('/src/combineWorkouts.js');
      action={type:'combine-workouts',proposal:buildCombinedProposal(state,{sourceIds:combineSources(state).filter(row=>row.status==='missed').slice(-2).map(row=>row.logicalSessionId),minutes:45}).proposal};
    }
    state.activeCoachConversationId='synthetic-review';state.coachConversationMeta={'synthetic-review':{id:'synthetic-review',createdAt:Date.now(),lastActivityAt:Date.now(),lastUserActivityAt:Date.now(),localDateStarted:isoDay()}};
    state.conversations=[{id:'synthetic-review-entry',conversationId:'synthetic-review',createdAt:Date.now(),user:{swap:'Swap these two workouts.',plan:'Update my weekly plan.',optional:'Prepare an extra workout.',combine:'Combine two missed workouts for today.'}[audit],reply:{text:'Here are the changes.',action}}];
  }
  localStorage.setItem('lift-v2-state',serializeState(state));
  if(localStorage.getItem(PERSONAL_THEME_PREFERENCE)===null)savePersonalThemePreference({basePalette:['halloween','champagne'].includes(query.get('palette'))?query.get('palette'):'forest',appearance:query.get('appearance')==='light'?'light':'dark',paletteCustomizations:{}});
}
const {RookRoot}=await import('/src/App.jsx');
const {bindNavigationFocus}=await import('/src/navigationFocus.js');
const {bindPressFeedback}=await import('/src/pressFeedback.js');
const {observeVisibleViewport}=await import('/src/sheetVisibleViewport.js');
for(const name of ['styles','overrides','overlay','calendar','workout-controls','onboarding-controls','import-plan','coach','landing','theme','navigationFocus','activeLoggerTouch','standalonePageZoom','pressFeedback','uiReadability','typography'])await import(`/src/${name}.css`);
const releases=[bindNavigationFocus(),bindPressFeedback(),observeVisibleViewport()];
function Preview(){return <>{query.get('chrome')!=='0'&&<aside style={{position:'fixed',zIndex:12000,top:0,left:0,right:0,padding:'6px 10px',display:'flex',justifyContent:'space-between',gap:12,background:'var(--rook-bg)',color:'var(--rook-secondary)',fontSize:12,borderBottom:'1px solid var(--rook-border)'}}><span>Sample data · Plan & saved workouts</span><button type="button" style={{background:'none',border:0,color:'var(--rook-accent-text)',cursor:'pointer'}} onClick={()=>{localStorage.clear();sessionStorage.clear();location.reload();}}>Reset demo</button></aside>}<RookRoot/></>;}
const root=createRoot(document.getElementById('root'));root.render(<Preview/>);
if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();releases.forEach(release=>release?.());for(const [key,descriptor]of Object.entries(originals)){if(descriptor)Object.defineProperty(window,key,descriptor);else delete window[key];}});
