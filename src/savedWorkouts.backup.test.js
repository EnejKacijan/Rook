import {it,expect} from 'vitest';
import {strToU8,strFromU8,unzipSync,zipSync} from 'fflate';
import {buildBackupArchive,parseBackupArchive} from './backup.js';
import {createReturningUserFixture} from './demoFixture.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
import {saveWorkoutTemplate,templateDraft,useSavedWorkout} from './savedWorkouts.js';
import {createCustomExerciseRecord} from './customExercises.js';
const rewrite=(bytes,change)=>{const files=unzipSync(bytes),manifest=JSON.parse(strFromU8(files['manifest.json'])),state=JSON.parse(strFromU8(files['data/state.json']));change(manifest,state);files['manifest.json']=strToU8(JSON.stringify(manifest));files['data/state.json']=strToU8(JSON.stringify(state));return zipSync(files);};
it('exports/restores templates with exact custom snapshots/order; restored state starts in a clean environment',async()=>{
 let state=startFreestyleWorkout(createReturningUserFixture(0));state.customExercises=[createCustomExerciseRecord({name:'Personal cable press',equipment:['cables'],loggingType:'weight_reps'})];
 for(const id of ['plank',state.customExercises[0].id,'barbell-row'])state=addFreestyleExercise(state,id);
 state=saveWorkoutTemplate(state,{...templateDraft(state.activeWorkout,state),name:'Personal workout'},{id:'personal'});state.activeWorkout=null;
 const archive=await buildBackupArchive(state,[]),restored=await parseBackupArchive(archive.bytes);
 expect(archive.manifest.schemaVersion).toBe(2);expect(restored.countValidation.every(r=>r.status==='match')).toBe(true);expect(archive.manifest.counts.savedWorkoutTemplates).toBe(1);
 expect(restored.state.savedWorkoutTemplates).toEqual(state.savedWorkoutTemplates);expect(restored.state.customExercises).toEqual(state.customExercises);
 const fresh=useSavedWorkout(restored.state,{templateId:'personal',revision:1,requestId:'clean-start'});expect(fresh.activeWorkout.exercises.map(e=>e.exerciseId)).toEqual(state.savedWorkoutTemplates[0].exercises.map(e=>e.exerciseId));
});
it('accepts absent legacy templates only in schema 1; schema 2 requires exact counts and rejects invalid content',async()=>{
 const archive=await buildBackupArchive(createReturningUserFixture(0),[]);
 const old=rewrite(archive.bytes,(m,s)=>{m.schemaVersion=1;delete m.counts.savedWorkoutTemplates;delete s.savedWorkoutTemplates;});
 const restored=await parseBackupArchive(old);expect(restored.manifest.schemaVersion).toBe(1);expect(restored.state.savedWorkoutTemplates).toEqual([]);expect(restored.countValidation.find(r=>r.field==='savedWorkoutTemplates').status).toBe('legacy-zero');
 for(const version of [1,2])await expect(parseBackupArchive(rewrite(archive.bytes,(m)=>{m.schemaVersion=version;delete m.counts.savedWorkoutTemplates;}))).rejects.toMatchObject({mismatchedFields:['savedWorkoutTemplates']});
 await expect(parseBackupArchive(rewrite(archive.bytes,(m,s)=>{delete m.counts.savedWorkoutTemplates;delete s.savedWorkoutTemplates;}))).rejects.toMatchObject({mismatchedFields:['savedWorkoutTemplates']});
 await expect(parseBackupArchive(rewrite(archive.bytes,(m,s)=>{m.counts.savedWorkoutTemplates=1;s.savedWorkoutTemplates=[{id:'broken',name:'Broken'}];}))).rejects.toThrow();
});
