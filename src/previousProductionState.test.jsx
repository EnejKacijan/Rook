import {it,expect,vi,afterEach} from 'vitest';
import fixtures from './fixtures/previousProductionState.json';
import olderFixtures from './fixtures/previousProductionState-80765c6.json';
import {hydrateStoredState,readStartupState,saveState,blankState} from './domain.js';
import {loadInitialLiftState} from './App.jsx';
import * as planHistory from './planHistory.js';
import {PRIMARY_KEY as P,INSTALL_META_KEY as M,RECOVERY_KEY as B,readRecovery,restoreLocalCheckpoint,readLocalState,assertHydrationCurrent,storageDiagnostics} from './localStateStorage.js';

afterEach(()=>vi.restoreAllMocks());
function memory(fixture) {
  const values=new Map([[P,fixture.raw],[M,fixture.metadata],[B,fixture.backup]]);
  return {values,getItem:key=>values.get(key)??null,setItem:vi.fn((key,value)=>values.set(key,String(value))),removeItem:vi.fn(key=>values.delete(key))};
}
// Keep prior writer output immutable and compare every stored domain field.
// Only neutral defaults and the approved derived duration estimate differ:
// the current automatic warm-up estimate is two minutes longer.
const currentExpected=expected=>({...expected,dismissedTemporarySchedule:null,
  ...(expected.program ? {program:{...expected.program,days:expected.program.days.map(day=>({...day,estimatedMinutes:day.estimatedMinutes+2}))}} : {}),
  profile:{preferredTrainingStyle:null,noPlanReceipt:null,...expected.profile}});
const allFixtures=[fixtures,olderFixtures].flatMap(collection=>collection.fixtures.map(fixture=>({
  ...fixture,name:`${collection.commit.slice(0,7)}/${fixture.name}`,
  // Prescriptions, sessions, elapsed durations, history and IDs stay identical.
  expected:currentExpected(fixture.expected),
})));
for(const fixture of allFixtures){
  it(`reads real previous-production writer output: ${fixture.name}`,async()=>{
    const storage=memory(fixture),result=readStartupState(storage);
    expect(result.status,`${result.code}: ${result.error?.cause?.message}`).toBe('ready');
    expect(result.state).toEqual(fixture.expected);
    expect(()=>assertHydrationCurrent(result,storage)).not.toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    for(const [key,value] of storage.values)localStorage.setItem(key,value);
    // Includes the actual account/startup boundary, not just deserialization.
    const startup=await loadInitialLiftState();
    expect(startup.status).toBe('ready');expect(startup.state).toEqual(fixture.expected);
    expect(()=>assertHydrationCurrent(startup)).not.toThrow();
  });
  it(`restores prior-schema checkpoint explicitly without changing backup: ${fixture.name}`,()=>{
    const storage=memory(fixture),prior=readRecovery(storage,hydrateStoredState);
    storage.values.set(P,'{malformed');
    expect(readStartupState(storage).status).toBe('error');
    expect(saveState(fixture.expected,{storage})).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    restoreLocalCheckpoint(storage,hydrateStoredState);
    expect(storage.getItem(B)).toBe(fixture.backup);
    expect(readStartupState(storage).state).toEqual(prior.state);
    expect(storage.getItem(P)).toBe(prior.raw);
  });
}
it.each(['{bad',JSON.stringify({...fixtures.fixtures[0].expected,schemaVersion:999})])('fails closed without touching the prior backup: %s',bad=>{
  const storage=memory(fixtures.fixtures[0]);storage.values.set(P,bad);
  expect(readStartupState(storage).status).toBe('error');
  expect(saveState(blankState(),{storage})).toBe(false);
  expect(saveState(fixtures.fixtures[0].expected,{storage})).toBe(false);
  expect(storage.setItem).not.toHaveBeenCalled();expect(storage.removeItem).not.toHaveBeenCalled();
  expect(storage.getItem(B)).toBe(fixtures.fixtures[0].backup);
});
it('migration failure invalidates the writer; read-only retry re-establishes exactly the old profile',()=>{
  const fixture=fixtures.fixtures[3],storage=memory(fixture);
  expect(readLocalState(storage,()=>{throw Error('Synthetic migration failure');})).toMatchObject({status:'error',code:'migration-error'});
  expect(saveState(fixture.expected,{storage})).toBe(false);expect(storage.setItem).not.toHaveBeenCalled();
  const retried=readStartupState(storage);expect(retried.status).toBe('ready');expect(retried.state).toEqual(currentExpected(fixture.expected));
  expect(storage.getItem(B)).toBe(fixture.backup);
});
it('disabled account rollout metadata does not make an established local profile a new user',async()=>{
  const fixture=fixtures.fixtures[0];localStorage.setItem(P,fixture.raw);localStorage.setItem(M,fixture.metadata);
  localStorage.setItem('rook-account-sync-ledger-v1',JSON.stringify({version:1,profileId:fixture.expected.profile.id,accountUid:'synthetic-account'}));
  expect((await loadInitialLiftState()).state).toEqual(currentExpected(fixture.expected));
});
it('post-read normalization failure revokes writer authority and reports its stage without overwriting data',async()=>{
  const fixture=fixtures.fixtures[0];
  for(const [key,value] of [[P,fixture.raw],[M,fixture.metadata],[B,fixture.backup]])localStorage.setItem(key,value);
  const normalize=planHistory.normalizePlanHistoryState;let calls=0;
  const spy=vi.spyOn(planHistory,'normalizePlanHistoryState').mockImplementation(state=>{
    if(++calls===2)throw Error('Synthetic post-read failure');
    return normalize(state);
  });
  const failed=await loadInitialLiftState();expect(failed.status).toBe('error');
  expect(storageDiagnostics()).toMatchObject({startupOutcome:'normalization-error',startupStage:'normalization'});
  expect(saveState({...fixture.expected,selectedDate:'2026-10-01'})).toBe(false);
  expect(localStorage.getItem(P)).toBe(fixture.raw);expect(localStorage.getItem(B)).toBe(fixture.backup);
  spy.mockRestore();const retry=await loadInitialLiftState();expect(retry.status).toBe('ready');
  expect(retry.state).toEqual(currentExpected(fixture.expected));expect(()=>assertHydrationCurrent(retry)).not.toThrow();
});
