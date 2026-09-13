import {expect,it,vi} from 'vitest';
import {AIService} from './aiService.js';
import {blankState} from './domain.js';
import {hybridOwnerNotes} from './hybridImportFixture.js';
import {importExerciseReviewGroups,importResolutionDecisions} from './importResolution.js';

it('presents five genuine owner source groups plus schedule; optional names add no mandatory steps',async()=>{
 const profile=blankState().profile;
 const r=await AIService.importTrainingPlan(profile,hybridOwnerNotes,{review:true});
 const before=structuredClone(r.program),groups=importExerciseReviewGroups(r.sourceReview,r.program);
 expect(groups).toHaveLength(6);expect(groups.filter(g=>g.members.length)).toHaveLength(5);
 expect(groups.map(g=>g.members.length)).toEqual([2,1,1,1,1,0]);
 expect(groups.flatMap(g=>g.items)).toHaveLength(importResolutionDecisions(r.sourceReview,r.program).length);
 expect(groups[0].members.map(m=>m.source.importRole)).toEqual(['Top set','Working sets']);
 const optionalIds=r.program.days.flatMap(d=>d.exercises).filter(e=>e.matchStatus==='original').map(e=>e.id);
 const withExplicitIdentityReview=importExerciseReviewGroups(r.sourceReview,r.program,optionalIds);
 expect(withExplicitIdentityReview).toHaveLength(9);
 expect(withExplicitIdentityReview[2].members[0].source.hybridSource.blockId).not.toBe(withExplicitIdentityReview[2].members[1].source.hybridSource.blockId);
 expect(r.program.days[0].warmupPlan.items[0]).toMatchObject({sets:2,seconds:null});
 expect(r.program).toEqual(before);expect(groups.at(-1).items[0].issue.field).toBe('day');
});
it('never groups repeated names or unrelated source blocks/days by text',()=>{
 const ex=(id,blockId)=>({id,importedName:'Row',matchStatus:'unresolved',hybridSource:{blockId}});
 const p={days:[{id:'mon',exercises:[ex('a','one'),ex('b','two')]},{id:'fri',exercises:[ex('c','one')]}]};
 expect(importExerciseReviewGroups({issues:[]},p).map(g=>g.members.map(m=>m.id))).toEqual([['a'],['b'],['c']]);
});
it('does not manufacture a parent for legacy source metadata without a structural link',async()=>{
 const r=await AIService.importTrainingPlan(blankState().profile,hybridOwnerNotes,{review:true});
 const optionalIds=r.program.days.flatMap(d=>d.exercises).filter(e=>e.matchStatus==='original').map(e=>e.id);
 r.program.importMetadata.hybrid.sourceBlocks.forEach(b=>delete b.reviewParentBlockId);
 expect(importExerciseReviewGroups(r.sourceReview,r.program,optionalIds)).toHaveLength(10);
});
it('does not reparse or call AI when grouping a persisted draft',async()=>{
 const r=await AIService.importTrainingPlan(blankState().profile,hybridOwnerNotes,{review:true});
 const spy=vi.spyOn(AIService,'importTrainingPlan');
 try {const p=JSON.parse(JSON.stringify(r.program));expect(importExerciseReviewGroups(r.sourceReview,p)).toHaveLength(6);expect(spy).not.toHaveBeenCalled();}finally{spy.mockRestore();}
});
