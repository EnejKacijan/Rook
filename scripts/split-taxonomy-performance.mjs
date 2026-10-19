import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolveOtherWeeklyStructure } from '../src/splitPreferences.js';
import { blankState, customSplitIsValid } from '../src/domain.js';

const label = process.argv[2] || 'after';
const profile = { ...blankState().profile, goal:'Build muscle', experience:'Beginner', trainingSplitChoice:'other', daysPerWeek:3,
  availableDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], equipment:['full gym'], environment:'Commercial gym', sessionMinutes:60 };
const samples = (count, fn) => Array.from({length:count}, (_,i) => { const start=performance.now();fn(i);return performance.now()-start; }).sort((a,b)=>a-b);
const stats = values => ({ samples:values.length, medianMs:values[Math.floor(values.length/2)], p95Ms:values[Math.min(values.length-1,Math.floor(values.length*.95))], maxMs:values.at(-1) });
const inputs=['Chest + Back / Shoulders + Arms / Legs','  CHEST and BACK; SHOULDERS & ARMS; LEGS  '];
const result={ label, runtime:process.version, parser:stats(samples(1000,i=>resolveOtherWeeklyStructure(inputs[i%2],3))),
  coldCapability:stats(samples(20,i=>customSplitIsValid({...profile,trainingPreferences:inputs[0],age:25+i}))),
  equivalentCached:stats(samples(1000,i=>customSplitIsValid({...profile,age:44,trainingPreferences:inputs[i%2]}))),
  invalidTyping:stats(samples(1000,i=>customSplitIsValid({...profile,trainingPreferences:'Upper strength / Lower strength'.slice(0,1+i%30)}))) };
await mkdir('artifacts/ROOK-SPLIT-RESEARCH',{recursive:true});
await writeFile(`artifacts/ROOK-SPLIT-RESEARCH/performance-${label}.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
