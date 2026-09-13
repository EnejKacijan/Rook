import {describe,it,expect,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {blankState,serializeState,deserializeState,workoutPlanDate} from './domain.js';
import {parseHistoricalWorkoutCsv as parse,parseHistoricalWorkoutTable,applyHistoricalWorkoutImport as apply,resolveHistoricalExercise as resolve,compactHistoricalPreview} from './historicalWorkoutImport.js';
import {readHistoryCsv,historyDate,historyNumber,detectHistoricalImportSource} from './historyImportTable.js';
import {inspectHistoryTable} from './historySourceAdapters.js';
import {readHistoricalFile} from './historyImportFile.js';
import {prComparableSet,historySetDescriptor,normalizeAdvancedLoggingState} from './advancedLogging.js';
import {exercisePerformance} from './performanceInsights.js';
import {highestSimpleLoggedLoad} from './loggedExercises.js';
import {createWorkoutHistoryExport} from './workoutHistoryExport.js';
import {buildBackupArchive,parseBackupArchive} from './backup.js';
import {supersetMeta} from './supersets.js';
import {sessionLogSetParts} from './sessionLog.js';
import {importedSessionTimeLabel} from './historicalSetSemantics.js';
import {hevyRow,hevyCsv,hevyHeaders,strongCsv,genericRow,genericCsv,genericHeaders,largeCsv,xlsxFixture} from '../scripts/history-import-fixtures.mjs';

const state=()=>blankState();
const preview=(text,options={})=>parse({text,state:state(),...options});
const sets=p=>p.workouts.flatMap(w=>w.exercises.flatMap(e=>e.sets));
const buffer=text=>new TextEncoder().encode(text).buffer;
const read=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(file);});
const exported=async(s,includeNotes=true)=>JSON.parse(await read(await createWorkoutHistoryExport(s,{format:'json',includeNotes,yieldWork:async()=>{}})));
const resolveAll=p=>{for(const m of p.exerciseMappings){if(!m.exerciseId)p=resolve(p,state(),m.sourceName,{type:'custom'});if(p.exerciseMappings.find(e=>e.sourceName===m.sourceName).needsLoadKind)p=resolve(p,state(),m.sourceName,{type:'load',loadKind:'external'});}return p;};

