import {it,expect} from 'vitest';
import {AIService} from './aiService.js';
import {blankState,startWorkout,deserializeState} from './domain.js';
import {warmupPrescriptionLabel} from './warmupPrescription.js';
import {buildWorkoutExport} from './workoutExport.js';
export const notes=`Monday: Legs
Warm-up
hitre hoje 1 × 300 sec
3–5 min lahkega teka
Shuttle Run 5 × 5
Warm-up movement 2 × 1
60–70 % hitrosti
Figure-8 Run 5m
Lateral Shuffle
Workout
Leg Press 3x9 130kg`;
it('preserves a mixed imported warm-up through runtime, serialization and export',async()=>{
 const s=blankState();s.program=(await AIService.importTrainingPlan(s.profile,notes)).program;const d=s.program.days[0];
 expect(d.warmupPlan.items).toHaveLength(7);const expected=['5 min','3–5 min','5 × 5','2 × 1','','5 m',''];expect(d.warmupPlan.items.map(warmupPrescriptionLabel)).toEqual(expected);
 s.activeWorkout=startWorkout(s,d);expect(s.activeWorkout.warmup.general.map(warmupPrescriptionLabel)).toEqual(expected);expect(s.activeWorkout.warmup.estimatedMinutes).toBeNull();
 const restored=deserializeState(JSON.parse(JSON.stringify(s)));expect(restored.activeWorkout.warmup.general.map(warmupPrescriptionLabel)).toEqual(expected);
 const text=buildWorkoutExport({workout:d}).text;for(const value of expected.filter(Boolean))expect(text).toContain(value);expect(text).toContain('60–70 % hitrosti');expect(text).toContain('Lateral Shuffle');
});
it.each([['30 sec','30 sec'],['60 sec','1 min'],['90 sec','90 sec'],['3 min','3 min'],['300 sec','5 min'],['3–5 min','3–5 min']])('keeps explicit %s',async(value,label)=>{const s=blankState(),result=await AIService.importTrainingPlan(s.profile,`Monday\nWarm-up\nEasy bike ${value}\nWorkout\nBench Press 3x8`);expect(warmupPrescriptionLabel(result.program.days[0].warmupPlan.items[0])).toBe(label);});
it('does not present the legacy imported default minute as a prescription',()=>{expect(warmupPrescriptionLabel({label:'Lateral Shuffle',minutes:1,seconds:null,provenance:'imported'})).toBe('');expect(warmupPrescriptionLabel({label:'Bike',seconds:60,minutes:1,provenance:'imported'})).toBe('1 min');});
it.each([
 ['Shuttle Run 5 × 5 m', '5 × 5 m'],
 ['Easy bike 2 × 1:30', '2 × 90 sec'],
 ['Bodyweight squat 2 × 8–10', '2 × 8–10'],
 ['Shuttle Run 2 rounds of 5', '2 rounds of 5'],
])('retains the semantic form of %s', async (line, expected) => {
 const result = await AIService.importTrainingPlan(blankState().profile, `Monday\nWarm-up\n${line}\nWorkout\nBench Press 3x8`);
 expect(warmupPrescriptionLabel(result.program.days[0].warmupPlan.items[0])).toBe(expected);
});
it('preserves a trailing intensity cue and standalone rounds without timing', async () => {
 const result = await AIService.importTrainingPlan(blankState().profile, `Monday: Legs\nWarm-up\nShuttle Run 5 × 5 at 60–70 % speed\nMovement circuit 2 rounds\nWorkout\nBench Press 3x8`);
 const items = result.program.days[0].warmupPlan.items;
 expect(items[0].label).toContain('60–70 % speed');
 expect(warmupPrescriptionLabel(items[1])).toBe('2 rounds');
 expect(items.every(item => item.seconds === null && item.minutes === null)).toBe(true);
});
