import React,{act,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PersonalThemesProvider,usePersonalThemes} from './PersonalThemesContext.jsx';
import {useResolvedTheme} from './useResolvedTheme.js';
import {prepareSeasonalThemeSelection,resolveSeasonalTheme} from './seasonalThemeLifecycle.js';
import {selectPersonalThemePalette,updatePersonalTheme} from './personalThemes.js';
import {PERSONAL_THEME_PREFERENCE,readPersonalThemePreference,savePersonalThemePreference} from './personalThemePreference.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const free={enabled:true,status:'free'},pro={enabled:true,status:'active'},unknown={enabled:true,status:'unknown'};
const at=day=>new Date(`${day}T12:00:00`);
const original=()=>updatePersonalTheme({basePalette:'ocean',appearance:'dark'},{accent:'ocean-teal',base:'warm'});
const seasonal=()=>prepareSeasonalThemeSelection(updatePersonalTheme(selectPersonalThemePalette(original(),'halloween'),{accent:'halloween-violet',base:'cool'}),at('2026-10-28'));
const Header=({onClose})=><button onClick={onClose}>Close</button>;
const Modal=({children,close})=><section role="dialog">{children(close)}</section>;
let root,host,themes,explore;
function Probe({blocked}){
  themes=usePersonalThemes();
  useLayoutEffect(()=>themes.setSeasonalTransitionBlocked(blocked),[blocked,themes.setSeasonalTransitionBlocked]);
  useResolvedTheme('light','standard',themes.renderedPersonalTheme);
  return <main className="app-shell"><input aria-label="Workout draft" defaultValue="53,"/></main>;
}
async function render({access=free,blocked=false,canExplore=true}={}){
  await act(async()=>root.render(<PersonalThemesProvider Modal={Modal} Header={Header} seasonalAccess={access} onExploreSeasonalPro={canExplore?explore:undefined}><Probe blocked={blocked}/></PersonalThemesProvider>));
}
const open=()=>act(async()=>themes.openThemes());
const button=label=>[...document.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===label||node.textContent.trim()===label);
const click=label=>act(async()=>{expect(button(label),label).toBeTruthy();button(label).click();});
const refresh=()=>act(async()=>window.dispatchEvent(new Event('focus')));
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(at('2026-10-28'));localStorage.clear();explore=vi.fn();
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});

