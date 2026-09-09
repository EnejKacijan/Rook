// Decision metadata is transient. Verbatim source notes are durable plan content.
import {analyzeImportAlternatives} from './importAlternatives.js';
export {parseImportAlternatives} from './importAlternatives.js';
export function buildPlanImportReview(parsed, program, catalog) {
  const lines = parsed.parseReview?.lines || [];
  const issues = [];
  const add = (field, message, source, dayId = null, exerciseId = null) => issues.push({ id: `import-issue-${issues.length}`, field, message, source, dayId, exerciseId, status: 'NEEDS_REVIEW' });
  const usedDays = new Set();
  for (const [dayIndex, rawDay] of parsed.days.entries()) {
    const day = program.days[dayIndex];
    if (!day) continue;
    const heading = lines.find(line => line.line === rawDay.sourceLine)?.text || rawDay.name;
    if (!rawDay.scheduleExplicit || usedDays.has(rawDay.weekday)) {
      add('day', rawDay.scheduleExplicit ? `Two workouts are assigned to ${rawDay.weekday}. Choose a different day.` : 'Choose a calendar day for this workout.', heading, day.id);
      day.weekday = null;
    } else day.weekday = rawDay.weekday;
    usedDays.add(rawDay.weekday);
    const pairs = new Map();
    for (const [index, raw] of rawDay.exercises.entries()) {
      const source = lines.find(line => line.line === raw.sourceLine)?.text || '';
      const marker = source.match(/^\s*(?:[•*-]\s*)?([A-Z])([12])\s*[.):\-]?\s+/i);
      if (marker) {
        const key = marker[1].toUpperCase();
        pairs.set(key, [...(pairs.get(key) || []), { index, number: Number(marker[2]), source }]);
      }
    }
    for (const [key, members] of pairs) {
      if (members.length === 2 && members[0].number === 1 && members[1].number === 2 &&
          members[1].index === members[0].index + 1 &&
          day.exercises[members[0].index].sets.length === day.exercises[members[1].index].sets.length) {
        for (const member of members) day.exercises[member.index].supersetId = `${day.id}-superset-${key}`;
      } else add('grouping', 'This superset grouping is incomplete or has unequal rounds. Keep these as separate exercises, or edit the pairing below.', members.map(m => m.source).join('\n'), day.id);
    }
    const nextDayLine = parsed.days[dayIndex + 1]?.sourceLine || Infinity;
    const namedGroups = lines.filter(line => line.line > (rawDay.sourceLine || 0) && line.line < nextDayLine && /^\s*(?:superset|super set|ss)\s*:?\s*$/i.test(line.text));
    for (const [groupIndex, marker] of namedGroups.entries()) {
      const end = namedGroups[groupIndex + 1]?.line || nextDayLine;
      const members = rawDay.exercises.map((raw,index)=>({raw,index})).filter(({raw})=>raw.sourceLine > marker.line && raw.sourceLine < end);
      if (members.length === 2 && day.exercises[members[0].index].sets.length === day.exercises[members[1].index].sets.length) {
        for (const member of members) day.exercises[member.index].supersetId = `${day.id}-named-superset-${groupIndex}`;
        marker.status = 'superset';
      }
    }
    for (const [index, raw] of rawDay.exercises.entries()) {
      const exercise = day.exercises[index];
      if (!exercise) continue;
      const source = (raw.sourceLines || [raw.sourceLine]).map(n => lines.find(l => l.line === n)?.text || '').join('\n');
      const alternatives=analyzeImportAlternatives(source);
      if(alternatives.detected){
        add('alternative', 'Which exercise and prescription should ROOK use? The full source stays preserved.', source, day.id, exercise.id);
        Object.assign(issues.at(-1),alternatives);
        continue; // Effort, load and side semantics belong to the chosen branch.
      }
      if (/\bRPE\s*[:=]?\s*\d|\d\s*RPE\b/i.test(source)) add('rir', 'RPE was converted to an estimated RIR. Review the effort target.', source, day.id, exercise.id);
      else if (!/\bRIR\s*[:=]?\s*[0-4]\b/i.test(source) && /\bRIR\s*[:=]?\s*(?:[5-9]|\d{2,})\b|\b(?:[5-9]|\d{2,})\s*RIR\b/i.test(source)) {
        exercise.targetRir = null;
        add('rir', 'This RIR value is outside the supported range. Review it or leave it unspecified.', source, day.id, exercise.id);
      }
      else if (/@\s*\d/.test(source) && !/@\s*\d\s*RIR\b|@\s*RIR\s*\d|@\s*\d+(?:[.,]\d+)?\s*(?:kg|lbs?)\b/i.test(source)) {
        exercise.targetRir = null;
        add('rir', 'The @ notation is unclear. Choose RIR or leave it unspecified.', source, day.id, exercise.id);
      }
      if(raw.missingPrescription){
        add('prescription','The source gives a load but no sets or reps. Enter the intended prescription.',source,day.id,exercise.id);
        issues.at(-1).requiresReps=true;
        exercise.repMin=null;exercise.repMax=null;exercise.sets.forEach(set=>{set.reps=null;});
      }
      if (/\b(?:rounds?|krogi?|kroga|krogov)\b/i.test(source) && !/\d\s*[x×*]\s*\d/i.test(source)) {
        add('prescription', 'The source gives rounds, not reps. ROOK requires a rep target; enter the intended prescription. The original instruction is preserved.', source, day.id, exercise.id);
        issues.at(-1).requiresReps=true;
        exercise.repMin=null;exercise.repMax=null;exercise.sets.forEach(set=>{set.reps=null;});
        exercise.notes=[exercise.notes,source].filter(Boolean).join('\n');
      }
      if (/\d\s*\/\s*\d\s*\/\s*\d|(?:^|\n)\s*(?:Set\s*\d\s*:|\d+(?:[.,]\d+)?\s*(?:kg|lb)\s*[x×]\s*\d)/i.test(source)) add('prescription', 'This may be a past session log. Review the future prescription; use Import workout history for completed sets.', source, day.id, exercise.id);
      const extraAmrap = source.match(/\+\s*(\d+)\s*AMRAP\b/i);
      const numberedAmrap = source.match(/\bSet\s+(\d+)\s+AMRAP\b/i);
      const lastAmrap = /\b(?:last|final) set\s+AMRAP\b/i.test(source);
      let structuredAdvanced = false;
      if (extraAmrap && Number(extraAmrap[1]) + exercise.sets.length <= 20) {
        const count = Number(extraAmrap[1]);
        for (let n = 0; n < count; n++) exercise.sets.push({ ...exercise.sets.at(-1), id: `${exercise.id}-import-amrap-${n}`, setType: 'amrap', completed: false });
        structuredAdvanced = true;
      } else if (numberedAmrap && Number(numberedAmrap[1]) <= exercise.sets.length + 1) {
        const index = Number(numberedAmrap[1]) - 1;
        if (index === exercise.sets.length) exercise.sets.push({ ...exercise.sets.at(-1), id: `${exercise.id}-import-amrap`, completed: false });
        if (index >= 0) { exercise.sets[index].setType = 'amrap'; structuredAdvanced = true; }
      } else if (lastAmrap) {
        exercise.sets.at(-1).setType = 'amrap'; structuredAdvanced = true;
      } else if (/\d\s*[x×]\s*AMRAP\b/i.test(source)) {
        exercise.sets.forEach(set => { set.setType = 'amrap'; }); structuredAdvanced = true;
      }
      if (!structuredAdvanced && /\b(?:drop[ -]?set|rest[ -]?pause|final set|last set|zadnja serija)\b|\+\s*\d*\s*AMRAP/i.test(source)) add('advanced', 'Choose which existing set uses this method. Extra drop/rest-pause segments are not separate working sets.', source, day.id, exercise.id);
      if (/\/operirana noga/i.test(source)) {
        exercise.loggingMode='normal';exercise.notes=[exercise.notes,source].filter(Boolean).join('\n');
      } else if (/\b(?:per side|each side|each leg|each arm)\b|\/stran|leva\/desna/i.test(source) && (source.match(/\d\s*[x×]\s*\d/g)||[]).length===1 && !/\b(?:left|right|leva|desna)\s*[:=]?\s*\d/i.test(source)) {
        exercise.loggingMode='per_side';exercise.notes=[exercise.notes,source].filter(Boolean).join('\n');
      } else if (/\b(?:per side|each side|each leg|each arm|left\/right|L\/R)\b|\/stran|leva\/desna/i.test(source)) {
        add('loggingMode', 'The side-specific values need a logging choice. Choose how to record this exercise.', source, day.id, exercise.id);
      }
      if (/\d\s*%/.test(source)) add('instruction', 'A percentage load is not an absolute weight. Keep the instruction and enter a working weight only when known.', source, day.id, exercise.id);
      if(raw.unitlessLoads?.length&&!raw.sourceLoadUnit){
        exercise.sets.forEach(set=>{set.weight=null;});
        add('sourceUnit','Choose the unit used for this source weight. Your display preference will not change.',source,day.id,exercise.id);
        issues.at(-1).sourceLoads=[...raw.unitlessLoads];
      }
      if (/(?:^|\s)-\d+(?:[.,]\d+)?\s*(?:kg|lbs?)\b/i.test(source)) {
        exercise.sets.forEach(set => { set.weight = null; });
        add('load', 'A negative load may describe assistance, not lifted weight. Review it; no positive load has been assumed.', source, day.id, exercise.id);
      }
      if (/warm[ -]?up\s+sets?[\s\S]*working\s+sets?/i.test(source)) add('prescription','Warm-up and working sets must stay separate. Confirm only the working prescription here.',source,day.id,exercise.id);
    }
  }
  let group = null;
  const flush = () => {
    if (!group) return;
    add('source', group.status === 'recovery' ? 'Recovery/context text is not a working workout. Review it before excluding it from this plan.' : group.status === 'warmup-review' ? 'Check this warm-up against the preview. Detailed instructions may need correction.' : 'Some text was not confidently interpreted. Review it before proceeding.', group.text.join('\n'));
    group = null;
  };
  for (const line of lines) {
    if (['unclassified','recovery','warmup-review','review'].includes(line.status) && line.text.trim()) {
      if (group?.status !== line.status) { flush(); group = { status: line.status, text: [] }; }
      group.text.push(line.text);
    } else if(line.text.trim()) flush();
  }
  flush();
  for(const line of lines){
    if(!['unclassified','review'].includes(line.status))continue;
    const alternatives=analyzeImportAlternatives(line.text);
    if(alternatives.detected&&!issues.some(issue=>issue.field==='alternative'&&issue.source.includes(line.text))){
      add('alternative','This possible exercise alternative needs a clear prescription. Edit the source notes before using the plan.',line.text);
      Object.assign(issues.at(-1),{options:[],requiresSourceEdit:true});
    }
  }
  // Scope the complete original source, not only warnings. This protects text
  // classified as context/formatting as well as imperfect structural matches.
  program.importMetadata={...program.importMetadata,source:'notes',sourceNotes:[]};
  let note=null;
  for(const line of lines){
    const rawIndex=parsed.days.findIndex(day=>day.sourceLine===line.line);
    const heading=/^\s*(?:[\p{S}\p{P}]\s*)*(?:SOBOTA|NEDELJA|SATURDAY|SUNDAY|Tvoj glavni princip|.*progression principle)/iu.test(line.text);
    if(!note||rawIndex>=0||heading){
      note={scope:rawIndex>=0?'workout':'plan',dayId:rawIndex>=0?program.days[rawIndex]?.id:null,title:line.text.trim()||'Original source',text:''};program.importMetadata.sourceNotes.push(note);
    }
    note.text += (note.text?'\n':'')+line.text;
  }
  for(const issue of issues){
    if(['source','instruction'].includes(issue.field)) {
      issue.category='preserved';
      const day=program.days.find(day=>day.id===issue.dayId),exercise=day?.exercises.find(exercise=>exercise.id===issue.exerciseId);
      if(exercise)exercise.notes=[...new Set([exercise.notes,issue.source].filter(Boolean))].join('\n');
    } else issue.category='decision';
  }
  return { version: 1, issues, lines };
}

export function pendingImportIssues(review, resolved = {}) {
  return (review?.issues || []).filter(issue => issue.category!=='preserved' && !resolved[issue.id]);
}

export const isImportAcknowledgement = issue => issue.category==='exclusion';
export function importDecisionSummary(review, resolved = {}) {
  const pending = pendingImportIssues(review, resolved);
  const notes = pending.filter(isImportAcknowledgement).length;
  const choices = pending.length - notes;
  return [notes && `${notes} exclusions to confirm`, choices && `${choices} ${choices === 1 ? 'decision' : 'decisions'} remaining`].filter(Boolean).join(' · ') || 'Ready to use';
}
