import {formatExportSet} from './workoutExport.js';

// Reviews show the prescribed targets. An unspecified load is a normal input
// for the next session, so it need not be repeated beside every exercise.
export function reviewSetTarget(exercise,set,options) {
  return formatExportSet(exercise,set,options)
    .replace(' - Load not specified','')
    .replaceAll(' - ',' · ')
    .replace(/RIR (\d+(?:\.\d+)?)/g,'$1 RIR');
}

export function reviewPrescription(exercise,options) {
  const targets=exercise.sets.map(set=>reviewSetTarget(exercise,set,options));
  return new Set(targets).size===1?targets[0]:targets.map((target,index)=>`Set ${index+1}: ${target}`).join(' · ');
}
