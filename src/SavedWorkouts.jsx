import {NavigationChevron} from './NavigationChevron.jsx';
import React,{useId,useRef,useState,useLayoutEffect,useEffect,useMemo} from 'react';
import {createPortal} from 'react-dom';
import {SheetActionFooter} from './SheetActionFooter.jsx';
import {SearchInput} from './SearchInput.jsx';
import {OverflowIcon} from './OverflowIcon.jsx';
import {DestructiveConfirmationSheet} from './DestructiveConfirmationSheet.jsx';
import {ExercisePickerIdentity} from './ExercisePickerIdentity.jsx';
import {exerciseName,exerciseMeasure,exerciseCatalog,uid,pluralize} from './domain.js';
import {useDurableAction} from './useDurableAction.js';
import {focusNavigationTarget} from './navigationFocus.js';
import {useExerciseSearchSheet} from './useExerciseSearchSheet.js';
import {useExerciseRemoveUndo} from './SwipeActionRow.jsx';
import {canUndoWorkoutAddition,undoWorkoutAddition} from './freestyleWorkout.js';
import {startFreestyleWorkout} from './freestyleWorkout.js';
import {templateDraft,saveWorkoutTemplate,deleteWorkoutTemplate,templateUseIssues,templateOverlaps,useSavedWorkout} from './savedWorkouts.js';
import {saveFirstRunWorkout} from './firstRunNoPlan.js';
import {recordAccountSyncDeleteIntent} from './accountSyncOutbox.js';
import {planWorkoutChoices,resolvePlanWorkout,startPlanWorkoutExtra} from './planWorkoutTemplates.js';
import {planScheduledOptions,reviewPlanWorkoutStart,startScheduledPlanWorkout} from './planWorkoutSchedule.js';
import {PlanWorkoutStartSheet} from './PlanWorkoutStartSheet.jsx';
import {searchWorkoutNames} from './workoutSearch.js';
import './savedWorkouts.css';

