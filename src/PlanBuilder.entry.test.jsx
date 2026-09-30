import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {Detail,EntryLanding,Onboarding,NoPlanToday,Profile} from './App.jsx';
import * as domain from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root,persist,current,generate;
const button = label => [...host.querySelectorAll('button')].find(node=>node.textContent.trim()===label || node.getAttribute('aria-label')===label || node.querySelector('strong')?.textContent===label);
const click = label => {const target=typeof label==='string'?button(label):label;expect(target).toBeTruthy();act(()=>target.click());};
const settle = async () => act(async()=>vi.advanceTimersByTimeAsync(450));
const input = (node,value) => act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-29T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=()=>{};HTMLElement.prototype.getAnimations=()=>[];
  persist=vi.spyOn(domain,'saveState').mockReturnValue(true);generate=vi.spyOn(domain,'buildProgram');
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function fixture(style='freestyle'){
  const state=domain.blankState();Object.assign(state.profile,{onboardingComplete:true,preferredTrainingStyle:style,noPlanReceipt:{kind:'first-run'}});return state;
}
function mount(initial,entry='today'){
  generate.mockClear();
  function Harness(){
    const [state,setState]=useState(initial),[detail,setDetail]=useState(null),[building,setBuilding]=useState(false);current=state;
    const update=fn=>setState(previous=>fn(structuredClone(previous)));
    if(detail)return <Detail detail={detail} state={state} update={update} setDetail={setDetail} close={()=>setDetail(null)} onPlanAccepted={()=>setDetail(null)}/>;
    if(building)return <Onboarding state={state} update={update} exit={()=>setBuilding(false)} onPlanAccepted={()=>setBuilding(false)}/>;
    if(entry==='landing')return <EntryLanding personalize={()=>setBuilding(true)} ownWorkouts={()=>{}} trainFreestyle={()=>{}} importPlan={()=>{}} startFromScratch={()=>{}} restoreBackup={()=>{}}/>;
    if(entry==='profile')return <Profile state={state} update={update} setDetail={setDetail} setPage={()=>{}}/>;
    return <NoPlanToday state={state} update={update} setPage={()=>{}} setDetail={setDetail}/>;
  }
  act(()=>root.render(<Harness/>));
}
function openToday(){click('Create or import one');click('Build a personalized plan');}
async function review(profile){
  expect(button('Age range').textContent).toContain(profile.ageRange);click('CONTINUE');
  expect(button(profile.goal).getAttribute('aria-pressed')).toBe('true');click(profile.goal);await settle();
  expect(button(profile.experience).getAttribute('aria-pressed')).toBe('true');click(profile.experience);await settle();
  expect(button(`${profile.daysPerWeek} days`).getAttribute('aria-pressed')).toBe('true');
  expect(button(`${profile.sessionMinutes} min`).getAttribute('aria-pressed')).toBe('true');click('CONTINUE');
  expect(button(profile.environment).getAttribute('aria-pressed')).toBe('true');click('CONTINUE');click('CONTINUE');click('CONTINUE');
}
it.each(['freestyle','own-workouts'])('%s users without plan inputs enter the questionnaire, never instant generation',style=>{
  const state=fixture(style),before=structuredClone(state);mount(state);openToday();
  expect(host.textContent).toContain('Set the right starting point.');expect(button('CONTINUE').disabled).toBe(true);
  expect(host.textContent).not.toContain('BUILD NEW PLAN');expect(generate).not.toHaveBeenCalled();expect(persist).not.toHaveBeenCalled();
  click('Back to plan options');expect(host.textContent).toContain('Create a plan');expect(current).toEqual(before);
});
it('prefills a partial profile and asks for its missing required goal',async()=>{
  const state=fixture();Object.assign(state.profile,{ageRange:'30–39',goal:null,experience:'Advanced',exercisePreference:null});mount(state);openToday();
  click('CONTINUE');expect(host.textContent).toContain('What are you training for?');
  expect(host.querySelector('.onboarding-option[aria-pressed="true"]')).toBeNull();expect(generate).not.toHaveBeenCalled();
});
it('complete prefilled answers are reviewed and edited before generating; cancel does not persist',async()=>{
  const state=fixture();Object.assign(state.profile,createReturningUserFixture(0).profile,{ageRange:'30–39',trainingSplitChoice:'recommended',onboardingComplete:true,preferredTrainingStyle:'freestyle'});
  const before=structuredClone(state);mount(state);openToday();
  input(host.querySelector('input'), 'Changed draft');await review(state.profile);
  expect(button('No preference').getAttribute('aria-pressed')).toBe('true');
  click('Machines');click('BUILD MY PLAN');await settle();
  expect(generate).toHaveBeenCalledOnce();expect(generate.mock.calls[0][0]).toMatchObject({name:'Changed draft',exercisePreference:'Prefer machines'});
  expect(host.textContent).toContain('Plan preview');expect(current).toEqual(before);expect(persist).not.toHaveBeenCalled();
  click('Back to onboarding');await settle();expect(host.textContent).toContain('Review your plan preferences.');
});
it('null exercise preference and weekly structure remain unselected until explicit answers',async()=>{
  const state=fixture();Object.assign(state.profile,createReturningUserFixture(0).profile,{ageRange:'30–39',exercisePreference:null,trainingSplitChoice:null,trainingPreferences:''});mount(state);openToday();await review(state.profile);
  expect(button('No preference').getAttribute('aria-pressed')).toBe('false');expect(button('LET ROOK CHOOSE').getAttribute('aria-pressed')).toBe('false');expect(button('BUILD MY PLAN').disabled).toBe(true);
  click('LET ROOK CHOOSE');expect(button('BUILD MY PLAN').disabled).toBe(true);click('No preference');expect(button('BUILD MY PLAN').disabled).toBe(false);expect(generate).not.toHaveBeenCalled();
});
it('persists confirmed training setup only when the reviewed plan is accepted, and preserves a failed-save preview',async()=>{
  const state=fixture();Object.assign(state.profile,createReturningUserFixture(0).profile,{ageRange:'30–39',trainingSplitChoice:'recommended',onboardingComplete:true,preferredTrainingStyle:'freestyle',noPlanReceipt:{kind:'first-run'}});
  const before=structuredClone(state);mount(state);openToday();await review(state.profile);click('Machines');click('BUILD MY PLAN');await settle();
  expect(current).toEqual(before);expect(persist).not.toHaveBeenCalled();persist.mockReturnValueOnce(false);
  click('USE THIS PLAN');await settle();expect(current).toEqual(before);expect(host.querySelector('[role="alert"]').textContent).toMatch(/couldn’t save/);
  click('USE THIS PLAN');await settle();expect(current.program).not.toBeNull();expect(current.profile.exercisePreference).toBe('Prefer machines');expect(current.profile.id).toBe(before.profile.id);expect(current.profile.preferredTrainingStyle).toBe('plan');expect(current.profile.noPlanReceipt).toBeNull();expect(persist).toHaveBeenCalledTimes(2);
});
it('landing uses the same draft questionnaire without an example or persisted side effects',()=>{
  const state=fixture(),before=structuredClone(state);mount(state,'landing');
  expect(host.querySelector('h1').textContent).toBe('A plan that fits your week.');
  expect(host.querySelectorAll('.entry-secondary-routes button')).toHaveLength(3);
  expect(host.querySelectorAll('.entry-primary-action > button')).toHaveLength(1);
  expect(host.querySelectorAll('.entry-action-chevron')).toHaveLength(3);
  expect(host.querySelectorAll('.restore-backup-action')).toHaveLength(1);
  expect(host.querySelector('.entry-demo')).toBeNull();
  click('BUILD MY PLAN');
  expect(host.textContent).toContain('Set the right starting point.');expect(current).toEqual(before);expect(persist).not.toHaveBeenCalled();
});
it('Profile replacement shares the builder and leaves the current program intact on cancellation',()=>{
  const state=createReturningUserFixture(0),before=structuredClone(state);mount(state,'profile');
  click(host.querySelector('[data-profile-area="program"]'));click('Replace plan');click('Build a personalized plan');
  expect(host.textContent).toContain('Set the right starting point.');click('Back to plan options');expect(current).toEqual(before);expect(persist).not.toHaveBeenCalled();expect(generate).not.toHaveBeenCalled();
});
it('has one generation call, inside the canonical builder, including the compatibility-review route',()=>{
  const source=readFileSync('src/App.jsx','utf8');
  expect(source.match(/await generatePersonalizedProgram\(/g)).toHaveLength(1);
  expect(source).not.toMatch(/confirm-build|BUILD NEW PLAN|generatePersonalizedProgram\(state.profile/);
  expect(source).toContain("setRepairPreview(null);setDetail('plan-builder')");
});
