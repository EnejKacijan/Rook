import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
// Run with node --env-file-if-exists=.env. Never print environment values or
// requests. The only upstream payloads here are synthetic, non-personal facts.
process.env.NODE_ENV='production';
const {handler}=await import('../netlify/functions/api.mjs');
const {AIService}=await import('../src/aiService.js');
const {combineExample}=await import('../src/combineWorkouts.fixture.js');
const nativeFetch=globalThis.fetch,requests=[],results=[];
globalThis.fetch=async(url,options={})=>{
 if(String(url).startsWith('/api/')){
  const start=performance.now(),operation=options.body?JSON.parse(options.body).operation:null;
  const result=await handler({path:`/.netlify/functions/api${String(url).slice(4)}`,httpMethod:options.method||'GET',headers:options.headers||{},body:options.body});
  requests.push({operation,status:result.statusCode,milliseconds:performance.now()-start,...(result.statusCode>=400?{error:JSON.parse(result.body).error}:{})});
  return new Response(result.body,{status:result.statusCode,headers:result.headers});
 }
 assert.equal(new URL(url).hostname,'api.openai.com');return nativeFetch(url,options);
};
try{
 const status=await AIService.status();assert.equal(status.available,true,'Existing provider configuration required');
 const source='Monday: Upper\nPo želji še na koncu do failure dipsi';
 try{
  const imported=await AIService.importTrainingPlan(combineExample().profile,source,{review:true,interpretWithAI:true});
  assert.equal(imported.hybrid.needsAI,false,requests.find(r=>r.operation==='interpret-import')?.error);assert.equal(imported.program.days[0].exercises[0].failureTarget,true);
  results.push({scenario:'Netlify wrapper → real interpret-import → verified source facts',passed:true});
 }catch(error){results.push({scenario:'Netlify wrapper → real interpret-import',passed:false,error:error.message});process.exitCode=1;}
 const state=combineExample(),before=JSON.stringify(state);
 const response=await AIService.coach(state,'Explain the difference between training volume and intensity, based on my program. Do not change my plan.');
 assert.equal(response.source,'ai');assert.ok(!response.degraded);assert.equal(JSON.stringify(state),before);
 results.push({scenario:'Netlify wrapper → real Coach structured response, no mutation',passed:true});
 assert.ok(requests.some(r=>r.operation==='interpret-import'&&r.status===200));assert.ok(requests.some(r=>r.operation==='coach'&&r.status===200));
}catch(error){results.push({passed:false,error:error.message});process.exitCode=1;}
finally{globalThis.fetch=nativeFetch;await mkdir('artifacts/release-2026-09-13',{recursive:true});await writeFile('artifacts/release-2026-09-13/provider-smoke.json',JSON.stringify({results,requests},null,2));console.log(JSON.stringify({results,requests}));}
