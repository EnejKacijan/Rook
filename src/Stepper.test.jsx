import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Stepper } from './App.jsx';
let root,host;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const render=(emptyLabel,value=null)=>act(()=>root.render(<Stepper label="Load in kg for set 1" emptyLabel={emptyLabel} value={value} step={2.5} onChange={vi.fn()}/>));
for(const label of ['Enter weight','Bodyweight','Optional'])it(`${label} is decorative, hides during editing, and returns on empty blur`,()=>{
 render(label);const input=host.querySelector('input');expect(host.querySelector('.stepper-empty-label').textContent).toBe(label);expect(host.querySelector('.stepper-empty-label').getAttribute('aria-hidden')).toBe('true');expect(input.getAttribute('aria-label')).toBe('Load in kg for set 1');expect(input.getAttribute('inputmode')).toBe('decimal');
 act(()=>input.focus());expect(host.querySelector('.stepper-empty-label')).toBeNull();act(()=>input.blur());expect(host.querySelector('.stepper-empty-label').textContent).toBe(label);
 if(label==='Bodyweight')expect(input.getAttribute('aria-valuetext')).toBe('Bodyweight');
});
for(const value of [0,52.5])it(`does not overlay an entered numeric value ${value}`,()=>{render('Enter weight',value);expect(host.querySelector('.stepper-empty-label')).toBeNull();expect(host.querySelector('input').value).toBe(String(value));});
it('does not add a label to equivalent numeric inputs without an empty label',()=>{render(undefined);expect(host.querySelector('.stepper-empty-label')).toBeNull();});
