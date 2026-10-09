import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
import {Detail} from './App.jsx';
import {PersonalThemesProvider} from './PersonalThemesContext.jsx';
import {blankState,deserializeState,serializeState,exerciseCatalog,makeProgramExercise} from './domain.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,current,writes;
beforeEach(()=>{
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame',callback=>setTimeout(callback,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
  HTMLElement.prototype.scrollTo=vi.fn();
  host=document.createElement('div');document.body.append(host);root=createRoot(host);writes=vi.fn();
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();vi.restoreAllMocks();});
async function mount(initial){
  function Harness(){const[state,setState]=useState(initial);current=state;return <Detail detail="appearance" state={state} update={fn=>setState(prev=>{const next=fn(structuredClone(prev));writes(next);return next;})} close={()=>{}}/>;}
  await act(async()=>root.render(<PersonalThemesProvider Modal={()=>null} Header={()=>null}><Harness/></PersonalThemesProvider>));
}
it.each([true,false,undefined])('describes existing illustration state %s with the unchanged switch name and semantics',async flag=>{
  const state=blankState();state.profile.showExerciseImages=flag;await mount(state);
  const control=host.querySelector('[role="switch"][aria-label="Exercise illustrations"]');
  expect(control.checked).toBe(flag!==false);
  expect(host.querySelector('.setting-help').textContent).toBe(`Exercise images are ${flag===false?'hidden':'shown'} while training and in exercise details.`);
  expect(writes).not.toHaveBeenCalled();
});
it('updates helper immediately using only the existing profile flag, and survives canonical serialization/reload',async()=>{
  const state=blankState();state.profile.showExerciseImages=true;await mount(state);
  const baseline=structuredClone(current),control=host.querySelector('[role="switch"]');
  await act(async()=>control.click());
  expect(control.checked).toBe(false);expect(host.querySelector('.setting-help').textContent).toContain('are hidden');
  const expected=structuredClone(baseline);expected.profile.showExerciseImages=false;expect(current).toEqual(expected);
  const restored=deserializeState(serializeState(current));
  await act(async()=>root.render(<Detail detail="appearance" state={restored} update={()=>{}} close={()=>{}}/>));
  expect(host.querySelector('[role="switch"]').checked).toBe(false);expect(host.querySelector('.setting-help').textContent).toContain('are hidden');
});
it('preserves the real exercise-detail image gate and the credits while illustrations are off',()=>{
  const state=blankState(),exercise=makeProgramExercise(exerciseCatalog['barbell-bench-press'],state.profile);
  const markup=()=>renderToStaticMarkup(<Detail detail={{exercise}} state={state} update={()=>{}} close={()=>{}}/>);
  expect(markup()).toContain('exercise-detail-art');
  state.profile.showExerciseImages=false;expect(markup()).not.toContain('exercise-detail-art');
  const appearance=renderToStaticMarkup(<Detail detail="appearance" state={state} update={()=>{}} close={()=>{}}/>);
  expect(appearance).toContain('Cable Crunch illustration by');expect(appearance).toContain('EXERCISE REFERENCES');
});
function declaration(file,selector,property){let value;postcss.parse(readFileSync(file,'utf8')).walkRules(rule=>{if(rule.selectors.includes(selector))rule.walkDecls(property,decl=>value=decl.value);});return value;}
it('uses the established control/section rhythm only inside Appearance',()=>{
  expect(declaration('src/theme.css','.appearance-screen > section.appearance-theme-group','gap')).toBe('12px');
  expect(declaration('src/theme.css','.appearance-screen > .appearance-theme-group > .appearance-theme-help','margin')).toBe('0 2px');
  expect(declaration('src/theme.css','.appearance-screen > .appearance-theme-group + section.logging-group','padding-top')).toBe('28px');
});
