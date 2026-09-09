import { expect, it } from 'vitest';
import { AIService } from './aiService.js';
import { blankState, displayWeight } from './domain.js';
import { applySourceUnitDecision, sourceWeightUnitAt } from './importSourceUnits.js';
import { pendingImportIssues } from './planImportReview.js';
const parse=(source,units='kg')=>AIService.importTrainingPlan({...blankState().profile,units},source,{review:true});
const first=result=>result.program.days[0].exercises[0];

it.each(['kg','lb'])('uses %s only for display, preserving explicit source meaning',async units=>{
  const source='Monday\nBench Press 3x8 185 lb\nLeg Press 3x8 80 kg';
  const result=await parse(source,units),[a,b]=result.program.days[0].exercises;
  expect(a.sets[0].weight).toBe(83.91);expect(b.sets[0].weight).toBe(80);
  expect(result.profile.units).toBe(units);
  expect(result.sourceReview.issues.filter(i=>i.field==='sourceUnit')).toHaveLength(0);
  expect(result.sourceReview.lines.map(l=>l.text).join('\n')).toBe(source);
  expect(result.program.importMetadata.sourceNotes.map(n=>n.text).join('\n')).toBe(source);
  expect(displayWeight(b.sets[0].weight,units)).toBe(units==='lb'?176.37:80);
});
it.each(['kg','lb'])('blocks a unitless load independently of %s preference',async units=>{
  const result=await parse('Monday\nBench Press 3x8 185',units);
  const issue=result.sourceReview.issues.find(i=>i.field==='sourceUnit');
  expect(issue.sourceLoads).toEqual([185]);expect(first(result).sets.every(s=>s.weight===null)).toBe(true);
  expect(pendingImportIssues(result.sourceReview)).toContain(issue);
  expect(applySourceUnitDecision(result.program,issue,'lb')).toBe(true);
  expect(first(result).sets.map(s=>s.weight)).toEqual([83.91,83.91,83.91]);
  expect(result.profile.units).toBe(units);
  expect(pendingImportIssues(result.sourceReview,{[issue.id]:{unit:'lb'}})).toHaveLength(0);
});
it('resolves a per-set vector with one decision, preserving each value',async()=>{
  const result=await parse('Monday\nBench Press 176/176/165 5 reps','lb');
  const issues=result.sourceReview.issues.filter(i=>i.field==='sourceUnit');expect(issues).toHaveLength(1);
  expect(first(result).sets.every(s=>s.weight===null)).toBe(true);
  applySourceUnitDecision(result.program,issues[0],'lb');expect(first(result).sets.map(s=>s.weight)).toEqual([79.83,79.83,74.84]);
  applySourceUnitDecision(result.program,issues[0],'kg');expect(first(result).sets.map(s=>s.weight)).toEqual([176,176,165]);
});
it.each(['Weights in lb','All weights: lb','Units: lb'])('honors explicit shared context %s without another question',async header=>{
  const result=await parse(`${header}\nMonday\nBench Press 3x8 185\nLeg Press 3x8 155`,'kg');
  expect(first(result).sets[0].weight).toBe(83.91);
  expect(result.program.days[0].exercises[1].sets[0].weight).toBe(70.31);
  expect(result.sourceReview.issues.filter(i=>i.field==='sourceUnit')).toHaveLength(0);
});
it('honors an explicit table column without leaking it into later prose',async()=>{
  const result=await parse('Monday\n| Exercise | Sets | Reps | Weight (lb) |\n| Bench Press | 3 | 8 | 185 |\n\nLeg Press 3x8 155');
  expect(first(result).sets[0].weight).toBe(83.91);
  expect(result.sourceReview.issues.filter(i=>i.field==='sourceUnit')).toHaveLength(1);
});
it('local explicit units override a declaration, not the other way round',async()=>{
  const result=await parse('Weights in lb\nMonday\nBench Press 3x8 80 kg','lb');expect(first(result).sets[0].weight).toBe(80);
});
it('does not borrow a neighboring exercise unit or a later declaration',async()=>{
  const result=await parse('Monday\nBench Press 3x8 80 kg\nLeg Press 3x8 155\nWeights in lb');
  expect(result.sourceReview.issues.filter(i=>i.field==='sourceUnit')).toHaveLength(1);
  expect(sourceWeightUnitAt('Bench Press 80 kg\nLeg Press 155',2)).toBeNull();
});
it.each(['Bench Press 80','Leg Press 155'])('requires units AND a real prescription for %s',async source=>{
  const result=await parse(`Monday\n${source}`);
  expect(result.sourceReview.issues.map(i=>i.field)).toEqual(expect.arrayContaining(['sourceUnit','prescription']));
  expect(first(result).repMin).toBeNull();expect(first(result).sets[0].weight).toBeNull();
});
it('does not misread effort/time/percent as a unitless load',async()=>{
  for(const suffix of ['2 RIR','@2','60 sec rest','80%']){
    const result=await parse(`Monday\nBench Press 3x8 ${suffix}`);
    expect(result.sourceReview.issues.filter(i=>i.field==='sourceUnit'),suffix).toHaveLength(0);
  }
});
it('rejects invalid unit decisions without changing draft data',async()=>{
  const result=await parse('Monday\nBench Press 3x8 80'),before=structuredClone(result.program);
  expect(applySourceUnitDecision(result.program,result.sourceReview.issues[0],'stone')).toBe(false);
  expect(result.program).toEqual(before);
});
