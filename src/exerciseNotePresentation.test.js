import {expect,it} from 'vitest';
import {exerciseNotePresentation,upNextExerciseNote} from './exerciseNotePresentation.js';
const source='Leg Press 3x9 155 kg / Leg press masina 3x8 173 kg';
const program={importMetadata:{sourceNotes:[{text:`Monday\n${source}\nPause at the bottom`}]}};
it('separates verified source prescription from an execution cue without mutation',()=>{
 const exercise={notes:`Pause at the bottom\n${source}`,personalNote:'Seat 4'},before=structuredClone(exercise);
 expect(exerciseNotePresentation(exercise,program)).toEqual({reference:source,cue:'Pause at the bottom'});expect(exercise).toEqual(before);
});

const queueExercise=notes=>({exerciseId:'rear-delt-fly',importedName:'Rear Delt Fly',sets:[{},{}],repMin:7,repMax:7,notes});
it.each(['Slow eccentric','35 kg / side','Last set dropset'])('keeps a standalone execution cue: %s',note=>{
 expect(upNextExerciseNote(queueExercise(note),program)).toBe(note);
});
it.each(['','/stran 35 kg · 5. Rear Delt Fly – 2×7/stran 35 kg','5. Slow eccentric','2 × 7','Original import: pause','Parser source text'])('omits raw or redundant queue text: %s',note=>{
 const exercise=queueExercise(note),before=structuredClone(exercise);
 expect(upNextExerciseNote(exercise,program)).toBe('');expect(exercise).toEqual(before);
});
it('uses an existing structured cue when useful instructions are mixed into source text',()=>{
 const exercise={...queueExercise('5. Rear Delt Fly – 2×7/stran 35 kg, slow eccentric'),hybridSource:{aiEvidence:[{kind:'cue',value:'Slow eccentric',evidence:'slow eccentric'}]}},before=structuredClone(exercise);
 expect(upNextExerciseNote(exercise,program)).toBe('Slow eccentric');expect(exercise).toEqual(before);
});
it('does not promote hybrid section or role metadata when no structured cue exists',()=>{
 const exercise={...queueExercise('Working sets\nUpper body\nDo controlled rear delt work for two sets'),hybridSource:{aiEvidence:[{kind:'load',value:'35 kg'}]}},before=structuredClone(exercise);
 expect(upNextExerciseNote(exercise,program)).toBe('');expect(exercise).toEqual(before);
});
it('selects a separate clean line without extracting or rewriting a mixed prescription',()=>{
 const exercise=queueExercise('5. Rear Delt Fly – 2×7/stran 35 kg\n35 kg / side');
 expect(upNextExerciseNote(exercise,program)).toBe('35 kg / side');
 expect(upNextExerciseNote({...exercise,notes:undefined},{})).toBe('');
});
it('does not hide manual notes or guess source provenance',()=>{
 expect(exerciseNotePresentation({notes:source},{})).toEqual({reference:'',cue:source});
 expect(exerciseNotePresentation({notes:'Pause at the bottom'},program)).toEqual({reference:'',cue:'Pause at the bottom'});
});
it('keeps long source text intact, distinct from personal reminder limits',()=>{
 const text=`${source} — ${'original instruction '.repeat(30)}`;
 expect(exerciseNotePresentation({notes:text},{importMetadata:{sourceNotes:[{text}]}}).reference).toBe(text);
});
