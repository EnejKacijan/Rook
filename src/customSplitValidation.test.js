import {describe,it,expect} from 'vitest';
import {blankState,buildProgram,customSplitIsValid} from './domain.js';

const profile=(text,days=5)=>({...blankState().profile,goal:'Build muscle',experience:'Intermediate',trainingSplitChoice:'other',trainingPreferences:text,daysPerWeek:days,availableDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],equipment:['full gym'],environment:'Commercial gym',sessionMinutes:60});
describe('Other live validation shares the existing structural build gate',()=>{
  it.each([
    ['push / pull / legs + Arnold split',5,false],['PPL + Arnold',5,false],
    ['bodybuilding split I used with my coach',5,false],['push pull legs push pull',5,true],
    ['upper / lower / upper / lower',5,false],['',5,false],
    ['push pull legs upper lower',5,true],['PPLUL',5,true],
    ['upper lower full body',3,true],['chest back / shoulders arms / legs',3,true],
    ['upper / lower / upper / lower',4,true],
  ])('%s has the same result before and during a build',(text,days,valid)=>{
    const p=profile(text,days),before=structuredClone(p);
    expect(customSplitIsValid(p)).toBe(valid);
    if(valid)expect(buildProgram(p).days).toHaveLength(days);
    else expect(()=>buildProgram(p)).toThrow();
    expect(p).toEqual(before);
  });
  it('reflects the current value immediately without retaining a previous error',()=>{
    const p=profile('PPL + Arnold');expect(customSplitIsValid(p)).toBe(false);
    p.trainingPreferences='PPLUL';expect(customSplitIsValid(p)).toBe(true);
    p.daysPerWeek=4;expect(customSplitIsValid(p)).toBe(false);
    p.trainingPreferences='upper / lower / upper / lower';expect(customSplitIsValid(p)).toBe(true);
  });
  it('does not validate unrelated automatic/predefined choices as Other',()=>{
    expect(customSplitIsValid({...profile(''),trainingSplitChoice:'recommended'})).toBe(true);
    expect(customSplitIsValid({...profile('Arnold split'),trainingSplitChoice:'arnold'})).toBe(true);
  });
  it('keeps the existing equipment incompatibility guard',()=>{
    const p={...profile('push pull legs',3),equipment:['bodyweight only'],environment:'Home gym'};
    expect(customSplitIsValid(p)).toBe(false);expect(()=>buildProgram(p)).toThrow(/cannot be preserved/);
  });
});
