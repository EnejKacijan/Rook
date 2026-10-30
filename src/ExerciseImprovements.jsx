import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import {displayWeight,exerciseCatalog,exerciseName,pluralize,searchExercises,weightUnit} from './domain.js';
import {exerciseImprovementHistory,improvementsForPeriod,improvementDateLabel} from './exerciseImprovements.js';
import {useLocalDay} from './useLocalDay.js';
import {ProfileInformation} from './ProfileInformation.jsx';
import {SearchInput} from './SearchInput.jsx';
import {ExerciseNavigationButton} from './ExerciseNavigationButton.jsx';
import {NavigationChevron} from './NavigationChevron.jsx';
import {focusNavigationTarget} from './navigationFocus.js';
import './exerciseImprovements.css';

export function ImprovementRow({item,units,onClick}) {
  return <ExerciseNavigationButton className="list-row improvement-row" data-improvement-id={item.id} onClick={onClick}>
    <span><strong>{exerciseName(item.exercise)}</strong><small>
      <span className="improvement-delta">{item.type==='weight'?`+${displayWeight(item.deltaWeight,units)} ${weightUnit(units)}`:`+${item.deltaReps} ${item.deltaReps===1?'rep':'reps'}`}</span>
      {item.type==='weight'?' since last session':`${item.loggingMode==='per_side'?' on the lower side':''}${item.weight>0?` at ${displayWeight(item.weight,units)} ${weightUnit(units)}`:''}`}
    </small></span><NavigationChevron/>
  </ExerciseNavigationButton>;
}
export function ExerciseImprovements({state,setDetail,close,Header,Modal,initial={}}) {
  const [period,setPeriod]=useState(initial.period==='week'?'week':'all'),[query,setQuery]=useState(initial.query||'');
  const ref=useRef(null),today=useLocalDay();
  const events=useMemo(()=>exerciseImprovementHistory(state.workouts),[state.workouts,today]);
  const periodRows=improvementsForPeriod(events,period,today);
  const exercises=[...new Map(periodRows.map(event=>[event.exerciseId,{id:event.exerciseId,name:exerciseName(event.exercise),aliases:exerciseCatalog[event.exerciseId]?.aliases||[]}])).values()];
  const matches=new Set(searchExercises(exercises,query).map(exercise=>exercise.id));
  const rows=periodRows.filter(event=>matches.has(event.exerciseId));
  const grouped=new Map();for(const item of rows){const group=grouped.get(item.date)||[];group.push(item);grouped.set(item.date,group);}const groups=[...grouped];
  useLayoutEffect(()=>{
    const surface=ref.current;surface.scrollTop=initial.scroll||0;
    if(!initial.focusId)return;
    const frame=requestAnimationFrame(()=>{
      const row=[...surface.querySelectorAll('[data-improvement-id]')].find(item=>item.dataset.improvementId===initial.focusId);
      focusNavigationTarget(row);surface.scrollTop=initial.scroll||0;
    });return ()=>cancelAnimationFrame(frame);
  },[]);
  const changePeriod=next=>{setPeriod(next);if(ref.current)ref.current.scrollTop=0;};
  return <main ref={ref} className="screen detail-screen exercise-improvements-sheet">
    <Header title="Improvements" onBack={close} backLabel="Back to Progress" onClose={close}/>
    <div className="statistics-heading"><p>{pluralize(rows.length,'improvement')}</p>
      <ProfileInformation label="About improvements" title="Your improvements" Modal={Modal} backgroundRef={ref}>
        <p>These are recorded gains in load or reps compared with the previous compatible session. They are not necessarily personal records.</p>
        <p>Dates show when you trained. This week runs Monday to Sunday; the comparison can use a session from an earlier week.</p>
        <p>Comparisons require matching logging context and a clear session order. Per-side rep comparisons use the lower side. Timed work, assisted movements and complex set protocols are left out.</p>
      </ProfileInformation>
    </div>
    <div className="segmented improvements-period" role="group" aria-label="Improvement period">
      <button type="button" aria-pressed={period==='week'} className={period==='week'?'active':''} onClick={()=>changePeriod('week')}>This week</button>
      <button type="button" aria-pressed={period==='all'} className={period==='all'?'active':''} onClick={()=>changePeriod('all')}>All time</button>
    </div>
    <SearchInput aria-label="Search improvements" placeholder="Search by exercise" value={query} onChange={event=>setQuery(event.target.value)} onClear={()=>setQuery('')}
      resultsTarget={()=>ref.current} searchScope={period}/>
    <div className="improvement-history-list">{groups.map(([date,items])=><section className="improvement-date-group" key={date}>
      <h2>{improvementDateLabel(date,today)}</h2>{items.map(item=><ImprovementRow key={item.id} item={item} units={state.profile.units} onClick={()=>setDetail({exercise:item.exercise,
        returnToImprovements:{period,query,scroll:ref.current?.scrollTop||0,focusId:item.id}})}/>)}</section>)}</div>
    {!rows.length&&<p className="improvements-empty" role="status">{query.trim()?`No improvements match “${query}”.`:period==='week'?'No improvements logged this week yet.':'No comparable improvements logged yet.'}</p>}
  </main>;
}
