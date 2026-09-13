import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PlanNumberInput } from './PlanNumberInput.jsx';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
afterEach(() => { act(() => root?.unmount()); host?.remove(); });
function setup(initial = 3, commits) {
  const changed = vi.fn();
  function Form() { const [value,setValue] = useState(initial); return <><PlanNumberInput commits={commits} aria-label="Sets" value={value} min={1} max={20} onCommit={next => { changed(next); setValue(next); }} /><button>Save</button></>; }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root.render(<Form/>)); const input = host.querySelector('input');
  act(() => input.focus());
  const fill = text => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,text); input.dispatchEvent(new Event('input',{bubbles:true})); });
  return { input, fill, changed, blur: () => act(() => input.blur()) };
}
it('allows clearing 1 and typing 2, commits once on blur', () => {
  const {input,fill,changed,blur} = setup(1); fill(''); expect(input.value).toBe(''); fill('2'); expect(changed).not.toHaveBeenCalled(); blur(); expect(changed).toHaveBeenCalledExactlyOnceWith(2); expect(input.value).toBe('2');
});
it('never resizes through intermediate digits or an empty value', () => {
  const {fill,changed,blur} = setup(12); fill('1'); fill(''); fill('15'); expect(changed).not.toHaveBeenCalled(); blur(); expect(changed).toHaveBeenCalledExactlyOnceWith(15);
});
it.each(['','0','-1','1.5','21','2 sets','2e1'])('restores last valid count for %s without mutation', text => {
  const {input,fill,changed,blur} = setup(); fill(text); blur(); expect(input.value).toBe('3'); expect(changed).not.toHaveBeenCalled();
});
it('Enter commits without submitting; Escape discards the text edit', () => {
  const {input,fill,changed} = setup(); fill('2');
  act(() => input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
  expect(changed).toHaveBeenCalledExactlyOnceWith(2);
  act(() => input.focus()); fill('6'); act(() => input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(input.value).toBe('2'); expect(changed).toHaveBeenCalledTimes(1);
});
it('unchanged blur does not rewrite the prescription', () => { const {changed,blur} = setup(); blur(); expect(changed).not.toHaveBeenCalled(); });
it('an unspecified target stays empty on focus/blur; only a valid deliberate edit commits',()=>{const {input,changed,blur,fill}=setup(null);expect(input.value).toBe('');blur();expect(changed).not.toHaveBeenCalled();act(()=>input.focus());fill('8');blur();expect(changed).toHaveBeenCalledExactlyOnceWith(8);});
it('save registry commits a focused draft once, without relying on blur', () => {
  const commits = new Set(), {fill,input,changed,blur} = setup(3,commits);
  fill('4'); act(() => [...commits].forEach(commit => commit()));
  expect(document.activeElement).toBe(input); expect(changed).toHaveBeenCalledExactlyOnceWith(4);
  blur(); expect(changed).toHaveBeenCalledTimes(1);
});
it('cancel/unmount unregisters without committing the pending text', () => {
  const commits = new Set(), {fill,changed} = setup(3,commits); fill('4');
  act(() => root.unmount()); root=null; expect(commits.size).toBe(0); expect(changed).not.toHaveBeenCalled();
});
