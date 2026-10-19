import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import DevPaywallPreviewProvider from './DevPaywallPreviewProvider.jsx';
import { ProAccessProvider, useProAccess } from './ProAccessContext.jsx';
import { getPreviewSession } from './devPaywallPreviewSession.js';

const billing = vi.hoisted(() => ({ load: vi.fn(), purchase: vi.fn(), server: vi.fn() }));
vi.mock('./proBilling.js', () => ({ loadRookProBilling: billing.load, purchaseRookPro: billing.purchase, trustedProAccess: billing.server }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host, access;
const resume = vi.fn();
const Modal = ({ children, close }) => <div className="modal-layer">{children(close)}</div>;
const Header = ({ onClose }) => <button onClick={onClose}>Close ROOK Pro</button>;
function Consumer() { access = useProAccess(); return <div className="app-shell">Normal app</div>; }
const button = label => [...document.querySelectorAll('button')].find(b => b.textContent === label);
const click = async label => act(async () => button(label).click());
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubEnv('DEV', true);
  vi.stubGlobal('location', { port: '4198', search: '?paywallPreview=1' });
  getPreviewSession().resetAccess();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  // Preload the lazy chunk before rendering the normal provider wrapper.
  await import('./DevPaywallPreviewProvider.jsx');
  await act(async () => root.render(<ProAccessProvider Modal={Modal} Header={Header}><Consumer /></ProAccessProvider>));
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

it('opening and closing preview leaves Free access and never invokes real billing', async () => {
  expect(access.status).toBe('free');
  expect(document.body.textContent).toContain('Normal app');
  expect(document.querySelector('.rook-pro-paywall')).toBeNull();
  await act(async () => access.openPaywall('premium_style', resume));
  expect(document.body.textContent).toContain('Local preview · Example prices · No payment');
  await click('Close ROOK Pro');
  expect(access.status).toBe('free'); expect(resume).not.toHaveBeenCalled();
  Object.values(billing).forEach(mock => expect(mock).not.toHaveBeenCalled());
});

it('simulated trial resumes the contextual action once; reset allows another preview', async () => {
  await act(async () => access.openPaywall('premium_style', resume));
  await click('START 7-DAY FREE TRIAL');
  expect(access.status).toBe('active'); expect(access.localPaywallPreview).toBe(true);
  expect(resume).toHaveBeenCalledExactlyOnceWith({ uid: 'local-paywall-preview' });
  expect(document.querySelector('.rook-pro-paywall')).toBeNull();
  await click('Reset to Free');
  expect(access.status).toBe('free');
  await act(async () => access.openPaywall('saved_workout_limit', resume));
  await click('Restore purchases');
  expect(access.status).toBe('free'); expect(resume).toHaveBeenCalledTimes(1);
  Object.values(billing).forEach(mock => expect(mock).not.toHaveBeenCalled());
});
