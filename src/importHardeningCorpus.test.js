import { it, expect } from 'vitest';
import { AIService } from './aiService.js';
import { blankState } from './domain.js';
import { importHardeningFixtures } from './importHardeningFixtures.js';
for(const fixture of importHardeningFixtures) it(fixture.name, async()=>{
  const parsing=AIService.importTrainingPlan(blankState().profile,fixture.text,{review:true});
  if(fixture.unsupported){await expect(parsing).rejects.toThrow();return;}
  const result=await parsing;
  expect(result.program.days).toHaveLength(fixture.days);
  expect(result.program.days.flatMap(d=>d.exercises)).toHaveLength(fixture.exercises);
  expect([...new Set(result.sourceReview.issues.map(i=>i.field))].sort()).toEqual([...fixture.issues].sort());
  for(const line of result.sourceReview.lines){
    expect(fixture.text.slice(line.start,line.end)).toBe(line.text);
    if(['unclassified','recovery','warmup-review','review'].includes(line.status)&&line.text.trim())
      expect(result.sourceReview.issues.some(i=>i.source.includes(line.text))).toBe(true);
  }
});
for(let seed=0;seed<40;seed++)it(`formatting invariance ${seed}`,async()=>{
  const bullet=['','• ','- ','1. '][seed%4];
  const times=['x','×','X','*'][Math.floor(seed/4)%4];
  const space=' '.repeat(1+seed%3);
  const name=seed%2?'BENCH PRESS':'Bench Press';
  const text=`Monday\n${seed%2?'\n':''}${bullet}${name}${space}3${space}${times}${space}8–12 RIR 2`;
  const result=await AIService.importTrainingPlan(blankState().profile,text,{review:true});
  const exercise=result.program.days[0].exercises[0];
  expect(result.program.days[0].weekday).toBe('Mon');
  expect([exercise.sets.length,exercise.repMin,exercise.repMax,exercise.targetRir]).toEqual([3,8,12,2]);
  expect(result.sourceReview.issues).toEqual([]);
});
