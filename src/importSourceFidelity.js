// Final source check after both local parser paths. Unsupported execution
// structures stay explicit decisions, rather than plausible but lossy targets.
const number=value=>Number(value.replace(',','.'));
export function sourceEffort(text,kind='RIR') {
  const token='(\\d+(?:[.,]\\d+)?)(?:\\s*[-–—]\\s*(\\d+(?:[.,]\\d+)?))?';
  const source=String(text),prefix=new RegExp(`\\b${kind}\\s*[:=]?\\s*${token}`,'gi');
  const suffix=new RegExp(`\\b${token}\\s*${kind}\\b(?!\\s*[:=]?\\s*\\d)`,'gi');
  return [...source.matchAll(prefix),...source.matchAll(suffix)].map(m=>[number(m[1]),number(m[2]||m[1])]);
}
export function sourceRestRange(text) {
  const m=String(text).match(/\b(?:rest|po[cč]itek|odmor|pause|descanso)\s*:?\s*(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(min(?:ute)?s?|sec(?:ond)?s?|s|sek(?:und[ei]?)?|′|″|')/i);
  return m?[number(m[1]),number(m[2])].map(n=>n*(/^(?:min|′|')/.test(m[3])?60:1)):null;
}
export function finalizeSourceFidelity(result) {
  const {program,sourceReview}=result;if(!sourceReview)return result;
  const issues=sourceReview.issues;let sequence=0;
  const add=(field,message,source,day,exercise,extra={})=>{
    let issue=issues.find(i=>i.field===field&&i.dayId===day?.id&&i.exerciseId===exercise?.id);
    if(issue)Object.assign(issue,{message,...extra,sourceFidelity:true});
    else {issue={id:`source-fidelity-${sequence++}`,field,message,source,dayId:day?.id||null,exerciseId:exercise?.id||null,category:'decision',status:'NEEDS_REVIEW',sourceFidelity:true,...extra};issues.push(issue);}
    return issue;
  };
  for(const day of program.days){
    const heading=sourceReview.lines.find(l=>l.status==='heading'&&l.line===(day.exercises[0]?.sourceSpan?.line||Infinity)-1)?.text;
    // Headers can scope an entire repeated workout. Never select just the first
    // calendar day when execution cannot yet represent the repetition.
    const dayNote=program.importMetadata?.sourceNotes?.find(n=>n.dayId===day.id);
    const title=(dayNote?.title||heading||'').split(/\b\d+\s*[x×*]/i)[0];
    const weekdays=title.normalize('NFKD').replace(/\p{M}/gu,'').match(/\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|pon(?:edeljek)?|tor(?:ek)?|sre(?:da)?|cet(?:rtek)?|pet(?:ek)?|sob(?:ota)?|ned(?:elja)?)\b/gi)||[];
    const weekdayKey=value=>({pon:'mon',tor:'tue',sre:'wed',cet:'thu',pet:'fri',sob:'sat',ned:'sun'}[value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().slice(0,3)]||value.toLowerCase().slice(0,3));
    if(new Set(weekdays.map(weekdayKey)).size>1)
      add('schedule','This heading names more than one workout day. Put the repeated workout under a separate heading for each day before importing; no day has been discarded.',title,day,null,{requiresSourceEdit:true});
    for(const exercise of day.exercises){
      const original=exercise.sourceSpan?.text||exercise.hybridSource?.sourceSpan?.text||'';
      const table=exercise.sourceSpan?.table;
      const source=table?`${table.header}\n${original}`:original;
      const facts=table?.normalized||source;
      if(/\d\s*[x×]\s*\d[\s\S]*\bthen\b[\s\S]*\d\s*[x×]\s*\d/i.test(source)){
        const issue=issues.find(i=>i.exerciseId===exercise.id&&i.field==='alternative'&&i.requiresSourceEdit);
        if(issue){issue.message='The source contains consecutive prescriptions for this exercise. Put each set block on its own named line; no second block has been discarded.';issue.sourceFidelity=true;}
      }
      const rir=sourceEffort(facts),rpe=sourceEffort(facts,'RPE');
      if(rpe.length||rir.some(([min,max])=>min!==max||!Number.isInteger(min)||min<0||min>4)||new Set(rir.map(r=>r.join(':'))).size>1){
        exercise.targetRir=null;
        exercise.notes=[...new Set([exercise.notes,source].filter(Boolean))].join('\n');
        add('rir',rpe.length?'RPE is kept in the source notes. Choose an explicit RIR for this plan, or leave it unspecified.':'The source gives a RIR range or conflicting effort targets. Choose one RIR for this plan, or leave it unspecified.',source,day,exercise);
      }
      const restRange=sourceRestRange(facts);
      if(restRange){
        exercise.restSeconds=null;
        exercise.importedRestRangeSeconds=restRange;
        add('rest',`Source rest: ${restRange[0]}–${restRange[1]} seconds. Choose the timer duration for this plan; the source range stays preserved.`,source,day,exercise,{restRange});
      }
      if(/\d\s*[x×*]\s*\d+(?:[.,]\d+)?\s*(?:km|m|metres?|meters?|metrov)\b/i.test(source)){
        exercise.repMin=null;exercise.repMax=null;exercise.repTarget='unspecified';
        exercise.sets.forEach(set=>{set.reps=null;});
        add('sourcePrescription','This exercise is prescribed by distance. ROOK cannot execute distance as reps. Edit the source to give the intended supported target; the original distance stays preserved.',source,day,exercise,{requiresSourceEdit:true});
      }
      const repList=/\d+\s*\/\s*\d+(?:\s*\/\s*\d+)*\s*reps?\b/i.test(source);
      const perSetRows=/(?:^|\n)\s*\d+(?:[.,]\d+)?\s*(?:kg|lbs?)\s*[x×]\s*\d+(?!\s*[x×]\s*\d)/i.test(source);
      if(repList||perSetRows){
        exercise.repMin=null;exercise.repMax=null;exercise.repTarget='unspecified';
        exercise.sets.forEach(set=>{set.reps=null;if(repList)set.weight=null;});
        exercise.notes=source;
        // The reusable plan model has a shared rep target. Per-set pyramids
        // would be reset on workout start, even if the draft looked correct.
        issues.splice(0,issues.length,...issues.filter(i=>!(i.exerciseId===exercise.id&&i.field==='prescription'&&!i.partialPrescription)));
        add('sourcePrescription',perSetRows?'These look like completed set logs. Use Import workout history, or rewrite the intended future targets. Different per-set targets cannot be flattened into one rep range.':'This exercise has different targets for each set. Put each target on its own exercise line, for example “Bench Press 1×12 50 kg”. Your original notes are kept.',source,day,exercise,{requiresSourceEdit:true});
      }
      if(/\b(?:last|final)\s+set\s+(?:to\s+)?failure\b/i.test(source)){
        issues.splice(0,issues.length,...issues.filter(i=>!(i.exerciseId===exercise.id&&i.field==='advanced')));
        add('sourcePrescription','The last set is open to failure, while the earlier sets have fixed reps. Put the failure set on a separate exercise line so it stays open; it has not been accepted as fixed reps.',source,day,exercise,{requiresSourceEdit:true});
      }
      const bothSides=/\b(?:left\s*\/\s*right|leva\s*\/\s*desna|per side|each side|each leg|each arm)\b|\/\s*(?:side|stran)\b/i.test(source);
      const sideValues=/\b(?:left|right|leva|desna)(?:\s+(?:leg|arm|noga|roka))?\s*[:=]?\s*\d/i.test(source);
      const onlyOneSide=/\b(?:left|right)(?:\s+(?:leg|arm))?(?:\s*$|\s*[:=]?\s*\d)|\b(?:leva|desna|operirana|operated|injured)\s+(?:noga|roka|leg|arm)\b/im.test(source);
      if(onlyOneSide&&(!bothSides||sideValues)){
        add('sourcePrescription','This source prescribes only a particular side. ROOK currently records either one representative value or both sides. Clarify the supported logging instructions before importing; no bilateral dose was assumed.',source,day,exercise,{requiresSourceEdit:true});
      }
      // Keep cues useful in the execution view, not only in the original file.
      if(/\btempo\b/i.test(source))exercise.notes=[...new Set([exercise.notes,source].filter(Boolean))].join('\n');
    }
    // The logger uses the maximum rest across a pair. A catalogue default on
    // the first member must not override explicit rest after the whole pair.
    for(const group of new Set(day.exercises.map(e=>e.supersetId).filter(Boolean))){
      const members=day.exercises.filter(e=>e.supersetId===group);
      const donor=members.find(e=>/\brest\b[^\n]*\bafter\b[^\n]*\b(?:pair|round)\b/i.test(e.sourceSpan?.text||''));
      if(donor)for(const member of members)member.restSeconds=donor.restSeconds;
    }
  }
  program.importMetadata ||= {};
  for(const issue of issues)if(issue.requiresSourceEdit||['alternative','load'].includes(issue.field))issue.sourceFidelity=true;
  program.importMetadata.pendingSourceDecisions=issues.filter(i=>i.sourceFidelity).map(i=>i.id);
  return result;
}
// Invalidated answers and removed entries must update the durable apply guard.
export function setSourceDecisionPending(program,issue,pending) {
  if(!issue.sourceFidelity)return;
  program.importMetadata ||= {};
  const ids=new Set(program.importMetadata.pendingSourceDecisions||[]);
  if(pending)ids.add(issue.id);else if(!issue.requiresSourceEdit)ids.delete(issue.id);
  program.importMetadata.pendingSourceDecisions=[...ids];
}
