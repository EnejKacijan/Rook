import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {AIService} from '../src/aiService.js';
import {blankState} from '../src/domain.js';
import {importConsistencyCorpus as corpus} from './fixtures/import-consistency-corpus.mjs';
const out='artifacts/ROOK-IMPORT-CONSISTENCY-AUDIT';await mkdir(out,{recursive:true});
const id=process.argv[2]||'01',item=corpus.find(c=>c.id===id);if(!item)throw Error('Unknown corpus id');
// Guard the audited real UI path against accidental model/network fallback.
let networkCalls=0;globalThis.fetch=()=>{networkCalls++;throw Error('Unexpected network request in review parser');};
const profile=blankState().profile;
const semantic=value=>{if(Array.isArray(value))return value.map(semantic);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['id','dayId','exerciseId','createdAt'].includes(k)).map(([k,v])=>[k,semantic(v)]));return value;};
// Keep canonical identity while normalizing generated record IDs and references.
const snapshot=r=>({days:r.program.days.map(d=>({weekday:d.weekday,name:d.name,location:d.location,warmup:d.warmupPlan?{...semantic(d.warmupPlan),items:d.warmupPlan.items?.map(item=>({...semantic(item),canonicalExerciseId:item.exerciseId}))}:undefined,exercises:d.exercises.map(e=>({...semantic(e),canonicalExerciseId:e.exerciseId,supersetPosition:e.supersetId?d.exercises.filter(x=>x.supersetId===e.supersetId).map(x=>x.importedName):null,supersetId:undefined}))})),notes:semantic(r.program.importMetadata),review:semantic(r.sourceReview)});
const runs=[];let first;
for(let i=0;i<10;i++){try{const result=await AIService.importTrainingPlan(profile,item.source,{review:true});first??=result;runs.push(snapshot(result));}catch(e){runs.push({error:e.message});}}
const stable=runs.every(r=>JSON.stringify(r)===JSON.stringify(runs[0]));
await writeFile(`${out}/${id}-result.json`,JSON.stringify({source:item,stable,repeats:10,networkCalls,firstResult:first||null,semanticRuns:runs},null,2));
let ledger;try{ledger=JSON.parse(await readFile(`${out}/LEDGER.json`,'utf8'));}catch{ledger=corpus.map(c=>({...c,parsedAs:null,preserved:null,normalized:null,blockerCreated:null,dropped:null,invented:null,status:'NOT RUN'}));}
Object.assign(ledger.find(c=>c.id===id),{parsedAs:runs[0],status:'PARSED — manual fidelity review pending',repeats:10,stable,networkCalls});await writeFile(`${out}/LEDGER.json`,JSON.stringify(ledger,null,2));
console.log(JSON.stringify({id,stable,repeats:10,networkCalls,semantic:runs[0]},null,2));
