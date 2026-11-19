// Resolve corrections before ordering. Reading guidance never edits history.
export const isDeloadWorkout=workout=>Boolean(workout?.trainingBlock?.plannedDeload || workout?.trainingBlock?.phase==='deload' ||
  !['base','build','final'].includes(workout?.trainingBlock?.phase)&&workout?.exercises?.length&&
  workout.exercises.every(exercise=>exercise.blockPrescription?.phase==='deload'));
export const progressionHistoryForPhase=(history,deload=false)=>progressionHistory(history).filter(workout=>isDeloadWorkout(workout)===deload);
export const normalProgressionHistory=history=>progressionHistoryForPhase(history);

export function progressionHistory(history=[]) {
  const superseded=new Set(history.map(workout=>workout.supersedesCompletionId).filter(Boolean));
  const latest=new Map();history.forEach((workout,index)=>{if(workout.id)latest.set(workout.id,index);});
  return history.map((workout,index)=>({workout,index})).filter(({workout,index})=>
    workout.completedAt&&!superseded.has(workout.id)&&(!workout.id||latest.get(workout.id)===index))
    .sort((a,b)=>{
      const left=Date.parse(a.workout.completedAt),right=Date.parse(b.workout.completedAt);
      return Number.isFinite(left)&&Number.isFinite(right)&&left!==right?left-right:a.index-b.index;
    }).map(({workout})=>workout);
}
