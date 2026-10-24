import {normalizedExerciseName} from './domain.js';
import {prepareTypoText,typoNameScore} from './exerciseSearchTypos.js';

// Interactive title search only: use the exercise picker's bounded spelling
// tolerance without its catalog aliases or exercise-identity ranking.
export function searchWorkoutNames(items,query) {
  const normalized=normalizedExerciseName(query);
  if(!normalized)return items;
  const typed=prepareTypoText(normalized),cache=new Map();
  const singleLetters=typed.words.filter(word=>/^\p{L}$/u.test(word));
  const matches=items.map((item,index)=>{
    const title=normalizedExerciseName(item.name),name=prepareTypoText(title);
    // Preserve explicit workout variants, e.g. Upper A/B and Week 1/2.
    if(typed.numbers.some(number=>!name.numbers.includes(number))||singleLetters.some(letter=>!name.words.includes(letter)))return null;
    const tier=title===normalized||name.compact===typed.compact?0
      :title.startsWith(normalized)?1
      :title.includes(normalized)||typed.words.every(word=>title.includes(word))?2
      :name.compact.includes(typed.compact)?3:4;
    return {item,index,tier,name};
  }).filter(Boolean);
  const strict=matches.filter(match=>match.tier<4).sort((a,b)=>a.tier-b.tier||a.index-b.index);
  if(strict.some(match=>match.tier===0)||typed.compact.length<4||normalized.length>128)return strict.map(match=>match.item);
  const suggestions=matches.filter(match=>match.tier===4)
    .map(match=>({...match,score:typoNameScore(match.name,typed,cache)}))
    .filter(match=>Number.isFinite(match.score))
    .sort((a,b)=>a.score-b.score||a.index-b.index);
  return [...strict,...suggestions].map(match=>match.item);
}
