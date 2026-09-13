import React,{act,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {useImportNotesPaste} from './useImportNotesPaste.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
afterEach(()=>{if(root)act(()=>root.unmount());host?.remove();vi.unstubAllGlobals();vi.restoreAllMocks();});
function setup(readText,secure=true){
 vi.stubGlobal('isSecureContext',secure);
 vi.stubGlobal('navigator',{clipboard:readText?{readText}:undefined});
 const onPasted=vi.fn();
 function Form(){const[text,setText]=useState('Before AFTER'),ref=useRef();const p=useImportNotesPaste(ref,setText,onPasted);return <><textarea ref={ref} value={text} onChange={e=>{setText(e.target.value);p.clearStatus();}}/><button onClick={p.paste} disabled={p.pasting}>PASTE</button><output>{p.status}</output></>;}
 host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<Form/>));
 const input=host.querySelector('textarea'),button=host.querySelector('button'),status=()=>host.querySelector('output').textContent;
 const fill=value=>act(()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
 return {input,button,status,fill,onPasted};
}
it('inserts faithful clipboard text at the current selection via React state',async()=>{
 const read=vi.fn().mockResolvedValue('Četrtek: Squat 3×8\n');const f=setup(read);f.input.setSelectionRange(7,12);
 await act(async()=>f.button.click());
 expect(read).toHaveBeenCalledOnce();expect(f.input.value).toBe('Before Četrtek: Squat 3×8\n');expect(f.onPasted).toHaveBeenCalledOnce();expect(f.status()).toBe('');
});
for(const reason of ['insecure','unavailable','denied','empty','whitespace'])it(`provides ${reason} feedback without changing notes`,async()=>{
 const read=reason==='unavailable'?undefined:reason==='denied'?vi.fn().mockRejectedValue(new DOMException('Denied','NotAllowedError')):vi.fn().mockResolvedValue(reason==='whitespace'?' \n':'');
 const f=setup(read,reason!=='insecure');await act(async()=>f.button.click());
 expect(f.input.value).toBe('Before AFTER');expect(document.activeElement).toBe(f.input);expect(f.onPasted).not.toHaveBeenCalled();
 expect(f.status()).toBe(['empty','whitespace'].includes(reason)?'Clipboard has no text to paste.':'Paste isn’t available here. Tap and hold in the field to paste.');
 if(reason==='insecure')expect(read).not.toHaveBeenCalled();
 f.fill('Native paste / typing');expect(f.status()).toBe('');expect(f.input.value).toBe('Native paste / typing');
});
it('does not duplicate permission requests or overwrite typing during a pending read',async()=>{
 let resolve;const read=vi.fn(()=>new Promise(r=>resolve=r));const f=setup(read);
 act(()=>{f.button.click();f.button.click();});expect(read).toHaveBeenCalledOnce();expect(f.button.disabled).toBe(true);
 f.fill('New notes ');f.input.setSelectionRange(10,10);
 await act(async()=>resolve('3×8'));expect(f.input.value).toBe('New notes 3×8');expect(f.button.disabled).toBe(false);
});
