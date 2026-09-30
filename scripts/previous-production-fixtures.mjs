// Regenerate synthetic compatibility fixtures using the actual released modules,
// never the candidate's serializers/defaults. Output contains no owner data.
import {execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const commit = process.argv[2] || '3d95bdc5dab4ed127a4f04ee24e448311c946bc0';
assert.match(commit,/^[0-9a-f]{40}$/);
const root = path.resolve('artifacts/previous-production-fixtures', commit);
await mkdir(root, {recursive:true});
const sources = execFileSync('git', ['ls-tree','-r','--name-only',commit,'src'], {encoding:'utf8'}).trim().split('\n')
  .filter(file=>/\.(js|json)$/.test(file) && !file.endsWith('.test.js'));
const archive = execFileSync('git', ['archive', commit, 'package.json', ...sources], {maxBuffer:32*1024*1024});
execFileSync('tar', ['-xf', '-', '-C', root], {input:archive});
const load = file => import(pathToFileURL(path.join(root, 'src', file)));
const d = await load('domain.js');
const {createReturningUserFixture} = await load('demoFixture.js');
const {dataReliabilityFixture} = await load('dataReliability.fixture.js');
const {startFreestyleWorkout, addFreestyleExercise} = await load('freestyleWorkout.js');
const {templateDraft, saveWorkoutTemplate} = await load('savedWorkouts.js');
const {flexibleSessions, proposeFlexibleWeek, applyFlexibleWeek} = await load('flexibleWeek.js');
const storageModule = await load('localStateStorage.js');
const supportsNoPlan = sources.includes('src/trainingStyle.js');
const noPlan = style => {
  const state = d.blankState();
  // Same explicit choice written by released App.chooseNoPlan (not a migration).
  Object.assign(state.profile, {onboardingComplete:true, preferredTrainingStyle:style, noPlanReceipt:{kind:'first-run'}});
  return state;
};
const states = {
  'initialized-plan': createReturningUserFixture(0),
  'active-and-history': dataReliabilityFixture(),
};
if(supportsNoPlan)Object.assign(states,{
  'no-plan':noPlan('own-workouts'),
  'freestyle-first':addFreestyleExercise(startFreestyleWorkout(noPlan('freestyle')),'push-up'),
});
let saved = addFreestyleExercise(startFreestyleWorkout(supportsNoPlan?noPlan('own-workouts'):createReturningUserFixture(0)), 'plank');
saved = saveWorkoutTemplate(saved, {...templateDraft(saved.activeWorkout,saved),name:'Synthetic saved workout'}, {id:'prior-saved-workout'});
saved.activeWorkout = null;
states['my-workouts'] = saved;
const older = structuredClone(states['initialized-plan']);
delete older.profile.preferredTrainingStyle; delete older.profile.noPlanReceipt;
delete older.savedWorkoutTemplates;
states['missing-optional-fields'] = older;
const temporary = createReturningUserFixture(0);
const today = d.isoDay();
const sessions = flexibleSessions(temporary, today).filter(s=>s.scheduledDate>=today);
assert.ok(sessions.length>=2);
const proposal = proposeFlexibleWeek(temporary, {mode:'swap',sessionId:sessions[0].logicalSessionId,otherSessionId:sessions[1].logicalSessionId}, today);
assert.equal(proposal.status,'ready');
states['temporary-schedule'] = applyFlexibleWeek(temporary,proposal).state;
const fixtures = [];
for (const [name,input] of Object.entries(states)) {
  // Released startup establishes IDs before its ordinary writer runs.
  const state = d.hydrateStoredState(input);
  if(name==='missing-optional-fields') {
    delete state.profile.preferredTrainingStyle; delete state.profile.noPlanReceipt;
    delete state.savedWorkoutTemplates;
  }
  const entries = new Map([[storageModule.PRIMARY_KEY,d.serializeState(state)]]);
  const storage = {getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,String(v)),removeItem:k=>entries.delete(k)};
  assert.equal(storageModule.readLocalState(storage,d.hydrateStoredState).status,'ready',`${name}: prior release accepts its state`);
  state.profile.name = 'Synthetic compatibility profile';
  assert.equal(d.saveState(state,{storage}),true,`${name}: prior production writer succeeds`);
  const raw = storage.getItem(storageModule.PRIMARY_KEY);
  fixtures.push({name,raw,expected:d.hydrateStoredState(raw),metadata:storage.getItem(storageModule.INSTALL_META_KEY),backup:storage.getItem(storageModule.RECOVERY_KEY)});
}
await mkdir('src/fixtures',{recursive:true});
await writeFile(`src/fixtures/previousProductionState${process.argv[2]?'-'+commit.slice(0,7):''}.json`,JSON.stringify({commit,producer:'scripts/previous-production-fixtures.mjs',fixtures}));
console.log(JSON.stringify({commit,fixtures:fixtures.map(f=>({name:f.name,bytes:f.raw.length,backup:!!f.backup}))},null,2));
