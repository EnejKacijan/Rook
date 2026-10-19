import React, {act, useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';

vi.mock('./seasonalThemes.js', async original => {
  const actual = await original();
  const season = (id, start, end) => ({id, name:id, description:'Test season', base:'cool', window:{start,end},
    surfaces:{light:['#f1f5f9','#fbfdff','#e3ebf3'],dark:['#0c131a','#152029','#1e2b37']},
    shades:Array.from({length:5},(_,i)=>({id:i?`${id}-${i}`:id,name:`Shade ${i}`,light:'#1f6aa1',dark:'#7ab8ee'}))});
  return {...actual, SHOW_ALL_SEASONS:false, SEASONAL_THEMES:actual.createSeasonalRegistry([
    season('autumn','10-01','11-02'),season('turn','12-28','01-07')])};
});
vi.mock('./nativeLifecycle.js',()=>({subscribeNativeForeground:vi.fn(()=>()=>{})}));

import {PersonalThemesProvider, usePersonalThemes} from './PersonalThemesContext.jsx';
import {normalizePersonalTheme, selectPersonalThemePalette, updatePersonalTheme} from './personalThemes.js';
import {PERSONAL_THEME_PREFERENCE, readPersonalThemePreference, savePersonalThemePreference} from './personalThemePreference.js';
import {prepareSeasonalThemeSelection, resolveSeasonalTheme, nextThemeMidnightDelay, validSeasonalLastDay} from './seasonalThemeLifecycle.js';
import {subscribeNativeForeground} from './nativeLifecycle.js';
import {useResolvedTheme} from './useResolvedTheme.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host, root, review;
const end = new Date('2026-11-02T23:59:59');
const original = () => updatePersonalTheme({basePalette:'ocean',appearance:'dark'},{accent:'ocean-teal',base:'warm'});
const seasonal = (id='autumn',date=new Date('2026-10-19T12:00:00')) =>
  prepareSeasonalThemeSelection(updatePersonalTheme(selectPersonalThemePalette(original(),id),{base:'warm',accent:`${id}-2`}),date);
const Header=({onClose})=><button onClick={onClose}>Close</button>;
const Modal=({children,close})=><section role="dialog">{children(close)}</section>;
function Probe({blocked}) {
  review=usePersonalThemes();
  useLayoutEffect(()=>review.setSeasonalTransitionBlocked(blocked),[blocked,review.setSeasonalTransitionBlocked]);
  useResolvedTheme('light','standard',review.renderedPersonalTheme);
  return <main className="app-shell"><input aria-label="Draft" defaultValue="53,"/></main>;
}
const element=blocked=><PersonalThemesProvider Modal={Modal} Header={Header}><Probe blocked={blocked}/></PersonalThemesProvider>;
async function mount(blocked=false){host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(element(blocked)));}
async function focus(){await act(async()=>window.dispatchEvent(new Event('focus')));}
async function click(text){await act(async()=>[...document.querySelectorAll('button')].find(node=>node.textContent===text||node.getAttribute('aria-label')===text).click());}
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(end);
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  subscribeNativeForeground.mockClear();
});
afterEach(async()=>{
  if(root)await act(async()=>root.unmount());root=null;host?.remove();
  localStorage.removeItem(PERSONAL_THEME_PREFERENCE);
  vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();
});

