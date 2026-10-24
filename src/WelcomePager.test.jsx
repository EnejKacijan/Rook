import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {FirstRunWelcome,WELCOME_PAGE_KEY} from './FirstRunWelcome.jsx';
import {FirstRunNavigation} from './FirstRunNavigation.jsx';
import {EntryLanding,Stepper} from './App.jsx';
import {acknowledgeFirstRunWelcome,FIRST_RUN_WELCOME_KEY} from './firstRunWelcome.js';
import {PRIMARY_KEY} from './localStateStorage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,continued,actions;
function Flow({startAtLanding=false}){
  const [route,setRoute]=useState('landing');
  const open=key=>()=>{actions[key]();setRoute(key);};
  return <FirstRunNavigation mode={route}>{name=>name==='landing'
    ?<FirstRunWelcome Stepper={Stepper} startAtLanding={startAtLanding} onContinue={continued}
      onSignIn={open('sign-in')} onRestore={open('restore')}
      renderLanding={pager=><EntryLanding {...pager} personalize={open('personalize')} bringPlan={open('bring')} ownWorkouts={open('create-workout')} trainFreestyle={open('freestyle-confirm')} signIn={open('sign-in')} restoreBackup={open('restore')}/>}/>
    :<main className="onboarding"><button aria-label="Back to start" onClick={()=>setRoute('landing')}>Back</button><h1>{name}</h1><input aria-label="Draft" defaultValue="Keep my draft"/></main>}
  </FirstRunNavigation>;
}
beforeEach(()=>{
  localStorage.clear();localStorage.setItem(PRIMARY_KEY,'training data unchanged');
  vi.useFakeTimers();vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class{observe(){} disconnect(){}});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:390,bottom:800,width:390,height:800});
  HTMLElement.prototype.getAnimations=()=>[];
  HTMLElement.prototype.animate=vi.fn(()=>({cancel(){}}));
  actions=Object.fromEntries(['personalize','bring','create-workout','freestyle-confirm','sign-in','restore'].map(key=>[key,vi.fn()]));
  continued=vi.fn(()=>acknowledgeFirstRunWelcome());
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root?.unmount());host?.remove();localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const mount=(props={})=>act(()=>root.render(<Flow {...props}/>));
const pager=()=>host.querySelector('.welcome-pager');
const active=()=>host.querySelector('.welcome-pager-page[data-active]');
const route=()=>host.querySelector('.first-run-page:not([hidden])');
const button=label=>[...route().querySelectorAll('button')].filter(node=>!node.closest('[inert]')).find(node=>node.textContent.trim()===label||node.getAttribute('aria-label')===label||node.querySelector('strong')?.textContent===label);
const click=label=>act(()=>button(label).click());
const settle=()=>act(()=>vi.advanceTimersByTime(250));
const touch=(target,type,x,y=200,points)=>act(()=>{
  const event=new Event(type,{bubbles:true,cancelable:true});
  Object.defineProperty(event,'touches',{value:points||(type==='touchend'?[]:[{clientX:x,clientY:y}])});
  Object.defineProperty(event,'changedTouches',{value:[{clientX:x,clientY:y}]});target.dispatchEvent(event);
});
const swipe=(target,from,to)=>{touch(target,'touchstart',from);touch(target,'touchmove',to);touch(target,'touchend',to);};

it('keeps all three pages in one physical track and one retained route, in both directions',()=>{
  mount();const samePager=pager(),track=pager().querySelector('.welcome-pager-track');
  const pages=[...pager().querySelectorAll('.welcome-pager-page')];expect(pages).toHaveLength(3);
  for(let index=0;index<3;index++){
    expect(active()).toBe(pages[index]);expect(active().getAttribute('aria-label')).toBe(`${index+1} of 3`);
    expect(route().dataset.firstRunPage).toBe('landing');expect(pager()).toBe(samePager);
    expect(pager().querySelector('.welcome-pager-track')).toBe(track);
    expect(pages.filter(node=>!node.hasAttribute('inert'))).toEqual([pages[index]]);
    expect(document.querySelector('[data-swipe-parent]')).toBeNull();
    if(index<2)click('Next introduction page');
  }
  click('Back to intro');expect(active()).toBe(pages[1]);
  click('Previous introduction page');expect(active()).toBe(pages[0]);
  expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
  expect(localStorage.getItem(PRIMARY_KEY)).toBe('training data unchanged');
});

