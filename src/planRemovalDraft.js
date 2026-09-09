import { validateSupersetExercises } from './supersets.js';

export function removalRows(day, records) {
  const rows=day.exercises.map(exercise=>({exercise}));
  for(const record of records.filter(r=>r.dayId===day.id).reverse()) {
    if(rows.some(row=>row.exercise.id===record.exercise.id))continue;
    const nextId=record.after.find(id=>rows.some(row=>row.exercise.id===id));
    let index=rows.findIndex(row=>row.exercise.id===nextId);
    if(index<0){const previousId=[...record.before].reverse().find(id=>rows.some(row=>row.exercise.id===id));const before=rows.findIndex(row=>row.exercise.id===previousId);index=before<0?Math.min(record.index,rows.length):before+1;}
    rows.splice(index,0,{exercise:record.exercise,removed:record});
  }
  return rows;
}

export function stagePlanRemoval(program, records, dayId, exerciseId) {
  const next=structuredClone(program),day=next.days.find(d=>d.id===dayId),exercise=day?.exercises.find(e=>e.id===exerciseId);
  if(!exercise)return {program,records};
  const rows=removalRows(day,records),index=rows.findIndex(row=>row.exercise.id===exerciseId);
  const inherited=records.find(r=>r.dayId===dayId&&r.partnerId===exerciseId);
  const supersetId=exercise.supersetId||inherited?.exercise.supersetId;
  const partnerId=day.exercises.find(e=>e.id!==exerciseId&&supersetId&&e.supersetId===supersetId)?.id||inherited?.exercise.id;
  const snapshot={...exercise};if(supersetId)snapshot.supersetId=supersetId;
  const record={dayId,exercise:snapshot,partnerId,index,before:rows.slice(0,index).map(r=>r.exercise.id),after:rows.slice(index+1).map(r=>r.exercise.id),ramps:(day.warmupPlan?.rampUpSets||[]).map((group,index)=>({group,index})).filter(r=>r.group.targetExerciseEntryId===exerciseId)};
  day.exercises=day.exercises.filter(e=>e.id!==exerciseId);
  for(const e of day.exercises)if(supersetId&&e.supersetId===supersetId)delete e.supersetId;
  if(day.warmupPlan?.mode==='custom')day.warmupPlan.rampUpSets=(day.warmupPlan.rampUpSets||[]).filter(g=>g.targetExerciseEntryId!==exerciseId);
  return {program:next,records:[...records,record]};
}

export function undoPlanRemoval(program, records, exerciseId) {
  const record=records.find(r=>r.exercise.id===exerciseId);
  if(!record)return {program,records};
  const next=structuredClone(program),day=next.days.find(d=>d.id===record.dayId);
  if(!day)return {program,records};
  const rows=removalRows(day,records),position=rows.findIndex(r=>r.exercise.id===exerciseId);
  const restored=structuredClone(record.exercise);
  day.exercises.splice(rows.slice(0,position).filter(r=>!r.removed).length,0,restored);
  if(restored.supersetId){
    const partner=day.exercises.find(e=>e.id===record.partnerId);
    if(partner&&!partner.supersetId){
      // Keep a restored pair adjacent even if its surviving member was moved.
      day.exercises=day.exercises.filter(e=>e.id!==restored.id);
      const partnerIndex=day.exercises.indexOf(partner);
      day.exercises.splice(partnerIndex+(record.before.includes(partner.id)?1:0),0,restored);
      partner.supersetId=restored.supersetId;
      if(validateSupersetExercises(day.exercises).length){delete partner.supersetId;delete restored.supersetId;}
    }else delete restored.supersetId;
  }
  if(day.warmupPlan?.mode==='custom')for(const {group,index} of record.ramps){
    day.warmupPlan.rampUpSets ||= [];
    if(!(day.warmupPlan.rampUpSets||[]).some(g=>g.id===group.id))day.warmupPlan.rampUpSets.splice(index,0,structuredClone(group));
  }
  return {program:next,records:records.filter(r=>r!==record)};
}
