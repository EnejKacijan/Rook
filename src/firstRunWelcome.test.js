import {beforeEach,expect,it} from 'vitest';
import {blankState} from './domain.js';
import {INSTALL_META_KEY,PRIMARY_KEY} from './localStateStorage.js';
import {acknowledgeFirstRunWelcome,FIRST_RUN_WELCOME_KEY,hasSeenFirstRunWelcome,initialFirstRunEntry,shouldShowFirstRunWelcome} from './firstRunWelcome.js';

beforeEach(()=>localStorage.clear());
const fresh={status:'empty',firstRunVerified:true};
it('opens only after the existing startup gate proves a genuinely empty first run',()=>{
  const state=blankState(),before=structuredClone(state);
  expect(initialFirstRunEntry(fresh,state)).toBe('welcome');
  for(const startup of [{status:'loading'},{status:'error'},{status:'account-recovery'},{...fresh,firstRunVerified:false},{...fresh,restoredFromCloud:true}])
    expect(shouldShowFirstRunWelcome(startup,state)).toBe(false);
  expect(state).toEqual(before);expect(localStorage.getItem(PRIMARY_KEY)).toBeNull();
});
it('never interrupts an existing profile, active workout, history or explicit profile reset',()=>{
  const state=blankState();
  for(const next of [{...state,profile:{...state.profile,onboardingComplete:true}}, {...state,program:{}}, {...state,activeWorkout:{}}, {...state,activeOptionalSession:{}}, {...state,workouts:[{}]}])
    expect(shouldShowFirstRunWelcome(fresh,next)).toBe(false);
  expect(shouldShowFirstRunWelcome({status:'ready',firstRunVerified:true},state)).toBe(false);
  localStorage.setItem(INSTALL_META_KEY,JSON.stringify({explicitDeleteAt:'2026-10-20T10:00:00Z'}));
  expect(shouldShowFirstRunWelcome(fresh,state)).toBe(false);
});
it('records one optional installation preference without writing a plan or profile',()=>{
  const state=blankState();
  acknowledgeFirstRunWelcome();expect(hasSeenFirstRunWelcome()).toBe(true);
  expect(shouldShowFirstRunWelcome(fresh,state)).toBe(false);
  expect(initialFirstRunEntry({...fresh,status:'ready'},state)).toBeNull();
  expect(localStorage.length).toBe(1);expect(localStorage.getItem(FIRST_RUN_WELCOME_KEY)).toBe('seen');
});
it('does not repeat the welcome when updating an unfinished existing installation',()=>{
  expect(initialFirstRunEntry({status:'ready',firstRunVerified:true},blankState())).toBe('personalize');
  expect(initialFirstRunEntry({status:'ready',firstRunVerified:false},blankState())).toBeNull();
});
it('keeps optional preference failures out of recovery and navigation',()=>{
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('full');}};
  expect(shouldShowFirstRunWelcome(fresh,blankState(),blocked)).toBe(false);
  expect(()=>acknowledgeFirstRunWelcome(blocked)).not.toThrow();
});
