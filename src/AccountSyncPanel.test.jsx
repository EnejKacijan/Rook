import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountSyncLock, AccountSyncPanel, accountSyncStatus } from './AccountSyncPanel.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const Modal = ({ children, close }) => <div>{children(close)}</div>;
function render(element) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root.render(element));
}
const button = label => [...document.querySelectorAll('button')].find(item => item.textContent.trim() === label);
const click = async element => { await act(async () => element.click()); };
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); root = null; host = null; });

describe('account status copy', () => {
  it('only says Synced when the acknowledged queue is empty', () => {
    expect(accountSyncStatus({ state: 'synced', pendingCount: 0 })).toBe('Synced');
    expect(accountSyncStatus({ state: 'synced', pendingCount: 2 })).toBe('Syncing…');
    expect(accountSyncStatus({ state: 'offline', pendingCount: 2 })).toBe('Offline · saved on this device');
    expect(accountSyncStatus({ state: 'not-configured' })).toBe('Cloud backup is not configured');
  });
});

describe('account sign-out choices', () => {
  it('keeps the linked profile open when sign-out is cancelled', async () => {
    const signOutAccount = vi.fn(async () => {});
    render(<AccountSyncPanel Modal={Modal} sync={{ state: 'synced', linked: true, signOutAccount }}/>);
    await click(button('Sign outYour local data stays on this device›'));
    expect(document.body.textContent).toContain('Your training data will stay on this device');
    await click(button('CANCEL'));
    expect(signOutAccount).not.toHaveBeenCalled();
  });
  it('signs out only after explicit confirmation', async () => {
    const signOutAccount = vi.fn(async () => {});
    render(<AccountSyncPanel Modal={Modal} sync={{ state: 'synced', linked: true, signOutAccount }}/>);
    await click(button('Sign outYour local data stays on this device›'));
    await click(button('SIGN OUT'));
    expect(signOutAccount).toHaveBeenCalledOnce();
  });
  it('requires confirmation before opening a separate unsigned profile', async () => {
    const useSeparateProfile = vi.fn(async () => {});
    render(<AccountSyncLock Modal={Modal} sync={{ signInToThisDevice: vi.fn(), useSeparateProfile }}/>);
    await click(button('Use ROOK without signing in'));
    expect(document.body.textContent).toContain('Your saved profile will stay protected on this device');
    expect(useSeparateProfile).not.toHaveBeenCalled();
    await click(button('GO BACK'));
    expect(useSeparateProfile).not.toHaveBeenCalled();
    await click(button('Use ROOK without signing in'));
    await click(button('CONTINUE'));
    expect(useSeparateProfile).toHaveBeenCalledOnce();
  });
});
