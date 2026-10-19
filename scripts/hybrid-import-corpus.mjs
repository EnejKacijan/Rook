import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {AIService} from '../src/aiService.js';
import {blankState} from '../src/domain.js';
import {hybridImportCorpus} from '../src/hybridImportCorpus.js';
const results=[];const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/hybrid-import';await mkdir(out,{recursive:true});
for(const c of hybridImportCorpus){
 let before,result;const started=performance.now();let requests=0;
 globalThis.fetch=async(url,options)=>{requests++;const input=JSON.parse(options.body);assert.equal(input.payload.profile,undefined);return {ok:true,json:async()=>({data:{fragments:input.payload.fragments.map(f=>({id:f.id,kind:'exercise',nameQuote:c.aiName,facts:[]}))}})};};
 try{
  before=await AIService.importTrainingPlan(blankState().profile,c.source,{review:true});assert.equal(requests,0);
  result=c.aiName?await AIService.importTrainingPlan(blankState().profile,c.source,{review:true,interpretWithAI:true}):before;
  assert.ok(!c.rejected,'non-workout accepted');const ex=result.program.days.flatMap(d=>d.exercises),issues=result.sourceReview.issues;
  if(c.blocks!=null)assert.equal(ex.length,c.blocks,'exercise count');
  if(c.counts)assert.deepEqual(ex.map(e=>e.sets.length),c.counts,'explicit counts');
  if(c.reps)assert.deepEqual(ex.map(e=>[e.repMin,e.repMax]),c.reps,'explicit/missing reps');
  if(c.loads)assert.deepEqual(ex.map(e=>e.sets[0]?.weight),c.loads,'explicit load');
  if(c.days)assert.deepEqual(result.program.days.map(d=>d.weekday),c.days);
  if(c.locations)assert.deepEqual(result.program.days.map(d=>d.location),c.locations);
  if(c.rir)assert.deepEqual(ex.map(e=>e.targetRir),c.rir);
  if(c.optional)assert.equal(issues.filter(i=>i.field==='optional').length,c.optional);
  if(c.choice)assert.equal(ex.filter(e=>e.hybridSource?.choice&&e.matchStatus==='needs-name-review').length,c.choice);
  if(c.roles)assert.deepEqual(ex.map(e=>e.importRole),c.roles);
  if(c.warmup)assert.equal(result.program.days[0].warmupPlan.items[0].sets,c.warmup);
  if(c.methods)assert.deepEqual(ex.map(e=>e.sets.at(-1)?.setType),c.methods);
  if(c.failure)assert.equal(ex[0].failureTarget,true);
  if(c.measure)assert.equal(ex[0].measure,c.measure);
  if(c.rest)assert.equal(ex[0].restSeconds,c.rest);
  if(c.mode)assert.equal(ex[0].loggingMode,c.mode);
  if(c.sourceEdit)assert.ok(issues.some(i=>i.requiresSourceEdit));
  if(c.circuit)assert.ok(issues.some(i=>i.field==='roundGroup'));
  if(c.superset)assert.ok(ex[0].supersetId&&ex[0].supersetId===ex[1].supersetId);
  if(c.aiName){assert.equal(requests,1);assert.equal(result.hybrid.needsAI,false);}
  if(result.hybrid&&!c.rir)assert.ok(ex.every(e=>e.targetRir==null),'invented RIR');
  if(result.hybrid&&!c.loads&&!c.locations)assert.ok(ex.every(e=>e.sets.every(s=>s.weight==null)),'invented load');
  const unresolved=issues.some(i=>i.category!=='preserved')||ex.some(e=>['unresolved','needs-name-review'].includes(e.matchStatus));
  results.push({id:c.id,result:'PASS',classification:c.aiName?'deterministic partial + validated AI interpretation':unresolved?'unresolved but reviewable':'deterministic success',milliseconds:Math.round(performance.now()-started),provider:c.aiName?'source-backed fixture, not live provider':null,blocks:ex.length,issues:issues.map(i=>({field:i.field,source:i.source})),program:result.program});
 }catch(error){if(c.rejected&&!before)results.push({id:c.id,result:'PASS',classification:'correctly rejected'});else results.push({id:c.id,result:'FAIL',error:error.message,program:result?.program||before?.program});}
 console.log(c.id,results.at(-1).result,results.at(-1).error||results.at(-1).classification);
}
await writeFile(`${out}/corpus-results.json`,JSON.stringify(results,null,2));
if(results.some(r=>r.result==='FAIL'))process.exitCode=1;
