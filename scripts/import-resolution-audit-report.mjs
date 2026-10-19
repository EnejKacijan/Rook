import {readFile,writeFile} from 'node:fs/promises';
import {AIService} from '../src/aiService.js';
import {blankState} from '../src/domain.js';
import {hybridOwnerNotes} from '../src/hybridImportFixture.js';
import {importResolutionDecisions} from '../src/importResolution.js';
const dir='artifacts/ROOK-IMPORT-RESOLUTION-AUDIT';
// Same bounded, validated response used in browser QA; never call a provider.
globalThis.fetch=async(url,options)=>{const b=JSON.parse(options.body);return {ok:true,json:async()=>({data:{fragments:b.payload.fragments.map(f=>({id:f.id,kind:'exercise',nameQuote:'dipsi',facts:[{kind:'failure',value:'true',evidence:'do failure'},{kind:'optional',value:'true',evidence:'Po želji'}]}))}})};};
const initial=await AIService.importTrainingPlan(blankState().profile,hybridOwnerNotes,{review:true,interpretWithAI:true});
const decisions=importResolutionDecisions(initial.sourceReview,initial.program),exercises=initial.program.days.flatMap(d=>d.exercises);
const browser=JSON.parse(await readFile(`${dir}/browser-results.json`,'utf8')).results;
const saved=JSON.parse(await readFile(`${dir}/0-persistence.json`,'utf8')).reloaded;
const target=e=>e?`${e.importRole?`${e.importRole}; `:''}${e.sets.length} × ${e.failureTarget?'AMRAP / to failure':`${e.repMin}${e.repMin===e.repMax?'':`–${e.repMax}`}${e.measure==='seconds'?' sec':''}`}; load ${e.sets.map(s=>s.weight??'unspecified').join('/')}; RIR ${e.targetRir??'unspecified'}; methods ${e.sets.map(s=>s.setType||'standard').join('/')}${e.hybridSource?.optional?`; optional: ${e.hybridSource.optionalDecision}`:''}`:'Friday (explicit QA selection)';
const rows=decisions.map((decision,index)=>{
 const original=exercises.find(e=>e.id===(decision.issue?.exerciseId||decision.entry?.id)),position=exercises.indexOf(original),e=position>=0?saved.days.flatMap(d=>d.exercises)[position]:null;
 const observed=browser[0].decisions[index],editable=observed.controls.map(c=>({...c,label:c.label||(c.type==='search'?'Search exercises':'Choice')}));
 const known=observed.sourceValues.map(v=>({...v,text:v.text.replace(/(Sets|Min reps|Max reps|Target)(?=\S)/,'$1: ').replace('From source',' · from source')}));
 if(original?.partialPrescription?.setRange)known.push({text:`Sets range: ${original.partialPrescription.setRange.join('–')} · from source`});
 const unresolved=editable.filter(c=>c.value===''||c.value==='__choose').map(c=>c.label);
 if(decision.issue?.field==='optional')unresolved.push('Include or exclude this optional block');
 return {step:index+1,field:decision.issue?.field||'exercise choice',source:observed.source,role:original?.importRole||null,known,unresolved,editable,correction:observed.correctionPath,final:target(e),exerciseId:e?.id||null};
});
await writeFile(`${dir}/owner-fixture-matrix.json`,JSON.stringify(rows,null,2));
const list=values=>values.length?values.join('; '):'None shown as a numeric control';
const md=`# Owner fixture — real browser resolution matrix\n\nSource: unchanged 'src/hybridImportFixture.js' (mixed Slovenian/English owner notes). The browser uses the real Import flow and a controlled, source-validated provider response for the one unresolved 'dipsi' fragment; this is not a new live provider or physical-iPhone test.\n\n**22 decisions = 12 prescription + 2 optionality + 1 day + 7 exercise identity.** Min/max and missing sets already share one prescription screen. Top/working/additional-drop blocks remain distinct executable work; merging them would hide meaning. Optional-exclusion QA legitimately visits 19 decisions and applies 10 blocks; inclusion visits 22 and applies all 12.\n\nThe standard inclusion run below supplies missing values only. A separate 390 Premium Dark run explicitly corrects the first source count from 1 to 2, verifies Back retention, persists user-correction provenance and reloads without changing source notes.\n\n${rows.map(row=>`## ${row.step}. ${row.field}${row.role?` — ${row.role}`:''}\n\n${row.source.split('\n').map(l=>'> '+l).join('\n')}\n\n- Static source values: ${list(row.known.map(x=>x.text))}.\n- Unresolved controls on entry: ${list(row.unresolved)}.\n- Editable controls: ${list(row.editable.map(x=>`${x.label} = ${x.value||'[empty]'} (${x.type}${x.inputMode?`; ${x.inputMode} keyboard`:''})`))}.\n- Correction path: ${row.correction}.\n- Final accepted result: ${row.final}.\n`).join('\n')}\n## Preserved outside these decisions\n\nTwo warm-up sets remain in the warm-up plan, with duration absent. Current plan is unchanged before explicit Apply. All 12 execution blocks, optionality choices, top/working roles, additional drop blocks, last-set drop method, source spans/notes and absent load/RIR survive reload and active-workout creation. Complete persisted snapshots and export text accompany the browser results.\n`;
await writeFile(`${dir}/OWNER-FIXTURE-MATRIX.md`,md);
console.log(JSON.stringify({decisions:rows.length,types:rows.reduce((n,r)=>(n[r.field]=(n[r.field]||0)+1,n),{}),browserCases:browser.length}));