it.each([0,1])('tracks a partial drag into page %i+1, including the final landing, without replacing either page',index=>{
  localStorage.setItem(WELCOME_PAGE_KEY,String(index));mount();const samePager=pager(),outgoing=active();
  touch(outgoing,'touchstart',280);touch(outgoing,'touchmove',200);
  expect(pager().dataset.dragging).toBe('true');expect(pager().style.getPropertyValue('--welcome-drag')).toBe('-80px');
  expect(active()).toBe(outgoing);expect(pager().querySelectorAll('.welcome-pager-page')).toHaveLength(3);
  touch(outgoing,'touchend',200);
  expect(pager()).toBe(samePager);expect(pager().dataset.page).toBe(String(index+2));
  expect(pager().hasAttribute('data-dragging')).toBe(false);expect(pager().style.getPropertyValue('--welcome-drag')).toBe('0px');
  expect(document.querySelector('[data-swipe-parent]')).toBeNull();
});

it.each([['Bring my plan','bring'],['Create workout','create-workout'],['Freestyle','freestyle-confirm'],['Build my plan','personalize']])('%s can be swiped across, then tapped and returned to the same third panel',(label,key)=>{
  mount({startAtLanding:true});const samePager=pager(),third=active(),target=button(label);
  swipe(target,100,240);
  act(()=>target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1})));
  expect(pager().dataset.page).toBe('2');expect(actions[key]).not.toHaveBeenCalled();
  click('Next introduction page');expect(active()).toBe(third);
  touch(target,'touchstart',100);touch(target,'touchend',100);
  click(label);settle();expect(route().dataset.firstRunPage).toBe(key);
  click('Back to start');settle();expect(pager()).toBe(samePager);expect(active()).toBe(third);
});

it('cancels short, vertical and multitouch drags without opening a route or changing the page',()=>{
  mount({startAtLanding:true});const target=button('Bring my plan');
  touch(target,'touchstart',100);touch(target,'touchmove',130);touch(target,'touchend',130);
  act(()=>target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1})));
  expect(actions.bring).not.toHaveBeenCalled();expect(pager().dataset.page).toBe('3');
  touch(target,'touchstart',100);touch(target,'touchmove',105,250);touch(target,'touchend',260,250);
  expect(pager().dataset.page).toBe('3');
  touch(target,'touchstart',100);touch(target,'touchmove',180);
  touch(target,'touchstart',190,200,[{clientX:190,clientY:200},{clientX:250,clientY:200}]);
  expect(pager().style.getPropertyValue('--welcome-drag')).toBe('0px');
  touch(target,'touchend',250);expect(pager().dataset.page).toBe('3');
  expect(pager().style.getPropertyValue('--welcome-drag')).toBe('0px');
  expect(continued).not.toHaveBeenCalled();
});

it('skips directly to the functional third panel, marks only the presentation as seen and allows replay',()=>{
  mount();click('Skip intro');expect(pager().dataset.page).toBe('3');
  expect(continued).toHaveBeenCalledOnce();expect(localStorage.getItem(FIRST_RUN_WELCOME_KEY)).toBe('seen');
  expect(localStorage.getItem(PRIMARY_KEY)).toBe('training data unchanged');
  expect(Object.values(actions).every(fn=>!fn.mock.calls.length)).toBe(true);
  click('Back to intro');expect(pager().dataset.page).toBe('2');click('Skip intro');expect(pager().dataset.page).toBe('3');
});

it('dissolves a skipped sequence with only the outgoing and destination panels, then clears the outgoing panel',()=>{
  mount();const first=active(),track=pager().querySelector('.welcome-pager-track');
  click('Skip intro');
  expect(pager().dataset.jumping).toBe('true');
  expect(pager().querySelectorAll('[data-leaving]')).toHaveLength(1);
  expect(first.hasAttribute('data-leaving')).toBe(true);
  expect(first.hasAttribute('inert')).toBe(true);
  expect(active().getAttribute('aria-label')).toBe('3 of 3');
  expect(pager().querySelector('.welcome-pager-track')).toBe(track);
  act(()=>vi.advanceTimersByTime(300));
  expect(pager().hasAttribute('data-jumping')).toBe(false);
  expect(pager().querySelector('[data-leaving]')).toBeNull();
  expect(pager().dataset.page).toBe('3');
});

it('can swipe back during a dissolve without a stale timer or outgoing panel taking over the new page',()=>{
  mount();click('Skip intro');
  const target=button('Bring my plan');
  touch(target,'touchstart',100);touch(target,'touchmove',180);
  expect(pager().hasAttribute('data-jumping')).toBe(false);
  expect(pager().querySelector('[data-leaving]')).toBeNull();
  expect(pager().dataset.dragging).toBe('true');
  touch(target,'touchend',180);
  expect(pager().dataset.page).toBe('2');
  act(()=>vi.advanceTimersByTime(500));
  expect(pager().dataset.page).toBe('2');
  expect(active().getAttribute('aria-label')).toBe('2 of 3');
  expect(continued).toHaveBeenCalledOnce();
});

