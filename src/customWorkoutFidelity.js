import { allMuscleFullBody, customFocusSatisfied, customFullBodyExerciseLimit, customFullBodyWorkingSetLimit, customFullBodyMaxSets, customFullBodyHingeSetLimit, fullBodyRequiredAccessories, fullBodyMuscleCoverage } from './customTrainingStructure.js';

// Generation checks the original questionnaire selection, rather than trusting
// a generated day's own labels to describe which exercises it should contain.
// Manual edits to an already accepted plan do not pass through this boundary.
export function customWorkoutFidelityErrors(program, requestedSessions, resolveItem, profile = program?.profileSnapshot || {}, availablePatterns = null) {
  if (!requestedSessions?.length) return [];
  if (!Array.isArray(program?.days) || program.days.length !== requestedSessions.length)
    return ['The generated workout count does not match your selected workout blocks.'];
  const errors = [];
  const fullBodyCount = requestedSessions.filter(session => allMuscleFullBody(session.concepts)).length;
  let fullBodyIndex = 0;
  for (const [index, requested] of requestedSessions.entries()) {
    const day = program.days[index];
    const label = `Workout ${index + 1} (${requested.name})`;
    if (!Array.isArray(day?.customFocus) || day.customFocus.length !== requested.concepts.length ||
      requested.concepts.some((concept, i) => day.customFocus[i] !== concept))
      errors.push(`${label} does not preserve the selected muscle groups in this block.`);
    if (requested.weekday && day?.weekday !== requested.weekday)
      errors.push(`${label} does not preserve its selected weekday.`);
    const items = (day?.exercises || []).map(exercise => resolveItem(exercise.exerciseId));
    const fullBody = allMuscleFullBody(requested.concepts);
    const fullBodyAccessories = fullBody ? fullBodyRequiredAccessories(fullBodyCount,fullBodyIndex,availablePatterns) : [];
    const light = fullBodyCount>=4 && fullBodyIndex%2===1;
    if(fullBody)fullBodyIndex++;
    if (!customFocusSatisfied(requested.concepts, items, [...new Set([...fullBodyAccessories,...(day?.customFullBodyAccessories||[])])]))
      errors.push(`${label} is missing a selected focus or contains an exercise outside those focuses.`);
    if (allMuscleFullBody(requested.concepts) && items.length > customFullBodyExerciseLimit(profile))
      errors.push(`${label} has too many exercises for the selected session length.`);
    if (allMuscleFullBody(requested.concepts) && day.estimatedMinutes > Number(profile.sessionMinutes || 45))
      errors.push(`${label} exceeds the selected session length.`);
    if(fullBody && ((day.exercises||[]).reduce((sum,e)=>sum+e.sets.length,0)>customFullBodyWorkingSetLimit(profile,light) ||
      (day.exercises||[]).some(e=>e.sets.length>Math.min(customFullBodyMaxSets(profile,light),resolveItem(e.exerciseId)?.pattern==='hinge'?customFullBodyHingeSetLimit(profile):Infinity))))
      errors.push(`${label} exceeds its planned full-body workload.`);
  }
  const fullBodyItems = program.days.flatMap((day,index) => allMuscleFullBody(requestedSessions[index].concepts)
    ? (day.exercises || []).map(exercise => resolveItem(exercise.exerciseId)) : []);
  if (fullBodyItems.length && !fullBodyMuscleCoverage(requestedSessions.find(session => allMuscleFullBody(session.concepts)).concepts, fullBodyItems))
    errors.push('Full-body workouts do not cover all selected muscle groups across the week.');
  return errors;
}
