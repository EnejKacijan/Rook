import { it, expect } from 'vitest';
import { AIService } from './aiService.js';
import { blankState } from './domain.js';
import { importAdversarialFixtures } from './importAdversarialFixtures.js';
for(const fixture of importAdversarialFixtures)it(`adversarial: ${fixture.name}`,async()=>{
  const parsing=AIService.importTrainingPlan(blankState().profile,fixture.text,{review:true});
  if(!fixture.days){await expect(parsing).rejects.toThrow();return;}
  const result=await parsing;
  expect(result.program.days).toHaveLength(fixture.days);
  expect(result.program.days.flatMap(d=>d.exercises)).toHaveLength(fixture.exercises);
  for(const line of result.sourceReview.lines)if(['unclassified','recovery','warmup-review','review'].includes(line.status)&&line.text.trim())
    expect(result.sourceReview.issues.some(issue=>issue.source.includes(line.text))).toBe(true);
  if(fixture.name==='unlabelled possible load') {
    expect(result.sourceReview.issues.some(i=>i.field==='sourceUnit')).toBe(true);
    expect(result.program.days[0].exercises[0].sets[0].weight).toBeNull();
  }
  if(fixture.name==='same-line entries') expect(result.program.days[0].exercises[1].sets[0].weight).toBeNull();
  if(fixture.name==='incomplete superset') expect(result.sourceReview.issues.some(i=>/superset/.test(i.message))).toBe(true);
});