it('keeps keyboard and wheel page changes bounded and ignores input-owned arrows',()=>{
  mount({startAtLanding:true});
  const key=value=>act(()=>pager().dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true})));
  key('ArrowRight');expect(pager().dataset.page).toBe('3');key('ArrowLeft');expect(pager().dataset.page).toBe('2');
  act(()=>pager().dispatchEvent(new WheelEvent('wheel',{deltaX:-60,bubbles:true})));
  expect(pager().dataset.page).toBe('1');
  act(()=>pager().dispatchEvent(new WheelEvent('wheel',{deltaX:-120,bubbles:true,ctrlKey:true})));
  expect(pager().dataset.page).toBe('1');
  click('Skip intro');click('Build my plan');settle();
  act(()=>route().querySelector('input').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));
  expect(route().dataset.firstRunPage).toBe('personalize');
});

it('restores keyboard focus into the new active page without creating route animation',()=>{
  mount();const next=button('Next introduction page');next.focus();click('Next introduction page');
  expect(active().contains(document.activeElement)).toBe(true);
  click('Next introduction page');
  expect(active().contains(document.activeElement)).toBe(true);
  expect(document.activeElement.getAttribute('aria-label')).toBe('Back to intro');
  expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
});

it('explores an isolated sample week, enters the sample logger and preserves demo choices only for this opening',()=>{
  mount();
  const day=name=>active().querySelector(`.week-strip button[aria-label^="${name} "]`);
  const choose=name=>act(()=>{day(name).focus();day(name).click();});
  const saved=()=>Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)]));
  const before=saved();
  expect(active().querySelectorAll('.week-strip button')).toHaveLength(7);
  expect(active().querySelector('.welcome-sample-day').textContent).toContain('Full Body A');
  expect(day('Monday').getAttribute('aria-pressed')).toBe('true');
  choose('Wednesday');expect(active().querySelector('.welcome-sample-day').textContent).toContain('Full Body B');
  expect(day('Wednesday').getAttribute('aria-pressed')).toBe('true');
  expect(document.activeElement).toBe(day('Wednesday'));
  expect(day('Monday').getAttribute('aria-pressed')).toBe('false');
  choose('Friday');expect(active().querySelector('.welcome-sample-day').textContent).toContain('Full Body C');
  for(const name of ['Tuesday','Thursday','Saturday','Sunday']){
    choose(name);expect(active().querySelector('.welcome-sample-day').textContent).toContain('Rest day');
    expect(button('Try a set')).toBeUndefined();
  }
  expect(active().querySelector('[aria-label="Previous week"],[aria-label="Next week"],[aria-haspopup="dialog"]')).toBeNull();
  expect(saved()).toEqual(before);
  choose('Friday');click('Try a set');
  expect(pager().dataset.page).toBe('2');expect(document.activeElement).toBe(active().querySelector('h1'));
  click('Increase sample weight');click('Log sample set');click('Previous introduction page');
  expect(day('Friday').getAttribute('aria-pressed')).toBe('true');
  click('Try a set');expect([...active().querySelectorAll('output')].map(node=>node.value)).toEqual(['42.5','8']);
  expect(button('Undo logged sample set').getAttribute('aria-checked')).toBe('true');
  click('Previous introduction page');
  expect(continued).not.toHaveBeenCalled();expect(Object.values(actions).every(fn=>!fn.mock.calls.length)).toBe(true);
  expect(localStorage.getItem(PRIMARY_KEY)).toBe('training data unchanged');
  act(()=>root.unmount());root=createRoot(host);mount();
  expect(day('Monday').getAttribute('aria-pressed')).toBe('true');
  click('Try a set');expect([...active().querySelectorAll('output')].map(node=>node.value)).toEqual(['40','8']);
  expect(button('Log sample set').getAttribute('aria-checked')).toBe('false');
});

it('keeps sample-week controls out of intro swipes and rejects a drag-generated click, then accepts a fresh tap',()=>{
  mount();
  const day=active().querySelector('.week-strip button[aria-label^="Wednesday "]');
  for(const target of [day,button('Try a set')]){
    swipe(target,280,100);
    act(()=>target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1})));
    expect(pager().dataset.page).toBe('1');
    expect(active().querySelector('.welcome-sample-day').textContent).toContain('Full Body A');
  }
  touch(day,'touchstart',100);touch(day,'touchmove',105,250);touch(day,'touchend',105,250);
  act(()=>day.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1})));
  expect(active().querySelector('.welcome-sample-day').textContent).toContain('Full Body A');
  touch(day,'touchstart',100);touch(day,'touchcancel',100);touch(day,'touchend',100);
  act(()=>day.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1})));
  expect(active().querySelector('.welcome-sample-day').textContent).toContain('Full Body A');
  touch(day,'touchstart',100);touch(day,'touchend',100);
  act(()=>day.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1})));
  expect(active().querySelector('.welcome-sample-day').textContent).toContain('Full Body B');
  const arrow=new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true});
  act(()=>day.dispatchEvent(arrow));expect(arrow.defaultPrevented).toBe(false);expect(pager().dataset.page).toBe('1');
  swipe(active().querySelector('h1'),280,100);expect(pager().dataset.page).toBe('2');
});

