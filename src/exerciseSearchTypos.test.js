import {describe,it,expect} from 'vitest';
import {exerciseCatalog,searchExercises,createExerciseSearchIndex,exerciseMatchesQuery,rankExerciseSearch,matchImportedExerciseName} from './domain.js';
import {createPlanEditorExerciseFilter} from './exerciseEligibility.js';
import {historicalExerciseChoices} from './historicalWorkoutImport.js';

const catalog=Object.values(exerciseCatalog).sort((a,b)=>a.name.localeCompare(b.name));
const search=createExerciseSearchIndex(catalog);
describe('interactive exercise typo search',()=>{
  it.each([
    ['squatt','wg-squat'],['sqaut','wg-squat'],['bnech press','barbell-bench-press'],
    ['bench prees','barbell-bench-press'],['bech pres','barbell-bench-press'],
    ['dumbell bench press','dumbbell-bench-press'],['latral raise','lateral-raise'],
    ['chest suported row','chest-supported-row'],['zgbii','pull-up'],['bnech pr','barbell-bench-press'],
  ])('%s finds the expected exercise first', (query,id)=>{
    expect(search(query)[0]?.id).toBe(id);
  });
  it('keeps strict matches in front of similar spellings and complete matches free of noise',()=>{
    const exactPrefix={id:'custom',name:'Bench prees variant'},bench=exerciseCatalog['barbell-bench-press'];
    expect(searchExercises([bench,exactPrefix],'bench prees')).toEqual([exactPrefix,bench]);
    const blank={id:'blank',name:'Blank'},plank=exerciseCatalog.plank;
    expect(searchExercises([blank,plank],'plank')).toEqual([plank]);
  });
  it('retains accents, aliases and custom exercise names',()=>{
    const custom={id:'custom',name:'Počep z ročkami',aliases:['My goblet squat']};
    expect(searchExercises([custom],'pocep z rockamii')).toEqual([custom]);
    expect(searchExercises([custom],'my gobelt squat')).toEqual([custom]);
    expect(search('RDL')[0].id).toBe('romanian-deadlift');
  });
  it('does not mix aliases, change numeric variants or expand very short/nonsense queries',()=>{
    const separate={id:'separate',name:'Other',aliases:['bench','press']};
    expect(searchExercises([separate],'bnech press')).toEqual([]);
    expect(searchExercises([{id:'angle',name:'45 degree leg press'}],'46 degree leg prees')).toEqual([]);
    expect(searchExercises([{id:'arms',name:'1 arm row'}],'2 arm roww')).toEqual([]);
    for(const query of ['gzi','zzqnoresult','xyzzqqwweee','b'.repeat(500)])expect(search(query)).toEqual([]);
  });
  it('never reintroduces occupied or ineligible exercises',()=>{
    const eligible=catalog.filter(createPlanEditorExerciseFilter({equipment:['bodyweight'],avoid:'Avoid squats'}));
    expect(createExerciseSearchIndex(eligible)('bnech press').every(item=>eligible.includes(item))).toBe(true);
    expect(createExerciseSearchIndex([exerciseCatalog['barbell-bench-press']])('bnech press',new Set(['barbell-bench-press']))).toEqual([]);
  });
  it('preserves source objects, stable ties and strict importer semantics',()=>{
    const a=Object.freeze({id:'a',name:'Local press'}),b=Object.freeze({id:'b',name:'Local press'});
    const candidates=Object.freeze([b,a]);
    expect(searchExercises(candidates,'local prees')).toEqual([b,a]);
    const bench=exerciseCatalog['barbell-bench-press'],before=matchImportedExerciseName('bnech press');
    expect(exerciseMatchesQuery(bench,'bnech press')).toBe(false);
    expect(rankExerciseSearch([a],'bnech press')).toEqual([a]);
    search('bnech press');
    expect(matchImportedExerciseName('bnech press')).toEqual(before);
  });
  it('shares suggestions and aliases with manual history matching',()=>{
    expect(historicalExerciseChoices({customExercises:[]},'bnech press')[0].id).toBe('barbell-bench-press');
    expect(historicalExerciseChoices({customExercises:[]},'RDL')[0].id).toBe('romanian-deadlift');
  });
});
