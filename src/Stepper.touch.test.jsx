import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {Stepper} from './App.jsx';
let root,host,changes;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);changes=vi.fn();});
afterEach(()=>{act(()=>root.unmount());host.remove();});
function mount(props={}){function Harness(){const [value,setValue]=useState(props.initial??52.5);return <Stepper label="Weight" value={value} step={2.5} alignToStep {...props} onChange={next=>{changes(next);setValue(next);}}/>;}act(()=>root.render(<Harness/>));return {input:host.querySelector('input'),minus:host.querySelector('[aria-label="Decrease Weight"]'),plus:host.querySelector('[aria-label="Increase Weight"]')};}
function type(input,value){act(()=>input.focus());act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
it('manual input then a button activation without blur updates the visible draft and survives later blur',()=>{
 const {input,plus}=mount();type(input,'53,5');act(()=>plus.click());expect(input.value).toBe('55');expect(document.activeElement).toBe(input);act(()=>input.blur());expect(input.value).toBe('55');expect(changes.mock.calls.at(-1)[0]).toBe(55);
});
it('blur before activation also commits one aligned step, with stable input identity',()=>{
 const {input,minus}=mount();type(input,'53.5');act(()=>{input.blur();minus.click();});expect(input.value).toBe('52.5');expect(host.querySelector('input')).toBe(input);
});
it('rapid activations are not lost or duplicated even before React flushes',()=>{
 const {input,plus,minus}=mount();act(()=>{for(let i=0;i<8;i++)plus.click();for(let i=0;i<3;i++)minus.click();});expect(input.value).toBe('65');expect(changes).toHaveBeenCalledTimes(11);
});
it.each([{step:1,integer:true,min:1,initial:99,end:'100'},{step:5,integer:true,min:1,initial:30,end:'35'},{step:5,initial:1000.5,end:'1005'}])('retains metric steps and bounds: $initial',props=>{
 const {input,plus,minus}=mount(props);act(()=>plus.click());expect(input.value).toBe(props.end);type(input,'0');act(()=>minus.click());expect(Number(input.value)).toBe(props.min??0);
});
it('keeps empty-value rules and allows only the existing optional increment',()=>{
 const {input,plus,minus}=mount({allowIncrementFromEmpty:true});type(input,'');expect(minus.disabled).toBe(true);act(()=>plus.click());expect(input.value).toBe('2.5');act(()=>input.blur());expect(input.value).toBe('2.5');
});
it('empty required input stays empty and disabled; a cancelled pointer gesture does not step',()=>{
 const {input,plus}=mount();type(input,'');expect(plus.disabled).toBe(true);act(()=>plus.click());expect(input.value).toBe('');type(input,'20');changes.mockClear();act(()=>{plus.dispatchEvent(new Event('pointerdown',{bubbles:true}));plus.dispatchEvent(new Event('pointermove',{bubbles:true}));plus.dispatchEvent(new Event('pointercancel',{bubbles:true}));});expect(input.value).toBe('20');expect(changes).not.toHaveBeenCalled();
});