it('binds an inclusive local window to its year, including December–January',()=>{
  const autumn=seasonal();
  expect(autumn.seasonalValidUntil).toBe('2026-11-02');
  expect(resolveSeasonalTheme(autumn,end)).toBe(autumn);
  expect(resolveSeasonalTheme(autumn,new Date('2026-11-03T00:00:00')).basePalette).toBe('ocean');
  expect(resolveSeasonalTheme(autumn,new Date('2027-10-19T12:00:00')).basePalette).toBe('ocean');
  const turn=seasonal('turn',new Date('2026-12-28T12:00:00'));
  expect(turn.seasonalValidUntil).toBe('2027-01-07');
  expect(resolveSeasonalTheme(turn,new Date('2027-01-07T23:59:59'))).toBe(turn);
  expect(resolveSeasonalTheme(turn,new Date('2027-01-08T00:00:00')).basePalette).toBe('ocean');
});
it('keeps review mode available, migrates unprovable legacy choices conservatively, and validates real dates',()=>{
  const legacy=selectPersonalThemePalette(original(),'autumn');
  expect(resolveSeasonalTheme(legacy,end).basePalette).toBe('ocean');
  expect(resolveSeasonalTheme(legacy,new Date('2026-11-03'),true)).toBe(legacy);
  expect(prepareSeasonalThemeSelection(legacy,new Date('2026-11-03'),true).basePalette).toBe('autumn');
  expect(()=>prepareSeasonalThemeSelection(legacy,new Date('2026-11-03'),false)).toThrow('season has ended');
  expect(validSeasonalLastDay('2026-02-29')).toBe(false);expect(validSeasonalLastDay('2028-02-29')).toBe(true);
  expect(nextThemeMidnightDelay(end)).toBe(1020);
});
it('returns to the saved year-round Fine-tune without losing seasonal choices or appearance',()=>{
  const choice=seasonal(),fallback=resolveSeasonalTheme(choice,new Date('2026-11-03'));
  expect(fallback).toMatchObject({basePalette:'ocean',accent:'ocean-teal',base:'warm',appearance:'dark'});
  expect(fallback.seasonalCustomizations).toEqual(choice.seasonalCustomizations);
  expect(resolveSeasonalTheme({...choice,fallbackPalette:null},new Date('2026-11-03')).basePalette).toBe('forest');
  expect(resolveSeasonalTheme({...choice,fallbackPalette:'unknown'},new Date('2026-11-03')).basePalette).toBe('forest');
  savePersonalThemePreference(choice);
  expect(JSON.parse(localStorage.getItem(PERSONAL_THEME_PREFERENCE))).toMatchObject({schemaVersion:3,seasonalValidUntil:'2026-11-02'});
  expect(readPersonalThemePreference()).toEqual(choice);
});
it('schedules local midnight across both DST transitions instead of a fixed 24 hours',async()=>{
  const {execFileSync}=await import('node:child_process');
  const output=execFileSync(process.execPath,['--input-type=module','-e',
    "import {nextThemeMidnightDelay,localThemeDay} from './src/seasonalThemeLifecycle.js'; console.log(JSON.stringify([nextThemeMidnightDelay(new Date(2026,2,29)),nextThemeMidnightDelay(new Date(2026,9,25)),localThemeDay(new Date('2026-10-18T23:30:00Z'))]));"],
    {encoding:'utf8',env:{...process.env,TZ:'Europe/Ljubljana'}});
  expect(JSON.parse(output)).toEqual([23*3600000+20,25*3600000+20,'2026-10-19']);
});
it('preserves removed seasons as opaque metadata through read, fallback, save and reload',()=>{
  const retired={schemaVersion:3,basePalette:'retired',appearance:'dark',fallbackPalette:'ocean',
    paletteCustomizations:original().paletteCustomizations,seasonalCustomizations:{retired:{accent:'retired-blue',base:'cool'}},seasonalValidUntil:'2025-11-02'};
  localStorage.setItem(PERSONAL_THEME_PREFERENCE,JSON.stringify(retired));
  const write=vi.spyOn(Storage.prototype,'setItem');
  const fallback=readPersonalThemePreference();expect(write).not.toHaveBeenCalled();
  expect(fallback.basePalette).toBe('ocean');expect(fallback.seasonalCustomizations.retired).toEqual(retired.seasonalCustomizations.retired);
  savePersonalThemePreference(fallback);
  expect(readPersonalThemePreference().seasonalCustomizations.retired).toEqual(retired.seasonalCustomizations.retired);
});
it('expires at local midnight, removes decoration, and announces once without remounting drafts',async()=>{
  savePersonalThemePreference(seasonal());await mount();const input=host.querySelector('input');
  expect(document.documentElement.dataset.season).toBe('autumn');
  await act(async()=>vi.advanceTimersByTimeAsync(1100));
  expect(review.personalTheme.basePalette).toBe('ocean');expect(document.documentElement.hasAttribute('data-season')).toBe(false);
  expect(document.documentElement.dataset.appearance).toBe('dark');
  expect(host.querySelector('input')).toBe(input);expect(input.value).toBe('53,');
  expect(readPersonalThemePreference().basePalette).toBe('ocean');
  expect(document.querySelector('.seasonal-theme-notice').textContent).toContain('Back to Ocean');
  await act(async()=>vi.advanceTimersByTimeAsync(5100));await focus();
  expect(document.querySelector('.seasonal-theme-notice')).toBeNull();
});
it('restores a paused/active-workout safety block before resolving on startup, then uses current state',async()=>{
  savePersonalThemePreference(seasonal());vi.setSystemTime(new Date('2026-11-03T12:00:00'));await mount(true);
  expect(review.personalTheme.basePalette).toBe('autumn');await focus();
  expect(readPersonalThemePreference().basePalette).toBe('autumn');
  await act(async()=>root.render(element(false)));expect(review.personalTheme.basePalette).toBe('ocean');
});
it('defers during focused input, then resolves on blur and native/foreground events',async()=>{
  savePersonalThemePreference(seasonal());await mount();
  await act(async()=>host.querySelector('input').focus());
  await act(async()=>vi.advanceTimersByTimeAsync(1100));expect(review.personalTheme.basePalette).toBe('autumn');
  await act(async()=>host.querySelector('input').blur());await act(async()=>vi.advanceTimersByTimeAsync(1));
  expect(review.personalTheme.basePalette).toBe('ocean');
  expect(subscribeNativeForeground).toHaveBeenCalledTimes(1);
});
it.each(['visibility','native','pageshow'])('rechecks a suspended app on %s without changing a hidden app',async event=>{
  savePersonalThemePreference(seasonal());await mount();
  const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');
  vi.setSystemTime(new Date('2026-11-03T12:00:00'));await focus();
  expect(review.personalTheme.basePalette).toBe('autumn');
  visibility.mockReturnValue('visible');
  await act(async()=>{
    if(event==='native')subscribeNativeForeground.mock.calls[0][0]();
    else if(event==='visibility')document.dispatchEvent(new Event('visibilitychange'));
    else window.dispatchEvent(new Event('pageshow'));
  });
  expect(review.personalTheme.basePalette).toBe('ocean');
});
it('keeps an expired preview editable, rejects late Apply, and resolves after Cancel',async()=>{
  savePersonalThemePreference(seasonal());await mount();await act(async()=>review.openThemes());
  await click('Shade 3');await act(async()=>vi.advanceTimersByTimeAsync(1100));
  expect(review.renderedPersonalTheme.basePalette).toBe('autumn');await click('Apply theme');
  expect(document.querySelector('[role="alert"]').textContent).toContain('season has ended');
  expect(readPersonalThemePreference().basePalette).toBe('autumn');
  await click('Cancel');expect(review.personalTheme.basePalette).toBe('ocean');
});
it('does not let an old pending expiry overwrite a later manual Apply',async()=>{
  savePersonalThemePreference(seasonal());await mount(true);
  vi.setSystemTime(new Date('2026-11-03T12:00:00'));await focus();
  await act(async()=>review.openThemes());await click('Plum');await click('Apply theme');
  await act(async()=>root.render(element(false)));await focus();
  expect(review.personalTheme.basePalette).toBe('plum');expect(readPersonalThemePreference().basePalette).toBe('plum');
});
it('renders fallback on failed automatic save, retries on a later event, and never reactivates next year',async()=>{
  savePersonalThemePreference(seasonal());await mount();const raw=localStorage.getItem(PERSONAL_THEME_PREFERENCE);
  const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('full');});
  await act(async()=>vi.advanceTimersByTimeAsync(1100));
  expect(review.personalTheme.basePalette).toBe('ocean');expect(localStorage.getItem(PERSONAL_THEME_PREFERENCE)).toBe(raw);
  expect(write).toHaveBeenCalledTimes(1);
  await act(async()=>root.unmount());root=null;host.remove();
  vi.setSystemTime(new Date('2027-10-19T12:00:00'));await mount();
  expect(review.personalTheme.basePalette).toBe('ocean');
  write.mockRestore();await focus();expect(readPersonalThemePreference().basePalette).toBe('ocean');
});
