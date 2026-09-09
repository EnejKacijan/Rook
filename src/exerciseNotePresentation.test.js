import {expect,it} from 'vitest';
import {exerciseNotePresentation} from './exerciseNotePresentation.js';
const source='Leg Press 3x9 155 kg / Leg press masina 3x8 173 kg';
const program={importMetadata:{sourceNotes:[{text:`Monday\n${source}\nPause at the bottom`}]}};
it('separates verified source prescription from an execution cue without mutation',()=>{
 const exercise={notes:`Pause at the bottom\n${source}`,personalNote:'Seat 4'},before=structuredClone(exercise);
 expect(exerciseNotePresentation(exercise,program)).toEqual({reference:source,cue:'Pause at the bottom'});expect(exercise).toEqual(before);
});
it('does not hide manual notes or guess source provenance',()=>{
 expect(exerciseNotePresentation({notes:source},{})).toEqual({reference:'',cue:source});
 expect(exerciseNotePresentation({notes:'Pause at the bottom'},program)).toEqual({reference:'',cue:'Pause at the bottom'});
});
it('keeps long source text intact, distinct from personal reminder limits',()=>{
 const text=`${source} — ${'original instruction '.repeat(30)}`;
 expect(exerciseNotePresentation({notes:text},{importMetadata:{sourceNotes:[{text}]}}).reference).toBe(text);
});
