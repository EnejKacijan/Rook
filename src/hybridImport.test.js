import {afterEach,it,expect,vi} from 'vitest';
import {AIService} from './aiService.js';
import {hybridOwnerNotes} from './hybridImportFixture.js';
import {validateHybridInterpretation,mergeHybridInterpretation,hybridInterpretationSchema} from './hybridImport.js';
import {resolvePartialPrescription} from './importPartialPrescription.js';
import {applyHybridDecision} from './hybridImportReview.js';
import {blankState,targetLabel,deserializeState,startWorkout} from './domain.js';
import {buildWeeklyPlanExport} from './workoutExport.js';
import {preparePlanImport} from './planImportTransaction.js';
afterEach(()=>vi.unstubAllGlobals());
const parse=(text,options={})=>AIService.importTrainingPlan(blankState().profile,text,{review:true,...options});
const all=result=>result.program.days.flatMap(d=>d.exercises);
it('preserves the real owner source locally, before any AI: no fabricated reps or hidden mandatory work',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const r=await parse(hybridOwnerNotes);expect(fetch).not.toHaveBeenCalled();
  expect(r.hybrid.needsAI).toBe(true);expect(r.hybrid.unresolvedCount).toBe(1);expect(r.program.days).toHaveLength(1);expect(r.program.days[0].name).toBe('Push');expect(r.program.days[0].weekday).toBeNull();
  const exercises=all(r);expect(exercises).toHaveLength(12);
  expect(exercises.map(e=>e.sets.length)).toEqual([1,3,4,3,1,3,0,3,1,3,4,0]);
  expect(exercises[0].importRole).toBe('Top set');expect(exercises[0].repMin).toBeNull();
  expect(exercises[1].importRole).toBe('Working sets');expect(exercises[1].repMin).toBe(3);expect(exercises[1].repMax).toBeNull();
  expect(exercises[6].partialPrescription.setRange).toEqual([3,4]);expect(exercises[6].matchStatus).toBe('needs-name-review');
  expect(exercises[10].sets.map(s=>s.setType)).toEqual(['standard','standard','standard','drop']);
  expect(exercises[11].failureTarget).toBe(true);expect(exercises[11].repMin).toBeNull();
  expect(r.sourceReview.issues.filter(i=>i.field==='optional')).toHaveLength(2);
  expect(r.sourceReview.issues.some(i=>i.field==='alternative')).toBe(false);
  expect(r.program.days[0].warmupPlan.items[0]).toMatchObject({sets:2,reps:null,seconds:null,prescriptionText:'2 warm-up sets'});
  for(const e of exercises){expect(e.targetRir).toBeNull();expect(e.restSeconds).toBeNull();expect(e.sets.every(s=>s.weight===null&&!s.completed)).toBe(true);}
  expect(()=>preparePlanImport(blankState(),r.program,r.profile,{date:'2026-09-11',weekday:'Fri',initial:true})).toThrow(/Resolve/);
});
it('sends only the unresolved fragment after explicit AI opt-in, never the profile or accepted exercises',async()=>{
  const fetch=vi.fn(async(url,options)=>{
    expect(url).toBe('/api/ai');const b=JSON.parse(options.body);expect(b.operation).toBe('interpret-import');expect(b.payload.consent).toBe(true);expect(b.payload.profile).toBeUndefined();
    expect(b.payload.fragments).toHaveLength(1);expect(b.payload.fragments[0].text).toBe('Po želji še na koncu do failure dipsi');
    return {ok:true,json:async()=>({data:{fragments:[{id:b.payload.fragments[0].id,kind:'exercise',nameQuote:'dipsi',facts:[{kind:'failure',value:'true',evidence:'do failure'},{kind:'optional',value:'true',evidence:'Po želji'}]}]}})};
  });vi.stubGlobal('fetch',fetch);
  const r=await parse(hybridOwnerNotes,{interpretWithAI:true});expect(fetch).toHaveBeenCalledOnce();expect(r.hybrid.needsAI).toBe(false);
  expect(all(r).at(-1)).toMatchObject({importedName:'dipsi',failureTarget:true,repMin:null,repMax:null});expect(all(r).at(-1).sets).toHaveLength(0);
});
const fragment={id:'f',text:'Chest flys - 4 seti',executable:true};
const valid={id:'f',kind:'exercise',nameQuote:'Chest flys',facts:[{kind:'sets',value:'4',evidence:'4 seti'}]};
it('uses a strict structured interpretation schema',()=>{expect(hybridInterpretationSchema.additionalProperties).toBe(false);expect(hybridInterpretationSchema.properties.fragments.items.required).toContain('facts');});
it.each([
  {...valid,nameQuote:'Squat'}, {...valid,facts:[{kind:'reps',value:'4',evidence:'4 seti'}]},
  {...valid,facts:[{kind:'sets',value:'3',evidence:'4 seti'}]}, {...valid,facts:[{kind:'load',value:'20 kg',evidence:'4 seti'}]},
  {...valid,facts:[{kind:'rir',value:'0',evidence:'4 seti'}]}, {...valid,facts:[{kind:'optional',value:'true',evidence:'4 seti'}]},
  {...valid,facts:[{kind:'sets',value:'4',evidence:'four sets'}]}, {...valid,kind:'note'}, {...valid,extra:'generated advice'},
])('rejects unsupported model claims %#',item=>{const checked=validateHybridInterpretation({fragments:[item]},[fragment]);expect(checked.accepted).toHaveLength(0);expect(checked.rejected).toHaveLength(1);});
it('rejects duplication/reordering and leaves original deterministic blocks untouched',()=>{
  expect(validateHybridInterpretation({fragments:[valid,valid]},[fragment]).rejected).toHaveLength(1);
  const original={fragments:[fragment],blocks:[{name:'Bench Press',sets:3},{fragmentId:'f',name:null}]};const merged=mergeHybridInterpretation(original,{fragments:[valid]});
  expect(merged.blocks[0]).toBe(original.blocks[0]);expect(original.blocks[1].name).toBeNull();expect(merged.blocks[1].name).toBe('Chest flys');
});
it.each(['network','invalid schema','refusal','unsupported evidence'])('retains local partial work after %s',async kind=>{
  vi.stubGlobal('fetch',vi.fn(async()=>{if(kind==='network')throw new Error('Offline');return {ok:kind!=='refusal',json:async()=>kind==='refusal'?{error:'Refused'}:{data:kind==='invalid schema'?{text:'make 4x10'}:{fragments:[{...valid,id:'fragment-30'}]}}};}));
  const r=await parse(hybridOwnerNotes,{interpretWithAI:true});expect(all(r)).toHaveLength(12);expect(r.hybrid.error).toBeTruthy();expect(all(r)[1].repMin).toBe(3);expect(all(r)[2].repMin).toBeNull();
});
it('enforces source set ranges and rep floors through repeated resolution',async()=>{
  const r=await parse(hybridOwnerNotes),range=all(r)[6],floor=all(r)[1];
  expect(resolvePartialPrescription(range,{sets:5,repMin:8,repMax:10})).toBe(false);
  expect(resolvePartialPrescription(range,{sets:3,repMin:8,repMax:10})).toBe(true);expect(range.sets).toHaveLength(3);
  expect(resolvePartialPrescription(floor,{sets:3,repMin:8,repMax:10})).toBe(false);
  expect(resolvePartialPrescription(floor,{sets:3,repMin:3,repMax:6})).toBe(true);expect(targetLabel(floor)).toBe('Working sets · 3 × 3–6');
});
it('optional exclusion is explicit and source text survives',async()=>{
  const r=await parse(hybridOwnerNotes),issue=r.sourceReview.issues.find(i=>i.field==='optional'),before=r.program.importMetadata.sourceNotes;
  applyHybridDecision(r.program,issue,{value:'exclude'});expect(all(r).find(e=>e.id===issue.exerciseId)).toBeUndefined();expect(r.program.importMetadata.sourceNotes).toBe(before);
  expect(r.program.importMetadata.pendingHybrid.some(id=>id.startsWith(`hybrid-${issue.exerciseId}-`))).toBe(false);
});
it('optional exclusion can be reversed in the local review without losing source order or unresolved answers',async()=>{
  const r=await parse(hybridOwnerNotes),issues=r.sourceReview.issues,issue=issues.find(i=>i.field==='optional'&&issues.some(other=>other.exerciseId===i.exerciseId&&other.field==='prescription')),original=all(r).map(e=>e.id),excluded=new Map();
  applyHybridDecision(r.program,issue,{value:'exclude'},{excluded,issues});expect(all(r).map(e=>e.id)).not.toContain(issue.exerciseId);
  applyHybridDecision(r.program,issue,{value:'include'},{excluded,issues});expect(all(r).map(e=>e.id)).toEqual(original);
  expect(r.program.importMetadata.pendingHybrid).toContain(issues.find(i=>i.exerciseId===issue.exerciseId&&i.field==='prescription').id);
  expect(all(r).find(e=>e.id===issue.exerciseId).hybridSource.optionalDecision).toBe('include');
  expect(JSON.stringify(r.program.importMetadata)).not.toContain('excludedExercises');
});
it.each(['Monday\nBench Press 3x8','Monday\nPull Up 3xAMRAP','Monday\nCable Row 3 sets','Monday\nSuperset: Cable Fly 3x12 + Cable Row 3x12','Monday\n3 rounds\nPush Up 10 reps\nSquat 15 reps'])('keeps accepted deterministic imports local: %s',async source=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const r=await parse(source);expect(fetch).not.toHaveBeenCalled();expect(r.hybrid).toBeUndefined();
});
it('rejects the actual provider mistake: workout position is not a back-off role',()=>{
  const f={id:'f',text:'Po želji še na koncu do failure dipsi',executable:true};
  const bad={id:'f',kind:'exercise',nameQuote:'dipsi',facts:[{kind:'role',evidence:'na koncu',value:'backoff'}]};
  expect(validateHybridInterpretation({fragments:[bad]},[f]).accepted).toEqual([]);
});
it('preserves separate role and additional-drop blocks, absent rest, and targets through reload/active/export',async()=>{
  const r=await parse('Monday: Upper\nBench Press - 1 top set 8 reps + 3 working sets 8–10 reps\nLateral raises - 3 seti 12 reps\n+ 1 dropset');
  for(const issue of r.sourceReview.issues.filter(i=>i.field==='prescription')){
    const ex=all(r).find(e=>e.id===issue.exerciseId),value={sets:ex.sets.length||3,repMin:8,repMax:10};
    expect(resolvePartialPrescription(ex,value)).toBe(true);applyHybridDecision(r.program,issue,value);
  }
  const state=preparePlanImport(blankState(),r.program,r.profile,{date:'2026-09-11',weekday:'Fri',initial:true});
  const reloaded=deserializeState(JSON.parse(JSON.stringify(state))),ex=reloaded.program.days[0].exercises;
  expect(ex).toHaveLength(4);expect(ex.map(e=>e.sets.length)).toEqual([1,3,3,1]);expect(ex.every(e=>e.restSeconds===null)).toBe(true);
  expect(ex.map(e=>e.importRole)).toEqual(['Top set','Working sets',null,null]);
  const active=startWorkout(reloaded,reloaded.program.days[0]);expect(active.exercises).toHaveLength(4);expect(active.exercises[1].repMax).toBe(10);
  const exported=buildWeeklyPlanExport({state:reloaded,includeNotes:false}).text;expect(exported).toContain('Top set');expect(exported).toContain('Working sets');expect(exported).toContain('8–10');expect(exported).not.toContain('RIR 0');
});
it('keeps an explicit rep ceiling unknown below until the user resolves it',async()=>{
  const r=await parse('Monday: Upper\nBench Press - 3 seti največ 8 repi'),ex=all(r)[0];
  expect([ex.repMin,ex.repMax]).toEqual([null,8]);expect(resolvePartialPrescription(ex,{sets:3,repMin:5,repMax:7})).toBe(false);expect(resolvePartialPrescription(ex,{sets:3,repMin:5,repMax:8})).toBe(true);
});
it('cannot dismiss optional-source blocking with an invalid answer',async()=>{
  const r=await parse('Monday: Push\n(Optional)\nPlate front raises - 3 seti'),issue=r.sourceReview.issues.find(i=>i.field==='optional');
  expect(applyHybridDecision(r.program,issue,{value:'default'})).toBe(false);expect(r.program.importMetadata.pendingHybrid).toContain(issue.id);
});
it('keeps an additional drop block optional when its source base exercise is optional',async()=>{
  const r=await parse('Monday: Push\nLateral raises (optional) - 3 seti\n+ 1 dropset');
  expect(all(r).map(e=>e.hybridSource.optional)).toEqual([true,true]);
  expect(r.sourceReview.issues.filter(i=>i.field==='optional')).toHaveLength(2);
});
it('cancellation keeps the source-only draft and never applies a result',async()=>{
  const controller=new AbortController();vi.stubGlobal('fetch',vi.fn(async()=>{controller.abort();throw new Error('Cancelled');}));
  await expect(parse(hybridOwnerNotes,{interpretWithAI:true,signal:controller.signal})).rejects.toThrow();
  expect(all(await parse(hybridOwnerNotes))).toHaveLength(12);
});
it('blocks a long-tail multi-prescription fragment instead of keeping only the AI-named first exercise',async()=>{
  const r=await parse('Monday: Upper\nPlease perform Cable Row for three sets of ten reps and Bench Press for three sets of eight reps.');
  expect(r.sourceReview.issues.some(i=>i.requiresSourceEdit&&/multiple prescriptions/.test(i.message))).toBe(true);
  expect(()=>preparePlanImport(blankState(),r.program,r.profile,{date:'2026-09-11',weekday:'Fri'})).toThrow(/Resolve/);
});
