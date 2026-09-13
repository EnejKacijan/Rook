import {it,expect} from 'vitest';
import {blankState,serializeState,deserializeState,exerciseCatalog} from './domain.js';
import {parseHistoricalWorkoutCsv as parse,parseHistoricalWorkoutTable,applyHistoricalWorkoutImport as apply,resolveHistoricalExercise as resolve,compactHistoricalPreview} from './historicalWorkoutImport.js';
import {matchHistoricalExercise} from './historicalExerciseMatching.js';
import {customExerciseSnapshot,historicalSourceKey,rememberHistoricalExerciseAlias,deleteCustomExercise} from './customExercises.js';
import {HistoryImportBatch} from './historyImportBatch.js';
import {readHistoryCsv} from './historyImportTable.js';
import {hevyCsv,hevyRow,genericCsv,genericRow,genericHeaders,strongCsv,xlsxFixture} from '../scripts/history-import-fixtures.mjs';

const name='Rare independent movement';
const textFor=(names=[name])=>hevyCsv(names.map((exercise_title,i)=>hevyRow({exercise_title,start_time:`${i+1} Mar 2025, 17:00`,end_time:`${i+1} Mar 2025, 18:00`})));
const reload=s=>deserializeState(serializeState(s));
const preview=(text,state=blankState())=>parse({text,state});
const buffer=text=>new TextEncoder().encode(text).buffer;
const mappingIds=p=>Object.fromEntries(p.exerciseMappings.map(m=>[m.sourceKey,m.exerciseId]));

