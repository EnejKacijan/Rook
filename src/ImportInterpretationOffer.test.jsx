import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,it,expect,vi} from 'vitest';
import {ImportInterpretationOffer} from './ImportInterpretationOffer.jsx';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
afterEach(()=>{act(()=>root?.unmount());host?.remove();});
function render(draft={},busy=false){host=document.createElement('div');document.body.append(host);root=createRoot(host);const onInterpret=vi.fn(),onReview=vi.fn();act(()=>root.render(<ImportInterpretationOffer draft={{knownCount:10,...draft}} busy={busy} onInterpret={onInterpret} onReview={onReview}/>));return {onInterpret,onReview};}
it('offers AI and local review without auto-submitting or an error panel',()=>{const f=render();expect(f.onInterpret).not.toHaveBeenCalled();expect(host.querySelector('[role="alert"]')).toBeNull();expect(host.textContent).toContain('10 source items preserved');expect(host.textContent).toContain('No profile or workout history');const buttons=host.querySelectorAll('button');act(()=>buttons[1].click());expect(f.onReview).toHaveBeenCalledOnce();expect(f.onInterpret).not.toHaveBeenCalled();act(()=>buttons[0].click());expect(f.onInterpret).toHaveBeenCalledOnce();});
it('preserves retry and local choice after an actual provider/validator failure',()=>{render({attemptedAI:true,error:'Interpretation could not be verified.'});expect(host.querySelector('[role="alert"]').textContent).toBe('Interpretation could not be verified.');expect(host.querySelector('button').textContent).toContain('RETRY');expect([...host.querySelectorAll('button')].every(b=>!b.disabled)).toBe(true);});
it('truthfully reports busy and prevents concurrent submissions',()=>{const f=render({},true);expect(host.querySelector('section').getAttribute('aria-busy')).toBe('true');expect(host.querySelector('button').textContent).toBe('INTERPRETING…');for(const b of host.querySelectorAll('button'))act(()=>b.click());expect(f.onInterpret).not.toHaveBeenCalled();expect(f.onReview).not.toHaveBeenCalled();});
