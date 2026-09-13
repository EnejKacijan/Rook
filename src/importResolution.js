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

/** Presentation only. Validators, answer IDs and executable blocks are unchanged. */
export function importExerciseReviewGroups(review, program, matchIds = []) {
  const decisions=importResolutionDecisions(review,program,matchIds),groups=[];
  const sourceBlocks=program.importMetadata?.hybrid?.sourceBlocks||[];
  const rootFor=exercise=>{
    let id=exercise.hybridSource?.blockId;
    const seen=new Set();
    while(id&&!seen.has(id)){
      seen.add(id);
      const block=sourceBlocks.find(b=>b.id===id),parent=sourceBlocks.find(b=>b.id===block?.reviewParentBlockId);
      if(!parent||parent.day!==block.day)break;
      id=parent.id;
    }
    return id||exercise.id;
  };
  const used=new Set();
  for(const day of program.days){
    const dayGroups=new Map();
    for(const exercise of day.exercises){
      const id=`exercise:${day.id}:${rootFor(exercise)}`;
      const name=exercise.originalImportedName||exercise.importedName||exercise.exerciseId;
      const title=exercise.hybridSource?.choice&&name==='Exercise choice'?exercise.hybridSource.sourceSpan.text.split('\n')[0]:name;
      if(!dayGroups.has(id))dayGroups.set(id,{id,dayId:day.id,title,members:[],items:[],sourceSpans:[]});
      const group=dayGroups.get(id);
      const items=decisions.filter(item=>(item.entry?.dayId||item.issue?.dayId)===day.id&&(item.entry?.id||item.issue?.exerciseId)===exercise.id);
      group.members.push({id:exercise.id,source:exercise});group.items.push(...items);
      const span=exercise.hybridSource?.sourceSpan||exercise.sourceSpan;
      if(span&&!group.sourceSpans.some(s=>s.start===span.start&&s.end===span.end&&s.text===span.text))group.sourceSpans.push(span);
      items.forEach(item=>used.add(item.id));
    }
    groups.push(...[...dayGroups.values()].filter(group=>group.items.length));
  }
  // Workout/plan-scoped decisions stay independent, after exercise groups.
  for(const item of decisions.filter(item=>!used.has(item.id))){
    const day=program.days.find(day=>day.id===item.issue?.dayId);
    groups.push({id:item.id,dayId:day?.id,title:item.issue?.field==='day'?`${day?.name||'Workout'} · Schedule`:item.issue?.field==='roundGroup'?'Review circuit structure':'Review source',members:[],items:[item],sourceSpans:[]});
  }
  return groups.map(group=>({...group,issues:group.items.filter(i=>i.issue).map(i=>i.issue),entries:group.items.filter(i=>i.entry).map(i=>i.entry)}));
}