it('proof matches link; all other names are original without eager suggestions; dry run is pure',()=>{
 const state=blankState(),before=JSON.stringify(state),p=preview(textFor(['Bench Press','Side Bend',name]),state);
 expect(p.summary).toMatchObject({autoMatchedExercises:1,suggestedExercises:0,customExercises:2,reviewExercises:0,loadDecisions:0});
 expect(p.exerciseMappings[1]).toMatchObject({matchStatus:'custom-auto',match:{tier:'C',suggestedExerciseId:null}});
 expect(p.exerciseMappings[1].exerciseId).toMatch(/^custom-import-/);
 expect(p.exerciseMappings[2].exerciseId).toMatch(/^custom-import-/);
 const saved=apply(state,p).state;
 expect(saved.customExercises).toHaveLength(2);
 expect(saved.workouts[1].exercises[0].exerciseId).toMatch(/^custom-import-/);
 expect(JSON.stringify(state)).toBe(before);
});
it.each([
 ['Single Leg Standing Calf Raise','wg-single-leg-calf-raise','Standing Single-Leg Calf Raise'],
 ['Standing Military Press (Barbell)','barbell-overhead-press','Barbell Standing Military Press'],
 ['Seated Incline Curl (Dumbbell)','incline-dumbbell-curl','Seated Incline Dumbbell Curl'],
 ['Seated Shoulder Press (Machine)','machine-shoulder-press','Seated Machine Shoulder Press'],
])('shared canonical aliases safely promote %s, independent of equipment word order', (source,id,variant)=>{
 expect(matchHistoricalExercise(source)).toMatchObject({tier:'A',exerciseId:id});
 expect(matchHistoricalExercise(variant)).toMatchObject({tier:'A',exerciseId:id});
});
it.each(['Triceps Dip (Weighted)','Shoulder Press (Machine Plates)','Hammer Curl (Cable)','Back Extension (Machine)',
 'Seated Lateral Raise (Dumbbell)','Leg Press Horizontal (Machine)','Chest Dip (Weighted)','Side Bend'])('does not silently approve the material distinction in %s',source=>{
 expect(matchHistoricalExercise(source)).toMatchObject({tier:'C',exerciseId:null});
 expect(matchHistoricalExercise(source,{},exerciseCatalog,'generic',{advanced:true})).toMatchObject({tier:'B',exerciseId:null});
 const saved=apply(blankState(),preview(textFor([source]))).state;
 expect(saved.workouts[0].exercises[0].exerciseId).toMatch(/^custom-import-/);
});
it('one provider identity covers many workouts, not similar different names; reload/reimport is stable',async()=>{
 const text=textFor([name,name.toUpperCase(),name+' single arm',name+' seated',name]);
 const p=await compactHistoricalPreview(preview(text));
 const s=reload(apply(blankState(),p).state);
 expect(s.customExercises).toHaveLength(3);expect(s.workouts).toHaveLength(5);
 expect(s.workouts[0].exercises[0].exerciseId).toBe(s.workouts[1].exercises[0].exerciseId);
 const q=await compactHistoricalPreview(preview(text,s),s);
 expect(q.summary).toMatchObject({reviewExercises:0,exactDuplicates:5});
 const repeated=apply(s,q);expect(repeated.result.imported).toBe(0);expect(repeated.state.customExercises).toEqual(s.customExercises);
});
it('reordered rows have the same provider identity mapping, including unreviewed B',()=>{
 const text=textFor([name,name.toUpperCase(),'Side Bend','SIDE BEND','Bench Press',name+' unilateral']);
 const table=readHistoryCsv(text),state=blankState();
 const a=parseHistoricalWorkoutTable({table,state}),b=parseHistoricalWorkoutTable({table:{...table,rows:[table.rows[0],...table.rows.slice(1).reverse()]},state});
 expect(mappingIds(a)).toEqual(mappingIds(b));
 const records=p=>apply(state,p).state.customExercises.map(e=>({id:e.id,name:e.name,historicalIdentity:e.historicalIdentity})).sort((a,b)=>a.id.localeCompare(b.id));
 expect(records(a)).toEqual(records(b));
});
it('preserves exact long Unicode names without inventing catalog metadata or measurements',()=>{
 const source='Čučanj – posebna naprava 🏋️ '+ 'daljša oznaka '.repeat(10),p=preview(textFor([source]));
 const state=reload(apply(blankState(),p).state),record=state.customExercises[0],snapshot=customExerciseSnapshot(record);
 expect(record.name).toBe(source.trim());expect(record.historicalIdentity.sourceName).toBe(source.trim());
 expect(snapshot).toMatchObject({equipment:[],muscles:[],pattern:null,kind:null,measure:null,exerciseType:null,increment:null,restSeconds:null});
 const e=state.workouts[0].exercises[0];expect(e.sourceName).toBe(source.trim());
 expect(e.sets[0]).toMatchObject({weight:60,reps:8,rpe:8,rir:null,durationSeconds:null,distance:null,rawImport:{weight:60,weightUnit:'kg',loadKind:'unknown'}});
});
it('explicit Keep separate wins over a known catalog alias and survives reload without another suggestion',()=>{
 let p=preview(textFor(['Bench Press']));p=resolve(p,blankState(),p.exerciseMappings[0].sourceKey,{type:'custom'});
 const s=reload(apply(blankState(),p).state),id=s.customExercises[0].id;
 expect(matchHistoricalExercise('Bench Press',s,exerciseCatalog,'hevy')).toMatchObject({exerciseId:id,reason:'Your saved match'});
 expect(matchHistoricalExercise('Bench Press',s,exerciseCatalog,'strong').exerciseId).toBe('barbell-bench-press');
});
it('remember opt-out on a pending custom identity does not lose its unsaved record',()=>{
 const state=blankState();let p=resolve(preview(textFor()),state,name,{type:'custom'});
 const id=p.exerciseMappings[0].exerciseId;
 p=resolve(p,state,p.exerciseMappings[0].sourceKey,{type:'match',exerciseId:id,rememberMatch:false});
 expect(p.exerciseMappings[0].customRecord.id).toBe(id);expect(state.customExercises).toHaveLength(0);
 const saved=reload(apply(state,p).state);expect(saved.customExercises[0].id).toBe(id);
 expect(saved.exerciseAliases).toHaveLength(0);expect(preview(textFor(),saved).exerciseMappings[0].exerciseId).toBe(id);
});
it('provider-scoped aliases and custom identities are independent even with identical names',async()=>{
 const batch=new HistoryImportBatch(),state=blankState();
 await batch.read([{name:'hevy.csv',buffer:buffer(textFor())},{name:'generic.csv',buffer:buffer(genericCsv([genericRow({exercise_name:name})]))}]);
 const p=await batch.parse([{sheetIndex:0},{sheetIndex:0}],state);
 expect(p.exerciseMappings).toHaveLength(2);expect(new Set(p.exerciseMappings.map(m=>m.exerciseId)).size).toBe(2);
 expect(()=>batch.resolve(state,name,{type:'match',exerciseId:'cable-curl'})).toThrow(/source-specific/);
 batch.resolve(state,historicalSourceKey('hevy',name),{type:'match',exerciseId:'cable-curl'});
 const s=reload(batch.apply(state).state);
 expect(s.workouts.find(w=>w.historicalImport.source==='hevy').exercises[0].exerciseId).toBe('cable-curl');
 expect(s.workouts.find(w=>w.historicalImport.source==='generic').exercises[0].exerciseId).toMatch(/^custom-import-/);
 expect(matchHistoricalExercise(name,s,exerciseCatalog,'hevy').exerciseId).toBe('cable-curl');
 expect(matchHistoricalExercise(name,s,exerciseCatalog,'generic').exerciseId).toMatch(/^custom-import-/);
});
it('an unavailable saved target retains the original name, never silently selects a new canonical match',()=>{
 let p=resolve(preview(textFor(['Bench Press'])),blankState(),'Bench Press',{type:'custom'});
 const s=apply(blankState(),p).state;deleteCustomExercise(s,s.customExercises[0].id);
 p=preview(textFor(['Bench Press']),s);expect(p.summary.reviewExercises).toBe(0);
 expect(p.exerciseMappings[0].exerciseId).toMatch(/^custom-import-/);
 expect(apply(s,p).state.workouts[0].exercises[0].exerciseId).not.toBe('barbell-bench-press');
 const corrected=resolve(p,s,p.exerciseMappings[0].sourceKey,{type:'match',exerciseId:'barbell-bench-press'});
 expect(corrected.summary.reviewExercises).toBe(0);
});
it('re-import correction updates association only and protects every locally edited factual field',async()=>{
 const text=textFor([name]),p=await compactHistoricalPreview(preview(text));
 const s=reload(apply(blankState(),p).state),w=s.workouts[0],e=w.exercises[0];
 w.sessionNote='Local corrected session';e.notes='Local corrected exercise';e.sets[0].reps=7;e.sets[0].weight=62;
 const before=structuredClone({sets:e.sets,note:e.notes,session:w.sessionNote,id:w.id,exId:e.id,fingerprint:w.historicalImport.fingerprint});
 const q=await compactHistoricalPreview(preview(text,s),s);
 const resolved=resolve(q,s,q.exerciseMappings[0].sourceKey,{type:'match',exerciseId:'cable-curl'});
 const result=apply(s,resolved),next=reload(result.state),nw=next.workouts[0],ne=nw.exercises[0];
 expect(result.result).toMatchObject({imported:0,skippedDuplicates:1});expect(ne.exerciseId).toBe('cable-curl');
 expect({sets:ne.sets,note:ne.notes,session:nw.sessionNote,id:nw.id,exId:ne.id,fingerprint:nw.historicalImport.fingerprint}).toEqual(before);
 expect(matchHistoricalExercise(name,next,exerciseCatalog,'hevy')).toMatchObject({exerciseId:'cable-curl',reason:'Your saved match'});
});
it('renaming an imported custom display name does not destroy its original provider association',()=>{
 const s=apply(blankState(),preview(textFor())).state,id=s.customExercises[0].id;
 s.customExercises[0].name='My display name';
 expect(matchHistoricalExercise(name,reload(s),exerciseCatalog,'hevy').exerciseId).toBe(id);
});
it('optional lookup is non-mutating; individual choices do not create unused original records',async()=>{
 const batch=new HistoryImportBatch(),state=blankState();await batch.read([{name:'h.csv',buffer:buffer(textFor(['Side Bend',name]))}]);
 await batch.parse([{sheetIndex:0}],state);
 const before=JSON.stringify(batch.preview.workouts);
 const suggestions=batch.reviewMatches(state);expect(suggestions.summary.suggestedExercises).toBe(1);
 expect(JSON.stringify(batch.preview.workouts)).toBe(before);
 let p=batch.resolve(state,historicalSourceKey('hevy','Side Bend'),{type:'match',exerciseId:'wg-dumbbell-side-bend'});
 expect(p.summary).toMatchObject({suggestedExercises:0,customExercises:1});
 batch.resolve(state,historicalSourceKey('hevy',name),{type:'match',exerciseId:'cable-curl'});
 expect(batch.apply(state).state.customExercises).toHaveLength(0);
});
it.each(['hevy','strong','generic-csv','generic-xlsx'])('%s imports unknown names without mandatory exercise review',async source=>{
 const generic=genericCsv([genericRow({exercise_name:name,weight:20,weight_unit:'lb',duration_seconds:30,distance:5,distance_unit:'m'})]);
 const file=source==='generic-xlsx'?{name:'history.xlsx',buffer:xlsxFixture([{name:'History',rows:readHistoryCsv(generic).rows}]).buffer}:
 {name:'history.csv',buffer:buffer(source==='hevy'?textFor():source==='strong'?strongCsv().replaceAll('Bench Press',name):generic)};
 const batch=new HistoryImportBatch(),state=blankState();await batch.read([file]);
 const p=await batch.parse([{sheetIndex:0,options:source==='strong'?{weightUnit:'kg',distanceUnit:'km'}:{}}],state);
 expect(p.summary).toMatchObject({reviewExercises:0,invalidRows:0,loadDecisions:0});
 const s=reload(batch.apply(state).state);expect(s.customExercises.some(e=>e.name===name)).toBe(true);
 expect(s.workouts.flatMap(w=>w.exercises).find(e=>e.sourceName===name).sets.length).toBeGreaterThan(0);
});
