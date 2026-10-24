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
const button=name=>[...host.querySelectorAll('button')].find(b=>b.textContent.trim()===name||b.querySelector('strong')?.textContent===name||b.getAttribute('aria-label')===name);
const click=name=>act(()=>button(name).click());

it('has one dominant CTA after the story, three secondary routes, and a shared account footer',()=>{
  expect(host.querySelector('h1').textContent).toBe('Choose your starting point.');
  const content=host.querySelector('.entry-content');
  expect([...content.children].map(n=>n.className||n.tagName)).toEqual(['H1','P']);
  expect(content.children[1].textContent).toBe('Your workouts, your plan, your progress.');
  expect(host.querySelectorAll('.button.primary')).toHaveLength(1);
  expect([...host.querySelectorAll('.entry-secondary-routes strong')].map(n=>n.textContent)).toEqual(['Bring my plan','Create workout','Freestyle']);
  expect(button('Restore backup').closest('footer')).toBeTruthy();
  expect(host.textContent).not.toMatch(/EXAMPLE WEEK|SEE HOW ROOK ADAPTS|Build my own program|My workouts/);
});
it.each([['Build my plan','personalize'],['Bring my plan','bringPlan'],['Create workout','ownWorkouts'],['Freestyle','trainFreestyle'],['Restore backup','restoreBackup']])('%s invokes only its canonical entry callback', (name,key)=>{
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
it('keeps all entry routes free with one primary action and no Pro promotion',()=>{
  const explore=vi.fn();act(()=>root.render(<EntryLanding {...actions} onExplorePro={explore}/>));
  expect(host.querySelectorAll('.button.primary')).toHaveLength(1);
  expect(host.querySelector('.entry-primary-note').textContent).toBe('A few questions to make it yours.');
  expect(explore).not.toHaveBeenCalled();
  expect(host.querySelector('.entry-explore-pro')).toBeNull();expect(host.textContent).not.toMatch(/Pro|paywall|offer/);
  expect(Object.values(actions).every(fn=>!fn.mock.calls.length)).toBe(true);
  click('Build my plan');expect(actions.personalize).toHaveBeenCalledOnce();
});
it('shows the third progress step and allows swiping backward over action buttons',()=>{
  expect(button('Back to intro')).toBeUndefined();
  const backToIntro=vi.fn();
  act(()=>root.render(<EntryLanding {...actions} backToIntro={backToIntro}/>));
  expect(host.querySelector('.welcome-dots').getAttribute('aria-label')).toBe('Page 3 of 3');
  expect(host.querySelector('[aria-label="Next introduction page"]').disabled).toBe(true);
  click('Back to intro');expect(backToIntro).toHaveBeenCalledOnce();backToIntro.mockClear();
  const swipe=target=>{
    for(const[type,x]of[['touchstart',100],['touchend',270]]){
      const event=new Event(type,{bubbles:true});
      Object.defineProperty(event,type==='touchstart'?'touches':'changedTouches',{value:[{clientX:x,clientY:160}]});
      act(()=>target.dispatchEvent(event));
    }
  };
  swipe(button('Build my plan'));expect(backToIntro).toHaveBeenCalledOnce();
  swipe(host.querySelector('h1'));expect(backToIntro).toHaveBeenCalledTimes(2);
  expect(Object.values(actions).every(fn=>fn.mock.calls.length===0)).toBe(true);
});
const touch=(target,type,x,y=160,points)=>act(()=>{
  const event=new Event(type,{bubbles:true,cancelable:true});
  Object.defineProperty(event,'touches',{value:points|| (type==='touchend'?[]:[{clientX:x,clientY:y}])});
  Object.defineProperty(event,'changedTouches',{value:[{clientX:x,clientY:y}]});
  target.dispatchEvent(event);
});
it.each([['Build my plan','personalize'],['Bring my plan','bringPlan'],['Create workout','ownWorkouts'],['Freestyle','trainFreestyle'],['Restore backup','restoreBackup']])('swipes over %s suppress their click, but a fresh tap still opens the route',(label,key)=>{
  const backToIntro=vi.fn();act(()=>root.render(<EntryLanding {...actions} backToIntro={backToIntro}/>));
  const target=button(label).querySelector('strong')||button(label);
  touch(target,'touchstart',100);touch(target,'touchmove',180);touch(target,'touchend',270);
  act(()=>target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1})));
  expect(backToIntro).toHaveBeenCalledOnce();expect(Object.values(actions).every(fn=>!fn.mock.calls.length)).toBe(true);
  touch(target,'touchstart',100);touch(target,'touchend',100);
  act(()=>target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1})));
  expect(actions[key]).toHaveBeenCalledOnce();
});
it('ignores vertical scroll and pinch gestures and does not activate a row after a short horizontal drag',()=>{
  const backToIntro=vi.fn();act(()=>root.render(<EntryLanding {...actions} backToIntro={backToIntro}/>));
  const target=button('Bring my plan');
  touch(target,'touchstart',100);touch(target,'touchmove',110,220);touch(target,'touchend',270,220);
  expect(backToIntro).not.toHaveBeenCalled();
  touch(target,'touchstart',100,160,[{clientX:100,clientY:160},{clientX:200,clientY:160}]);touch(target,'touchend',270);
  expect(backToIntro).not.toHaveBeenCalled();
  touch(target,'touchstart',100);touch(target,'touchmove',130);touch(target,'touchend',130);
  act(()=>target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1})));
  expect(backToIntro).not.toHaveBeenCalled();expect(actions.bringPlan).not.toHaveBeenCalled();
  // Keyboard activation remains available even immediately after that drag.
  act(()=>target.click());expect(actions.bringPlan).toHaveBeenCalledOnce();
});
it('bounds keyboard and horizontal wheel navigation at the final page and preserves browser zoom',()=>{
  const backToIntro=vi.fn();act(()=>root.render(<EntryLanding {...actions} backToIntro={backToIntro}/>));
  const panel=host.querySelector('.welcome-landing-carousel');
  const wheel=(deltaX,deltaY,time,deltaMode=0,ctrlKey=false)=>act(()=>{
    const event=new WheelEvent('wheel',{deltaX,deltaY,deltaMode,ctrlKey,bubbles:true});Object.defineProperty(event,'timeStamp',{value:time});panel.dispatchEvent(event);
  });
  act(()=>panel.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
  wheel(100,0,100);wheel(-100,0,400,0,true);wheel(0,100,700);expect(backToIntro).not.toHaveBeenCalled();
  wheel(-3,0,1000,1);wheel(-10,0,1040,1);expect(backToIntro).toHaveBeenCalledOnce();
  act(()=>panel.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));expect(backToIntro).toHaveBeenCalledTimes(2);
});
it('passes no demo state into the canonical builder and writes no state on entry',()=>{
  const persist=vi.spyOn(Storage.prototype,'setItem');
  act(()=>root.render(<EntryLanding {...actions}/>));
  expect(host.querySelector('.entry-demo')).toBeNull();
  expect(persist).not.toHaveBeenCalled();
  click('Build my plan');
  expect(actions.personalize).toHaveBeenCalledOnce();
  expect(actions.personalize.mock.calls[0]).toHaveLength(1);
  expect(actions.personalize.mock.calls[0][0].type).toBe('click');
  expect(actions.personalize.mock.calls[0][0].previewDays).toBeUndefined();
  expect(persist).not.toHaveBeenCalled();
});
it.each(['ownWorkouts','trainFreestyle'])('%s opens its child without trying to persist a choice',key=>{
  const persist=vi.spyOn(Storage.prototype,'setItem');click(key==='ownWorkouts'?'Create workout':'Freestyle');
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
  expect(host.textContent).toContain('weekly program day by day');expect(host.textContent).not.toContain('Create workout');
});
it('offers one quiet sign-in and account-creation entry only when the account gate supplies the route', () => {
  const signIn=vi.fn();
  act(()=>root.render(<EntryLanding {...actions} signIn={signIn}/>));
  expect(button('Sign in').closest('footer')).toBeTruthy();
  expect(button('Restore backup')).toBeTruthy();
  click('Sign in'); expect(signIn).toHaveBeenCalledOnce();
  expect(actions.personalize).not.toHaveBeenCalled();
  act(()=>root.render(<EntryLanding {...actions}/>));
  expect(button('Restore backup')).toBeTruthy(); expect(button('Sign in')).toBeUndefined();
});
it('keeps provider cancellation on the child screen without changing the Landing',async()=>{
  const back=vi.fn(),restoreBackup=vi.fn(),onSignedIn=vi.fn();
  const cancelled=Object.assign(new Error('cancel'),{code:'auth/popup-closed-by-user'});
  const signInWithGoogle=vi.fn().mockRejectedValue(cancelled);
  act(()=>root.render(<FirstRunSignIn back={back} restoreBackup={restoreBackup}
    providerReady signInWithGoogle={signInWithGoogle} onSignedIn={onSignedIn}/>));
  expect(host.querySelector('h1').textContent).toBe('Sign in or create account');
  expect(host.textContent).toContain('ROOK opens your existing profile, or creates an account if you are new.');
  expect(host.querySelector('.first-run-back-button svg path')?.getAttribute('d')).toBe('m12.5 4.5-5.5 5.5 5.5 5.5');
  expect(host.querySelector('.entry-sign-in-restore svg')).toBeTruthy();
  await act(async()=>button('CONTINUE WITH GOOGLE').click());
  expect(signInWithGoogle).toHaveBeenCalledOnce();
  expect(host.querySelector('[role="alert"]')).toBeNull(); expect(onSignedIn).not.toHaveBeenCalled();
  act(()=>host.querySelector('.entry-sign-in-restore').click());expect(restoreBackup).toHaveBeenCalledOnce();
  act(()=>host.querySelector('[aria-label="Back to start"]').click());expect(back).toHaveBeenCalledOnce();
});
