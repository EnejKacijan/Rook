// Synthetic notes only. No private user notes belong in the fixture corpus.
export const importHardeningFixtures = [
  {name:'A clean standard',text:'MON - Push\nBench Press 3x6-8 RIR 2\nCable Fly 2x10-15 RIR 1',days:1,exercises:2,issues:[]},
  {name:'B minimal shorthand',text:'Push\nBench 3x8\nFly 2x12\nTri pushdown 3x10',days:1,exercises:3,issues:['day']},
  {name:'C messy Apple Notes',text:'PUSH!!!\n• incline db press — 3 x 8-12 @2\n• chest supported row 3x10\nlast set AMRAP\n• cable fly: 2 sets x 12-15',days:1,exercises:3,issues:['day','rir']},
  {name:'D decimal comma',text:'Incline Press\n3 x 8\n32,5 kg',days:1,exercises:1,issues:['day']},
  {name:'E mixed units',text:'Monday\nBench 70kg 3x8\nDB Curl 25 lb 3x10',days:1,exercises:2,issues:[]},
  {name:'F RPE',text:'Monday\nSquat 3x5 @ RPE 8',days:1,exercises:1,issues:['rir']},
  {name:'G supersets',text:'Monday\nA1 Cable Fly 3x12\nA2 Lateral Raise 3x15\nB1 Curl 3x10\nB2 Pushdown 3x10',days:1,exercises:4,issues:[]},
  {name:'H working sets with unlabelled ramps',text:'Bench\nWarm up:\n20x10\n40x5\n60x3\nWorking:\n70kg 3x6-8 @1',days:1,exercises:1,issues:['day','rir','source']},
  {name:'I advanced',text:'Monday\nLat Pulldown 2x8-10\nSet 3 AMRAP\nLateral Raise 2x12 + drop set',days:1,exercises:2,issues:['advanced']},
  {name:'J numbered days',text:'Day 1 - Upper\nBench Press 3x8\nDay 2 - Lower\nLeg Press 3x10',days:2,exercises:2,issues:['day']},
  {name:'K Slovenian days',text:'PON - Push\nBench Press 3x8\nSRE - Pull\nCable Row 3x8\nPET - Legs\nLeg Press 3x8',days:3,exercises:3,issues:[]},
  {name:'L typo and alias candidate',text:'Monday\nLat pulldowm 3x8\nPrime incline 3x10',days:1,exercises:2,issues:[]},
  {name:'M ambiguous identity',text:'Monday\nIncline Press 3x10',days:1,exercises:1,issues:[]},
  {name:'N comments',text:'Push\nBench 3x8\nTry to beat last week if reps are clean\nCable Fly 2x12',days:1,exercises:2,issues:['day','source']},
  {name:'O duplicate day',text:'Monday - Push\nBench Press 3x8\nMonday - Pull\nCable Row 3x10',days:2,exercises:2,issues:['day']},
  {name:'P multi-week',text:'Week 1\nBench 3x8 @3\nWeek 2\nBench 3x8 @2\nWeek 3\nBench 3x8 @1',unsupported:true},
  {name:'Q history-like unlabelled load',text:'Bench\n70x8\n70x8\n70x7',unsupported:true},
  {name:'R custom machine',text:'Monday\nPrime Plate Loaded Incline Press 3x8',days:1,exercises:1,issues:[]},
  {name:'S long plan',text:['Monday','Tuesday','Wednesday','Thursday','Friday'].map(day=>`${day}\n${['Bench Press','Cable Fly','Cable Row','Lat Pulldown','Dumbbell Curl','Leg Press','Leg Curl','Calf Raise'].map(name=>`${name} 2x8`).join('\n')}`).join('\n'),days:5,exercises:40,issues:[]},
  // Hybrid import now preserves this explicitly incomplete exercise instead of
  // excluding it. Unknown prose is retained in source notes, not executable work.
  {name:'T malformed partial',text:'Monday\nBench Press 3x8\n???\nCable Fly - missing sets\nunknown meaningful instruction',days:1,exercises:2,issues:['prescription']},
];