it('lets Free select and apply the current seasonal theme without opening Pro',async()=>{
  savePersonalThemePreference(original());await render();await open();
  expect(button('Halloween').disabled).toBe(false);await click('Halloween');await click('Apply theme');
  expect(readPersonalThemePreference()).toMatchObject({basePalette:'halloween',seasonalValidUntil:'2026-11-02',appearance:'dark'});
  expect(explore).not.toHaveBeenCalled();expect(document.querySelector('.pro-theme-studio')).toBeNull();
});
it('shows just one contextual Pro entry, only inside Appearance, with no claim/keep purchase fiction',async()=>{
  await render();expect(button('See ROOK Pro')).toBeUndefined();await open();
  expect([...document.querySelectorAll('button')].filter(node=>node.textContent==='See ROOK Pro')).toHaveLength(1);
  expect(document.querySelector('.pro-theme-studio').textContent).toContain('released seasonal themes year-round');
  await click('See ROOK Pro');expect(explore).toHaveBeenCalledOnce();
  expect(document.querySelector('.pro-theme-studio').textContent).not.toMatch(/Keep Halloween|Claim|forever|Last chance/);
});
it('keeps the billing-free release unchanged and does not show a dead upsell when no integration is supplied',async()=>{
  await render({access:null,canExplore:false});await open();
  expect(document.querySelector('.pro-theme-studio').textContent).not.toContain('ROOK Pro');
  await click('Cancel');await render({canExplore:false});await open();expect(button('See ROOK Pro')).toBeUndefined();
});
it('removes the archive and Pro copy if the optional capability is disabled while Appearance is open',async()=>{
  vi.setSystemTime(at('2026-11-03'));await render();await open();expect(document.querySelector('.seasonal-theme-archive')).not.toBeNull();
  await render({access:null});expect(document.querySelector('.seasonal-theme-archive')).toBeNull();expect(document.querySelector('.pro-theme-studio').textContent).not.toContain('ROOK Pro');
});
it('lets Pro keep its selected theme across season end without a prompt, switch or storage entitlement',async()=>{
  savePersonalThemePreference(seasonal());await render({access:pro});const before=localStorage.getItem(PERSONAL_THEME_PREFERENCE);
  vi.setSystemTime(at('2026-11-03'));await refresh();
  expect(themes.personalTheme.basePalette).toBe('halloween');expect(document.documentElement.dataset.season).toBe('halloween');
  expect(localStorage.getItem(PERSONAL_THEME_PREFERENCE)).toBe(before);expect(document.querySelector('.seasonal-theme-notice')).toBeNull();
  for(const key of ['active','subscription','entitlement'])expect(JSON.parse(before)).not.toHaveProperty(key);
});
it('includes the released archive for Pro and uses the normal preview, Cancel and Apply path',async()=>{
  vi.setSystemTime(at('2026-11-03'));savePersonalThemePreference(original());await render({access:pro});await open();
  expect(document.querySelector('.seasonal-theme-archive')).not.toBeNull();expect(button('Halloween').disabled).toBe(false);
  await click('Halloween');expect(themes.renderedPersonalTheme.basePalette).toBe('halloween');expect(readPersonalThemePreference().basePalette).toBe('ocean');
  await click('Cancel');expect(themes.renderedPersonalTheme.basePalette).toBe('ocean');
  await open();await click('Halloween');await click('Apply theme');expect(readPersonalThemePreference().basePalette).toBe('halloween');
});
it('keeps out-of-season Free archive cards locked, without changing the current theme or granting access from a click',async()=>{
  vi.setSystemTime(at('2026-11-03'));savePersonalThemePreference(original());await render();await open();
  const locked=button('Halloween, year-round access requires ROOK Pro');expect(locked.disabled).toBe(true);
  act(()=>locked.click());expect(themes.renderedPersonalTheme.basePalette).toBe('ocean');expect(readPersonalThemePreference().basePalette).toBe('ocean');
  expect(document.querySelector('.seasonal-theme-archive').textContent).toContain('Returns Oct 1');
});
it('defers both season-end and Pro-loss fallbacks while a workout or focused input is active',async()=>{
  savePersonalThemePreference(seasonal());await render({access:pro,blocked:true});const input=host.querySelector('input');
  vi.setSystemTime(at('2026-11-03'));await render({access:free,blocked:true});expect(themes.personalTheme.basePalette).toBe('halloween');
  await act(async()=>input.focus());await render({access:free,blocked:false});expect(themes.personalTheme.basePalette).toBe('halloween');
  await act(async()=>input.blur());await act(async()=>vi.advanceTimersByTime(1));
  expect(themes.personalTheme).toMatchObject({basePalette:'ocean',accent:'ocean-teal',base:'warm',appearance:'dark'});
  expect(themes.personalTheme.seasonalCustomizations.halloween).toEqual({accent:'halloween-violet',base:'cool'});
  expect(host.querySelector('input')).toBe(input);expect(input.value).toBe('53,');expect(document.querySelector('.seasonal-theme-notice')).toBeNull();
});
it('does not interrupt an open theme editor on Pro loss; Cancel restores the safe fallback',async()=>{
  savePersonalThemePreference(seasonal());vi.setSystemTime(at('2026-11-03'));await render({access:pro});await open();
  await click('Moonlight');await render();
  expect(themes.renderedPersonalTheme.basePalette).toBe('halloween');expect(button('Apply theme').disabled).toBe(true);
  expect(readPersonalThemePreference().basePalette).toBe('halloween');await click('Cancel');
  expect(themes.personalTheme.basePalette).toBe('ocean');expect(readPersonalThemePreference().basePalette).toBe('ocean');
});
it('does not remove a currently free seasonal theme when a paid entitlement expires inside its window',async()=>{
  savePersonalThemePreference({...seasonal(),seasonalValidUntil:'2025-11-02'});await render({access:pro});
  await render();expect(themes.personalTheme.basePalette).toBe('halloween');
  expect(readPersonalThemePreference().seasonalValidUntil).toBe('2026-11-02');
});
it('keeps an explicit off-season Pro choice free if the subscription ends during the next season while the app is closed',async()=>{
  const choice=prepareSeasonalThemeSelection(seasonal(),at('2026-11-03'),false,pro);
  expect(choice.seasonalValidUntil).toBe('2027-11-02');savePersonalThemePreference(choice);
  vi.setSystemTime(at('2027-10-28'));await render();expect(themes.personalTheme.basePalette).toBe('halloween');
  vi.setSystemTime(at('2027-11-03'));await refresh();expect(themes.personalTheme.basePalette).toBe('ocean');
  vi.setSystemTime(at('2028-10-28'));await refresh();expect(themes.personalTheme.basePalette).toBe('ocean');
});
it('treats cancelled or offline-cached active access exactly as the trusted subscription owner reports it',async()=>{
  savePersonalThemePreference(seasonal());vi.setSystemTime(at('2026-11-03'));
  await render({access:{...pro,willRenew:false,offline:true,expirationDate:'2000-01-01'}});
  expect(themes.personalTheme.basePalette).toBe('halloween');
});
it('holds an existing off-season appearance during unknown access without persisting a fallback or permitting a new Pro selection',async()=>{
  savePersonalThemePreference(seasonal());const raw=localStorage.getItem(PERSONAL_THEME_PREFERENCE);vi.setSystemTime(at('2026-11-03'));
  await render({access:unknown});expect(themes.personalTheme.basePalette).toBe('halloween');expect(localStorage.getItem(PERSONAL_THEME_PREFERENCE)).toBe(raw);
  await open();expect(button('See ROOK Pro')).toBeUndefined();expect(document.querySelector('.pro-theme-studio').textContent).toContain('Checking Pro access');
  const held=button('Halloween, current theme, Pro access is being checked');expect(held.disabled).toBe(true);
  expect(held.getAttribute('aria-pressed')).toBe('true');expect(held.querySelector('.seasonal-theme-lock')).toBeNull();
  expect(held.textContent).toContain('Checking Pro access');expect(document.querySelector('.seasonal-theme-access-note').textContent).toBe('Halloween stays active while we check your Pro access.');
  await click('ROOK Gold');await click('Apply theme');expect(readPersonalThemePreference().basePalette).toBe('champagne');
});
it('resolves unknown to inactive with the normal safe fallback, and unknown to active without a switch',async()=>{
  savePersonalThemePreference(seasonal());vi.setSystemTime(at('2026-11-03'));await render({access:unknown});
  await render({access:pro});expect(themes.personalTheme.basePalette).toBe('halloween');
  await render({access:unknown});await render();expect(themes.personalTheme.basePalette).toBe('ocean');
});
it('unlocks the archive on restored Pro but never automatically reselects an older seasonal choice',async()=>{
  savePersonalThemePreference(seasonal());vi.setSystemTime(at('2026-11-03'));await render();expect(themes.personalTheme.basePalette).toBe('ocean');
  await render({access:pro});expect(themes.personalTheme.basePalette).toBe('ocean');await open();expect(button('Halloween').disabled).toBe(false);
});
it('checks availability again at Apply and never authorizes a new seasonal choice from unknown access',()=>{
  expect(()=>prepareSeasonalThemeSelection(seasonal(),at('2026-11-03'),false,unknown)).toThrow('not confirmed');
  expect(()=>prepareSeasonalThemeSelection(seasonal(),at('2026-11-03'),false,free)).toThrow('ROOK Pro is required');
  expect(resolveSeasonalTheme(seasonal(),at('2027-10-28'),false,free).basePalette).toBe('ocean');
});
