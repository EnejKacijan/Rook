import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {PrivacyLegal} from './PrivacyLegal.jsx';
import {SettingSwitch} from './SettingSwitch.jsx';
import {AIDataConsent} from './AIDataConsent.jsx';
import {requireAiConsent,privacyPreferences,savePrivacyPreference} from './privacyPreferences.js';
import {generateLegalPages} from '../scripts/generate-legal-pages.mjs';
import {legalDocuments,legalDraft} from './legalDocuments.js';
import {existsSync,readFileSync} from 'node:fs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();});
const button=label=>[...document.querySelectorAll('button')].find(el=>el.textContent===label);
const Modal=({children,close})=><div>{typeof children==='function'?children(close):children}</div>;
const Header=({onClose})=><button aria-label="Close consent" onClick={onClose}>Close</button>;
it('generated public notices are current, account-free and honest about unfinished operator details',()=>{
 expect(()=>generateLegalPages({check:true})).not.toThrow();expect(legalDraft).toBe(true);
 for(const {id} of legalDocuments){const html=readFileSync(`public/legal/${id}.html`,'utf8');expect(html).toContain('Skip to content');expect(html).toContain('Draft — not ready for public release');expect(html).not.toContain('<script');}
 expect(existsSync('public/legal/software-notices.txt')).toBe(true);
});
it('shows optional choices off, no pretend request submission, and reuses the explicit local-delete confirmation',async()=>{
 const onDelete=vi.fn(),setDetail=vi.fn();act(()=>root.render(<PrivacyLegal Switch={SettingSwitch} onDelete={onDelete} setDetail={setDetail}/>));
 expect(host.querySelector('[role=switch]').checked).toBe(false);expect(host.querySelector('[role=switch]').getAttribute('aria-label')).toBe('Local usage diagnostics');
 expect(host.querySelector('a[href^="mailto:"]')).toBeNull();expect(host.textContent).toContain('verified contact address');
 const deletion=[...host.querySelectorAll('button')].find(el=>el.textContent.startsWith('Delete local data'));act(()=>deletion.click());expect(onDelete).toHaveBeenCalledOnce();
 act(()=>host.querySelector('[role=switch]').click());expect(privacyPreferences().analytics).toBe(true);act(()=>host.querySelector('[role=switch]').click());expect(privacyPreferences().analytics).toBe(false);
});
it('AI permission is unchecked, cancellation sends nothing, and granting it requires an explicit choice',async()=>{
 act(()=>root.render(<AIDataConsent Modal={Modal} Header={Header}><button>Training</button></AIDataConsent>));
 let first;await act(async()=>{first=requireAiConsent().catch(error=>error);});
 expect(document.querySelector('input[type=checkbox]').checked).toBe(false);expect(button('ALLOW AI PROCESSING').disabled).toBe(true);
 await act(async()=>button('KEEP AI OFF').click());expect((await first).code).toBe('ai-consent-required');expect(privacyPreferences().ai).toBe(false);
 let second;await act(async()=>{second=requireAiConsent();});act(()=>document.querySelector('input[type=checkbox]').click());await act(async()=>button('ALLOW AI PROCESSING').click());await second;expect(privacyPreferences().ai).toBe(true);expect(document.querySelector('[role=dialog]')).toBeNull();
});
it('a cancelled request closes an unanswered consent prompt without granting permission',async()=>{
 act(()=>root.render(<AIDataConsent Modal={Modal} Header={Header}/>));const controller=new AbortController();let pending;
 await act(async()=>{pending=requireAiConsent({signal:controller.signal}).catch(error=>error);});
 await act(async()=>controller.abort());expect((await pending).name).toBe('AbortError');expect(document.querySelector('[role=dialog]')).toBeNull();expect(privacyPreferences().ai).toBe(false);
});
it('acceptance uses the shared closing lifecycle before releasing the waiting request',async()=>{
 let finishClose,resolved=false;
 const AnimatedModal=({children,close})=><div>{children(()=>{finishClose=close;})}</div>;
 act(()=>root.render(<AIDataConsent Modal={AnimatedModal} Header={Header}/>));let pending;
 await act(async()=>{pending=requireAiConsent().then(()=>{resolved=true;});});act(()=>document.querySelector('input[type=checkbox]').click());await act(async()=>button('ALLOW AI PROCESSING').click());
 expect(finishClose).toBeTypeOf('function');expect(resolved).toBe(false);expect(document.querySelector('[role=dialog]')).not.toBeNull();
 await act(async()=>finishClose());await pending;expect(resolved).toBe(true);expect(document.querySelector('[role=dialog]')).toBeNull();
});
it('withdrawal is easy and does not claim to recall already sent requests',()=>{
 savePrivacyPreference('ai',true);act(()=>root.render(<PrivacyLegal Switch={SettingSwitch}/>));act(()=>button('TURN OFF AI SHARING').click());expect(privacyPreferences().ai).toBe(false);expect(host.querySelector('[role=status]').textContent).toContain('already sent cannot be recalled');expect(document.activeElement).toBe(host.querySelector('.privacy-ai-choice h3'));
});
