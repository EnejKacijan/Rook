import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { createReturningUserFixture } from './demoFixture.js';
import { hydrateStoredState, serializeState } from './domain.js';
import { PRIMARY_KEY, readLocalState } from './localStateStorage.js';
import { useLiftState } from './App.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
afterEach(() => {
  if (root) act(() => root.unmount());
  host?.remove(); root = null; host = null; localStorage.clear();
});

it('does not autosave or normalize a signed-out profile until it is unlocked', () => {
  const original = createReturningUserFixture(1), raw = serializeState(original);
  localStorage.setItem(PRIMARY_KEY, raw);
  localStorage.setItem('rook-account-signed-out-v1', 'true');
  const startup = readLocalState(localStorage, hydrateStoredState);
  function Harness() {
    const [, update] = useLiftState(startup);
    return <button onClick={() => update(state => { state.profile.name = 'Unlocked'; return state; })}>Change profile</button>;
  }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root.render(<Harness/>));
  expect(localStorage.getItem(PRIMARY_KEY)).toBe(raw);
  localStorage.removeItem('rook-account-signed-out-v1');
  act(() => host.querySelector('button').click());
  expect(JSON.parse(localStorage.getItem(PRIMARY_KEY)).profile.name).toBe('Unlocked');
});