describe('Synthetic Hevy / Strong interoperability',()=>{
 it.each(['kg','lb'])('recognizes Hevy %s without column-order dependence',unit=>{
  const p=preview(hevyCsv([hevyRow()],unit,hevyHeaders(unit).toReversed()));
  expect(p.source).toBe('hevy');expect(p.summary).toMatchObject({workouts:1,sets:1,reviewExercises:0,invalidRows:0});
  expect(sets(p)[0]).toMatchObject({weight:unit==='kg'?60:83.91,reps:8,rir:null,rpe:8});
  expect(sets(p)[0].rawImport.weightUnit).toBe(unit);
 });
 it('preserves BOM, whitespace, uppercase headers, quoted multiline notes, diacritics and emoji',()=>{
  const headers=hevyHeaders('kg'),text='\uFEFF'+hevyCsv().replace(headers.join(','),headers.map(h=>' '+h.toUpperCase()+' ').join(','));
  const p=preview(text);expect(p.workouts[0].name).toBe('Upper 💪');expect(p.workouts[0].sessionNote).toBe('Lep trening, "počasi".\nDruga vrstica.');expect(p.workouts[0].exercises[0].notes).toContain('zaklepaj');
 });
 it('preserves each set type, including unknown, but never treats it as normal PR data',()=>{
  const types=['normal','warmup','failure','dropset','Future Hevy Type'];const p=preview(hevyCsv(types.map((set_type,set_index)=>hevyRow({set_type,set_index}))));
  const s=normalizeAdvancedLoggingState(apply(state(),p).state),e=s.workouts[0].exercises[0];
  expect(e.sets.map(s=>s.importSetType)).toEqual(types);expect(e.sets.map(s=>prComparableSet(e,s))).toEqual([true,false,false,false,false]);
  expect(e.sets.map(s=>s.planned)).toEqual([true,false,true,true,false]);
  expect(historySetDescriptor(e,e.sets[3])).toContain('dropset');expect(historySetDescriptor(e,e.sets[3])).not.toContain('0 drop segments');
 });
 it('keeps actual duration and distance separate from reps; RPE never becomes RIR',()=>{
  const p=preview(hevyCsv([hevyRow({exercise_title:'Plank',weight_kg:'',reps:'',duration_seconds:30,rpe:''}),hevyRow({exercise_title:'Walking',weight_kg:'',reps:'',distance_km:2.5,duration_seconds:1500,rpe:5})]));
  const s=sets(p);expect(s[0]).toMatchObject({weight:null,reps:null,durationSeconds:30,rir:null,rpe:null});
  expect(s[1]).toMatchObject({reps:null,distance:2.5,distanceUnit:'km',durationSeconds:1500,rpe:5,rir:null});expect(p.summary.sets).toBe(2);
 });
 it('links two proven members in source order and preserves >2 source groups without fabricating A1/A2',()=>{
  const p=preview(hevyCsv([hevyRow({exercise_title:'Cable Fly',superset_id:'A'}),hevyRow({exercise_title:'Cable Row',superset_id:'A'}),hevyRow({exercise_title:'Squat',superset_id:'B'}),hevyRow({exercise_title:'Leg Press',superset_id:'B'}),hevyRow({exercise_title:'Leg Curl',superset_id:'B'})]));
  const ex=p.workouts[0].exercises;expect(supersetMeta(ex,0).role).toBe('A1');expect(supersetMeta(ex,1).role).toBe('A2');
  expect(ex.slice(2).every(e=>e.sourceSupersetId==='B'&&!e.supersetId)).toBe(true);expect(p.summary.sets).toBe(5);expect(p.warnings.join(' ')).toContain('other than two');
 });
 it('keeps multiple distinct pairs and literal group identity 0',()=>{
  const p=preview(hevyCsv(['Cable Fly','Cable Row','Bench Press','Squat'].map((name,i)=>hevyRow({exercise_title:name,superset_id:i<2?'0':'2'}))));
  const e=p.workouts[0].exercises;expect(e[0].supersetId).toBe(e[1].supersetId);expect(e[2].supersetId).toBe(e[3].supersetId);expect(e[0].supersetId).not.toBe(e[2].supersetId);
 });
 it('asks once for missing Strong units, preserves notes/timed/bodyweight/distance sessions',()=>{
  expect(()=>preview(strongCsv())).toThrow(/weight unit/);
  const info=inspectHistoryTable(readHistoryCsv(strongCsv()));expect(info).toMatchObject({source:'strong',needsWeightUnit:true,needsDistanceUnit:true});
  const p=preview(strongCsv(),{weightUnit:'kg',distanceUnit:'km'});expect(p.summary).toMatchObject({workouts:2,sets:4,invalidRows:0});
  expect(p.workouts[0].durationSeconds).toBe(4560);expect(sets(p)[1]).toMatchObject({weight:0,reps:12});expect(sets(p)[2].reps).toBeNull();expect(sets(p)[3].distance).toBe(2);
 });
 it('does not use filenames/source hints to misidentify another app',()=>{
  expect(preview(hevyCsv(),{fileName:'Strong.csv'}).source).toBe('hevy');expect(()=>preview(strongCsv(),{source:'hevy'})).toThrow(/Detected Strong/);
  expect(detectHistoricalImportSource(['Title','Start Time','Exercise Title','Set Index']).source).toBe('hevy');
 });
});

