import React,{useRef,useState,useLayoutEffect,useEffect,memo} from 'react';
import {ExercisePickerIdentity} from './ExercisePickerIdentity.jsx';
import {SearchInput} from './SearchInput.jsx';
import {useExerciseSearchSheet} from './useExerciseSearchSheet.js';
import {useDurableAction} from './useDurableAction.js';
import {useExerciseRemoveUndo,useSwipeActionList} from './SwipeActionRow.jsx';
import {uid} from './domain.js';
import {addWorkoutExercise,canUndoWorkoutAddition,undoWorkoutAddition,doWorkoutExerciseNow} from './freestyleWorkout.js';
import './freestyleQueuePicker.css';
import {SheetActionFooter} from './SheetActionFooter.jsx';
import {usePickerResults} from './usePickerResults.js';
import {SavedWorkouts} from './SavedWorkouts.jsx';
import {ExerciseQueuePreview} from './ExerciseQueuePreview.jsx';
import {useExercisePreviewMotion} from './useExercisePreviewMotion.js';

export function FreestyleExercisePicker({state,update,close,Header,Editor,Modal,Illustration}) {
  const screen=useRef(null),list=useRef(null),position=useRef(0),returnFocus=useRef(null);
  const sessionId=useRef(state.activeWorkout?.id).current;
  const [query,setQuery]=useState(''),[preview,setPreview]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [repeatRequest,setRepeatRequest]=useState(null);
  const [chooseInstance,setChooseInstance]=useState(false),[acknowledged,setAcknowledged]=useState(null);
  const leaving=useRef(false),exitPresentation=useRef(null);
  const capturePreview=useExercisePreviewMotion(screen,preview);
  const [scope,setScope]=useState('exercises');
  const previousScope=useRef(scope);
  useLayoutEffect(()=>{
    if(previousScope.current===scope)return;
    previousScope.current=scope;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if(reduced?.matches)return;
    // Animate the retained incoming scroller inside its existing clipped pane.
    // Scope alone owns this entry motion; queries, focus and clock ticks do not.
    const pane=screen.current?.querySelector(scope==='saved'
      ? ':scope > .saved-workouts > [data-exercise-search-scroll]'
      : ':scope > .exercise-search-body > [data-exercise-search-scroll]');
    if(!pane?.animate)return;
    const animation=pane.animate([
      {opacity:0,transform:`translateX(${scope==='saved'?7:-7}px)`},
      {opacity:1,transform:'translateX(0)'}
    ],{duration:150,easing:getComputedStyle(screen.current).getPropertyValue('--rook-ease-standard').trim()||'cubic-bezier(.2,0,0,1)'});
    const stop=()=>animation.cancel();
    reduced?.addEventListener?.('change',stop);
    return()=>{stop();reduced?.removeEventListener?.('change',stop);};
  },[scope]);
  const [savedEditing,setSavedEditing]=useState(false);
  const [limit,setLimit]=useState(24),[savedQuery,setSavedQuery]=useState(''),[savedVisited,setSavedVisited]=useState(false),[savedView,setSavedView]=useState(false);
  const browsing=!preview&&!(scope==='saved'&&savedView);
  const {commit,latest}=useDurableAction(state,update),undo=useExerciseRemoveUndo();
  useExerciseSearchSheet(screen,!savedEditing,{focusedSearch:true,browsing});
  // Keep the canonical sheet/viewport owner while the reused editor mounts its
  // footer. Do not overwrite classes installed by the shared footer binder.
  useLayoutEffect(()=>{const root=screen.current;root.classList.toggle('edit-plan-screen',savedEditing);root.classList.toggle('is-template-editing',savedEditing);},[savedEditing]);
  useLayoutEffect(()=>{screen.current.classList.toggle('has-exercise-preview',Boolean(preview));},[preview]);
  const {ready,catalog,results}=usePickerResults(state,query,scope==='exercises',screen);
  const actions=useRef(null),more=useRef(null),savedBack=useRef(null);
  useEffect(()=>{setLimit(24);},[query]);
  useEffect(()=>{
    if(!more.current||!list.current||typeof IntersectionObserver!=='function')return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))setLimit(n=>n+24);},{root:list.current,rootMargin:'200px'});
    observer.observe(more.current);return()=>observer.disconnect();
  },[results.length,limit,scope,preview]);
  const entries=id=>(state.activeWorkout?.exercises||[]).filter(e=>e.exerciseId===id);
  const status=id=>{
    const found=entries(id),active=state.activeWorkout;
    if(found.some(e=>e.id===active?.exercises[active.exerciseIndex]?.id))return 'Current';
    if(found.some(e=>active.exercises.indexOf(e)>active.exerciseIndex))return 'In Up Next';
    return found.length?'Already in workout':'';
  };
  const add=(item,{again=false,requestId=uid('queue-add')}={})=>{
    setError('');setNotice('');
    try {
      if(latest.current.activeWorkout?.id!==sessionId)throw Error('This workout has ended or changed. Return to your workout.');
      const result=commit(current=>addWorkoutExercise(current,item.id,{allowDuplicate:again,requestId,sessionId}));
      if(!result.changed)return false;
      const ids=result.state.activeWorkout.exercises.filter(e=>e.queueAdditionId===requestId).map(e=>e.id),record={sessionId,requestId,ids};
      setNotice(result.state.activeWorkout.exercises.length===ids.length?'Added · current exercise':'Added to Up Next');
      undo.show({message:`${item.name} added`,valid:()=>canUndoWorkoutAddition(latest.current,record),undo:()=>{try{commit(current=>undoWorkoutAddition(current,record));setNotice('Addition undone');}catch(e){setError(e.message);}}});
      return true;
    }catch(e){setError(e.message);return false;}
  };
  // Keep search focus at the compatibility mouse event, as SearchInput's Clear
  // does. Cancelling touch pointerdown can suppress WebKit's semantic click.
  const keepSearchFocus=event=>{if(event.button===0&&screen.current?.querySelector('.rook-search-field input')===document.activeElement)event.preventDefault();};
  const open=item=>{position.current=list.current?.scrollTop||0;capturePreview(false);setPreview(item);setRepeatRequest(null);setChooseInstance(false);setAcknowledged(null);setError('');};
  const back=()=>{capturePreview(true);returnFocus.current=preview?.id;setPreview(null);};
  useSwipeActionList(list,!preview&&scope==='exercises',{mode:'add',onAdd:id=>{const item=catalog.find(e=>e.id===id);return item?add(item):false;}});
  const doNow=(instanceId)=>{
    if(leaving.current)return;
    if(!instanceId&&entries(preview.id).length>1){setChooseInstance(true);return;}
    leaving.current=true;setError('');
    try{commit(current=>doWorkoutExerciseNow(current,{sessionId,requestId:uid('do-now'),exerciseId:preview.id,instanceId}));if(latest.current.activeWorkout?.id!==sessionId)throw Error('This workout has ended.');close();}
    catch(e){leaving.current=false;setError(e.message);}
  };
  const addPreview=()=>{if(!latest.current.activeWorkout?.exercises.some(e=>e.exerciseId===preview.id)&&add(preview))setAcknowledged(preview.id);};
  const changeScope=next=>{if(next==='saved')setSavedVisited(true);setScope(next);};
  const scopes=<nav className="queue-search-scopes" data-scope={scope} aria-label="Search scope"><button type="button" aria-pressed={scope==='exercises'} onMouseDown={keepSearchFocus} onClick={()=>changeScope('exercises')}>Exercises</button><button type="button" aria-pressed={scope==='saved'} onMouseDown={keepSearchFocus} onClick={()=>changeScope('saved')}>Saved workouts</button></nav>;
  useLayoutEffect(()=>{if(preview){screen.current.querySelector('.queue-exercise-preview h1')?.focus({preventScroll:true});}else if(list.current){list.current.scrollTop=position.current;if(returnFocus.current){[...list.current.querySelectorAll('[data-catalog-id]')].find(row=>row.dataset.catalogId===returnFocus.current)?.querySelector('.queue-search-body')?.focus({preventScroll:true});returnFocus.current=null;}}},[preview]);
  useLayoutEffect(()=>{
    if(!chooseInstance&&!repeatRequest)return;
    const pane=screen.current.querySelector('.queue-exercise-preview'),choice=pane?.querySelector('.queue-preview-choice');
    if(!choice)return;
    choice.focus({preventScroll:true});
    // Reveal the explicit choice within this pane, including short screens.
    // Never pan the outer sheet or the workout underneath it.
    pane.scrollTop+=choice.getBoundingClientRect().top-pane.getBoundingClientRect().top;
  },[chooseInstance,repeatRequest]);
  actions.current={open,add,keepSearchFocus};
  const searchQuery=scope==='saved'?savedQuery:query;
  const setSearch=value=>{if(scope==='saved')setSavedQuery(value);else {setQuery(value);position.current=0;if(list.current)list.current.scrollTop=0;}};
  // The underlying workout updates immediately; keep the outgoing preview's
  // actions stable during the shared sheet's normal close animation.
  if(!leaving.current)exitPresentation.current={status:preview?status(preview.id):'',empty:!state.activeWorkout?.exercises.length};
  const {status:previewStatus,empty}=exitPresentation.current;
  const repeatAction=<button type="button" className="text-button queue-preview-repeat" onClick={()=>{setRepeatRequest(uid('queue-repeat'));setChooseInstance(false);}}>Add again</button>;
  return <main ref={screen} className="screen detail-screen freestyle-picker freestyle-queue-picker">
    <Header title={preview?'Exercise':'Add exercise'} onBack={preview?back:scope==='saved'&&savedView?()=>savedBack.current?.():undefined} onClose={close} closeLabel="Back to workout"/>
    <div className="queue-picker-search-chrome" hidden={!browsing} data-preview-motion>
      {scopes}
      <SearchInput className="exercise-search" aria-label={scope==='saved'?'Search saved workouts':'Search exercises'} placeholder={scope==='saved'?'Search saved workouts':'Search exercises'} value={searchQuery} onChange={e=>setSearch(e.target.value)} onClear={()=>setSearch('')}/>
      <div className="queue-picker-feedback" aria-live="polite">{notice}</div>
    </div>
    {savedVisited&&<SavedWorkouts embedded hidden={scope!=='saved'} browseQuery={savedQuery} navigationRef={savedBack} onViewChange={setSavedView} state={state} update={update} close={close} Header={Header} Editor={Editor} Modal={Modal} onEditingChange={setSavedEditing}/>}
    <div className="exercise-search-body" hidden={Boolean(preview)||scope!=='exercises'} data-preview-motion>
      <div ref={list} data-exercise-search-scroll>
        {results.slice(0,limit).map(item=><PickerRow key={item.id} item={item} status={status(item.id)} showImages={state.profile.showExerciseImages!==false} actions={actions}/>)}
        {limit<results.length&&<button ref={more} className="text-button queue-more-results" onClick={()=>setLimit(n=>n+24)}>Show more exercises</button>}
        {ready&&!results.length&&<p>No compatible exercises found. Try another search or review your equipment and restrictions in Profile.</p>}
      </div>
    </div>
    {preview&&<ExerciseQueuePreview item={preview} showImages={state.profile.showExerciseImages!==false} status={previewStatus} Illustration={Illustration}>
      {previewStatus&&previewStatus!=='Current'&&!repeatRequest&&repeatAction}
      {chooseInstance&&<div className="queue-preview-choice" tabIndex={-1} role="group" aria-label="Choose which instance to do now"><p>Choose which instance to do now</p>{entries(preview.id).filter(entry=>entry.id!==state.activeWorkout.exercises[state.activeWorkout.exerciseIndex]?.id).map(entry=><button type="button" className="button secondary" key={entry.id} onClick={()=>doNow(entry.id)}>Do now · exercise {state.activeWorkout.exercises.indexOf(entry)+1} · {entry.sets.length} sets{entry.repMin!=null?` · ${entry.repMin}–${entry.repMax} reps`:''}</button>)}</div>}
      {repeatRequest&&<div className="queue-preview-choice" tabIndex={-1} role="group" aria-label="Add a separate instance"><p>Add a separate instance of {preview.name}?</p><button type="button" className="button secondary" onClick={()=>{if(add(preview,{again:true,requestId:repeatRequest}))setRepeatRequest(null);}}>Add another instance</button><button className="text-button" onClick={()=>setRepeatRequest(null)}>Cancel</button></div>}
    </ExerciseQueuePreview>}
    {error&&<p role="alert">{error}</p>}
    {!savedEditing&&<SheetActionFooter separate hideWhileSearching={browsing} className={preview?'queue-preview-actions':''}>
      {!preview?<button type="button" className="text-button queue-picker-back" onClick={close}>Back to workout</button>:empty?<button type="button" className="button primary" disabled={leaving.current} onClick={()=>doNow()}>Start with this exercise</button>:<>
        {!previewStatus&&<button type="button" className="button primary" onClick={addPreview}>Add to Up Next</button>}
        {previewStatus==='In Up Next'&&<button type="button" className={`button secondary queue-preview-added${acknowledged===preview.id?' is-acknowledged':''}`} disabled><span><span aria-hidden="true">✓ </span>In Up Next</span></button>}
        {previewStatus!=='Current'&&<button type="button" className="button secondary" disabled={leaving.current} onClick={()=>doNow()}>Do now</button>}
        {previewStatus==='Current'&&!repeatRequest&&repeatAction}
      </>}
    </SheetActionFooter>}
    {undo.surface}
  </main>;
}

const PickerRow=memo(function PickerRow({item,status,showImages,actions}){
  return <div className="queue-add-swipe" data-catalog-id={item.id} data-swipe-row data-swipe-enabled={!status}>
    <span className="queue-swipe-cue" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></svg></span>
    <div className="queue-search-row" data-swipe-content>
      <button type="button" className="queue-search-body" data-swipe-body aria-label={`Preview ${item.name}`} onClick={()=>actions.current.open(item)}>
        <ExercisePickerIdentity item={item} enabled={showImages}><strong>{item.name}</strong><small>{item.equipment?.join(' · ')}{item.custom?' · Custom':''}</small><small className="queue-result-status" aria-hidden={!status}>{status||'\u00a0'}</small></ExercisePickerIdentity>
      </button>
      <button type="button" className="queue-add-button" aria-label={status?`${item.name}: ${status}`:`Add ${item.name} to Up Next`} disabled={Boolean(status)} onMouseDown={e=>actions.current.keepSearchFocus(e)} onClick={()=>actions.current.add(item)}>{status?'✓':'+'}</button>
    </div>
  </div>;
});
