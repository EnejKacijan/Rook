import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SearchInput } from './SearchInput.jsx';

let root;
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ''; });
it('clears controlled search and returns focus without submitting the form', () => {
  const submit = vi.fn();
  function Harness() {
    const [value, setValue] = useState('Cable');
    return <form onSubmit={submit}><SearchInput aria-label="Search exercises" value={value} onChange={event => setValue(event.target.value)} onClear={() => setValue('')} /></form>;
  }
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root.render(<Harness />));
  const input = host.querySelector('input'); const clear = host.querySelector('button');
  expect(clear.getAttribute('aria-label')).toBe('Clear search');
  expect(clear.type).toBe('button');
  act(() => clear.click());
  expect(input.value).toBe(''); expect(document.activeElement).toBe(input);
  expect(host.querySelector('button')).toBeNull(); expect(submit).not.toHaveBeenCalled();
});
