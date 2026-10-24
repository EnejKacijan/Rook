import {displayWeight,weightUnit,exerciseMeasure} from './domain.js';

export function progressionPresentation(advice,exercise,units='kg') {
  if(!advice)return null;
  const timed=exerciseMeasure(exercise)==='seconds',max=exercise.repMax??exercise.repRange?.[1];
  const variation=/variation/.test(advice.title)||/same variation/.test(advice.detail),setup=variation?'variation':'load';
  let action;
  if(advice.weight)action=`${advice.title==='Consider a small increase'?'If effort was on target, try':'Try'} ${displayWeight(advice.weight,units)} ${weightUnit(units)} on your next working sets.`;
  else switch(advice.title){
    case 'Build reps first':action=`Same ${setup}. Add one rep to a set below ${max}.`;break;
    case 'Repeat to confirm':action=timed?`Repeat ${max} seconds per hold before progressing.`:`Repeat the same ${setup} for one more workout.`;break;
    case 'Repeat this load':case 'Repeat this variation':action=`Keep the same ${setup} for one more workout.`;break;
    case 'Hold the load':case 'Hold the variation':action=exercise.targetRir!=null?`Keep the same ${setup}. Leave at least ${exercise.targetRir} reps in reserve.`:`Keep the same ${setup} and stay within your target effort.`;break;
    case 'Review the load':action='Consider a lighter load and rebuild your reps.';break;
    case 'Review the variation':action='Consider an easier variation and rebuild your reps.';break;
    case 'Use a smaller increment':action='Keep this load. Choose a smaller equipment step.';break;
    case 'Keep your load pattern':action='Keep each set’s own load. Review increases set by set.';break;
    case 'Progress has slowed':action='Review rest and recovery before changing this exercise.';break;
    case 'Repeat before increasing':action='Repeat the same load or variation for one more workout.';break;
    case 'Build hold time':action=`Build each hold gradually toward ${max} seconds.`;break;
    case 'Reduce the hold target slightly':action='Use an easier hold and rebuild with control.';break;
    case 'Ready for a harder variation':action='Progress the variation gradually, keeping control.';break;
    case 'Ready to progress':action=timed?'Increase hold time gradually, keeping control.':advice.detail;break;
    case 'Log a working load first':action='Record your working weight before increasing it.';break;
    default:action=advice.detail;
  }
  const caution=advice.type==='stalled'||['Review the load','Review the variation','Use a smaller increment','Reduce the hold target slightly'].includes(advice.title);
  return {heading:advice.weight&&advice.title==='Ready to progress'?'Increase weight':advice.title,action,tone:caution?'caution':advice.type==='progress'?'progress':'neutral',explanation:advice.detail};
}
