const normalize = unit => /^lbs?$/i.test(unit) ? 'lb' : /^kgs?$/i.test(unit) ? 'kg' : null;

// Only a written declaration establishes context. A nearby exercise's kg/lb,
// or the user's display preference, is not a declaration for other exercises.
export function declaredSourceWeightUnit(line) {
  const match=String(line).trim().match(/^(?:all\s+)?(?:weights?|loads?|units?|teža|teze|uteži)\s*(?:are\s+)?(?:in\s+|[:=]\s*|\(\s*)(kg|kgs|lb|lbs)\s*\)?\s*[.!]?$/iu);
  return normalize(match?.[1]||'');
}
export function sourceWeightUnitAt(source, lineNumber) {
  let unit=null,tableUnit=null;
  for(const line of String(source).split(/\r?\n/).slice(0,lineNumber)){
    const declared=declaredSourceWeightUnit(line);
    if(declared)unit=declared;
    if(!line.includes('|'))tableUnit=null;
    // An explicitly unit-labelled weight column applies to its table rows.
    if(/\|/.test(line)&&/\b(?:exercise|name|vaja)\b/i.test(line))
      tableUnit=normalize(line.match(/(?:^|\|)\s*(?:weight|load)\s*\((kg|kgs|lb|lbs)\)/i)?.[1]||'');
  }
  return tableUnit||unit;
}
export function unitlessPrescriptionLoads(prescription) {
  if(/^\s*@\s*[0-4](?:\s|$)/u.test(prescription.suffix||''))return null; // Existing effort-notation decision owns @1/@2.
  if(prescription.loadUnit)return null;
  if(prescription.setLoads)return [...prescription.setLoads];
  const match=String(prescription.suffix||'').match(/^[\s|,@:;–—-]*(\d+(?:[.,]\d+)?)(.*)$/u);
  if(!match || /^\s*(?:kg|lbs?|kgs|RIR|RPE|reps?|sec\w*|s\b|sek\w*|min\w*|%|[x×/])/i.test(match[2]))return null;
  return [Number(match[1].replace(',','.'))];
}
export function sourceLoadsInKg(loads, unit) {
  return loads.map(load=>Number((load*(unit==='lb'?0.45359237:1)).toFixed(2)));
}
export function applySourceUnitDecision(program, issue, unit) {
  if(!['kg','lb'].includes(unit)||!issue.sourceLoads?.length)return false;
  const exercise=program.days.find(day=>day.id===issue.dayId)?.exercises.find(item=>item.id===issue.exerciseId);
  if(!exercise)return false;
  const loads=sourceLoadsInKg(issue.sourceLoads,unit);
  if(loads.length!==1&&loads.length!==exercise.sets.length)return false;
  exercise.sets.forEach((set,index)=>{set.weight=loads.length===1?loads[0]:loads[index];});
  return true;
}
