// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {Profile} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';

it('Export yields the boundary to Replace without changing upper/lower actions',()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  const scroll=vi.spyOn(window,'scrollTo').mockImplementation(()=>{}),host=document.createElement('div');document.body.append(host);
  const root=createRoot(host),state=createReturningUserFixture(0),before=structuredClone(state),detail=vi.fn();
  try {
    act(()=>root.render(<Profile state={state} update={()=>{}} setDetail={detail} setPage={()=>{}}/>));
    act(()=>host.querySelector('[data-profile-area="program"]').click());
    const rows=[...host.querySelectorAll('.program-actions > .list-row')];
    const exportRow=rows.find(row=>row.textContent.includes('Export workout plan')),replace=rows.find(row=>row.textContent.includes('Replace plan'));
    expect(exportRow.classList.contains('program-group-last-row')).toBe(true);expect(replace.classList.contains('profile-separated-action')).toBe(true);
    const css=readFileSync('src/profileHub.css','utf8');expect(css).toMatch(/\.program-actions > \.program-group-last-row\s*\{ border-bottom: 0;/);
    act(()=>exportRow.click());expect(detail).toHaveBeenLastCalledWith({export:{date:state.selectedDate}});
    act(()=>replace.click());expect(detail).toHaveBeenLastCalledWith('change-plan');
    act(()=>rows.find(row=>row.textContent.includes('Stop following this plan')).click());expect(detail).toHaveBeenLastCalledWith('stop-plan');expect(state).toEqual(before);
  } finally {act(()=>root.unmount());host.remove();scroll.mockRestore();vi.unstubAllGlobals();}
});