describe('History-only table grammar and bounded mapping',()=>{
 it.each([',',';','\t'])('reads %s-delimited UTF-8/BOM CSV with embedded punctuation',delimiter=>{
  const p=preview(genericCsv([genericRow({notes:'č,š;ž\t"quoted"\nnext'})],genericHeaders,delimiter,true));expect(p.summary.sets).toBe(1);expect(p.workouts[0].exercises[0].notes).toBe('č,š;ž\t"quoted"\nnext');
 });
 it.each([['100',100],['100.5',100.5],['100,5',100.5],['36,25',36.25],['0',0],['',null],['null',null],['10000',10000]])('valid numeric fact %s', (input,value)=>expect(historyNumber(input,'Load')).toBe(value));
 it.each(['-1','NaN','1,234','20kg','1.2.3'])('rejects invalid/ambiguous number %s',input=>expect(()=>historyNumber(input,'Load')).toThrow());
 it('uses explicit column / per-value units before user choice without magnitude guessing',()=>{
  expect(sets(preview(genericCsv([genericRow({weight:'250lb',weight_unit:''})]),{weightUnit:'kg'}))[0].rawImport.weightUnit).toBe('lb');
  const headers=genericHeaders.map(h=>h==='weight'?'Weight (lbs)':h);const row={...genericRow({weight_unit:''}),'Weight (lbs)':100};
  expect(sets(preview(genericCsv([row],headers),{weightUnit:'kg'}))[0].weight).toBe(45.36);
 });
 it('rejects conflicting explicit units instead of choosing one silently',()=>expect(()=>preview(genericCsv([genericRow({weight:'60lb',weight_unit:'kg'})]))).toThrow(/conflicting/));
 it('requires mapping for unknown/ambiguous columns; retains extra data as metadata',()=>{
  const table=readHistoryCsv('When;Movement;Load;Count;opaque\n2025-03-28;Bench Press;60;8;držati');
  expect(inspectHistoryTable(table).needsMapping).toBe(true);
  const p=parseHistoricalWorkoutTable({table,state:state(),weightUnit:'kg',mapping:{started:0,exerciseName:1,weight:2,reps:3}});
  expect(sets(p)[0].rawImport.sourceValues.opaque).toBe('držati');expect(sets(p)[0].rir).toBeNull();
  expect(inspectHistoryTable(readHistoryCsv('date,exercise,weight_kg,weight_lbs,reps\n2025-03-28,Bench Press,60,132,8')).needsMapping).toBe(true);
 });
 it.each(['2025-03-30T00:30:00+02:00','2025-10-26T23:30:00-03:00','2025-03-28T23:30:00','2025-03-28'])('preserves source calendar day / precision %s',date=>{
  const p=preview(genericCsv([genericRow({workout_date:date})]));expect(workoutPlanDate(p.workouts[0])).toBe(date.slice(0,10));
  expect(p.workouts[0].sourceDate.precision).toBe(date.length===10?'date':'datetime');if(date.length===10)expect(p.workouts[0].startedAt).toBeNull();
 });
 it('requires an explicit localized date order and rejects impossible dates',()=>{
  expect(()=>historyDate('04/05/2025')).toThrow();expect(historyDate('04/05/2025','dmy').day).toBe('2025-05-04');expect(historyDate('04/05/2025','mdy').day).toBe('2025-04-05');
  for(const date of ['2025-02-30','2025-13-01','2025-03-28T25:00:00'])expect(()=>historyDate(date)).toThrow();
 });
 it('blocks malformed CSV, not half-read quotes',()=>{expect(()=>readHistoryCsv('a,b\n"oops,x')).toThrow(/unclosed/);expect(()=>readHistoryCsv('a,b\n"ok"oops,1')).toThrow(/unexpected/);});
 it('rejects legacy XLS / corrupt XLSX / invalid UTF-8',async()=>{
  await expect(readHistoricalFile('legacy.xls',buffer('data'))).rejects.toThrow(/Legacy XLS/);
  await expect(readHistoricalFile('broken.xlsx',buffer('not zip'))).rejects.toThrow(/XLSX/);
  await expect(readHistoricalFile('broken.csv',new Uint8Array([255,255]).buffer)).rejects.toThrow(/UTF-8/);
 });
 it('reads real XLSX structure, separate sheets, numeric cells, exact text without executing formulas',async()=>{
  const rows=[genericHeaders,genericHeaders.map(h=>genericRow()[h]??'')];
  const bytes=xlsxFixture([{name:'History',rows},{name:'More',rows}]);
  const sheets=await readHistoricalFile('SYNTHETIC-generic.xlsx',bytes.buffer);expect(sheets.map(s=>s.name)).toEqual(['History','More']);
  expect(parseHistoricalWorkoutTable({table:sheets[0],state:state()}).summary.sets).toBe(1);
  const formulas=xlsxFixture([{name:'History',rows}],{formula:true});await expect(readHistoricalFile('formula.xlsx',formulas.buffer)).rejects.toThrow(/Formula cells/);
 });
});

