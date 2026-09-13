import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {CustomExerciseFallback} from './CustomExerciseFallback.jsx';

it('keeps the explanatory text separate from one accessible creation action', async () => {
  const host=document.createElement('div'),root=createRoot(host),onCreate=vi.fn();
  await act(async()=>root.render(<CustomExerciseFallback onCreate={onCreate}/>));
  expect(host.querySelectorAll('button')).toHaveLength(1);
  expect(host.querySelector('aside > span').textContent).toBe('Can’t find it?');
  const action=host.querySelector('button');
  expect(action.getAttribute('aria-label')).toBe('Create custom exercise');
  expect(action.type).toBe('button');
  await act(async()=>action.click());expect(onCreate).toHaveBeenCalledTimes(1);
  await act(async()=>root.unmount());
});
