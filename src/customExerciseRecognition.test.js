import {it,expect} from 'vitest';
import {exerciseCatalog} from './domain.js';
import {createCustomExerciseRecognizer,emptyCustomExerciseForm,createCustomExerciseDraft,changeCustomExerciseDraft} from './customExerciseRecognition.js';
const recognize=createCustomExerciseRecognizer(exerciseCatalog);
const draft=name=>createCustomExerciseDraft(emptyCustomExerciseForm(name),recognize);
const edit=(value,field,next)=>changeCustomExerciseDraft(value,field,next,recognize);

it.each(['single leg skater hops','Single-Leg Skater Hops',' single   leg skater hop '])('recognizes the reviewed Skater Hop family with catalog roles: %s',name=>{
 const result=draft(name);expect(result.form).toMatchObject({name,equipment:['bodyweight'],primaryMuscle:'Quads',secondaryMuscles:['Hamstrings / glutes','Calves'],loggingType:'reps',loggingMode:'normal',pattern:''});
 expect(result.source).toMatchObject({id:'wg-skater-hop',kind:'family'});expect(result.form).not.toHaveProperty('id');expect(result.form).not.toHaveProperty('artId');expect(result.form).not.toHaveProperty('aliases');
});
it.each(['Skater Hops','Lateral Skater Hops'])('uses complete aliases without inventing plural rules: %s',name=>expect(recognize(name).source?.kind).toBe('exact'));
it.each([['skatr hops','wg-skater-hop'],['bnech press','barbell-bench-press'],['dumbell bench press','dumbbell-bench-press']])('accepts one full-word typo: %s',(name,id)=>expect(recognize(name).source).toMatchObject({id,kind:'typo'}));
it.each(['press','row','leg','single leg skatr hops','mystery skater hops','weighted skater hops','skater ho','bench pr'])('does not infer from generic, uncovered, partial or combined approximations: %s',name=>expect(recognize(name).source).toBeUndefined());
it.each(['dumbbell skater hops','single leg dumbbell skater hops'])('explicit equipment does not inherit incompatible bodyweight logging/muscles: %s',name=>expect(recognize(name)).toEqual({fields:{equipment:['dumbbells']}}));
it.each(['without dumbbells','no cable row','dumbbell cable press','brez dumbbells'])('does not guess through negation or conflicting equipment: %s',name=>expect(recognize(name)).toEqual({fields:{}}));
it('keeps duration, distance/duration and load requirements distinct',()=>{
 expect(recognize('Plank').fields.loggingType).toBe('duration');expect(recognize('Cycling').fields.loggingType).toBe('distance_duration');expect(recognize('Bench Press').fields.loggingType).toBe('weight_reps');
 // Optional added load cannot be faithfully represented by the custom form's required-load selector.
 expect(recognize('Pull-up').fields.loggingType).toBeUndefined();
});
it('rejects different catalog IDs tied at the strongest level rather than mixing their metadata',()=>{
 const one={...exerciseCatalog.plank,id:'one',name:'Same movement'},two={...one,id:'two',muscles:['Chest']};
 expect(createCustomExerciseRecognizer({one,two})('Same movement')).toEqual({fields:{}});
 expect(createCustomExerciseRecognizer({one,again:one})('Same movement').source.id).toBe('one');
});
it('renaming a known movement to an unknown one retracts only automatic fields',()=>{
 let value=draft('single leg skater hops');value=edit(value,'primaryMuscle','Calves');value=edit(value,'notes','My own cue');value=edit(value,'loggingMode','per_side');
 value=edit(value,'name','Completely new movement');expect(value.form).toMatchObject({name:'Completely new movement',equipment:[''],loggingType:'',primaryMuscle:'Calves',notes:'My own cue',loggingMode:'per_side',secondaryMuscles:[]});expect(value.source).toBeNull();
});
it('manual equipment invalidates dependent suggestions immediately, even without renaming',()=>{
 const value=edit(draft('single leg skater hops'),'equipment',['dumbbells']);expect(value.form).toMatchObject({equipment:['dumbbells'],primaryMuscle:'',loggingType:'',secondaryMuscles:[]});expect(value.source).toBeNull();
 const renamed=edit(value,'name','Bench Press');expect(renamed.form.equipment).toEqual(['dumbbells']);expect(renamed.form.primaryMuscle).toBe('');
});
it('manual clearing, secondary selections and logging are never overwritten by a later suggestion',()=>{
 let value=draft('Skater Hops');value=edit(value,'equipment',['']);value=edit(value,'secondaryMuscles',['Chest']);value=edit(value,'loggingType','duration');
 value=edit(value,'name','Bench Press');expect(value.form.equipment).toEqual(['']);expect(value.form.secondaryMuscles).toEqual(['Chest']);expect(value.form.loggingType).toBe('duration');expect(value.form.primaryMuscle).toBe('');
});
it('existing exercise editing never starts inference, even on a name change',()=>{
 const form={...emptyCustomExerciseForm('My row'),equipment:['machines'],primaryMuscle:'Back',loggingType:'weight_reps',secondaryMuscles:['Arms']};
 const value=edit(createCustomExerciseDraft(form,recognize,false),'name','Skater Hops');expect(value.form).toEqual({...form,name:'Skater Hops'});expect(value.source).toBeNull();
});
