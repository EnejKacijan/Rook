import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {useInitialThemeDiscovery, useThemeDiscovery} from './useThemeDiscovery.js';
import {readSeenThemeReleases, THEME_DISCOVERY_KEY} from './themeDiscovery.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root,discovery;
function Probe({newProfile=false,profileId='fresh',complete=false}) {
  discovery=useThemeDiscovery();
  useInitialThemeDiscovery({newProfile,profileId,complete,acknowledge:discovery.acknowledgeInitialThemes});
  return <button onClick={()=>discovery.markSeen(discovery.releases.map(item=>item.id))}>{discovery.hasNewThemes?'Unseen themes':'All viewed'}</button>;
}
async function render(props={}) {await act(async()=>root.render(<Probe {...props}/>));}
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-19T12:00:00'));
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.useRealTimers();});

it('acknowledges initial choices only when the same verified fresh profile finishes setup',async()=>{
  await render({newProfile:true});expect(discovery.hasNewThemes).toBe(true);expect(readSeenThemeReleases().size).toBe(0);
  await render({newProfile:false,complete:true});expect(discovery.hasNewThemes).toBe(false);expect(readSeenThemeReleases().size).toBe(7);
  vi.setSystemTime(new Date('2027-10-19T12:00:00'));await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(discovery.releases).toMatchObject([{id:'season:halloween:v1:2027',returning:true}]);
});
it('never infers a new user from absent metadata, or hides notices for a restored profile identity',async()=>{
  await render({newProfile:true});await render({profileId:'restored-profile',complete:true});
  expect(discovery.hasNewThemes).toBe(true);expect(readSeenThemeReleases().size).toBe(0);
  await act(async()=>root.unmount());root=createRoot(host);await render({profileId:'existing-profile',complete:true});
  expect(discovery.hasNewThemes).toBe(true);expect(localStorage.getItem(THEME_DISCOVERY_KEY)).toBeNull();
});
it('retains acknowledgement in shared memory when storage reads and writes throw',async()=>{
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('blocked');});
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('full');});
  await render();expect(discovery.hasNewThemes).toBe(true);
  await act(async()=>host.querySelector('button').click());expect(discovery.hasNewThemes).toBe(false);
  await act(async()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
  expect(discovery.hasNewThemes).toBe(false);
});
