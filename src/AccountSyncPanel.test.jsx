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
    expect(accountSyncStatus({ state: 'not-configured', category: 'rollout-off' })).toBe('Cloud backup is not available yet');
    expect(accountSyncStatus({ state: 'auth-unavailable' })).toBe('Account connection needs attention');
  });
  it('does not imply an anonymous cloud copy is recoverable elsewhere or includes photos', () => {
    render(<AccountSyncPanel Modal={Modal} sync={{ state: 'synced', pendingCount: 0, linked: false, secureWithGoogle: vi.fn() }}/>);
    expect(document.body.textContent).toContain('Cloud copy for this device');
    expect(document.body.textContent).toContain('Workout photos stay on this device');
    expect(document.body.textContent).toContain('Secure your account with Google');
  });
});

it('keeps a Google identity collision separate and offers a safe retry without switching profiles', async () => {
  const secureWithGoogle = vi.fn()
    .mockResolvedValueOnce({ status: 'existing-account-conflict' })
    .mockResolvedValueOnce({ status: 'linked' });
  render(<AccountSyncPanel Modal={Modal} sync={{ state: 'synced', pendingCount: 0, linked: false, secureWithGoogle }}/>);
  await click(button('Secure your account with GoogleConnect Google to restore your training data on another device or after reinstalling ROOK›'));
  expect(document.body.textContent).toContain('will not merge the profiles automatically');
  expect(button('KEEP THIS PROFILE')).toBeTruthy();
  await click(button('TRY A DIFFERENT GOOGLE ACCOUNT'));
  expect(secureWithGoogle).toHaveBeenCalledTimes(2);
  expect(document.body.textContent).not.toContain('will not merge the profiles automatically');
});

describe('account sign-out choices', () => {
  it('keeps the linked profile open when sign-out is cancelled', async () => {
    const signOutAccount = vi.fn(async () => {});
    render(<AccountSyncPanel Modal={Modal} sync={{ state: 'synced', linked: true, signOutAccount }}/>);
    await click(button('Sign outYour local data stays on this device›'));
    expect(document.body.textContent).toContain('Your ROOK data will stay on this device');
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
    await click(button('Use another ROOK profile'));
    expect(button('SIGN IN WITH ANOTHER ACCOUNT')).toBeTruthy();
    expect(useSeparateProfile).not.toHaveBeenCalled();
    await click(button('START WITHOUT AN ACCOUNT'));
    expect(document.body.textContent).toContain('Your saved profile will stay protected on this device');
    expect(useSeparateProfile).not.toHaveBeenCalled();
    await click(button('GO BACK'));
    expect(useSeparateProfile).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button('SIGN IN WITH ANOTHER ACCOUNT'));
    await click(button('START WITHOUT AN ACCOUNT'));
    expect(document.activeElement).toBe(button('GO BACK'));
    await click(button('CONTINUE'));
    expect(useSeparateProfile).toHaveBeenCalledOnce();
  });
  it('keeps owner recovery and another-account login separate; cancel does not act', async () => {
    const sync = { signInToThisDevice: vi.fn(async () => {}), signInWithAnotherAccount: vi.fn(async () => {}) };
    render(<AccountSyncLock Modal={Modal} sync={sync}/>);
    await click(button('CONTINUE WITH GOOGLE'));
    expect(sync.signInToThisDevice).toHaveBeenCalledOnce();
    await click(button('Use another ROOK profile'));
    await click(button('CANCEL'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(sync.signInWithAnotherAccount).not.toHaveBeenCalled();
    await click(button('Use another ROOK profile'));
    await click(button('SIGN IN WITH ANOTHER ACCOUNT'));
    expect(sync.signInWithAnotherAccount).toHaveBeenCalledOnce();
    expect(document.body.textContent).not.toMatch(/Delete local data|Delete account|Start over/i);
  });
  it('prevents duplicate submissions and presents a failure inside the choice, without onboarding', async () => {
    let reject;
    const signInWithAnotherAccount = vi.fn(() => new Promise((_, fail) => { reject = fail; }));
    render(<AccountSyncLock Modal={Modal} sync={{ signInWithAnotherAccount }}/>);
    await click(button('Use another ROOK profile'));
    const action = button('SIGN IN WITH ANOTHER ACCOUNT');
    await act(async () => { action.click(); action.click(); });
    expect(signInWithAnotherAccount).toHaveBeenCalledOnce();
    expect(button('START WITHOUT AN ACCOUNT').disabled).toBe(true);
    expect(document.querySelector('[role="dialog"]').dispatchEvent(new CustomEvent('rook:before-sheet-close', { cancelable: true }))).toBe(false);
    await act(async () => reject(new Error('Account check unavailable. Your data is protected.')));
    expect(document.querySelector('[role="dialog"] [role="alert"]').textContent).toContain('Account check unavailable');
    expect(button('START WITHOUT AN ACCOUNT').disabled).toBe(false);
    expect(document.querySelector('[role="dialog"]').dispatchEvent(new CustomEvent('rook:before-sheet-close', { cancelable: true }))).toBe(true);
    expect(document.body.textContent).toContain('This device has saved training data');
  });
});