it('lets users adjust, log and undo a memory-only set, preserving it across swipes without starting a workout',()=>{
  localStorage.setItem(WELCOME_PAGE_KEY,'1');mount();
  const values=()=>[...active().querySelectorAll('output')].map(node=>node.value);
  const saved=()=>Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)]));
  const before=saved();
  click('Increase sample weight');click('Decrease sample reps');
  expect(values()).toEqual(['42.5','7']);
  click('Log sample set');expect(button('Undo logged sample set').getAttribute('aria-checked')).toBe('true');
  expect(active().querySelector('.set-row').classList.contains('set-completing')).toBe(true);
  act(()=>vi.advanceTimersByTime(259));
  expect(active().querySelector('.set-row').classList.contains('set-completing')).toBe(true);
  act(()=>vi.advanceTimersByTime(1));
  expect(active().querySelector('.set-row').classList.contains('set-completing')).toBe(false);
  expect(button('Undo logged sample set').hasAttribute('aria-disabled')).toBe(false);
  expect(button('Increase sample weight').disabled).toBe(true);
  click('Undo logged sample set');expect(values()).toEqual(['42.5','7']);
  expect(button('Log sample set').getAttribute('aria-checked')).toBe('false');
  expect(button('Increase sample weight').disabled).toBe(false);
  expect(button('Increase sample reps').disabled).toBe(false);
  click('Increase sample weight');click('Decrease sample reps');
  expect(values()).toEqual(['45','6']);
  click('Log sample set');expect(button('Undo logged sample set').getAttribute('aria-checked')).toBe('true');
  expect(active().querySelector('.set-row').classList.contains('set-completing')).toBe(true);
  click('Undo logged sample set');
  expect(active().querySelector('.set-row').classList.contains('set-completing')).toBe(false);
  click('Log sample set');
  expect(active().querySelector('.set-row').classList.contains('set-completing')).toBe(true);
  act(()=>vi.advanceTimersByTime(260));
  expect(active().querySelector('[role="status"]').textContent).toContain('Nothing was saved');
  expect(pager().dataset.page).toBe('2');expect(saved()).toEqual(before);
  expect(Object.values(actions).every(fn=>!fn.mock.calls.length)).toBe(true);
  click('Next introduction page');click('Back to intro');
  expect(values()).toEqual(['45','6']);expect(button('Undo logged sample set').getAttribute('aria-checked')).toBe('true');
  expect(active().querySelector('.set-row').classList.contains('set-completing')).toBe(false);
  click('Undo logged sample set');expect(values()).toEqual(['45','6']);
  expect(button('Log sample set').getAttribute('aria-checked')).toBe('false');
  expect(button('Increase sample weight').disabled).toBe(false);
  expect(active().querySelector('input')).toBeNull();
  expect(localStorage.getItem(PRIMARY_KEY)).toBe('training data unchanged');
});

it('does not swipe or consume keyboard arrows within the sample control cluster',()=>{
  localStorage.setItem(WELCOME_PAGE_KEY,'1');mount();
  const cluster=active().querySelector('.welcome-sample-controls');
  for(const target of [button('Increase sample weight'),cluster.querySelector('output'),cluster]){
    swipe(target,280,100);expect(pager().dataset.page).toBe('2');
  }
  const arrow=new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true});
  act(()=>cluster.dispatchEvent(arrow));expect(arrow.defaultPrevented).toBe(false);
  expect(pager().dataset.page).toBe('2');
  swipe(active().querySelector('h1'),280,100);expect(pager().dataset.page).toBe('3');
});

it('leaves zoomed panning to the browser and restores pager gestures after zoom ends',()=>{
  const viewport=Object.assign(new EventTarget(),{scale:2});vi.stubGlobal('visualViewport',viewport);
  mount();expect(pager().hasAttribute('data-zoomed')).toBe(true);
  swipe(active().querySelector('h1'),280,100);expect(pager().dataset.page).toBe('1');
  act(()=>pager().dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
  expect(pager().dataset.page).toBe('1');
  act(()=>{viewport.scale=1;viewport.dispatchEvent(new Event('resize'));});
  expect(pager().hasAttribute('data-zoomed')).toBe(false);
  swipe(active().querySelector('h1'),280,100);expect(pager().dataset.page).toBe('2');
});
