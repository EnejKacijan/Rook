import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { StartupAccountRecovery } from './StartupBoundary.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; });
function render(startup) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const actions = { onStartFresh: vi.fn(), onRetry: vi.fn() };
  act(() => root.render(<StartupAccountRecovery startup={startup} {...actions} />));
  return actions;
}

it('offers an explicit continuation of existing setup after a verified empty guest account', () => {
  const actions = render({ code: 'unverified-anonymous-first-run', verifiedEmpty: true, allowStartFresh: true, setupAlreadyStarted: true });
  expect(host.querySelector('[role=status] h1')?.textContent).toBe('Continue setting up Rook.');
  expect(host.textContent).toContain('restore it below');
  expect(host.textContent).not.toContain('TRY AGAIN');
  expect(actions.onStartFresh).not.toHaveBeenCalled();
  act(() => host.querySelector('button.primary').click());
  expect(actions.onStartFresh).toHaveBeenCalledOnce();
  expect(actions.onRetry).not.toHaveBeenCalled();
});

it.each([
  { code: 'account-check-failed' },
  { code: 'unverified-anonymous-first-run', allowStartFresh: true },
  { code: 'unverified-anonymous-first-run', allowStartFresh: true, verifiedEmpty: true, cloudFound: true },
])('keeps uncertain or existing cloud data behind recovery (%j)', startup => {
  const actions = render(startup);
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  expect(host.querySelector('button.primary')?.textContent).toBe('TRY AGAIN');
  expect(actions.onStartFresh).not.toHaveBeenCalled();
  act(() => host.querySelector('button.primary').click());
  expect(actions.onRetry).toHaveBeenCalledOnce();
});
