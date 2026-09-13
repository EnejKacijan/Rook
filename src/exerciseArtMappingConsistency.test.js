// @vitest-environment node
import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {exerciseCatalog,matchImportedExerciseName} from './domain.js';

it.each([
  ['step-down','wg-step-down'],
  ['hip-adduction-machine','wg-hip-adduction-machine'],
  ['high-to-low-cable-fly','wg-rook-high-to-low-cable-fly'],
  ['preacher-curl','wg-preacher-curl'],
  ['machine-preacher-curl','wg-rook-machine-preacher-curl'],
  ['wg-preacher-curl','wg-rook-machine-preacher-curl'],
  ['bodyweight-split-squat','wg-rook-bodyweight-split-squat'],
])('%s resolves to its reviewed apparatus-specific drawing',(id,artId)=>{
  expect(exerciseCatalog[id].artId).toBe(artId);
  expect(readFileSync(new URL(`./assets/exercise-art/${artId}.svg`,import.meta.url),'utf8')).toContain('<svg');
});

it.each([
  ['Step-down','wg-step-down'],
  ['Adductor','wg-hip-adduction-machine'],
  ['EZ-Bar Preacher Curl','wg-preacher-curl'],
  ['Machine Biceps Curl','wg-rook-machine-preacher-curl'],
  ['High-to-Low Cable Fly','wg-rook-high-to-low-cable-fly'],
  ['Bodyweight Split Squat','wg-rook-bodyweight-split-squat'],
])('alias %s retains the correct artwork',(name,artId)=>{
  const match=matchImportedExerciseName(name);
  expect(exerciseCatalog[match.exerciseId]?.artId).toBe(artId);
});

it('does not confuse related exercises or mutate training equipment to fit a drawing',()=>{
  for(const [a,b] of [['step-down','step-up'],['hip-adduction-machine','hip-abduction-machine'],['high-to-low-cable-fly','cable-fly'],['preacher-curl','machine-preacher-curl']])
    expect(exerciseCatalog[a].artId).not.toBe(exerciseCatalog[b].artId);
  expect(exerciseCatalog['preacher-curl'].equipment).toEqual(['barbell','bench']);
  expect(exerciseCatalog['machine-preacher-curl'].equipment).toEqual(['machines']);
  expect(exerciseCatalog['wg-preacher-curl'].equipment).toEqual(['machines']);
  expect(exerciseCatalog['bodyweight-split-squat'].equipment).toEqual(['bodyweight']);
});
