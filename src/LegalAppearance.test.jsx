import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,it,expect,vi} from 'vitest';
import vm from 'node:vm';
import {legalPageHref,LEGAL_THEME_ROLES} from './legalAppearance.js';
import {LegalLink} from './LegalLinks.jsx';
import {legalAppearanceScript,legalPage} from '../scripts/generate-legal-pages.mjs';
import {legalDocuments} from './legalDocuments.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{vi.unstubAllGlobals();for(const key of ['appearance','style','personalTheme'])delete document.documentElement.dataset[key];for(const role of LEGAL_THEME_ROLES)document.documentElement.style.removeProperty(`--rook-${role}`);});

it('uses the app appearance and colour family without including any training or account data',()=>{
 const root=document.documentElement;root.dataset.appearance='light';root.dataset.personalTheme='plum-lavender-neutral';
 expect(legalPageHref('terms')).toBe('/legal/terms.html?appearance=light&theme=plum');
 root.dataset.appearance='dark';root.dataset.personalTheme='ocean-cool';
 expect(legalPageHref('privacy')).toBe('/legal/privacy.html?appearance=dark&theme=ocean');
 delete root.dataset.personalTheme;root.dataset.style='premium';expect(legalPageHref('terms')).toContain('theme=champagne');
});
it.each(['click','auxclick','contextmenu'])('refreshes appearance on %s after the app theme changes',type=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 document.documentElement.dataset.appearance='dark';act(()=>root.render(<LegalLink document="terms">Terms of service</LegalLink>));
 const link=host.querySelector('a');expect(link.search).toContain('appearance=dark');
 document.documentElement.dataset.appearance='light';document.documentElement.dataset.personalTheme='champagne-warm';
 host.addEventListener(type,event=>event.preventDefault());act(()=>link.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true})));
 expect(link.search).toBe('?appearance=light&theme=champagne');expect(link.target).toBe('_blank');expect(link.rel).toContain('noopener');
 act(()=>root.unmount());host.remove();
});
it('updates the initial link after its parent resolves the app theme',()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);document.documentElement.dataset.appearance='dark';
 function Screen(){React.useLayoutEffect(()=>{document.documentElement.dataset.appearance='light';document.documentElement.dataset.personalTheme='plum-neutral';},[]);return <LegalLink document="terms">Terms</LegalLink>;}
 act(()=>root.render(<Screen/>));expect(host.querySelector('a').search).toBe('?appearance=light&theme=plum');act(()=>root.unmount());host.remove();
});
it('carries only bounded semantic colours for custom and seasonal themes',()=>{
 const root=document.documentElement;root.dataset.appearance='light';
 const colours=['f5f6f3','ffffff','16201e','576760','dee0e0','206b4c','e9f0ed','206b4c'];
 LEGAL_THEME_ROLES.forEach((role,index)=>root.style.setProperty(`--rook-${role}`,`#${colours[index]}`));
 const search=new URL(legalPageHref('terms'),'https://rook.test').search,{page}=renderPage(search,true);
 LEGAL_THEME_ROLES.forEach((role,index)=>expect(page.documentElement.style.getPropertyValue(`--rook-${role}`)).toBe(`#${colours[index]}`));
 expect(page.querySelector('[data-legal-document]').getAttribute('href')).toContain(`colours=${colours.join('-')}`);
 root.style.setProperty('--rook-bg','url(https://example.com/private)');expect(legalPageHref('terms')).not.toContain('colours=');
});
it('ignores malformed colour input rather than applying partial or arbitrary CSS',()=>{
 const {page}=renderPage('?appearance=light&colours=url(evil)',true);
 expect(page.documentElement.style.getPropertyValue('--rook-bg')).toBe('');expect(page.querySelector('[data-legal-document]').getAttribute('href')).not.toContain('colours=');
});

function renderPage(search,systemDark=false) {
 const page=new DOMParser().parseFromString(legalPage(legalDocuments.find(item=>item.id==='terms')),'text/html');
 let systemChange;const system={matches:systemDark,addEventListener:vi.fn((_,callback)=>{systemChange=callback;})};
 const context={document:page,location:new URL(`https://rook.test/legal/terms.html${search}`),URL,URLSearchParams,matchMedia:()=>system};
 // Reading a legal notice must not initialize the app or touch private storage.
 Object.defineProperty(context,'localStorage',{get:()=>{throw Error('No storage access');}});
 context.fetch=()=>{throw Error('No network requests');};vm.runInNewContext(legalAppearanceScript(),context);
 return {page,system,changeSystem:dark=>{system.matches=dark;systemChange?.();}};
}
it.each([['light',true],['dark',false]])('keeps explicit %s appearance over the opposite device setting', (appearance,systemDark)=>{
 const {page,system}=renderPage(`?appearance=${appearance}&theme=champagne`,systemDark);
 expect(page.documentElement.dataset.appearance).toBe(appearance);expect(page.documentElement.dataset.legalTheme).toBe('champagne');expect(system.addEventListener).not.toHaveBeenCalled();
 for(const link of page.querySelectorAll('[data-legal-document]'))expect(link.getAttribute('href')).toMatch(new RegExp(`\\?appearance=${appearance}&theme=champagne$`));
 expect(page.querySelector('.legal-back').getAttribute('href')).toBe('/');
});
it('direct and invalid links follow the device, including a later system change',()=>{
 const {page,changeSystem}=renderPage('?appearance=unknown&theme=not-a-theme',true);
 expect(page.documentElement.dataset.appearance).toBe('dark');expect(page.documentElement.dataset.legalTheme).toBe('forest');
 changeSystem(false);expect(page.documentElement.dataset.appearance).toBe('light');
 expect(page.querySelector('[data-legal-document]').getAttribute('href')).toContain('appearance=light');
});
it('applies the same appearance to links parsed after the prepaint script',()=>{
 const {page}=renderPage('?appearance=light&theme=ocean',true);const link=page.createElement('a');link.setAttribute('data-legal-document','');link.setAttribute('href','/legal/cookies.html');page.body.append(link);
 page.dispatchEvent(new Event('DOMContentLoaded'));expect(link.getAttribute('href')).toBe('/legal/cookies.html?appearance=light&theme=ocean');
});
