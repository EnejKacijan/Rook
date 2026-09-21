const dayKey=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
const validTime=value=>(typeof value==='number' || typeof value==='string' || value instanceof Date) && value!=='' && Number.isFinite(new Date(value).getTime());
const localDay=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

// A schedule date is provenance, never evidence that training happened then.
// Imported source-local days are explicit facts, even when import synthesized
// a timestamp to represent date-only data. Native sessions use their real start.
export function workoutPerformedDate(workout) {
  if(!workout)return null;
  if(workout.historicalImport || workout.sourceDate?.day){
    const imported=dayKey(workout.sourceDate?.day)||dayKey(workout.workoutDateKey)||dayKey(workout.canonicalPlanDate);
    if(imported)return imported;
  }
  const value=[workout.startedAt,workout.completedAt,workout.endedAt].find(validTime);
  if(value!==undefined){
    if(dayKey(value))return value;
    const date=new Date(value);
    if(Number.isFinite(workout.utcOffsetMinutesAtStart))return new Date(date.getTime()-workout.utcOffsetMinutesAtStart*60000).toISOString().slice(0,10);
    if(workout.timeZoneAtStart){try{const parts=new Intl.DateTimeFormat('en',{timeZone:workout.timeZoneAtStart,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');}catch{/* Legacy invalid zone: use the existing local calendar convention. */}}
    return localDay(date);
  }
  // No reliable timestamp: preserve legacy date evidence without guessing.
  return dayKey(workout.workoutDateKey)||dayKey(workout.canonicalPlanDate);
}