describe('Factual grouping, atomicity, duplicates and downstream safety',()=>{
 it('requires an explicit grouping decision when time/ID cannot separate date-only sets',()=>{
  const p=preview(genericCsv([genericRow({workout_date:'2025-03-28'}),genericRow({workout_date:'2025-03-28',exercise_name:'Squat'})]));
  expect(p.summary.groupingDecisions).toBe(1);expect(()=>apply(state(),p)).toThrow(/date-only session grouping/);
  expect(apply(state(),p,{dateOnlyGroupingConfirmed:true}).state.workouts[0].exercises).toHaveLength(2);
 });
 it('rejects malformed group linking without losing its original group ID or factual sets',()=>{
  const p=preview(hevyCsv([hevyRow({superset_id:'???'}),hevyRow({exercise_title:'Cable Row',superset_id:'???'})]));
  expect(p.summary.sets).toBe(2);expect(p.workouts[0].exercises.every(e=>e.sourceSupersetId==='???'&&!e.supersetId)).toBe(true);
 });
 it('derives a known end only from an explicit duration, preserving unzoned local time',()=>{
  const p=preview(strongCsv(),{weightUnit:'kg',distanceUnit:'km'}),w=p.workouts[0];
  expect(w.endedAt).toBe('2025-03-28T18:45:00.000');expect(w.sourceEnd.derivedFrom).toBe('source-duration');
  expect(importedSessionTimeLabel(w)).toBe('Finished 18:45');
  const unknown=preview(genericCsv()).workouts[0];expect(unknown.endedAt).toBeNull();expect(importedSessionTimeLabel(unknown)).toBe('Started 17:00');
  expect(importedSessionTimeLabel(preview(genericCsv([genericRow({workout_date:'2025-03-28'})])).workouts[0])).toBe('Time not recorded');
 });
 it('renders imported time/distance/RPE and assistance factually instead of 0 reps or added load',()=>{
  const timed=sets(preview(hevyCsv([hevyRow({reps:'',weight_kg:'',duration_seconds:90,distance_km:0.5,rpe:5})])))[0];
  const parts=sessionLogSetParts({exerciseId:'wg-walking'},timed,0,'kg').join(' · ');expect(parts).toContain('90 sec');expect(parts).toContain('0.5 km');expect(parts).toContain('RPE 5');expect(parts).not.toMatch(/0 reps|5 RIR/);
  const set=sets(preview(hevyCsv()))[0];set.rawImport.loadKind='assisted';expect(sessionLogSetParts({exerciseId:'pull-up'},set,0,'kg').join(' ')).toContain('Assistance 60 kg');
 });
 it('keeps same-title same-date sessions with different starts separate',()=>{
  const p=preview(genericCsv([genericRow({workout_date:'2025-03-28T10:00:00'}),genericRow({workout_date:'2025-03-28T18:00:00'})]));expect(p.summary).toMatchObject({workouts:2,exactDuplicates:0,ambiguousDuplicates:0});
 });
 it('preserves explicit exercise block order and detects ambiguous repeated set indexes',()=>{
  const rows=[genericRow({exercise_order:2,set_order:2}),genericRow({exercise_order:1}),genericRow({exercise_order:2,set_order:1})],headers=[...genericHeaders,'exercise_order'];
  const p=preview(genericCsv(rows,headers));expect(p.workouts[0].exercises.map(e=>e.sourceExerciseOrder)).toEqual([1,2]);expect(p.workouts[0].exercises[1].sets.map(s=>s.rawImport.setOrder)).toEqual([1,2]);
  const invalid=preview(genericCsv([genericRow(),genericRow()]));expect(invalid.summary.invalidRows).toBe(1);expect(()=>apply(state(),invalid)).toThrow(/invalid rows/);
 });
 it('never imports valid rows around an invalid row; original state remains byte-for-byte unchanged',()=>{
  const s=state(),before=JSON.stringify(s),p=preview(genericCsv([genericRow(),genericRow({set_order:2,weight:-60})]));
  expect(p.summary).toMatchObject({sets:1,invalidRows:1});expect(()=>apply(s,p)).toThrow(/Nothing has been saved/);expect(JSON.stringify(s)).toBe(before);
 });
 it('compacts exact identity, rejects same/reordered files and protects local edits from changed source',async()=>{
  vi.stubGlobal('crypto',webcrypto);
  const text=hevyCsv([hevyRow(),hevyRow({set_index:1,reps:7}),hevyRow({exercise_title:'Squat'})]);
  let p=await compactHistoricalPreview(preview(text),state()),s=apply(state(),p).state;
  const originalId=s.workouts[0].id;s.workouts[0].exercises[0].sets[0].reps=5;
  const table=readHistoryCsv(text),reordered={...table,rows:[table.rows[0],...table.rows.slice(1).toReversed()]};
  p=await compactHistoricalPreview(parseHistoricalWorkoutTable({table:reordered,state:s}),s);expect(p.summary.exactDuplicates).toBe(1);
  expect(apply(s,p).state.workouts[0].exercises[0].sets[0].reps).toBe(5);
  p=await compactHistoricalPreview(parse({text:text.replace(',60,8,',',65,8,'),state:s}),s);expect(p.summary.ambiguousDuplicates).toBe(1);expect(()=>apply(s,p)).toThrow(/possible duplicates/);
  expect(apply(s,p,{ambiguousAction:'skip'}).state.workouts[0].id).toBe(originalId);vi.unstubAllGlobals();
 });
 it('keeps ambiguous source amounts without inventing their meaning; neither unknown nor assistance becomes a weight PR',()=>{
  let p=preview(hevyCsv([hevyRow({exercise_title:'Pull Up',weight_kg:20})]));expect(p.summary.loadDecisions).toBe(0);
  const unresolved=apply(state(),p).state.workouts[0].exercises[0];expect(unresolved.sets[0].weight).toBe(20);expect(unresolved.sets[0].rawImport.loadKind).toBe('unknown');expect(prComparableSet(unresolved,unresolved.sets[0])).toBe(false);
  p=resolve(p,state(),'Pull Up',{type:'load',loadKind:'assisted'});const s=apply(state(),p).state,e=s.workouts[0].exercises[0];expect(e.sets[0].weight).toBe(20);expect(prComparableSet(e,e.sets[0])).toBe(false);expect(exercisePerformance(s.workouts,e.exerciseId).bestWeight).toBeNull();
 });
 it('unknown/multilingual names are automatic separate identities; no new record during dry run',()=>{
  const s=state(),p=preview(hevyCsv([hevyRow({exercise_title:'Čučanj pri prijatelju 🏋️'})]));expect(p.summary.reviewExercises).toBe(0);expect(s.customExercises).toHaveLength(0);expect(apply(s,p).state.workouts[0].exercises[0].originalImportedName).toBe('Čučanj pri prijatelju 🏋️');
 });
 it('warm-up/failure/drop/unknown loads do not contaminate best working load or e1RM',()=>{
  const p=preview(hevyCsv(['normal','warmup','failure','dropset','mystery'].map((set_type,i)=>hevyRow({set_type,set_index:i,weight_kg:i?300:60}))));const s=apply(state(),p).state,e=s.workouts[0].exercises[0];
  expect(exercisePerformance(s.workouts,e.exerciseId).bestWeight).toBe(60);expect(highestSimpleLoggedLoad(e)).toBe(60);
 });
 it('no-load and timed sets have no fake 0 kg Working Weight / e1RM or numeric rep target',()=>{
  const p=resolveAll(preview(hevyCsv([hevyRow({exercise_title:'Plank',weight_kg:'',reps:'',duration_seconds:30,rpe:''}),hevyRow({exercise_title:'Push Up',weight_kg:0,reps:12,rpe:''})])));
  const s=deserializeState(serializeState(apply(state(),p).state));for(const e of s.workouts[0].exercises){expect(e.repMin).toBeNull();expect(exercisePerformance(s.workouts,e.exerciseId).bestWeight).toBeNull();expect(highestSimpleLoggedLoad(e)).toBeNull();}
 });
 it('persists/reloads/backs up notes, raw unknown columns, actual effort and source grouping; export keeps actual fields',async()=>{
  const p=resolveAll(preview(hevyCsv([hevyRow({superset_id:'A'}),hevyRow({exercise_title:'Cable Row',superset_id:'A',set_type:'failure',rpe:0}),hevyRow({exercise_title:'Walking',weight_kg:'',reps:'',distance_km:2,duration_seconds:900,rpe:''})])));
  const original=state(),s=deserializeState(serializeState(apply(original,p).state));expect(s.program).toEqual(original.program);
  const restored=(await parseBackupArchive((await buildBackupArchive(s,[])).bytes)).state;
  expect(restored.workouts[0].exercises[1].sets[0].rawImport.rpe).toBe(0);
  const out=await exported(restored);expect(out.workouts[0].workout_date).toBe('2025-03-28');expect(out.workouts[0].session_note).toContain('Lep trening');
  expect(out.workouts[0].exercises[0].superset_id).toBe(out.workouts[0].exercises[1].superset_id);
  expect(out.workouts[0].exercises[1].sets[0]).toMatchObject({set_type:'failure',rpe:0,rir:null});
  expect(out.workouts[0].exercises[2].sets[0]).toMatchObject({reps:null,distance:2,distance_unit:'km',duration_seconds:900});
  expect(JSON.stringify(await exported(s,false))).not.toContain('Lep trening');
 });
 it.each([100,1000,5000])('retains all %i workouts / 3 sets each without quadratic matching',count=>{const p=preview(largeCsv(count));expect(p.summary).toMatchObject({workouts:count,sets:count*3,invalidRows:0,reviewExercises:0});expect(apply(state(),p).state.workouts).toHaveLength(count);});
 it('blocks row 6000 of 10002 atomically',()=>{const p=preview(largeCsv(3334,3,5999));expect(p.summary.invalidRows).toBe(1);expect(()=>apply(state(),p)).toThrow(/invalid rows/);});
});
