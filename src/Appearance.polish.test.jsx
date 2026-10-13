import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
import {Detail} from './App.jsx';
import {PersonalThemesProvider} from './PersonalThemesContext.jsx';
import {PERSONAL_THEME_PREFERENCE,readPersonalThemePreference,savePersonalThemePreference} from './personalThemePreference.js';
import {normalizePersonalTheme,selectPersonalThemePalette,updatePersonalTheme} from './personalThemes.js';
import {blankState,deserializeState,serializeState,exerciseCatalog,makeProgramExercise} from './domain.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,current,writes;
beforeEach(()=>{
  localStorage.removeItem(PERSONAL_THEME_PREFERENCE);
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame',callback=>setTimeout(callback,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
  HTMLElement.prototype.scrollTo=vi.fn();
  host=document.createElement('div');document.body.append(host);root=createRoot(host);writes=vi.fn();
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();localStorage.removeItem(PERSONAL_THEME_PREFERENCE);vi.unstubAllGlobals();});
async function mount(initial,{Modal=()=>null}={}){
  function Harness(){const[state,setState]=useState(initial);current=state;return <Detail detail="appearance" state={state} update={fn=>setState(prev=>{const next=fn(structuredClone(prev));writes(next);return next;})} close={()=>{}}/>;}
  await act(async()=>root.render(<PersonalThemesProvider Modal={Modal} Header={()=>null}><Harness/></PersonalThemesProvider>));
}
const mode=label=>[...host.querySelectorAll('[role="radiogroup"][aria-label="Theme"] [role="radio"]')].find(button=>button.textContent===label);
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
it.each(['standard','premium'].flatMap(style=>['system','light','dark'].map(appearance=>[style,appearance])))('removes duplicate style choices for legacy %s/%s without migrating or resetting the profile',async(style,appearance)=>{
  const state=blankState();Object.assign(state.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
  const before=structuredClone(state),write=vi.spyOn(Storage.prototype,'setItem');await mount(state);
  expect(host.querySelector('.appearance-style-group')).toBeNull();expect(host.querySelector('.appearance-style-choice')).toBeNull();
  expect(host.textContent).not.toMatch(/Standard|Premium/);
  expect(host.querySelector('.appearance-palettes-group').textContent).toContain(`${style==='premium'?'ROOK Gold':'ROOK Green'} · ${appearance[0].toUpperCase()+appearance.slice(1)}`);
  expect(mode(appearance[0].toUpperCase()+appearance.slice(1)).getAttribute('aria-checked')).toBe('true');
  expect(current).toEqual(before);expect(writes).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();expect(readPersonalThemePreference()).toBeNull();
});
it('changes legacy brightness without changing the stored Gold style or creating a personal theme',async()=>{
  const state=blankState();Object.assign(state.profile,{stylePreference:'premium',appearancePreference:'system',themePreference:'premium'});await mount(state);
  const expected=structuredClone(current);expected.profile.appearancePreference='dark';
  await act(async()=>mode('Dark').click());expect(current).toEqual(expected);expect(current.profile.themePreference).toBe('premium');
  expect(readPersonalThemePreference()).toBeNull();expect(host.querySelector('.appearance-palettes-group').textContent).toContain('ROOK Gold · Dark');
});
it('always exposes brightness, preserves every customized family and restores the selected mode after reload',async()=>{
  const ocean=updatePersonalTheme({basePalette:'ocean',appearance:'system'},{accent:'ocean-teal',base:'cool'});
  const saved=updatePersonalTheme(selectPersonalThemePalette(ocean,'plum'),{accent:'plum-mauve',base:'warm'});savePersonalThemePreference(saved);
  const state=blankState(),before=structuredClone(state);await mount(state);
  expect(mode('System').getAttribute('aria-checked')).toBe('true');
  await act(async()=>mode('Dark').click());
  expect(readPersonalThemePreference()).toEqual(normalizePersonalTheme({...saved,appearance:'dark'}));expect(current).toEqual(before);expect(writes).not.toHaveBeenCalled();
  expect(host.querySelector('.appearance-palettes-group').textContent).toContain('Plum · Customized · Warm · Dark');
  await act(async()=>root.unmount());root=createRoot(host);await mount(state);
  expect(mode('Dark').getAttribute('aria-checked')).toBe('true');expect(readPersonalThemePreference().paletteCustomizations).toEqual(saved.paletteCustomizations);
  const write=vi.spyOn(Storage.prototype,'setItem');await act(async()=>mode('Dark').click());expect(write).not.toHaveBeenCalled();
  await act(async()=>mode('Light').click());await act(async()=>mode('System').click());
  expect(readPersonalThemePreference()).toEqual(saved);
});
it('retains saved colors and brightness on storage failure and allows retry',async()=>{
  const saved=updatePersonalTheme({basePalette:'ocean',appearance:'system'},{accent:'ocean-teal',base:'warm'});savePersonalThemePreference(saved);await mount(blankState());
  vi.spyOn(Storage.prototype,'setItem').mockImplementationOnce(()=>{throw Error('full');});await act(async()=>mode('Dark').click());
  expect(mode('System').getAttribute('aria-checked')).toBe('true');expect(host.querySelector('[role="alert"]').textContent).toContain('Couldn’t save');expect(readPersonalThemePreference()).toEqual(saved);
  await act(async()=>mode('Dark').click());expect(host.querySelector('[role="alert"]')).toBeNull();expect(readPersonalThemePreference()).toEqual(normalizePersonalTheme({...saved,appearance:'dark'}));
});
it('keeps all six palettes in the existing editor and leaves the legacy profile intact when preview is canceled',async()=>{
  const state=blankState();Object.assign(state.profile,{stylePreference:'premium',appearancePreference:'dark',themePreference:'premium'});
  const Modal=({children,close})=><div>{children(close)}</div>;await mount(state,{Modal});const before=structuredClone(current);
  await act(async()=>host.querySelector('.appearance-palettes-group button').click());
  const editor=document.querySelector('.pro-theme-studio');expect([...editor.querySelectorAll('.pro-theme-presets button')].map(button=>button.getAttribute('aria-label'))).toEqual(['ROOK Green','ROOK Gold','Ocean','Slate','Plum','Terracotta']);
  expect(editor.querySelector('.pro-theme-presets [aria-pressed="true"]').getAttribute('aria-label')).toBe('ROOK Gold');
  await act(async()=>editor.querySelector('[aria-label="Ocean"]').click());await act(async()=>[...editor.querySelectorAll('button')].find(button=>button.textContent==='Cancel').click());
  expect(document.querySelector('.pro-theme-studio')).toBeNull();expect(current).toEqual(before);expect(readPersonalThemePreference()).toBeNull();
});
