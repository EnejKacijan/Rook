import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {EntryLanding,BringPlanLanding,FirstRunSignIn} from './App.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root,actions;
beforeEach(()=>{
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  actions=Object.fromEntries(['personalize','ownWorkouts','trainFreestyle','bringPlan','restoreBackup'].map(key=>[key,vi.fn()]));
  act(()=>root.render(<EntryLanding {...actions}/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();});
const button=name=>[...host.querySelectorAll('button')].find(b=>b.textContent.trim()===name||b.querySelector('strong')?.textContent===name);
const click=name=>act(()=>button(name).click());

it('has one dominant CTA after the hero, three secondary routes, and top Restore',()=>{
  expect(host.querySelector('h1').textContent).toBe('A plan that fits your week.');
  const content=host.querySelector('.entry-content');
  expect([...content.children].map(n=>n.className||n.tagName)).toEqual(['H1','P','entry-primary-action']);
  expect(content.children[1].textContent).toBe('Tell ROOK your goal, schedule and equipment. It builds the plan around them.');
  expect(host.querySelectorAll('.button.primary')).toHaveLength(1);
  expect([...host.querySelectorAll('.entry-secondary-routes strong')].map(n=>n.textContent)).toEqual(['Bring my plan','Create a workout','Freestyle']);
  expect(button('Restore').parentElement.className).toBe('entry-top');
  expect(host.textContent).not.toMatch(/EXAMPLE WEEK|SEE HOW ROOK ADAPTS|Build my own program|My workouts/);
});
it.each([['BUILD MY PLAN','personalize'],['Bring my plan','bringPlan'],['Create a workout','ownWorkouts'],['Freestyle','trainFreestyle'],['Restore','restoreBackup']])('%s invokes only its canonical entry callback', (name,key)=>{
  click(name);expect(actions[key]).toHaveBeenCalledOnce();
  expect(actions[key].mock.calls[0][0]?.previewDays).toBeUndefined();
  Object.entries(actions).filter(([k])=>k!==key).forEach(([,fn])=>expect(fn).not.toHaveBeenCalled());
});
it('renders no landing demo, selectors, selected day, or exercise inspector',()=>{
  expect(host.querySelector('.entry-demo')).toBeNull();
  expect(host.querySelector('.entry-example-week')).toBeNull();
  expect(document.body.querySelector('.entry-equipment-sheet')).toBeNull();
  expect(host.textContent).not.toMatch(/Example only|training days · Full gym|Tap a day to explore/);
});
it('passes no demo state into the canonical builder and writes no state on entry',()=>{
  const persist=vi.spyOn(Storage.prototype,'setItem');
  act(()=>root.render(<EntryLanding {...actions}/>));
  expect(host.querySelector('.entry-demo')).toBeNull();
  expect(persist).not.toHaveBeenCalled();
  click('BUILD MY PLAN');
  expect(actions.personalize).toHaveBeenCalledOnce();
  expect(actions.personalize.mock.calls[0]).toHaveLength(1);
  expect(actions.personalize.mock.calls[0][0].type).toBe('click');
  expect(actions.personalize.mock.calls[0][0].previewDays).toBeUndefined();
  expect(persist).not.toHaveBeenCalled();
});
it.each(['ownWorkouts','trainFreestyle'])('%s opens its child without trying to persist a choice',key=>{
  const persist=vi.spyOn(Storage.prototype,'setItem');click(key==='ownWorkouts'?'Create a workout':'Freestyle');
  expect(actions[key]).toHaveBeenCalledOnce();expect(persist).not.toHaveBeenCalled();
});
it('retains the separate-profile return path and its failure message',async()=>{
  const returnToSavedProfile=vi.fn().mockRejectedValue(new Error('Protected profile remains saved'));
  act(()=>root.render(<EntryLanding {...actions} returnToSavedProfile={returnToSavedProfile}/>));
  await act(async()=>button('Return to saved profile').click());
  expect(returnToSavedProfile).toHaveBeenCalledOnce();expect(host.querySelector('[role="alert"]').textContent).toBe('Protected profile remains saved');
});
it('Bring my plan keeps manual weekly creation distinct from reusable workouts',()=>{
  const back=vi.fn(),importPlan=vi.fn(),startFromScratch=vi.fn();
  act(()=>root.render(<BringPlanLanding back={back} importPlan={importPlan} startFromScratch={startFromScratch}/>));
  expect(host.querySelector('.first-run-back-button svg path')?.getAttribute('d')).toBe('m12.5 4.5-5.5 5.5 5.5 5.5');
  expect(host.querySelectorAll('.entry-action-row > svg')).toHaveLength(2);
  click('Import a plan');expect(importPlan).toHaveBeenCalledOnce();
  click('Enter it myself');expect(startFromScratch).toHaveBeenCalledOnce();
  act(()=>host.querySelector('[aria-label="Back to start"]').click());expect(back).toHaveBeenCalledOnce();
  expect(host.textContent).toContain('weekly program day by day');expect(host.textContent).not.toContain('Create a workout');
});
it('offers a quiet returning-user Sign in only when the existing account gate supplies the route', () => {
  const signIn=vi.fn();
  act(()=>root.render(<EntryLanding {...actions} signIn={signIn}/>));
  expect(button('Sign in').parentElement.className).toBe('entry-top');
  expect(button('Restore')).toBeUndefined();
  click('Sign in'); expect(signIn).toHaveBeenCalledOnce();
  expect(actions.personalize).not.toHaveBeenCalled();
  act(()=>root.render(<EntryLanding {...actions}/>));
  expect(button('Restore')).toBeTruthy(); expect(button('Sign in')).toBeUndefined();
});
it('keeps provider cancellation on the child screen without changing the Landing',async()=>{
  const back=vi.fn(),restoreBackup=vi.fn(),onSignedIn=vi.fn();
  const cancelled=Object.assign(new Error('cancel'),{code:'auth/popup-closed-by-user'});
  const signInWithGoogle=vi.fn().mockRejectedValue(cancelled);
  act(()=>root.render(<FirstRunSignIn back={back} restoreBackup={restoreBackup}
    providerReady signInWithGoogle={signInWithGoogle} onSignedIn={onSignedIn}/>));
  expect(host.querySelector('.first-run-back-button svg path')?.getAttribute('d')).toBe('m12.5 4.5-5.5 5.5 5.5 5.5');
  expect(host.querySelector('.entry-sign-in-restore svg')).toBeTruthy();
  await act(async()=>button('CONTINUE WITH GOOGLE').click());
  expect(signInWithGoogle).toHaveBeenCalledOnce();
  expect(host.querySelector('[role="alert"]')).toBeNull(); expect(onSignedIn).not.toHaveBeenCalled();
  act(()=>host.querySelector('.entry-sign-in-restore').click());expect(restoreBackup).toHaveBeenCalledOnce();
  act(()=>host.querySelector('[aria-label="Back to start"]').click());expect(back).toHaveBeenCalledOnce();
});
