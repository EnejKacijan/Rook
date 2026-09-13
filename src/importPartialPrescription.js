// Ordinary resolution supplies missing dimensions only. Explicit correction is
// a separate user action; it never alters the preserved source text.
export function normalizePartialTargets(exercise, measure) {
  const partial=exercise.partialPrescription;
  if(!partial || measure==='seconds' || partial.roundCount!=null || partial.repFloor!=null || partial.repCeiling!=null) return;
  if(partial.missing.includes('reps') && exercise.repMin==null && exercise.repMax==null && !exercise.failureTarget){
    exercise.repTarget='unspecified';
    exercise.partialPrescription={...partial,missing:partial.missing.filter(key=>key!=='reps')};
  }
  if(!exercise.partialPrescription.missing.length)delete exercise.partialPrescription;
}

export function resolvePartialPrescription(exercise, value) {
  const partial = exercise.partialPrescription;
  if(!partial)return false;
  if(partial.missing.includes('structure'))return false;
  const known = partialPrescriptionSourceFields(partial);
  const corrections = (Array.isArray(value.sourceCorrections)?value.sourceCorrections:[]).filter(key=>known.includes(key));
  const prior = exercise.importPrescriptionCorrections;
  const corrected = key=>corrections.includes(key)||Object.hasOwn(prior?.values||{},key);
  const count = partial.missing.includes('sets')||corrections.includes('sets') ? Number(value.sets) : exercise.sets.length;
  const min = partial.missing.includes('reps')||corrections.includes('repMin') ? Number(value.repMin) : exercise.repMin;
  const max = partial.missing.includes('reps')||corrections.includes('repMax') ? Number(value.repMax) : exercise.repMax;
  if (!Number.isInteger(count) || count < 1 || count > 20 ||
      (exercise.supersetId && count!==exercise.sets.length) ||
      (partial.setRange && !corrected('sets') && (count<partial.setRange[0]||count>partial.setRange[1])) ||
      (partial.repFloor!=null && !corrected('repMin') && min!==partial.repFloor) ||
      (partial.repCeiling!=null && !corrected('repMax') && max!==partial.repCeiling) ||
      ((partial.missing.includes('reps')||corrections.some(key=>key!=='sets')) && (!Number.isInteger(min) || min < 1 || !Number.isInteger(max) || max < min))) return false;
  if(corrections.length){
    const source=prior?.source||{sets:partial.setRange?[...partial.setRange]:partial.missing.includes('sets')?null:exercise.sets.length,repMin:partial.repFloor??(!partial.missing.includes('reps')?exercise.repMin:null),repMax:partial.repCeiling??(!partial.missing.includes('reps')?exercise.repMax:null)};
    const targets={sets:count,repMin:min,repMax:max},values={...prior?.values};
    for(const key of corrections){
      if(targets[key]===source[key])delete values[key];else values[key]=targets[key];
    }
    exercise.importPrescriptionCorrections={source,values,origin:'user'};
  }
  exercise.repMin = min; exercise.repMax = max;
  exercise.sets = Array.from({length:count}, (_, index) => ({
    weight:partial.weight ?? null, setType:partial.setType,
    ...exercise.sets[Math.min(index, exercise.sets.length - 1)],
    id:exercise.sets[index]?.id || `${exercise.id}-review-set-${index}`,
    reps:min, completed:false,
    ...(exercise.hybridSource?{weightProvenance:exercise.sets[index]?.weightProvenance??null}:{}),
  }));
  delete exercise.partialPrescription;
  return true;
}

export function partialPrescriptionSourceFields(partial){
  if(!partial)return [];
  return [
    ...(!partial.missing.includes('sets')||partial.setRange?['sets']:[]),
    ...(!partial.missing.includes('reps')||partial.repFloor!=null?['repMin']:[]),
    ...(!partial.missing.includes('reps')||partial.repCeiling!=null?['repMax']:[]),
  ];
}
