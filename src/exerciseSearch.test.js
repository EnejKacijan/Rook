import { describe, it, expect } from 'vitest';
import { exerciseCatalog, exerciseMatchesQuery, rankExerciseSearch, matchImportedExerciseName } from './domain.js';

const all = Object.values(exerciseCatalog).sort((a,b) => a.name.localeCompare(b.name));
const matches = query => all.filter(item => exerciseMatchesQuery(item, query));
const search = query => rankExerciseSearch(matches(query), query);
describe('exercise search relevance without changing membership', () => {
  it.each(['pull up', 'pull ups', 'pull-up', 'pull-ups', 'pullup', 'pullups', 'PULL UPS'])('%s puts canonical Pull-up first', query => {
    expect(search(query)[0].id).toBe('pull-up');
  });
  it.each([
    ['weighted pull ups','wg-weighted-pull-up'], ['assisted pull ups','assisted-pull-up'],
    ['neutral grip pull ups','neutral-grip-pull-up'], ['zgibi','pull-up'],
    ['RDL','romanian-deadlift'], ['lateral raises','lateral-raise'], ['bench presses','barbell-bench-press'],
  ])('%s respects complete modified names and known aliases', (query, id) => expect(search(query)[0].id).toBe(id));
  it('primary-name matches beat exact aliases, including custom names', () => {
    const custom = { id:'custom-zgibi', name:'Zgibi', aliases:[], custom:true };
    expect(rankExerciseSearch([exerciseCatalog['pull-up'],custom], 'zgibi')[0]).toBe(custom);
  });
  it('equivalent full names beat prefix, tokens and substrings', () => {
    const items = [
      {id:'substring',name:'Australian Pull-up'}, {id:'tokens',name:'Up pull'},
      {id:'prefix',name:'Pull up variation'}, {id:'alias',name:'Local name',aliases:['Pull ups']},
      {id:'exact',name:'Pull-up'},
    ];
    expect(rankExerciseSearch(items,'pull up').map(i=>i.id)).toEqual(['exact','alias','prefix','substring','tokens']);
  });
  it('prefers strict canonical full-name target over an equivalent legacy name but never injects it', () => {
    const legacy = { id:'wg-test-pull', name:'Pull Ups' };
    const base = exerciseCatalog['pull-up'];
    expect(rankExerciseSearch([legacy,base],'pull ups')).toEqual([base,legacy]);
    expect(rankExerciseSearch([legacy],'pull ups')).toEqual([legacy]);
  });
  it('does not globally demote wg entries or inflate scores for repeated aliases', () => {
    const a={id:'wg-a',name:'Other A',aliases:['abc']}, b={id:'b',name:'Other B',aliases:['abc','abc','abc']};
    expect(rankExerciseSearch([a,b],'abc')).toEqual([a,b]);
    expect(rankExerciseSearch([b,a],'abc')).toEqual([b,a]);
  });
  it('does not singularize trailing s or combine separate aliases', () => {
    const items=[{id:'a',name:'Pre',aliases:['pull','up']},{id:'b',name:'Press'}];
    expect(rankExerciseSearch(items,'press')[0].id).toBe('b');
    expect(exerciseMatchesQuery(items[0],'pull up')).toBe(false);
  });
  it.each(['','   ','---'])('empty normalized query %j preserves exact input order', q => {
    const items=[all[7],all[2],all[0]]; expect(rankExerciseSearch(items,q)).toBe(items);
  });
  it('preserves candidate multiset, objects, stable ties and importer semantics', () => {
    for (const query of ['pull ups','press','lateral raises','RDL','weighted pull ups','no-such-movement']) {
      const before=matches(query), ids=before.map(i=>i.id), imported=matchImportedExerciseName(query);
      const result=rankExerciseSearch(before,query);
      expect(result.map(i=>i.id).sort()).toEqual([...ids].sort());
      expect(before.map(i=>i.id)).toEqual(ids);
      expect(result.every(item=>before.includes(item))).toBe(true);
      expect(rankExerciseSearch(before,query)).toEqual(result);
      expect(matchImportedExerciseName(query)).toEqual(imported);
    }
  });
});
