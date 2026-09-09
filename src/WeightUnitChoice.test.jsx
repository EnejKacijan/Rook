// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {WeightUnitChoice} from './WeightUnitChoice.jsx';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
it('keeps selected units, offers both choices and calls only explicit changes',()=>{
 const host=document.createElement('div'),root=createRoot(host),change=vi.fn();
 act(()=>root.render(<WeightUnitChoice value="lb" onChange={change}/>));
 const [kg,lb]=host.querySelectorAll('button');
 expect(lb.getAttribute('aria-pressed')).toBe('true');
 act(()=>lb.click());expect(change).not.toHaveBeenCalled();
 act(()=>kg.click());expect(change).toHaveBeenCalledExactlyOnceWith('kg');
 act(()=>root.render(<WeightUnitChoice value="kg" onChange={change} disabled/>));
 expect(kg.disabled).toBe(true);expect(lb.disabled).toBe(true);
 act(()=>root.unmount());
});
it('compact onboarding defaults to kg without requiring interaction',()=>{
 const host=document.createElement('div'),root=createRoot(host),change=vi.fn();
 act(()=>root.render(<WeightUnitChoice compact onChange={change}/>));
 expect(host.querySelector('.weight-unit-label').textContent).toBe('Weight units');
 expect(host.querySelector('.eyebrow')).toBeNull();expect(host.querySelector('button').getAttribute('aria-pressed')).toBe('true');
 expect(host.textContent).toContain('Used for weights. Change anytime in Profile → Logging.');expect(change).not.toHaveBeenCalled();
 act(()=>root.unmount());
});
