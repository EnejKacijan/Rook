import { describe, it, expect, vi, afterEach } from 'vitest';
import { AIService } from './aiService.js';
import { blankState } from './domain.js';
const parse = text => AIService.importTrainingPlan(blankState().profile,text,{review:true});
afterEach(()=>vi.unstubAllGlobals());
describe('local notes review semantics',()=>{
  it('imports clear fields without source issues',async()=>{
    const result=await parse('MON - Push\nBench Press 3x6-8 RIR 2\nCable Fly 2x10-15 RIR 1');
    expect(result.sourceReview.issues).toEqual([]);
    expect(result.program.days[0].weekday).toBe('Mon');
    const [bench,fly]=result.program.days[0].exercises;
    expect([bench.sets.length,bench.repMin,bench.repMax,bench.targetRir]).toEqual([3,6,8,2]);
    expect([fly.sets.length,fly.repMin,fly.repMax,fly.targetRir]).toEqual([2,10,15,1]);
  });
  it('preserves ordered workouts without inventing weekdays',async()=>{
    const result=await parse('Day 1 - Upper\nBench Press 3x8\nDay 2 - Lower\nLeg Press 3x10');
    expect(result.program.days.map(day=>day.weekday)).toEqual([null,null]);
    expect(result.sourceReview.issues.map(issue=>issue.field)).toEqual(['day','day']);
  });
  it('does not merge duplicate weekdays',async()=>{
    const result=await parse('Monday - Push\nBench Press 3x8\nMonday - Pull\nCable Row 3x10');
    expect(result.program.days).toHaveLength(2);
    expect(result.program.days.map(day=>day.weekday)).toEqual(['Mon',null]);
    expect(result.sourceReview.issues[0].message).toMatch(/Two workouts/);
  });
  it.each(['@2','@ RPE 8','RPE 8'])('requires effort review for %s',async notation=>{
    const result=await parse(`Monday\nBench Press 3x8 ${notation}`);
    expect(result.sourceReview.issues.some(issue=>issue.field==='rir')).toBe(true);
  });
  it('keeps decimal-comma and mixed explicit units',async()=>{
    const result=await parse('Monday\nBench Press 3x8 36,25 kg\nDumbbell Curl 3x10 25 lb');
    const exercises=result.program.days[0].exercises;
    expect(exercises[0].sets[0].weight).toBe(36.25);
    expect(exercises[1].sets[0].weight).toBeCloseTo(11.34,1);
  });
  it('separates working load from unlabelled warm-up ramps',async()=>{
    const result=await parse('Monday\nBench Press\nWarm up:\n20x10\n40x5\n60x3\nWorking:\n70kg 3x6-8 @1');
    const exercise=result.program.days[0].exercises[0];
    expect(exercise.importedName).toBe('Bench Press');
    expect(exercise.sets).toHaveLength(3);
    expect(exercise.sets[0].weight).toBe(70);
    expect(result.sourceReview.issues.some(i=>i.source.includes('20x10'))).toBe(true);
  });
  it('reads a written rep range',async()=>{
    const result=await parse('Monday\nBench Press 3x8 to 12 RIR 2');
    expect(result.program.days[0].exercises[0].repMax).toBe(12);
  });
  it('does not silently turn assistance into positive weight',async()=>{
    const result=await parse('Monday\nPull-up 3x8 -20kg');
    expect(result.program.days[0].exercises[0].sets[0].weight).toBeNull();
    expect(result.sourceReview.issues.some(i=>i.field==='load')).toBe(true);
  });
  it('preserves restriction conflicts for review instead of deleting the exercise',async()=>{
    const profile={...blankState().profile,avoid:'Avoid Leg Press',trainingSafetyAnalysis:{sourceText:'Avoid Leg Press',analysis:{schemaVersion:2,findings:[{kind:'explicit_avoidance',confidence:0.99,targetText:'Leg Press',evidence:[{quote:'Leg Press',start:6,end:15}]}],unresolved:[]}}};
    const result=await AIService.importTrainingPlan(profile,'Monday\nLeg Press 3x8 RIR 2',{review:true});
    expect(result.program.days[0].exercises[0].exerciseId).toBe('leg-press');
    expect(result.profile.avoid).toBe(profile.avoid);
  });
  it('creates only a complete adjacent equal-round superset',async()=>{
    const result=await parse('Monday\nA1 Cable Fly 3x12\nA2 Lateral Raise 3x15');
    const [a,b]=result.program.days[0].exercises;
    expect(a.supersetId).toBeTruthy();
    expect(a.supersetId).toBe(b.supersetId);
    const unequal=await parse('Monday\nA1 Cable Fly 3x12\nA2 Lateral Raise 2x15');
    expect(unequal.program.days[0].exercises.every(e=>!e.supersetId)).toBe(true);
    expect(unequal.sourceReview.issues.some(i=>/superset/.test(i.message))).toBe(true);
  });
  it('maps a clear named superset and trailing rest instruction',async()=>{
    const result=await parse('Monday\nSuperset:\nCable Fly 3x12\nLateral Raise 3x15\n2 min rest');
    const [a,b]=result.program.days[0].exercises;
    expect(a.supersetId).toBeTruthy();expect(b.supersetId).toBe(a.supersetId);
    expect(b.restSeconds).toBe(120);
    expect(result.sourceReview.issues).toEqual([]);
  });
  it('does not create a recovery workout or lose its excerpt',async()=>{
    const result=await parse('PON - Push\nBench Press 3x8\nSOBOTA - AKTIVNI RECOVERY\nBOSU 2x30 s\nNEDELJA - POČITEK\nHoja po občutku.');
    expect(result.program.days).toHaveLength(1);
    expect(result.sourceReview.issues.some(i=>i.source==='BOSU 2x30 s')).toBe(true);
  });
  it('maps an explicit shared per-side prescription without a redundant decision',async()=>{
    const result=await parse('Monday\nDumbbell Curl 3x10 each side');
    expect(result.sourceReview.issues.some(i=>i.field==='loggingMode')).toBe(false);
    expect(result.program.days[0].exercises[0].loggingMode).toBe('per_side');
  });
  it.each(['Set 3 AMRAP','last set AMRAP'])('preserves structured %s without adding normal volume',async instruction=>{
    const result=await parse(`Monday\nLat Pulldown 2x8-10\n${instruction}`);
    const sets=result.program.days[0].exercises[0].sets;
    expect(sets).toHaveLength(instruction.startsWith('Set 3')?3:2);
    expect(sets.at(-1).setType).toBe('amrap');
    expect(sets[0].setType).toBeUndefined();
    expect(result.sourceReview.issues).toEqual([]);
  });
  it('rejects multiple explicit weeks locally',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    await expect(parse('Week 1\nBench Press 3x8\nWeek 2\nBench Press 3x10')).rejects.toThrow(/multiple/i);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not flatten Markdown or emoji-labelled block weeks',async()=>{
    await expect(parse('## Week 1\nMonday\nBench Press 3x8\n🟢 Week 2\nMonday\nBench Press 4x8')).rejects.toThrow(/multiple/);
  });
  it('does not send unrecognized notes to an AI provider',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    await expect(parse('random private notes without a prescription')).rejects.toThrow(/prescription/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
