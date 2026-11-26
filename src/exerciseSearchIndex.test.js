import { it, expect } from 'vitest';
import { exerciseCatalog, exerciseMatchesQuery, rankExerciseSearch, createExerciseSearchIndex } from './domain.js';
import { createPlanEditorExerciseFilter } from './exerciseEligibility.js';

const all = Object.values(exerciseCatalog).sort((a,b)=>a.name.localeCompare(b.name));
const queries = [...new Set(['',' ','---','s','squ','squat','press','zzqnoresult','pull ups','zgibi','RDL','lateral raises','PULL-UPS','café',...all.flatMap(item=>[item.name,...(item.aliases||[])])])];
it('prepared membership, objects and stable relevance equal canonical search for every bundled name and alias',()=>{
  const search=createExerciseSearchIndex(all);
  for(const query of queries)expect(search(query)).toEqual(rankExerciseSearch(all.filter(item=>exerciseMatchesQuery(item,query)),query));
},60000);
it('restrictions, equipment, occupied IDs and custom labels retain canonical results',()=>{
  const custom=[{id:'custom-local',name:'Zgibi',aliases:['pull ups'],custom:true,pattern:'pull',muscles:['Back'],equipment:[]},{id:'custom-other',name:'Pre',aliases:['pull','up'],custom:true,equipment:[]}];
  for(const profile of [{equipment:['full gym'],avoid:'Avoid squats'},{equipment:['bodyweight'],avoid:''}]){
    const items=[...all,...custom].filter(createPlanEditorExerciseFilter(profile)),search=createExerciseSearchIndex(items),occupied=new Set(['plank','push-up','pull-up']);
    for(const query of ['','s','squat','press','pull ups','zgibi','no-result','RDL'])expect(search(query,occupied)).toEqual(rankExerciseSearch(items.filter(item=>!occupied.has(item.id)&&exerciseMatchesQuery(item,query)),query));
  }
});
it('a new index accepts changed custom names and aliases; searches never mutate their source',()=>{
  const old={id:'custom',name:'Old move',aliases:['old alias']},updated={...old,name:'New move',aliases:['new alias']};
  const first=createExerciseSearchIndex([old]),next=createExerciseSearchIndex([updated]);
  expect(first('old alias')).toEqual([old]);expect(next('old alias')).toEqual([]);expect(next('new alias')).toEqual([updated]);expect(updated).toEqual({id:'custom',name:'New move',aliases:['new alias']});
});

it('muscle searches match every eligible primary and secondary target, with primary exercises first', () => {
  const profile = { equipment: ['bodyweight'] };
  const filter = createPlanEditorExerciseFilter(profile);
  const local = { id:'custom-core', name:'My brace practice', muscles:['Shoulders','Core'], pattern:'core', equipment:['bodyweight'], custom:true };
  const eligible = [...all, local].filter(filter);
  const occupied = new Set(['plank']);
  const search = createExerciseSearchIndex(eligible, { searchMuscles: true });
  const primary = eligible.filter(item => !occupied.has(item.id) && item.muscles?.[0] === 'Core');
  const secondary = eligible.filter(item => !occupied.has(item.id) && item.muscles?.slice(1).includes('Core'));
  for (const query of ['abs', 'CORE', 'abdominals', ' abdominal ']) {
    expect(search(query, occupied)).toEqual([...primary, ...secondary]);
  }
  expect(search('abs', occupied)).toContain(local);
  expect(search('abs', occupied)).not.toContain(exerciseCatalog['cable-crunch']);
  expect(search('Chest')).toEqual([
    ...eligible.filter(item => item.muscles?.[0] === 'Chest'),
    ...eligible.filter(item => item.muscles?.slice(1).includes('Chest')),
  ]);
  expect(search('Plank')[0]).toBe(exerciseCatalog.plank);
  expect(createExerciseSearchIndex(eligible)('abs', occupied)).toEqual([]);
});
