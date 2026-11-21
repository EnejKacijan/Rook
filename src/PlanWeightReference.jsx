import {useLayoutEffect,useRef,useState} from 'react';
import {AnimatedDetails} from './AnimatedDetails.jsx';
import {displayWeight,exerciseLoadRequirement,exerciseMeasure,exerciseName,storedWeight,weightUnit} from './domain.js';
import {effectiveSetReps} from './advancedLogging.js';
import {planWeightHistory,supportsPlannedLoads} from './planWeightHistory.js';

const dateLabel=date=>date?new Intl.DateTimeFormat('en',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${date}T12:00:00`)):'Date unavailable';
const loadValues=sets=>sets.map(set=>({weight:set.weight??null,weightProvenance:set.weightProvenance??null}));

function PlannedLoadInput({weight,units,label,commits,onCommit}){
  const [draft,setDraft]=useState(null),raw=useRef(null),commit=useRef(null);
  commit.current=()=>{
    if(raw.current===null)return;
    const value=raw.current.trim().replace(',','.');raw.current=null;setDraft(null);
    if(value&&!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))return;
    const next=storedWeight(value,units);
    if((next===null||Number.isFinite(next))&&next!==weight)onCommit(next);
  };
  useLayoutEffect(()=>{const save=()=>commit.current();commits?.add(save);return()=>commits?.delete(save);},[commits]);
  return <input type="text" inputMode="decimal" value={draft??displayWeight(weight,units)} placeholder="—" aria-label={label}
    onChange={event=>{raw.current=event.target.value;setDraft(raw.current);}} onBlur={()=>commit.current()}
    onKeyDown={event=>{if(event.key==='Enter'||event.key==='Escape'){
      event.preventDefault();if(event.key==='Escape'){raw.current=null;setDraft(null);}event.currentTarget.blur();
    }}} />;
}

export function PlanWeightReference({exercise,workouts,units,commits,onWeightsChange,onWeightChange,showHistory=true}){
  const [undo,setUndo]=useState(null);
  const {rows,reusable}=planWeightHistory(workouts,exercise);
  const supportsLoads=supportsPlannedLoads(exercise);
  const current=loadValues(exercise.sets);
  const name=exerciseName(exercise),unit=weightUnit(units);
  const show=value=>displayWeight(value,units);
  const formatted=value=>`${show(value)} ${unit}`;
  const summary=values=>{
    const weights=values.filter(Number.isFinite);
    if(!weights.length)return null;
    const low=Math.min(...weights),high=Math.max(...weights);
    return low===high?formatted(low):`${show(low)}–${formatted(high)}`;
  };
  const weightLabel=set=>{
    const kind=set.rawImport?.loadKind;
    const weight=Number.isFinite(set.weight)?formatted(set.weight):null;
    if(kind==='assisted')return weight?`${weight} assistance`:'Assistance not logged';
    if(set.rawImport?.version===2&&!['external','added','normal','bodyweight'].includes(kind))return 'Load not confirmed';
    if(exerciseLoadRequirement(exercise)==='none')return 'Bodyweight';
    if(exerciseLoadRequirement(exercise)==='optional')return set.weight>0?`+${weight}`:'Bodyweight';
    return weight||'Weight not logged';
  };
  const latest=rows[0];
  const lastSets=latest?.sets.filter(set=>set.completed)||[];
  const lastSummary=lastSets.some(set=>set.rawImport?.version===2&&!['external','added','normal','bodyweight'].includes(set.rawImport.loadKind))
    ? weightLabel(lastSets.at(-1)) : summary(lastSets.map(set=>set.weight))|| (lastSets.length?weightLabel(lastSets.at(-1)):null);
  const apply=value=>{setUndo(null);onWeightsChange(value);};
  // Today's preparation shows its own Last workout card with a Use action.
  if(!supportsLoads&&(!latest||!showHistory))return null;
  return <section className="plan-editor-weight-reference" aria-label={`Weights for ${name}`}>
    {supportsLoads&&<AnimatedDetails>
      <summary>Planned weight · {summary(current.map(set=>set.weight))||'Not set'}</summary>
      <div className="plan-editor-weights"><div>{current.map((set,index)=><label key={exercise.sets[index].id}>
        <small>Set {index+1} · {unit}</small>
        <PlannedLoadInput weight={set.weight} units={units} commits={commits} label={`Planned weight for ${name}, set ${index+1}, ${unit}`}
          onCommit={weight=>{setUndo(null);onWeightChange(index,weight);}} />
      </label>)}</div></div>
    </AnimatedDetails>}
    {showHistory&&latest&&<AnimatedDetails>
      <summary>Last logged · {lastSummary}</summary>
      <div className="plan-weight-history-list">{rows.map(row=><div key={row.id}>
        <strong>{dateLabel(row.date)}</strong>
        <ul>{row.sets.map((set,index)=>set.completed?<li key={set.id||index}>
          Set {index+1} · {weightLabel(set)}{effectiveSetReps(row.entry,set)>0?` · ${effectiveSetReps(row.entry,set)} ${exerciseMeasure(row.entry)==='seconds'?'sec':'reps'}`:''}
        </li>:null)}</ul>
      </div>)}</div>
    </AnimatedDetails>}
    {undo?<button className="text-button" type="button" onClick={()=>apply(undo)}>Undo weight change</button>
      : showHistory&&reusable?.some((weight,index)=>current[index].weight!==weight)&&<button className="text-button" type="button" onClick={()=>{
        setUndo(current);onWeightsChange(reusable.map(weight=>({weight,weightProvenance:'explicit-plan'})));
      }}>Use last logged weights</button>}
  </section>;
}
