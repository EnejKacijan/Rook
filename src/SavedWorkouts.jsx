import React,{useId,useRef,useState,useLayoutEffect,useMemo} from 'react';
import {createPortal} from 'react-dom';
import {SearchInput} from './SearchInput.jsx';
import {OverflowIcon} from './OverflowIcon.jsx';
import {ExercisePickerIdentity} from './ExercisePickerIdentity.jsx';
import {exerciseName,exerciseMeasure,exerciseCatalog,uid,pluralize} from './domain.js';
import {useDurableAction} from './useDurableAction.js';
import {focusNavigationTarget} from './navigationFocus.js';
import {useExerciseSearchSheet} from './useExerciseSearchSheet.js';
import {useExerciseRemoveUndo} from './SwipeActionRow.jsx';
import {canUndoWorkoutAddition,undoWorkoutAddition} from './freestyleWorkout.js';
import {templateDraft,saveWorkoutTemplate,deleteWorkoutTemplate,templateUseIssues,templateOverlaps,useSavedWorkout} from './savedWorkouts.js';
import {saveFirstRunWorkout} from './firstRunNoPlan.js';
import {recordAccountSyncDeleteIntent} from './accountSyncOutbox.js';
import './savedWorkouts.css';

export function SavedWorkouts({state,update,close,Header,Editor,Modal,onStarted,source=null,initialTemplateId=null,createNew=false,firstRun=false,embedded=false,scopeBar=null,onEditingChange,hidden=false,browseQuery,navigationRef,onViewChange,onBack,onSaved}) {
  const {commit,latest}=useDurableAction(state,update);
  const screen=useRef(null),browseScroll=useRef(0),undo=useExerciseRemoveUndo();
  const overlapDescriptionId=useId();
  const [query,setQuery]=useState(''),[selection,setSelection]=useState(()=>initialTemplateId?structuredClone(state.savedWorkoutTemplates?.find(t=>t.id===initialTemplateId)||null):null),[draft,setDraft]=useState(()=>source?templateDraft(source,state):createNew?{name:'New workout',exercises:[]}:null);
  const [editing,setEditing]=useState(createNew),[renaming,setRenaming]=useState(false),[deleting,setDeleting]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [optionsOpen,setOptionsOpen]=useState(false);
  const optionsBackground=useRef(null),optionsTrigger=useRef(null),optionsAction=useRef(null),actionFocus=useRef(null),editPosition=useRef(null);
  const editorDirty=useRef(false);
  const createId=useRef(uid('workout-template')),request=useRef(initialTemplateId?uid('template-use'):null),sessionId=useRef(state.activeWorkout?.id||null).current;
  const selected=selection,review=draft||selected;
  const searchQuery=browseQuery??query;
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
  },[optionsOpen,editing,renaming,deleting]);
  const edit=()=>{editPosition.current=screen.current?.querySelector('.saved-workout-preview')?.scrollTop||0;setEditing(true);};
  const dismissOptions=()=>{
    const action=optionsAction.current;optionsAction.current=null;setOptionsOpen(false);
    if(action==='rename'){setDraft(structuredClone(selected));setRenaming(true);actionFocus.current='.saved-template-name input';}
    if(action==='edit'){edit();actionFocus.current='h1';}
    if(action==='delete'){setDeleting(true);actionFocus.current='.saved-template-delete .secondary';}
  };
  const chooseOption=(action,requestClose)=>{
    if(optionsAction.current)return;
    optionsAction.current=action;
    if(requestClose()===false)optionsAction.current=null;
  };
  const reset=()=>{setDraft(null);setSelection(null);setRenaming(false);setDeleting(false);setEditing(false);setError('');setConfirmed(false);};
  const leaveFirstRun=()=>{
    if ((editorDirty.current || draft?.exercises.length || draft?.name !== 'New workout') &&
        !window.confirm('Discard this workout draft and return to the start?')) return;
    close();
  };
  const back=()=>{if(firstRun){leaveFirstRun();return;}if(editing){setEditing(false);return;}if(source&&onBack){onBack();return;}if(renaming){setRenaming(false);setDraft(null);return;}if(source){close();return;}reset();};
  if(navigationRef)navigationRef.current=back;
  const save=value=>{
    try{const result=commit(current=>(firstRun?saveFirstRunWorkout:saveWorkoutTemplate)(current,value,{id:selected?.id||createId.current,revision:selected?.revision??null}));if(!result.changed)return;setNotice('Workout saved');if(firstRun||source){(onSaved||close)();return;}createId.current=uid('workout-template');reset();}catch(e){setError(e.message);}
  };
  const use=()=>{
    try{const result=commit(current=>useSavedWorkout(current,{templateId:selected.id,revision:selected.revision,sessionId,requestId:request.current,confirmDuplicates:confirmed}));if(result.changed){setNotice(sessionId?'Exercises added to Up Next':'Workout started');if(!sessionId)onStarted?.();else {const record={sessionId,requestId:request.current,ids:result.state.activeWorkout.exercises.filter(e=>e.queueAdditionId===request.current).map(e=>e.id)};undo.show({message:`${record.ids.length} exercises added`,valid:()=>canUndoWorkoutAddition(latest.current,record),undo:()=>{try{commit(current=>undoWorkoutAddition(current,record));setNotice('Addition undone');}catch(e){setError(e.message);}}});}}}catch(e){setError(e.message);}
  };
  const issues=review?templateUseIssues(state,review):[],overlaps=selected?templateOverlaps(state,selected):[];
  const editorSource=useMemo(()=>editing&&review&&{id:'saved-workout-editor',source:'manual',name:review.name,days:[{id:'saved-workout-day',name:review.name,workoutName:review.name,weekday:'Mon',exercises:structuredClone(review.exercises).map(e=>({...e,sets:e.sets.map(s=>({...s,completed:false}))}))}]},[editing,review]);
  const applied=state.activeWorkout?.queueCommandIds?.includes(request.current);
  return <><main hidden={hidden} ref={screen} className={`${embedded?'':'screen detail-screen '}${editing?'edit-plan-screen ':''}saved-workouts`}>
    {!embedded&&<Header title={source?'Save workout':editing&&!selected?'Create workout':editing?'Edit saved workout':review?'Saved workout':'Saved workouts'} onBack={firstRun||review?back:undefined} backLabel={firstRun?'Back to start':'Back'} onClose={firstRun?undefined:close}/>}
    {!review&&scopeBar}
    {editing?<Editor mode="edit" workoutOnly source={editorSource} profile={state.profile} exerciseState={state}
      copyOverride={{eyebrow:'SAVED WORKOUT',title:selected?'Edit exercises':'Build your workout',body:'Changes affect this saved workout only. Sessions already started keep their own values.',action:'REVIEW WORKOUT'}}
      onSave={program=>{editorDirty.current=true;setDraft({name:review.name,exercises:program.days[0].exercises});setEditing(false);setRenaming(true);}} onCancel={firstRun?leaveFirstRun:()=>setEditing(false)} onDirtyChange={firstRun?value=>{editorDirty.current=value;}:undefined}/>:review?<>
      <div className="saved-workout-preview" data-exercise-search-scroll>
      {(source||renaming||draft)?<label className="saved-template-name">Workout name<input maxLength={100} value={review.name} onChange={e=>setDraft({...review,name:e.target.value})}/></label>:<div className="saved-template-title"><h1>{review.name}</h1><button ref={optionsTrigger} className="saved-template-options-trigger" type="button" aria-label="Saved workout options" aria-haspopup="dialog" aria-expanded={optionsOpen} onClick={()=>{optionsBackground.current=screen.current.closest('.screen')||screen.current;optionsAction.current=null;setOptionsOpen(true);}}><OverflowIcon/></button></div>}
      <p>{pluralize(review.exercises.length,'exercise')} · reusable targets only</p>
      <ol className="saved-template-exercises">{review.exercises.map((e,index)=><li key={e.id||index}><ExercisePickerIdentity item={e.importedExercise||exerciseCatalog[e.exerciseId]||{id:e.exerciseId,name:exerciseName(e)}} enabled={state.profile.showExerciseImages!==false}><strong>{exerciseName(e)}</strong><small>{pluralize(e.sets.length,'set')} · {e.repMin==null?'Target not set':`${e.repMin}${e.repMax!==e.repMin?`–${e.repMax}`:''} ${exerciseMeasure(e)==='seconds'?'sec':'reps'}`}{e.loggingMode==='per_side'?' · per side':''}</small></ExercisePickerIdentity></li>)}</ol>
      {(source||draft||renaming)?<><p className="saved-template-copy-note">Logged results stay in history. This saves the exercises and targets for reuse.</p><div className="saved-template-save-actions"><button className="text-button" type="button" onClick={edit}>Edit exercises</button><button className="button primary" type="button" disabled={!review.name.trim()||!review.exercises.length} onClick={()=>save(review)}>{selected ? 'SAVE CHANGES' : 'SAVE WORKOUT'}</button></div></>:<>
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
        {deleting&&<div className="saved-template-delete" role="group" aria-label="Delete saved workout"><p>Delete this saved workout? Your workout history and active session remain saved.</p><button className="button secondary" onClick={()=>setDeleting(false)}>Cancel</button><button className="button danger" onClick={()=>{try{const result=commit(current=>deleteWorkoutTemplate(current,selected.id,selected.revision));let syncDeleteFailed=false;if(result.changed){try{recordAccountSyncDeleteIntent(globalThis.localStorage,result.state.profile.id,'savedWorkoutTemplates',selected.id);}catch{syncDeleteFailed=true;}}reset();setNotice('Saved workout deleted');if(syncDeleteFailed)setError('Saved workout deleted locally. Cloud removal needs attention.');}catch(e){setError(e.message);}}}>Delete saved workout only</button></div>}
      </>}
      </div>
    </>:<>
      {!embedded&&<button className="button secondary saved-workout-create" type="button" onClick={()=>{setDraft({name:'New workout',exercises:[]});setEditing(true);setError('');}}>+ CREATE WORKOUT</button>}
      {!embedded&&<SearchInput className="exercise-search" aria-label="Search saved workouts" placeholder="Search saved workouts" value={query} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')}/>}
      <div className="saved-workout-list" data-exercise-search-scroll>
      {(state.savedWorkoutTemplates||[]).filter(t=>t.name.toLocaleLowerCase().includes(searchQuery.toLocaleLowerCase())).map(template=><button key={template.id} className="list-row" type="button" onClick={()=>{browseScroll.current=screen.current?.querySelector('.saved-workout-list')?.scrollTop||0;setSelection(structuredClone(template));request.current=uid('template-use');setConfirmed(false);setError('');}}><span><strong>{template.name}</strong><small>{template.exercises.length} exercises</small></span><span aria-hidden="true">›</span></button>)}
      {!state.savedWorkoutTemplates?.length&&<div className="saved-workouts-empty"><h2>No saved workouts yet</h2><p>Create a reusable workout here, or save a completed session for reuse.</p></div>}
      {state.savedWorkoutTemplates?.length>0&&!(state.savedWorkoutTemplates||[]).some(t=>t.name.toLocaleLowerCase().includes(searchQuery.toLocaleLowerCase()))&&<p>No saved workouts match your search.</p>}
      </div>
    </>}
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
    {undo.surface}
  </main>
    {optionsOpen&&createPortal(<Modal close={dismissOptions} backgroundRef={optionsBackground} returnFocusRef={optionsTrigger} lockDocument={false}>{requestClose=><main className="screen detail-screen saved-template-options" role="dialog" aria-modal="true" aria-label="Saved workout options">
      <Header title="Saved workout options" onBack={requestClose} backLabel="Back to saved workout" onClose={requestClose}/>
      <button className="list-row" type="button" onClick={()=>chooseOption('rename',requestClose)}>Rename</button>
      <button className="list-row" type="button" onClick={()=>chooseOption('edit',requestClose)}>Edit exercises</button>
      <button className="list-row danger-text" type="button" onClick={()=>chooseOption('delete',requestClose)}>Delete saved workout</button>
    </main>}</Modal>,document.body)}
  </>;
}
