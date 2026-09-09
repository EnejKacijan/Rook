import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionFeedbackChoices } from './SessionFeedback.jsx';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host;
afterEach(()=>{act(()=>root.unmount());host.remove();});
function render(value,completion=true){host=document.createElement('div');document.body.append(host);root=createRoot(host);const onChange=vi.fn();act(()=>root.render(<SessionFeedbackChoices completion={completion} value={value} onChange={onChange}/>));return onChange;}
for(const value of [undefined,'skipped'])it(`completion ${value} shows only three optional choices without default selection`,()=>{
 const change=render(value);expect(host.querySelectorAll('button')).toHaveLength(3);expect(host.querySelector('[aria-pressed=true]')).toBeNull();expect(host.textContent).toContain('Optional');expect(host.textContent).not.toContain('Skip');expect(change).not.toHaveBeenCalled();
});
for(const value of ['easier','about_right','harder'])it(`${value} can be removed using existing skipped semantics`,()=>{
 const change=render(value);expect(host.querySelectorAll('[aria-pressed=true]')).toHaveLength(1);act(()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Remove feedback').click());expect(change).toHaveBeenCalledExactlyOnceWith('skipped');
});
it('preserves History editor skip behavior',()=>{render(undefined,false);expect(host.textContent).toContain('Skip');});
