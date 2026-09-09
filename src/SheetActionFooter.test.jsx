// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SheetActionFooter } from './SheetActionFooter.jsx';
let root;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{act(()=>root?.unmount());root=null;document.body.innerHTML='';});
function render(element){const container=document.createElement('div');document.body.append(container);root=createRoot(container);const rerender=e=>act(()=>root.render(e));rerender(element);return {container,rerender};}
const screen={getByText:text=>[...document.querySelectorAll('button')].find(e=>e.textContent===text),getAllByRole:role=>[...document.querySelectorAll(`[role="${role}"]`)]};
const fireEvent={click:e=>act(()=>e.click())};
it('keeps disabled/enabled action and secondary callbacks unchanged', () => {
  const commit=vi.fn(), cancel=vi.fn();
  const view=render(<main className="detail-screen"><SheetActionFooter><button disabled onClick={commit}>Save</button><button onClick={cancel}>Back</button></SheetActionFooter></main>);
  fireEvent.click(screen.getByText('Save')); expect(commit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Back')); expect(cancel).toHaveBeenCalledOnce();
  view.rerender(<main className="detail-screen"><SheetActionFooter><button onClick={commit}>Save</button></SheetActionFooter></main>);
  fireEvent.click(screen.getByText('Save')); expect(commit).toHaveBeenCalledOnce();
});
it('does not create a footer for excluded states and removes its scroll registration', () => {
  const view=render(<main className="detail-screen"><SheetActionFooter><button>Apply</button></SheetActionFooter></main>);
  expect(view.container.querySelector('main').classList.contains('has-sheet-action-footer')).toBe(true);
  view.rerender(<main className="detail-screen"><SheetActionFooter enabled={false}><button>Pick</button></SheetActionFooter></main>);
  expect(view.container.querySelector('footer')).toBeNull();
  expect(view.container.querySelector('main').classList.contains('has-sheet-action-footer')).toBe(false);
});
it('preserves concise action errors without duplication', () => {
  render(<main className="detail-screen"><SheetActionFooter><p role="alert">Could not save</p><button>Retry</button></SheetActionFooter></main>);
  expect(screen.getAllByRole('alert')).toHaveLength(1);
});
it('supports existing independently scrolling scaffolds without adding a second action system', () => {
  const view=render(<main className="sheet"><SheetActionFooter separate gutter={22}><button>Create</button></SheetActionFooter></main>);
  const footer=view.container.querySelector('footer');
  expect(footer.dataset.separate).toBe('true');
  expect(footer.style.getPropertyValue('--sheet-action-inner-gutter')).toBe('22px');
});
it('uses native page scrolling only for the opted-in full-page input', () => {
  const view=render(<main className="detail-screen"><textarea/><SheetActionFooter pageScroll><button>Create</button></SheetActionFooter></main>);
  const input=view.container.querySelector('textarea');input.scrollIntoView=vi.fn();
  input.getBoundingClientRect=()=>({top:400,bottom:560});
  view.container.querySelector('footer').getBoundingClientRect=()=>({top:320});
  act(()=>input.focus());expect(input.scrollIntoView).toHaveBeenCalledWith({block:'center',behavior:'instant'});
});
