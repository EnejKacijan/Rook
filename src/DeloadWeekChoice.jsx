import React,{useRef,useState} from 'react';
import {isoDay} from './domain.js';
import {addCalendarDays} from './flexibleWeek.js';
import {deloadWeekContext,visibleDeloadWeek,chooseDeloadWeek,deloadChoiceFingerprint,canUndoDeloadChoice,undoDeloadChoice} from './deloadWeek.js';
import {useDurableAction} from './useDurableAction.js';
import {SheetActionFooter} from './SheetActionFooter.jsx';
import './deloadWeek.css';

const dateLabel=date=>new Intl.DateTimeFormat('en',{month:'short',day:'numeric'}).format(new Date(`${date}T12:00:00`));
export function DeloadWeekNotice({state,setDetail,today=isoDay()}){
  const view=visibleDeloadWeek(state,today);
  if(!view||state.activeWorkout||state.activeOptionalSession)return null;
  const title={pending:'Deload week',deload:'Deload training this week',normal:'Normal training this week',rest:'Rest week'}[view.mode];
  const blockId=view.block?.id||view.rest?.blockId,weekNumber=view.week?.weekNumber||view.rest?.weekNumber;
  return <section className="deload-week-notice" aria-label="This week’s training choice">
    <div><strong>{title}</strong><small>{view.mode==='rest'?`${dateLabel(view.rest.restFrom)} – ${dateLabel(view.rest.restThrough)} · Planned recovery`:view.mode==='pending'?'Choose training or a full week of rest.':'Applies to this week only.'}</small></div>
    {view.changeable&&<button type="button" className="text-button" onClick={()=>setDetail({deloadWeek:{blockId,weekNumber}})}>{view.mode==='pending'?'Choose':'Change'}</button>}
  </section>;
}

export function DeloadWeekChoice({state,update,close,Header,request}){
  const screen=useRef(null),{commit}=useDurableAction(state,update);
  const block=state.program?.trainingBlock,week=block?.weeks.find(item=>item.weekNumber===request.weekNumber);
  const choice=block?.deloadChoices?.[request.weekNumber];
  const [mode,setMode]=useState(choice?.mode||'deload'),[error,setError]=useState('');
  const [fingerprint]=useState(()=>deloadChoiceFingerprint(state));
  const context=deloadWeekContext(state);
  const undoable=canUndoDeloadChoice(state)&&state.deloadWeekUndo.weekNumber===request.weekNumber;
  const active=Boolean(state.activeWorkout||state.activeOptionalSession);
  const available=block?.id===request.blockId&&week?.phase==='deload'&&!active&&
    (context?.week.weekNumber===request.weekNumber&&!block.completed||choice?.mode==='rest'&&undoable);
  const apply=()=>{
    try{commit(current=>chooseDeloadWeek(current,{...request,mode,fingerprint}));close();}catch(cause){setError(cause.message);}
  };
  const undo=()=>{try{commit(undoDeloadChoice);close();}catch(cause){setError(cause.message);}};
  const restFrom=choice?.mode==='rest'?choice.restFrom:isoDay(),restThrough=choice?.mode==='rest'?choice.restThrough:addCalendarDays(isoDay(),6);
  return <main ref={screen} className="screen detail-screen deload-week-sheet">
    <Header title="This week" onClose={close}/>
    <h1>How do you want to train?</h1>
    <p>Week {request.weekNumber} of {block?.totalWeeks} · Deload scheduled</p>
    <div className="deload-week-options" role="radiogroup" aria-label="Training for this deload week">
      {[
        ['deload','Deload training','Fewer sets, more reps in reserve.'],
        ['normal','Normal training','Keep your normal targets and progression.'],
        ['rest','Rest for the whole week',`${dateLabel(restFrom)} – ${dateLabel(restThrough)} · Handle remaining plan workouts together.`],
      ].map(([value,title,detail],index)=><button key={value} type="button" role="radio" aria-checked={mode===value} tabIndex={mode===value?0:-1} disabled={!available}
        className={`deload-week-option${mode===value?' is-selected':''}`} onClick={()=>{setMode(value);setError('');}}
        onKeyDown={event=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
          event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?2:(index+(['ArrowDown','ArrowRight'].includes(event.key)?1:2))%3;
          setMode(['deload','normal','rest'][next]);setError('');event.currentTarget.parentElement.querySelectorAll('[role="radio"]')[next].focus();}}>
        <span><strong>{title}{value==='deload'&&<span className="deload-week-recommended">Recommended</span>}</strong><small>{detail}</small></span>
        <span className="deload-week-radio" aria-hidden="true">{mode===value?'✓':''}</span>
      </button>)}
    </div>
    <p className="sheet-footnote">This week only. Logged workouts stay in your history.</p>
    {!available&&<p role="status" className="sheet-footnote">{active?'Finish or discard the active session before changing this week.':'This week has already moved on. Your logged workouts are kept.'}</p>}
    {error&&<p role="alert" className="deload-week-error">{error}</p>}
    <SheetActionFooter><button type="button" className="button primary" disabled={!available} onClick={apply}>{mode==='rest'?'REST FOR 7 DAYS':mode==='normal'?'USE NORMAL TRAINING':'USE DELOAD TRAINING'}</button>
      {undoable&&<button type="button" className="button quiet" onClick={undo}>UNDO CHOICE</button>}
    </SheetActionFooter>
  </main>;
}
