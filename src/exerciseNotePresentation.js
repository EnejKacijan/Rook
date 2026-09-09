import {exerciseNote} from './domain.js';
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
