// Repeatable SYNTHETIC interoperability corpus. No real user's export is included.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {blankState,serializeState,deserializeState,exerciseLoadRequirement} from '../src/domain.js';
import {readHistoryCsv} from '../src/historyImportTable.js';
import {parseHistoricalWorkoutCsv,applyHistoricalWorkoutImport,resolveHistoricalExercise} from '../src/historicalWorkoutImport.js';
import {createWorkoutHistoryExport} from '../src/workoutHistoryExport.js';
import {buildBackupArchive,parseBackupArchive} from '../src/backup.js';
import {hevyCsv,strongCsv,genericCsv,genericRow,genericHeaders,csv} from './history-import-fixtures.mjs';

const root='artifacts/ROOK-HISTORY-IMPORT-AUDIT',results=[];
await mkdir(`${root}/fixtures`,{recursive:true});
const parse=(text,options={})=>parseHistoricalWorkoutCsv({text,state:blankState(),...options});
const facts=p=>p.workouts.map(w=>({name:w.name,date:w.sourceDate,end:w.sourceEnd,duration:w.durationSeconds,notes:w.sessionNote,
  exercises:w.exercises.map(e=>({name:e.sourceName,notes:e.notes,group:e.sourceSupersetId,
    sets:e.sets.map(s=>({reps:s.reps,weight:s.weight,duration:s.durationSeconds,distance:s.distance,distanceUnit:s.distanceUnit,rpe:s.rpe,rir:s.rir,type:s.importSetType,order:s.rawImport.setOrder}))}))}));

for(const [source,original,options]of [['hevy',hevyCsv(),{}],['strong',strongCsv(),{weightUnit:'kg',distanceUnit:'km'}]]){
  const table=readHistoryCsv(original),expected=facts(parse(original,options)),headers=table.rows[0],rows=table.rows.slice(1);
  const mutations={
    'reordered-columns':csv(headers.toReversed(),rows.map(r=>r.toReversed())),
    'extra-column':csv([...headers,'Unknown source field'],rows.map(r=>[...r,'Čuvaj me 🏋️'])),
    'bom':`\uFEFF${original}`,
    'lf':original.replaceAll('\r\n','\n'),
    'all-quoted':[headers,...rows].map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n'),
    'semicolon':csv(headers,rows,';'),
    'tab':csv(headers,rows,'\t'),
    'trailing-lines':original+'\r\n\r\n',
    'header-case-space':csv(headers.map(h=>` ${h.toUpperCase()} `),rows),
  };
  for(const [name,text]of Object.entries(mutations)){
    const file=`SYNTHETIC-${source}-${name}.${name==='tab'?'tsv':'csv'}`;
    await writeFile(`${root}/fixtures/${file}`,text);assert.deepEqual(facts(parse(text,options)),expected);
    results.push({name:`${source}-${name}`,passed:true});
  }
  let preview=parse(original,options);const originalState=blankState();
  for(const mapping of preview.exerciseMappings){
    if(!mapping.exerciseId)preview=resolveHistoricalExercise(preview,originalState,mapping.sourceName,{type:'custom'});
    if(preview.exerciseMappings.find(m=>m.sourceName===mapping.sourceName).needsLoadKind)preview=resolveHistoricalExercise(preview,originalState,mapping.sourceName,{type:'load',loadKind:'external'});
  }
  const persisted=deserializeState(serializeState(applyHistoricalWorkoutImport(originalState,preview).state));
  const restored=(await parseBackupArchive((await buildBackupArchive(persisted,[])).bytes)).state;
  const output=JSON.parse(await (await createWorkoutHistoryExport(restored,{format:'json',includeNotes:true,yieldWork:async()=>{}})).text());
  assert.equal(output.workouts.length,preview.workouts.length);
  for(let wi=0;wi<preview.workouts.length;wi++){
    const input=preview.workouts[wi],actual=output.workouts[wi];
    assert.equal(actual.workout_date,input.sourceDate.day);assert.equal(actual.started_at,input.startedAt);assert.equal(actual.completed_at,input.sourceEnd?.value??null);assert.equal(actual.session_note,input.sessionNote);
    assert.equal(actual.workout_duration_seconds,input.durationSeconds);
    for(let ei=0;ei<input.exercises.length;ei++){
      const ex=input.exercises[ei],actualEx=actual.exercises[ei];assert.equal(actualEx.exercise_note,ex.notes);assert.equal(actualEx.sets.length,ex.sets.length);
      for(let si=0;si<ex.sets.length;si++){
        const s=ex.sets[si],a=actualEx.sets[si];
        // Existing optional-load normalization uses null for no added load.
        // The original explicit source 0 must still be retained/exported below.
        const canonicalWeight=s.weight===0&&exerciseLoadRequirement(ex)==='optional'?null:s.weight;
        assert.deepEqual([a.weight,a.reps,a.duration_seconds,a.distance,a.distance_unit,a.rpe,a.rir,a.set_type,a.original_import_unit,a.original_import_weight],
          [canonicalWeight,s.reps,s.durationSeconds,s.distance,s.distanceUnit,s.rpe,s.rir,s.importSetType,s.rawImport.weightUnit,s.rawImport.weight]);
      }
    }
  }
  results.push({name:`${source}-persistence-backup-restore-export`,passed:true,workouts:preview.summary.workouts,sets:preview.summary.sets});
}
for(const [name,delimiter]of [['semicolon',';'],['tab','\t']]){
  const text=genericCsv([genericRow({weight:'36,25',notes:'Čisti gibi, "pavza".\nNaslednja vrstica.'})],genericHeaders,delimiter,true);
  await writeFile(`${root}/fixtures/SYNTHETIC-generic-${name}.${name==='tab'?'tsv':'csv'}`,text);
  assert.equal(parse(text).workouts[0].exercises[0].sets[0].weight,36.25);results.push({name:`generic-${name}-decimal-comma`,passed:true});
}
const manifest=[];
for(const name of(await readdir(`${root}/fixtures`)).filter(n=>n.startsWith('SYNTHETIC-')).sort()){
  const bytes=await readFile(`${root}/fixtures/${name}`);manifest.push({name,synthetic:true,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(`${root}/fixtures/MANIFEST.json`,JSON.stringify({realUserFiles:0,files:manifest},null,2));
await writeFile(`${root}/corpus-results.json`,JSON.stringify(results,null,2));
console.log(`Historical synthetic mutation/round-trip checks: ${results.length} passed, 0 failed. ${manifest.length} fixture files hashed.`);
