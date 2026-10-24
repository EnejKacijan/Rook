import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {useInitialThemeDiscovery, useThemeDiscovery} from './useThemeDiscovery.js';
import {readSeenThemeReleases, themeDiscoveryKey, THEME_DISCOVERY_KEY} from './themeDiscovery.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root,discovery;
function Probe({newProfile=false,profileId='fresh',complete=false,eligible=false,accountCreatedAt='2026-09-01T12:00:00Z'}) {
  discovery=useThemeDiscovery({eligible,profileId,accountCreatedAt});
  useInitialThemeDiscovery({newProfile,profileId,complete,acknowledge:discovery.acknowledgeInitialThemes});
  return <button onClick={()=>discovery.markSeen(discovery.releases.map(item=>item.id))}>{discovery.hasNewThemes?'Unseen themes':'All viewed'}</button>;
}
async function render(props={}) {await act(async()=>root.render(<Probe {...props}/>));}
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-19T12:00:00'));
  localStorage.clear();
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();localStorage.clear();vi.useRealTimers();});

it('suppresses the catalog for a new setup even when it links an older anonymous identity',async()=>{
  await render({newProfile:true});expect(discovery.hasNewThemes).toBe(false);
  await render({eligible:true,newProfile:false,complete:true});expect(discovery.hasNewThemes).toBe(false);
  expect(readSeenThemeReleases(undefined,themeDiscoveryKey('fresh')).size).toBe(7);
  vi.setSystemTime(new Date('2027-10-19T12:00:00'));await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(discovery.releases).toMatchObject([{id:'season:halloween:v1:2027',returning:true}]);
});
it('retains new releases for an older signed-in account restored into a fresh browser',async()=>{
  await render({newProfile:true});await render({eligible:true,profileId:'restored-profile',complete:true});
  expect(discovery.hasNewThemes).toBe(true);expect(readSeenThemeReleases().size).toBe(0);
  await act(async()=>root.unmount());root=createRoot(host);await render({eligible:true,profileId:'existing-profile',complete:true});
  expect(discovery.hasNewThemes).toBe(true);expect(localStorage.getItem(THEME_DISCOVERY_KEY)).toBeNull();
});
it('never announces themes to guests or an unsigned completed local profile',async()=>{
  await render({complete:true});expect(discovery.hasNewThemes).toBe(false);expect(discovery.openDiscovery()).toEqual([]);
  expect(localStorage.length).toBe(0);
});
it('keeps a new signed-in account quiet across reload but announces a later season',async()=>{
  const props={eligible:true,complete:true,accountCreatedAt:'2026-10-19T09:00:00Z'};
  await render(props);expect(discovery.hasNewThemes).toBe(false);expect(discovery.openDiscovery()).toEqual([]);
  await act(async()=>root.unmount());root=createRoot(host);await render(props);expect(discovery.hasNewThemes).toBe(false);
  vi.setSystemTime(new Date('2027-10-19T12:00:00'));await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(discovery.releases).toMatchObject([{id:'season:halloween:v1:2027',returning:true}]);
});
it('hides notices immediately on sign-out and isolates acknowledgements between accounts',async()=>{
  await render({eligible:true,profileId:'older-a'});expect(discovery.hasNewThemes).toBe(true);
  await render({eligible:false,profileId:'older-a'});expect(discovery.hasNewThemes).toBe(false);expect(discovery.openDiscovery()).toEqual([]);
  await render({eligible:true,profileId:'older-b'});expect(discovery.hasNewThemes).toBe(true);
  await act(async()=>host.querySelector('button').click());expect(discovery.hasNewThemes).toBe(false);
  await render({eligible:true,profileId:'older-a'});expect(discovery.hasNewThemes).toBe(true);
});
it('does not announce the existing catalog when account creation metadata is unavailable',async()=>{
  await render({eligible:true,complete:true,accountCreatedAt:null});expect(discovery.hasNewThemes).toBe(false);
});
it('retains acknowledgement in shared memory when storage reads and writes throw',async()=>{
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('blocked');});
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('full');});
  await render({eligible:true});expect(discovery.hasNewThemes).toBe(true);
  await act(async()=>host.querySelector('button').click());expect(discovery.hasNewThemes).toBe(false);
  await act(async()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
  expect(discovery.hasNewThemes).toBe(false);
});
