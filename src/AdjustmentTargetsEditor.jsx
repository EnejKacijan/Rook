import React from 'react';
import { PlanNumberInput } from './PlanNumberInput.jsx';
import { exerciseCatalog } from './domain.js';
import './adjustmentTargets.css';

export function AdjustmentTargetsEditor({ exercise, name, rirEnabled, onChange, commits, showScopeHint=true }) {
  const target = { exerciseId: exercise.exerciseId, sets: exercise.sets.length,
    repMin: exercise.repMin ?? null,
    repMax: exercise.repMax ?? exercise.repMin ?? null,
    restSeconds: exercise.restSeconds ?? 90, targetRir: exercise.targetRir ?? null };
  const change = (key, value) => {
    const next = { ...target, [key]: value };
    if (key === 'repMin' && (next.repMax == null || value > next.repMax)) next.repMax = value;
    if (key === 'repMax' && (next.repMin == null || value < next.repMin)) next.repMin = value;
    onChange(next);
  };
  const timed = (exercise.measure || exercise.importedExercise?.measure || exerciseCatalog[exercise.exerciseId]?.measure) === 'seconds';
  return <div className="adjustment-target-editor" role="group" aria-label={`Edit targets for ${name}`}>
    {[
      ['sets','Sets',1,20], ['repMin',timed?'Min seconds':'Min reps',1,timed?3600:100],
      ['repMax',timed?'Max seconds':'Max reps',1,timed?3600:100], ['restSeconds','Rest seconds',0,600],
      ...(rirEnabled ? [['targetRir','RIR',0,10]] : []),
    ].map(([key,label,min,max]) => <label key={key}><span>{label}</span>
      <PlanNumberInput commits={commits} aria-label={`${label} for ${name}`} min={min} max={max}
        value={target[key]} onCommit={value => change(key,value)}/></label>)}
    {showScopeHint&&<small>Only this workout changes. The time estimate updates as you edit.</small>}
  </div>;
}
