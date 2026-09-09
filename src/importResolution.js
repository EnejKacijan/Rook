export const needsImportMatch = exercise => ['unresolved', 'needs-name-review'].includes(exercise?.matchStatus);
export function importResolutionDecisions(review, program, matchIds = []) {
  return importResolutionGroups(review, program, matchIds).flatMap(group => [
    ...group.issues.map(issue => ({id:issue.id, group:group.id, issue})),
    ...(group.entries || []).map(entry => ({id:`match:${entry.id}`, group:group.id, entry})),
  ]);
}
export function importMatchEntries(program) {
  return program.days.flatMap(day => day.exercises.filter(needsImportMatch).map(exercise => ({dayId:day.id, id:exercise.id})));
}
export function importResolutionGroups(review, program, matchIds = []) {
  const issues = (review?.issues || []).filter(issue => issue.category !== 'preserved');
  const definitions = [
    ['prescriptions', 'PRESCRIPTIONS', issue => !['loggingMode','advanced','day'].includes(issue.field) && issue.category !== 'exclusion'],
    ['logging', 'LOGGING', issue => ['loggingMode','advanced'].includes(issue.field) && issue.category !== 'exclusion'],
    ['schedule', 'SCHEDULE', issue => issue.field === 'day' && issue.category !== 'exclusion'],
    ['exclusions', 'EXCLUSIONS', issue => issue.category === 'exclusion'],
  ];
  const groups = definitions.map(([id,title,filter]) => ({id,title,issues:issues.filter(filter)})).filter(group => group.issues.length);
  const ids = new Set([...matchIds, ...importMatchEntries(program).map(entry => entry.id)]);
  const entries = program.days.flatMap(day => day.exercises.filter(exercise => ids.has(exercise.id)).map(exercise => ({dayId:day.id,id:exercise.id})));
  if(entries.length) groups.push({id:'matches',title:'EXERCISE MATCHES',issues:[],entries});
  return groups;
}
