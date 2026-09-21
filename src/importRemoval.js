// A durable decision about the interpreted plan, never deletion of source notes.
export function removeImportedExercise(program,dayId,exerciseId,{issues=[],resolved={}}={}) {
 const next=structuredClone(program),day=next.days.find(d=>d.id===dayId),index=day?.exercises.findIndex(e=>e.id===exerciseId);
 if(index==null||index<0)return next;
 const exercise=day.exercises[index],issueIds=issues.filter(i=>i.exerciseId===exerciseId).map(i=>i.id);
 next.importMetadata ||= {};next.importMetadata.removedExercises ||= [];
 const remainingGroup=exercise.supersetId?day.exercises.filter(e=>e.id!==exerciseId&&e.supersetId===exercise.supersetId):[];
 const detached=remainingGroup.length===1?remainingGroup.map(e=>({id:e.id,supersetId:e.supersetId})):[];
 next.importMetadata.removedExercises.push({dayId,exercise,index,detached,followingIds:day.exercises.slice(index+1).map(e=>e.id),issueIds,resolved:Object.fromEntries(issueIds.map(id=>[id,resolved[id]||false])),pending:(next.importMetadata.pendingHybrid||[]).filter(id=>issueIds.includes(id))});
 day.exercises.splice(index,1);
 for(const link of detached)delete day.exercises.find(e=>e.id===link.id).supersetId;
 if(next.importMetadata.pendingHybrid)next.importMetadata.pendingHybrid=next.importMetadata.pendingHybrid.filter(id=>!issueIds.includes(id));
 return next;
}
export function undoImportedExerciseRemoval(program,exerciseId) {
 const next=structuredClone(program),entries=next.importMetadata?.removedExercises||[],record=entries.find(r=>r.exercise.id===exerciseId);
 if(!record)return next;
 const day=next.days.find(d=>d.id===record.dayId);if(!day||day.exercises.some(e=>e.id===exerciseId))return next;
 const anchor=day.exercises.findIndex(e=>record.followingIds.includes(e.id));day.exercises.splice(anchor<0?Math.min(record.index,day.exercises.length):anchor,0,record.exercise);
 for(const link of record.detached||[]){const partner=day.exercises.find(e=>e.id===link.id);if(partner&&!partner.supersetId)partner.supersetId=link.supersetId;}
 if(record.exercise.supersetId&&day.exercises.filter(e=>e.supersetId===record.exercise.supersetId).length<2)delete record.exercise.supersetId;
 next.importMetadata.removedExercises=entries.filter(r=>r!==record);
 if(record.pending.length)next.importMetadata.pendingHybrid=[...new Set([...(next.importMetadata.pendingHybrid||[]),...record.pending])];
 return next;
}
export function removedImportAnswers(program) {return Object.fromEntries((program.importMetadata?.removedExercises||[]).flatMap(r=>r.issueIds.map(id=>[id,{excluded:true,removed:true}])));}
