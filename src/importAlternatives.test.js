import {expect,it,describe} from 'vitest';
import {ALTERNATIVE_WORDS,analyzeImportAlternatives as analyze} from './importAlternatives.js';
import {AIService} from './aiService.js';
import {blankState} from './domain.js';
const connectors=[...ALTERNATIVE_WORDS,'/','または','もしくは','或者','或是','또는','혹은'];
describe('explicit alternative connectors',()=>{
 for(const connector of connectors){
  it.each(['separate','shared'])(`${connector}: %s targets retain every branch`,kind=>{
   const source=kind==='separate'?`Bench Press 3×8 80kg ${connector} Push-ups 2x12`:`Bench Press ${connector} Push-ups 3x8–10`;
   const result=analyze(source);expect(result.detected).toBe(true);expect(result.requiresSourceEdit).toBe(false);expect(result.options.map(option=>option.name)).toEqual(['Bench Press','Push-ups']);
   expect(result.options.map(option=>option.sets)).toEqual(kind==='separate'?[3,2]:[3,3]);expect(result.options[1].weight).toBeNull();
  });
 }
});
it.each(['Leg Press3x8/Hack Squat3x10','3x8 Bench Press or Push-ups','Bench Press\nor Push-ups 3x8','Bench Press或者Push-ups 3x8','BENCH PRESS OR PUSH-UPS 3x8','Bench Press or Push-ups 3 sets of 8','Bench Press 3x8 to 12 or Push-ups 3x10','Bench Press 3 Sätze à 8 oder Push-ups 3 Sätze à 10'])('spacing and case: %s',source=>{
 expect(analyze(source).options).toHaveLength(2);
});
it('three branches preserve all choices and never share a branch load',()=>{
 const result=analyze('Bench Press or Push-ups or Chest Press 3x8 185 lb');
 expect(result.options).toHaveLength(3);expect(result.options.map(option=>option.weight)).toEqual([null,null,185*0.45359237]);
 expect(result.options[2].sourceUnit).toBe('lb');expect(result.options[2].sourceWeight).toBe(185);
});
it('branch metadata stays attached to its own prescription',()=>{
 const result=analyze('Dumbbell Curl 3x8 36,25kg @ 2 RIR per side rest 90 sec or Cable Curl 2x10 25 lb @ 0 RIR');
 expect(result.options[0]).toMatchObject({weight:36.25,targetRir:2,loggingMode:'per_side',restSeconds:90});
 expect(result.options[1]).toMatchObject({weight:25*0.45359237,targetRir:0,loggingMode:'normal',restSeconds:null});
});
it('timed targets are explicitly represented, not silently converted to reps',()=>{
 expect(analyze('Plank or Wall Sit 2x30 sec').options.map(option=>option.measure)).toEqual(['seconds','seconds']);
});
it.each([
 'Floor Press 3x8','Pullover 3x8','Lateral Raise 3x8','Romanian Deadlift 3x8',
 'Bench Press 3 sets of 8','Bench Press 3 sets of 8 reps',
 'Range of motion drill 3x8','Front of thigh stretch 3x8',
 'Dumbbell Curl 3x8 /stran','Dumbbell Curl 3x8 / leg','Dumbbell Curl 3x8 left/right',
 'Dumbbell Curl 3x8 (left/right)','Dumbbell Curl 3x8 L / R',
 'Bench Press 3x8 50 kg/lb','Bench Press 3x8 50 kg / lb,','Bench Press 3x8/10/12',
 'Bench Press 3x8 or stop if uncomfortable','Bench Press 3x8 or fewer reps',
 'Bench Press 3x8 per side','Bench Press 3x8\n30kg 3x8',
])('does not confuse notation or instructions with exercise alternatives: %s',source=>{
 expect(analyze(source).detected).toBe(false);
});
it.each([
 'Bench Press 3x8 or Push-ups','Bench Press or Push-ups',
 'Bench Press (or Push-ups) 3x8','Bench Press 3x8 / Mystery 3x',
 'Bench Press 3x8 50 or Push-ups 3x8','Bench Press 3x8 -20kg or Push-ups 3x8',
 'Bench Press 3x8 RPE 8 or Push-ups 3x8','Bench Press 3x8 80% or Push-ups 3x8',
 'Bench Press 3x8 drop set or Push-ups 3x8','Bench Press 3x8 foobar Push-ups 3x8',
 'Bench Press 0x8 or Push-ups 3x8','Bench Press 21x8 or Push-ups 3x8',
 'Bench Press -3x8 or Push-ups 3x8',
 'Bench Press 3x10–8 or Push-ups 3x8','Bench Press 3x8 or or Push-ups 3x8',
 'or Push-ups 3x8','Bench Press 3x8 or Push-ups 3x8 or',
])('uncertain syntax has no partial first-choice escape: %s',source=>{
 const result=analyze(source);expect(result.detected).toBe(true);expect(result.requiresSourceEdit).toBe(true);expect(result.options).toEqual([]);
});
it.each([
 ['Potisk s prsi','Sklece','ali'],['Bankdrücken','Liegestütze','oder'],['Développé couché','Pompes','ou'],
 ['Press de banca','Flexiones','o'],['Supino','Flexões','ou'],['Panca piana','Piegamenti','oppure'],
 ['Жим лёжа','Отжимания','или'],['ベンチプレス','腕立て伏せ','または'],['卧推','俯卧撑','或者'],
])('preserves foreign identities verbatim: %s / %s',async(first,second,join)=>{
 const source=`MONDAY\n${first} ${join} ${second} 3x8`;
 const result=await AIService.importTrainingPlan(blankState().profile,source,{review:true});
 const choice=result.sourceReview.issues.find(issue=>issue.field==='alternative');
 expect(choice.options.map(option=>option.name)).toEqual([first,second]);expect(choice.options.map(option=>option.repMin)).toEqual([8,8]);
 expect(result.program.importMetadata.sourceNotes[0].text).toContain(source);
});
it('malformed branches never return only their valid siblings',()=>{
 for(let n=0;n<150;n++){
  const bad=['0x8','21x8','3x0','3x10-2','3x8 50','3x8 RPE 8'][n%6];
  const result=analyze(`Bench Press ${1+n%20}x8 or Unknown ${bad} or Push-ups 3x12`);
  expect(result.detected).toBe(true);expect(result.options).toEqual([]);expect(result.requiresSourceEdit).toBe(true);
 }
});
it('caps branch complexity without partial interpretation',()=>{
 const result=analyze(Array.from({length:100},(_,i)=>`Movement ${i} 3x8`).join(' or '));expect(result.requiresSourceEdit).toBe(true);expect(result.options).toEqual([]);
 expect(analyze(`${'a'.repeat(50000)} 3x8 or Push-ups 3x8`).options).toHaveLength(2);
});
for(const connector of ALTERNATIVE_WORDS)it(`actual import requires a decision for ${connector}`,async()=>{
 const source=`MONDAY\nBench Press 3x8 80kg ${connector} Push-ups 3x12`;
 const result=await AIService.importTrainingPlan(blankState().profile,source,{review:true});
 const issues=result.sourceReview.issues.filter(issue=>issue.category!=='preserved');
 expect(issues.map(issue=>issue.field)).toEqual(['alternative']);expect(issues[0].options).toHaveLength(2);
 expect(result.program.importMetadata.sourceNotes.map(note=>note.text).join('\n')).toContain(source);
});
it.each(['Bench Press 3x8\nor Push-ups 3x10','Bench Press 3x8\nRow or Lat Pulldown','Bench Press (or Push-ups) 3x8'])('actual import blocks unsupported scope without dropping the fragment: %s',async(line)=>{
 const result=await AIService.importTrainingPlan(blankState().profile,`MONDAY\n${line}`,{review:true});
 const issue=result.sourceReview.issues.find(issue=>issue.field==='alternative');expect(issue.requiresSourceEdit).toBe(true);expect(issue.options).toEqual([]);
 expect(result.program.importMetadata.sourceNotes.map(note=>note.text).join('\n')).toContain(line);
});