export function SavedWorkouts({state,update,close,Header,Editor,Modal,onStarted,source=null,initialTemplateId=null,createNew=false,firstRun=false,embedded=false,scopeBar=null,onEditingChange,hidden=false,browseQuery,navigationRef,onViewChange,onBack,onSaved,dialogLabel}) {
  const {commit,latest}=useDurableAction(state,update);
  const screen=useRef(null),browseScroll=useRef(0),undo=useExerciseRemoveUndo();
  const overlapDescriptionId=useId();
  const [query,setQuery]=useState(''),[selection,setSelection]=useState(()=>initialTemplateId?structuredClone(state.savedWorkoutTemplates?.find(t=>t.id===initialTemplateId)||null):null),[draft,setDraft]=useState(()=>source?templateDraft(source,state):createNew?{name:'New workout',exercises:[]}:null);
  const [editing,setEditing]=useState(createNew),[renaming,setRenaming]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [deleteConfirmation,setDeleteConfirmation]=useState(null),[deleteError,setDeleteError]=useState('');
  const pendingDelete=useRef(null),deleteBackground=useRef(null),deleteSubmitted=useRef(false),deleteOutcome=useRef(null);
  const [optionsOpen,setOptionsOpen]=useState(false);
  const [planSelection,setPlanSelection]=useState(null);
  const [planStart,setPlanStart]=useState(null);
  const planStartBackground=useRef(null),planStartTrigger=useRef(null);
  const copyReference=useRef(null);
  const optionsBackground=useRef(null),optionsTrigger=useRef(null),optionsAction=useRef(null),actionFocus=useRef(null),editPosition=useRef(null);
  const editorDirty=useRef(false);
  const createId=useRef(uid('workout-template')),request=useRef(initialTemplateId?uid('template-use'):null),sessionId=useRef(state.activeWorkout?.id||null).current;
  const selected=selection,review=draft||planSelection?.todayDraft||planSelection?.draft||selected;
  const planChoices=!embedded&&!state.activeWorkout&&!firstRun&&!source?planWorkoutChoices(state):[];
  let planError='';
  if(planSelection){try{resolvePlanWorkout(state,planSelection.reference);}catch(e){planError=e.message;}}
  const scheduled=planError?null:planSelection?.scheduled;
  const searchQuery=browseQuery??query;
  const filteredPlanChoices=searchWorkoutNames(planChoices,searchQuery),filteredTemplates=searchWorkoutNames(state.savedWorkoutTemplates||[],searchQuery);
  useLayoutEffect(()=>{if(!review){const list=screen.current?.querySelector('.saved-workout-list');if(list)list.scrollTop=browseScroll.current;}},[Boolean(review)]);
  useLayoutEffect(()=>{onViewChange?.(Boolean(review));},[Boolean(review),onViewChange]);
  useLayoutEffect(()=>{onEditingChange?.(editing);return()=>onEditingChange?.(false);},[editing,onEditingChange]);
  useExerciseSearchSheet(screen,!embedded&&!editing,{focusedSearch:true,browsing:!review});
  useLayoutEffect(()=>{
    if(!editing&&editPosition.current!==null){
      const preview=screen.current?.querySelector('.saved-workout-preview');
      if(preview)preview.scrollTop=editPosition.current;
      editPosition.current=null;
    }
    if(optionsOpen||!actionFocus.current)return;
    const selector=actionFocus.current;actionFocus.current=null;
    let frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
      const target=screen.current?.querySelector(selector);
      target?.scrollIntoView?.({block:'nearest'});
      focusNavigationTarget(target);
    });});
    return()=>cancelAnimationFrame(frame);
  },[optionsOpen,editing,renaming]);
  useEffect(()=>{
    if(optionsOpen||!pendingDelete.current)return;
    // Mount the next nested sheet after the options sheet has released its
    // focus/background ownership, keeping the original detail and scroller.
    const frame=requestAnimationFrame(()=>{
      deleteBackground.current=screen.current?.closest('.modal-layer')?.firstElementChild||screen.current;
      setDeleteError('');deleteSubmitted.current=false;deleteOutcome.current=null;
      setDeleteConfirmation(pendingDelete.current);pendingDelete.current=null;
    });
    return()=>cancelAnimationFrame(frame);
  },[optionsOpen]);
  const edit=()=>{editPosition.current=screen.current?.querySelector('.saved-workout-preview')?.scrollTop||0;setEditing(true);};
  const dismissOptions=()=>{
    const action=optionsAction.current;optionsAction.current=null;setOptionsOpen(false);
    if(action==='rename'){setDraft(structuredClone(selected));setRenaming(true);actionFocus.current='.saved-template-name input';}
    if(action==='edit'){edit();actionFocus.current='h1';}
    if(action==='delete')pendingDelete.current={id:selected.id,revision:selected.revision,name:selected.name};
  };
  const chooseOption=(action,requestClose)=>{
    if(optionsAction.current)return;
    optionsAction.current=action;
    if(requestClose()===false)optionsAction.current=null;
  };
  const reset=()=>{setDraft(null);setSelection(null);setPlanSelection(null);setPlanStart(null);copyReference.current=null;setRenaming(false);setEditing(false);setError('');setConfirmed(false);};
  const closeDelete=()=>{
    setDeleteConfirmation(null);setDeleteError('');
    if(deleteOutcome.current){
      const {syncDeleteFailed}=deleteOutcome.current;deleteOutcome.current=null;
      reset();
      setNotice('');
      undo.show({message:syncDeleteFailed?'Saved workout deleted locally. Cloud removal needs attention.':'Saved workout deleted'});
    }
  };
  const confirmDelete=requestClose=>{
    if(deleteSubmitted.current||!deleteConfirmation)return;
    deleteSubmitted.current=true;
    try{
      const {id,revision}=deleteConfirmation;
      const result=commit(current=>deleteWorkoutTemplate(current,id,revision));
      let syncDeleteFailed=false;
      if(result.changed){try{recordAccountSyncDeleteIntent(globalThis.localStorage,result.state.profile.id,'savedWorkoutTemplates',id);}catch{syncDeleteFailed=true;}}
      deleteOutcome.current={syncDeleteFailed};
      requestClose();
    }catch(e){deleteSubmitted.current=false;setDeleteError(e.message);}
  };
  const leaveFirstRun=()=>{
    if ((editorDirty.current || draft?.exercises.length || draft?.name !== 'New workout') &&
        !window.confirm('Discard this workout draft and return to the start?')) return;
    close();
  };
  const back=()=>{if(firstRun){leaveFirstRun();return;}if(editing){setEditing(false);return;}if(source&&onBack){onBack();return;}if(renaming){setRenaming(false);setDraft(null);copyReference.current=null;return;}if(source){close();return;}reset();};
  if(navigationRef)navigationRef.current=back;
  const save=value=>{
    try{const result=commit(current=>{if(copyReference.current)resolvePlanWorkout(current,copyReference.current);return (firstRun?saveFirstRunWorkout:saveWorkoutTemplate)(current,value,{id:selected?.id||createId.current,revision:selected?.revision??null});});if(!result.changed)return;setNotice('Workout saved');if(firstRun||source){(onSaved||close)();return;}reset();}catch(e){setError(e.message);}
  };
  const openPlan=choice=>{
    try{
      const current=latest.current,{draft}=resolvePlanWorkout(current,choice.reference),scheduled=planScheduledOptions(current,choice.reference);
      const today=scheduled.options.find(item=>item.date===scheduled.today);
      const actual=today?reviewPlanWorkoutStart(current,{reference:choice.reference,snapshot:scheduled,sessionId:today.id}):null;
      browseScroll.current=screen.current?.querySelector('.saved-workout-list')?.scrollTop||0;
      setPlanSelection({...choice,draft,scheduled,todayDraft:actual?.draft,adjusted:actual?.adjusted});request.current=uid('plan-extra');setError('');setNotice('');
    }catch(e){setError(e.message);}
  };
  const startExtra=()=>{
    try{const result=commit(current=>startPlanWorkoutExtra(current,{reference:planSelection.reference,requestId:request.current}));if(result.changed)onStarted?.();}catch(e){setError(e.message);}
  };
  const startScheduled=details=>{
    try{const result=commit(current=>startScheduledPlanWorkout(current,{reference:planSelection.reference,requestId:request.current,...details}));if(result.changed)onStarted?.();return true;}catch(e){setError(e.message);return false;}
  };
  const choosePlanStart=()=>{
    setError('');
    const today=scheduled.options.find(item=>item.date===scheduled.today);
    if(today){startScheduled({snapshot:scheduled,sessionId:today.id});return;}
    planStartBackground.current=screen.current?.closest('.modal-layer')?.firstElementChild||screen.current;
    setPlanStart(scheduled);
  };
  const copyPlan=()=>{
    try{const {draft}=resolvePlanWorkout(latest.current,planSelection.reference);copyReference.current=planSelection.reference;screen.current?.querySelector('.saved-workout-preview')?.scrollTo?.({top:0});actionFocus.current='.saved-template-name input';setDraft({...draft,name:draft.name.slice(0,100)});setPlanSelection(null);setRenaming(true);setError('');createId.current=uid('workout-template');}catch(e){setError(e.message);}
  };
  const create=()=>{createId.current=uid('workout-template');setDraft({name:'New workout',exercises:[]});setEditing(true);setError('');};
  const use=()=>{
    try{const result=commit(current=>useSavedWorkout(current,{templateId:selected.id,revision:selected.revision,sessionId,requestId:request.current,confirmDuplicates:confirmed}));if(result.changed){setNotice(sessionId?'Exercises added to Up Next':'Workout started');if(!sessionId)onStarted?.();else {const record={sessionId,requestId:request.current,ids:result.state.activeWorkout.exercises.filter(e=>e.queueAdditionId===request.current).map(e=>e.id)};undo.show({message:`${record.ids.length} exercises added`,valid:()=>canUndoWorkoutAddition(latest.current,record),undo:()=>{try{commit(current=>undoWorkoutAddition(current,record));setNotice('Addition undone');}catch(e){setError(e.message);}}});}}}catch(e){setError(e.message);}
  };
  const issues=review?templateUseIssues(state,review):[],overlaps=selected?templateOverlaps(state,selected):[];
  const editorSource=useMemo(()=>editing&&review&&{id:'saved-workout-editor',source:'manual',name:review.name,days:[{id:'saved-workout-day',name:review.name,workoutName:review.name,weekday:'Mon',exercises:structuredClone(review.exercises).map(e=>({...e,sets:e.sets.map(s=>({...s,completed:false}))}))}]},[editing,review]);
  const applied=state.activeWorkout?.queueCommandIds?.includes(request.current);
  return <><main hidden={hidden} data-plan-start-open={Boolean(planStart)} ref={screen} role={dialogLabel ? 'dialog' : undefined} aria-modal={dialogLabel ? 'true' : undefined} aria-label={dialogLabel} className={`${embedded?'':'screen detail-screen '}${editing?'edit-plan-screen ':''}saved-workouts`}>
    {!embedded&&<Header title={planSelection?'From your plan':source?'Save workout':editing&&!selected?'Create workout':editing?'Edit saved workout':draft&&!selected?'Save workout':review?'Saved workout':'Choose a workout'} onBack={firstRun||review?back:undefined} backLabel={firstRun?'Back to start':'Back'} onClose={firstRun?undefined:close}/>}
    {!review&&scopeBar}
    {editing?<Editor mode="edit" workoutOnly source={editorSource} profile={state.profile} exerciseState={state}
      copyOverride={{eyebrow:selected?'SAVED WORKOUT':'CREATE WORKOUT',title:selected?'Edit workout':'Build your workout',body:'Choose exercises and set targets for your workout.',action:'REVIEW WORKOUT'}}
      onSave={program=>{editorDirty.current=true;setDraft({name:review.name,exercises:program.days[0].exercises});setEditing(false);setRenaming(true);}} onCancel={firstRun?leaveFirstRun:()=>setEditing(false)} onDirtyChange={firstRun?value=>{editorDirty.current=value;}:undefined}/>:review?<>
      <div className="saved-workout-preview" data-sheet-form-scroll data-exercise-search-scroll>
      {(source||renaming||draft)?<label className="saved-template-name">Workout name<input maxLength={100} value={review.name} onChange={e=>setDraft({...review,name:e.target.value})}/></label>:<div className="saved-template-title"><h1>{review.name}</h1>{!planSelection&&<button ref={optionsTrigger} className="saved-template-options-trigger" type="button" aria-label="Saved workout options" aria-haspopup="dialog" aria-expanded={optionsOpen} onClick={()=>{optionsBackground.current=screen.current.closest('.screen')||screen.current;optionsAction.current=null;setOptionsOpen(true);}}><OverflowIcon/></button>}</div>}
      <p>{planSelection?`${planSelection.contextLabel} · `:''}{pluralize(review.exercises.length,'exercise')}{!planSelection&&' · Reuse these exercises and targets anytime.'}</p>
      {planSelection?.todayDraft&&<p className="plan-template-note">{planSelection.adjusted?'Adjusted for today':'Scheduled for today'}</p>}
      {copyReference.current&&<p className="plan-template-note">Saved separately from your plan.</p>}
      <ol className="saved-template-exercises">{review.exercises.map((e,index)=><li key={e.id||index}><ExercisePickerIdentity item={e.importedExercise||exerciseCatalog[e.exerciseId]||{id:e.exerciseId,name:exerciseName(e)}} enabled={state.profile.showExerciseImages!==false}><strong>{exerciseName(e)}</strong><small>{pluralize(e.sets.length,'set')} · {e.repMin==null?'Target not set':`${e.repMin}${e.repMax!==e.repMin?`–${e.repMax}`:''} ${exerciseMeasure(e)==='seconds'?'sec':'reps'}`}{e.loggingMode==='per_side'?' · per side':''}</small></ExercisePickerIdentity></li>)}</ol>
      {planSelection?<div className="plan-template-actions">
        {planError&&<p role="alert">{planError}</p>}
        {issues.length>0&&<div role="status"><p>Review before using</p><ul>{issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul></div>}
        <p id={`${overlapDescriptionId}-extra`} className="plan-template-note">{scheduled?.options.length?'Use a scheduled workout, or start an extra without changing your plan.':'This won’t mark a scheduled workout as complete.'}</p>
        {state.activeWorkout||state.activeOptionalSession?<><p role="status">Resume or finish your active session first.</p><button key="resume" type="button" className="button primary" onClick={state.activeWorkout?onStarted:close}>{state.activeWorkout?'Resume workout':'Back to Today'}</button></>:<>
          {scheduled?.options.length>0&&<button ref={planStartTrigger} type="button" className="button primary" disabled={Boolean(planError)} onClick={choosePlanStart}>{scheduled.options.some(item=>item.date===scheduled.today)?'Start planned workout':'Start workout'}</button>}
          <button key="extra" type="button" className={scheduled?.options.length?'text-button':'button primary'} aria-describedby={`${overlapDescriptionId}-extra`} disabled={Boolean(planError)||issues.length>0} onClick={planSelection.todayDraft&&planSelection.adjusted?()=>{setPlanSelection({...planSelection,todayDraft:null,scheduled:null,adjusted:false});setError('');}:startExtra}>{planSelection.todayDraft&&planSelection.adjusted?'Preview extra workout':'Start extra workout'}</button>
        </>}
        <button type="button" className="text-button" disabled={Boolean(planError)} onClick={copyPlan}>Save a copy</button>
      </div>:(source||draft||renaming)?<>{source&&<p className="saved-template-copy-note">Saves the exercises and targets, not your logged results.</p>}<SheetActionFooter keyboardBehavior="pin-if-room" className="saved-template-save-actions"><button data-keyboard-secondary className="text-button" type="button" onClick={edit}>Edit workout</button><button className="button primary" type="button" disabled={!review.name.trim()||!review.exercises.length} onClick={()=>save(review)}>{selected ? 'SAVE CHANGES' : 'SAVE WORKOUT'}</button></SheetActionFooter></>:<>
        {issues.length>0&&<div role="status"><p>Review before using</p><ul>{issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul></div>}
        {!applied&&overlaps.length>0&&<div className="saved-template-overlaps">
          <div id={overlapDescriptionId} className="saved-template-overlap-context">
            <p className="saved-template-overlap-heading">{overlaps.length===1?`${exerciseName(overlaps[0])} is already in this workout`:`${overlaps.length} exercises are already in this workout`}</p>
            {overlaps.length>2&&<ul>{overlaps.map((exercise,index)=><li key={exercise.id||index}>{exerciseName(exercise)}</li>)}</ul>}
            <p>{overlaps.length===1?'It will be added again as a separate exercise.':overlaps.length===2?`${overlaps.map(exerciseName).join(' and ')} will be added again as separate exercises.`:'They will be added again as separate exercises.'}</p>
          </div>
          <label className="saved-template-overlap-confirm"><input type="checkbox" aria-describedby={overlapDescriptionId} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>{overlaps.length===1?'Add it again':'Add them again'}</span></label>
        </div>}
        {new Set(review.exercises.map(e=>e.exerciseId)).size<review.exercises.length&&<p>Repeated exercises in this workout remain separate instances.</p>}
        {state.activeOptionalSession?<p>Finish your current workout before using this saved workout.</p>:<button className="button primary" type="button" disabled={applied||issues.length>0||overlaps.length>0&&!confirmed} onClick={use}>{applied?'Added to Up Next':state.activeWorkout?`Add ${review.exercises.length} exercises to Up Next`:'Start workout'}</button>}
      </>}
      </div>
    </>:<>
      {!embedded&&<SearchInput className="exercise-search" aria-label="Search workouts" placeholder="Search workouts" value={query} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')}/>}
      <div className="saved-workout-list" data-exercise-search-scroll>
      {filteredPlanChoices.length>0&&<section className="plan-template-list" aria-label="From your plan"><h2>From your plan</h2>{filteredPlanChoices.map(choice=><button key={choice.reference.dayId} type="button" className="list-row" onClick={()=>openPlan(choice)}><span><strong>{choice.name}</strong><small>{choice.contextLabel} · {pluralize(choice.exerciseCount,'exercise')}</small></span><NavigationChevron/></button>)}</section>}
      {!embedded&&<div className="saved-template-section-heading"><h2 className="saved-template-section-title">Saved workouts</h2><button className="text-button saved-workout-create" type="button" onClick={create}>Create workout</button></div>}
      {filteredTemplates.map(template=><button key={template.id} className="list-row" type="button" onClick={()=>{browseScroll.current=screen.current?.querySelector('.saved-workout-list')?.scrollTop||0;setSelection(structuredClone(template));request.current=uid('template-use');setConfirmed(false);setError('');}}><span><strong>{template.name}</strong><small>{template.exercises.length} exercises</small></span><NavigationChevron/></button>)}
      {!state.savedWorkoutTemplates?.length&&!planChoices.length&&<div className="saved-workouts-empty"><h2>{embedded?'No saved workouts yet':'No workouts yet'}</h2><p>Create a workout to reuse anytime, or save a completed workout for later.</p>{!embedded&&!state.activeWorkout&&!state.activeOptionalSession&&onStarted&&<button type="button" className="button primary" onClick={()=>{try{commit(startFreestyleWorkout);onStarted();}catch(e){setError(e.message);}}}>Start freestyle workout</button>}</div>}
      {Boolean(state.savedWorkoutTemplates?.length||planChoices.length)&&!filteredTemplates.length&&!filteredPlanChoices.length&&<p>No workouts match your search.</p>}
      </div>
    </>}
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
    {undo.surface}
  </main>
    {planStart&&planSelection&&<PlanWorkoutStartSheet state={state} reference={planSelection.reference} snapshot={planStart} Modal={Modal} Header={Header} close={()=>{setPlanStart(null);setError('');}} confirm={startScheduled} startExtra={startExtra} error={error} backgroundRef={planStartBackground} returnFocusRef={planStartTrigger}/>}
    {optionsOpen&&createPortal(<Modal close={dismissOptions} backgroundRef={optionsBackground} returnFocusRef={optionsTrigger} lockDocument={false}>{requestClose=><main className="screen detail-screen saved-template-options" role="dialog" aria-modal="true" aria-label="Saved workout options">
      <Header title="Saved workout options" onBack={requestClose} backLabel="Back to saved workout" onClose={requestClose}/>
      <button className="list-row" type="button" onClick={()=>chooseOption('rename',requestClose)}><span>Rename</span><NavigationChevron/></button>
      <button className="list-row" type="button" onClick={()=>chooseOption('edit',requestClose)}><span>Edit workout</span><NavigationChevron/></button>
      <button className="list-row danger-text" type="button" onClick={()=>chooseOption('delete',requestClose)}>Delete saved workout</button>
    </main>}</Modal>,document.body)}
    {deleteConfirmation&&<DestructiveConfirmationSheet Modal={Modal} Header={Header}
      title={`Delete “${deleteConfirmation.name}”?`}
      description={<><span>This removes only the saved workout.</span><span>Your workout history and active session stay saved.</span></>}
      confirmLabel="DELETE SAVED WORKOUT" keepLabel="KEEP WORKOUT" closeLabel="Close deletion confirmation" backLabel="Back to saved workout"
      confirm={confirmDelete} close={closeDelete} error={deleteError}
      backgroundRef={deleteBackground} returnFocusRef={optionsTrigger}/>}
  </>;
}
