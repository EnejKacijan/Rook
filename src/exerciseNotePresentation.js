import {exerciseName,exerciseNote,targetLabel} from './domain.js';
import {analyzeImportAlternatives} from './importAlternatives.js';

// Presentation only: never rewrite notes or infer a new prescription from them.
export function exerciseNotePresentation(exercise,program) {
  const note=exerciseNote(exercise)||'';
  const sources=(program?.importMetadata?.sourceNotes||[]).map(item=>item.text);
  const reference=[],cues=[];
  for(const line of note.split('\n')){
    const exactSource=sources.some(source=>String(source).split('\n').some(original=>original===line));
    const prescription=/\d\s*[x×]\s*\d/u.test(line)||analyzeImportAlternatives(line).detected;
    // Standalone execution cues stay visible. Mixed raw prescription/cues are
    // preserved in full as reference instead of guessing which branch applies.
    (exactSource&&prescription?reference:cues).push(line);
  }
  return {reference:reference.join('\n'),cue:cues.join('\n').trim()};
}

// The compact queue selects existing standalone cues; it never repairs or
// extracts instructions from a mixed source prescription. Full notes stay intact.
export function upNextExerciseNote(exercise,program) {
  const name=exerciseName(exercise).toLocaleLowerCase();
  const target=targetLabel(exercise,false).replace(/\s/g,'').toLocaleLowerCase();
  const clean=line=>{
    const text=String(line||'').trim(),folded=text.toLocaleLowerCase();
    return text && !folded.includes(name) && folded.replace(/\s/g,'')!==target &&
      !/\d\s*[x×]\s*\d/u.test(text) && !/^(?:\d+[.)]\s|\/)/u.test(text) &&
      !/\b(?:original import|import provenance|source text|parser)\b/i.test(text);
  };
  const structured=(exercise.hybridSource?.aiEvidence||[]).filter(fact=>fact.kind==='cue').map(fact=>fact.value).filter(clean);
  // Hybrid notes also contain section/role/source metadata. Without an explicit
  // cue, omit that secondary line instead of treating metadata as instructions.
  const cues=exercise.hybridSource?structured:exerciseNotePresentation(exercise,program).cue.split('\n').filter(clean);
  return [...new Set(cues.map(cue=>cue.trim()))].join(' · ');
}
