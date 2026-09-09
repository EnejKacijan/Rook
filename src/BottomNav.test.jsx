import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { BottomNav } from './App.jsx';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,resize,disconnect;
afterEach(()=>{if(root)act(()=>root.unmount());host?.remove();root=null;vi.unstubAllGlobals();vi.restoreAllMocks();});
function render(page='today'){
 disconnect=vi.fn();vi.stubGlobal('ResizeObserver',class {constructor(callback){resize=callback;}observe(){}disconnect(){disconnect();}});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 const setPage=vi.fn();act(()=>root.render(<BottomNav page={page} setPage={setPage}/>));return setPage;
}
it.each(['today','coach','progress','profile'])('preserves four destinations and current-page semantics for %s',page=>{
 const setPage=render(page),buttons=[...host.querySelectorAll('button')];
 expect(buttons.map(b=>b.textContent)).toEqual(['TODAY','COACH','PROGRESS','PROFILE']);
 expect(host.querySelectorAll('.nav-icon-line')).toHaveLength(4);
 expect(host.querySelectorAll('.nav-icon-solid')).toHaveLength(4);
 expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
 expect(host.querySelector('[aria-current="page"]').getAttribute('aria-label')).toBe(page.toUpperCase());
 expect(host.querySelectorAll('.nav-icon[aria-hidden="true"] svg')).toHaveLength(4);
 expect(host.querySelectorAll('svg[focusable="false"]')).toHaveLength(4);
 act(()=>buttons[2].click());expect(setPage).toHaveBeenCalledWith('progress');
});
it('publishes measured total height including safe area and text growth, ignoring temporarily hidden nav',()=>{
 render();const nav=host.querySelector('nav');let height=98;
 vi.spyOn(nav,'getBoundingClientRect').mockImplementation(()=>({height}));
 act(()=>resize());expect(document.documentElement.style.getPropertyValue('--bottom-nav-total-height')).toBe('98px');
 height=124;act(()=>resize());expect(document.documentElement.style.getPropertyValue('--bottom-nav-total-height')).toBe('124px');
 height=0;act(()=>resize());expect(document.documentElement.style.getPropertyValue('--bottom-nav-total-height')).toBe('124px');
 act(()=>root.unmount());root=null;expect(disconnect).toHaveBeenCalled();expect(document.documentElement.style.getPropertyValue('--bottom-nav-total-height')).toBe('');
});
it('uses identical ascending bars and axis for outlined and filled Progress',()=>{
 render();const svg=host.querySelector('[data-nav-icon="progress"]');
 const line=svg.querySelector('.nav-icon-line'),solid=svg.querySelector('.nav-icon-solid');
 const geometry=group=>[...group.querySelectorAll('rect')].map(rect=>['x','y','width','height','stroke-width'].map(attr=>rect.getAttribute(attr)));
 expect(geometry(line)).toEqual(geometry(solid));expect(geometry(line)).toHaveLength(3);
 expect(line.querySelector('path').outerHTML).toBe(solid.querySelector('path').outerHTML);
 expect([...line.querySelectorAll('rect')].every(rect=>rect.getAttribute('fill')==='none')).toBe(true);
 expect([...solid.querySelectorAll('rect')].every(rect=>rect.getAttribute('fill')==='currentColor')).toBe(true);
 expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
});
it.each(['today','profile'])('keeps identical %s geometry between outlined and filled states',id=>{
 render();const svg=host.querySelector(`[data-nav-icon="${id}"]`);
 const geometry=selector=>[...svg.querySelector(selector).querySelectorAll('path,rect,circle')].map(element=>{
  const copy=element.cloneNode();copy.removeAttribute('fill');return copy.outerHTML;
 });
 expect(geometry('.nav-icon-line')).toEqual(geometry('.nav-icon-solid'));
 expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
 if(id==='today'){
  expect(svg.querySelectorAll('.nav-icon-line rect')).toHaveLength(4);
  expect([...svg.querySelectorAll('.nav-icon-solid rect')].every(e=>e.getAttribute('fill')==='currentColor')).toBe(true);
 }else{
  expect(svg.querySelector('.nav-icon-line > g').getAttribute('fill')).toBe('none');
  expect(svg.querySelector('.nav-icon-solid > g').getAttribute('fill')).toBe('currentColor');
 }
});
