import {describe,it,expect} from 'vitest';
import {searchWorkoutNames} from './workoutSearch.js';

const titles=(...names)=>names.map((name,id)=>Object.freeze({id,name}));
describe('interactive workout title search',()=>{
  it.each([
    ['uper a','Upper A'],['quik upper','Quick upper body'],
    ['full bdoy','Full body'],['qick up','Quick upper body'],
    ['rockamii','Trening z ročkami'],
  ])('finds %s despite a small typo',(query,title)=>{
    const items=titles('Lower body',title,'Cardio');
    expect(searchWorkoutNames(items,query)[0]).toBe(items[1]);
  });
  it('normalizes accents, punctuation, spacing, word order and incomplete words',()=>{
    const items=titles('Trening z ročkami','Quick upper body');
    expect(searchWorkoutNames(items,'  TRENING Z ROCKAMI  ')).toEqual([items[0]]);
    expect(searchWorkoutNames(items,'upper—quick')).toEqual([items[1]]);
    expect(searchWorkoutNames(items,'quickup')).toEqual([items[1]]);
  });
  it('puts literal matches before corrections and keeps exact titles free of noise',()=>{
    const items=titles('Full body','Full bdoy workout','Full bdoy');
    expect(searchWorkoutNames(items,'full bdoy')).toEqual([items[2],items[1]]);
    expect(searchWorkoutNames(items.slice(0,2),'full bdoy')).toEqual([items[1],items[0]]);
  });
  it('keeps explicit numbered and lettered variants distinct, including with typos',()=>{
    const items=titles('Upper B','Upper A','Week 1 strength','Week 12 strength','Week 2 strength');
    expect(searchWorkoutNames(items,'uper a')).toEqual([items[1]]);
    expect(searchWorkoutNames(items,'week 2 strenght')).toEqual([items[4]]);
    expect(searchWorkoutNames(items,'week 2')).toEqual([items[4]]);
  });
  it('does not expand short, nonsense or unbounded queries',()=>{
    const items=titles('Full body','Cardio','Upper A');
    for(const query of ['fll','zzqnoresult','b'.repeat(500)])expect(searchWorkoutNames(items,query)).toEqual([]);
    expect(searchWorkoutNames(items,'ful')).toEqual([items[0]]);
  });
  it('preserves duplicate titles, stable ties and the original objects without mutation',()=>{
    const items=Object.freeze(titles('Quick upper','Quick upper','Quick lower'));
    expect(searchWorkoutNames(items,'quik upper')).toEqual([items[0],items[1]]);
    expect(searchWorkoutNames(items,'   ')).toBe(items);
    expect(searchWorkoutNames(items,'quik upper')[0]).toBe(items[0]);
  });
});
