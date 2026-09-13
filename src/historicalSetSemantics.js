// Compatibility rules apply only to migrated factual sets, never plan targets.
export const isImportedHistorySet = set => set?.rawImport?.version === 2;
export function importedSessionTimeLabel(workout) {
  const end=workout.sourceEnd, start=workout.sourceDate;
  return end?.precision==='datetime'?`Finished ${end.value.slice(11,16)}`:
    start?.precision==='datetime'?`Started ${start.value.slice(11,16)}`:'Time not recorded';
}
export function importedSetComparable(set) {
  if (!isImportedHistorySet(set)) return true;
  const type=String(set.importSetType||'').toLowerCase().replace(/[\s_-]/g,'');
  return ['normal','standard'].includes(type) &&
    !['assisted','none','bodyweight','unknown'].includes(set.rawImport.loadKind) &&
    set.reps != null && Number(set.reps)>0 && !set.distance && !set.durationSeconds;
}
export function importedHistoryDescriptor(set) {
  const parts=[];
  if(set.importSetType)parts.push(set.importSetType);
  if(set.reps!=null)parts.push(`${set.reps} reps`);
  if(set.durationSeconds!=null)parts.push(`${set.durationSeconds} sec`);
  if(set.distance!=null)parts.push(`${set.distance} ${set.distanceUnit}`);
  if(set.rpe!=null)parts.push(`RPE ${set.rpe}`);
  if(set.rir!=null)parts.push(`RIR ${set.rir}`);
  if(set.rawImport?.loadKind==='assisted')parts.push('assisted load');
  if(set.rawImport?.loadKind==='unknown')parts.push('source load · meaning unconfirmed');
  return parts.join(' · ');
}
