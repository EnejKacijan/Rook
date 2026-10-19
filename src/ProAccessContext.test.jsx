import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ProAccessProvider, useProAccess } from './ProAccessContext.jsx';

const mocks = vi.hoisted(() => ({ load: vi.fn(), purchase: vi.fn(), server: vi.fn(), identityListener: null }));
vi.mock('./proBilling.js', () => ({ loadRookProBilling: mocks.load, purchaseRookPro: mocks.purchase, trustedProAccess: mocks.server }));
vi.mock('./proPolicy.js', async () => ({ ...await vi.importActual('./proPolicy.js'), ROOK_PRO_ROLLOUT: true }));
vi.mock('./firebaseSyncClient.js', () => ({ getFirebaseSyncClient: async () => ({ auth: {} }) }));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: (_auth, fn) => { mocks.identityListener = fn; return () => {}; } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host, access;
const resume = vi.fn();
const item = (period, amount) => ({ product: { identifier: period, normalPeriodDuration: period, price: { amountMicros: amount * 1e6, currency: 'EUR', formattedPrice: `€${amount}` }, defaultSubscriptionOption: { trial: period === 'P1Y' ? { price: null, periodDuration: 'P7D', cycleCount: 1 } : null } } });
const products = { annual: item('P1Y', 39.99), monthly: item('P1M', 5.99) };
const identity = { uid: 'billing-user', token: 'synthetic-token' };
const billing = sdkActive => ({ identity, products, sdkActive });
const Modal = ({ children, close }) => <div className="modal-layer">{children(close)}</div>;
const Header = ({ onClose }) => <button onClick={onClose}>Close ROOK Pro</button>;
function Consumer() { access = useProAccess(); return <div className="app-shell"><span>{access.status}</span></div>; }
async function show() {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<ProAccessProvider Modal={Modal} Header={Header}><Consumer /></ProAccessProvider>));
}
const button = label => [...document.querySelectorAll('button')].find(b => b.textContent === label);
const click = async target => act(async () => target.click());
beforeEach(() => {
  vi.clearAllMocks(); mocks.identityListener = null;
  mocks.load.mockResolvedValue(billing(false)); mocks.server.mockResolvedValue({ rollout: true, status: 'free', freeCoachResponsesUsed: 2 });
  mocks.purchase.mockResolvedValue({ status: 'pending' });
});
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); root = null; document.querySelectorAll('.modal-layer').forEach(el => el.remove()); });

it('D/E: install/open, sign-in and opening a contextual paywall do not purchase or start a trial', async () => {
  await show();
  expect(access.status).toBe('free'); expect(document.querySelector('.rook-pro-paywall')).toBeNull();
  await act(async () => mocks.identityListener({ uid: identity.uid }));
  expect(mocks.purchase).not.toHaveBeenCalled();
  await act(async () => access.openPaywall('generated_plan_apply', resume));
  expect(button('START 7-DAY FREE TRIAL')).toBeTruthy();
  expect(mocks.purchase).not.toHaveBeenCalled(); expect(resume).not.toHaveBeenCalled(); expect(access.status).toBe('free');
});
it.each(['generated_plan_apply', 'saved_workout_limit', 'premium_style', 'coach_limit'])('G: verified trial purchase activates Pro and resumes %s exactly once', async context => {
  await show(); await act(async () => access.openPaywall(context, resume));
  mocks.load.mockResolvedValue(billing(true)); mocks.server.mockResolvedValue({ rollout: true, status: 'active', freeCoachResponsesUsed: 2 });
  mocks.purchase.mockResolvedValue({ status: 'active', identity });
  await click(button('START 7-DAY FREE TRIAL'));
  expect(access.status).toBe('active'); expect(access.entitlement).toBe('rook_pro');
  expect(mocks.purchase).toHaveBeenCalledWith(products.annual, identity.uid);
  expect(resume).toHaveBeenCalledExactlyOnceWith(identity); expect(document.querySelector('.rook-pro-paywall')).toBeNull();
});
it('F: purchase cancellation and pending result do not mutate entitlement or resume', async () => {
  await show(); await act(async () => access.openPaywall('generated_plan_apply', resume));
  mocks.purchase.mockRejectedValueOnce({ errorCode: 1 });
  await click(button('START 7-DAY FREE TRIAL'));
  expect(access.status).toBe('free'); expect(access.entitlement).toBeNull(); expect(resume).not.toHaveBeenCalled();
  await click(button('START 7-DAY FREE TRIAL'));
  expect(access.status).toBe('free'); expect(resume).not.toHaveBeenCalled();
});
it('H: disabling renewal retains Pro while canonical store entitlement is active; expiry returns Free without resetting Coach', async () => {
  mocks.load.mockResolvedValue({ ...billing(true), info: { entitlements: { active: { rook_pro: { periodType: 'trial', willRenew: false } } } } });
  mocks.server.mockResolvedValue({ rollout: true, status: 'active', freeCoachResponsesUsed: 2 });
  await show(); expect(access.status).toBe('active');
  await act(async () => access.refresh()); expect(access.status).toBe('active');
  mocks.load.mockResolvedValue(billing(false)); mocks.server.mockResolvedValue({ rollout: true, status: 'free', freeCoachResponsesUsed: 2 });
  await act(async () => access.refresh());
  expect(access.status).toBe('free'); expect(access.entitlement).toBeNull(); expect(access.freeCoachResponsesUsed).toBe(2);
});
it.each(['trial', 'annual', 'monthly', 'canceled-active', 'expired'])('N: restoration uses one canonical entitlement for %s', async kind => {
  await show(); await act(async () => access.openPaywall('generated_plan_apply', resume));
  const active = kind !== 'expired';
  mocks.load.mockResolvedValue(billing(active)); mocks.server.mockResolvedValue({ rollout: true, status: active ? 'active' : 'free', freeCoachResponsesUsed: 2 });
  await click(button('Restore purchases'));
  expect(access.status).toBe(active ? 'active' : 'free'); expect(access.entitlement).toBe(active ? 'rook_pro' : null);
  expect(resume).not.toHaveBeenCalled(); expect(mocks.purchase).not.toHaveBeenCalled();
});
it('account change closes the prior account paywall without buying or resuming', async () => {
  await show(); await act(async () => access.openPaywall('generated_plan_apply', resume));
  await act(async () => mocks.identityListener({ uid: 'other-billing-user' }));
  expect(document.querySelector('.rook-pro-paywall')).toBeNull(); expect(mocks.purchase).not.toHaveBeenCalled(); expect(resume).not.toHaveBeenCalled();
});
it('a dismissed paywall does not resume an abandoned action if checkout completes later', async () => {
  let resolve;
  mocks.purchase.mockImplementation(() => new Promise(done => { resolve = done; }));
  await show(); await act(async () => access.openPaywall('generated_plan_apply', resume));
  await click(button('START 7-DAY FREE TRIAL')); await click(button('Close ROOK Pro'));
  mocks.load.mockResolvedValue(billing(true)); mocks.server.mockResolvedValue({ rollout: true, status: 'active' });
  await act(async () => resolve({ status: 'active', identity }));
  expect(access.status).toBe('active'); expect(resume).not.toHaveBeenCalled();
});

it('a purchase callback cannot resume if refreshed canonical access fails to confirm activation', async () => {
  await show(); await act(async () => access.openPaywall('generated_plan_apply', resume));
  mocks.purchase.mockResolvedValue({ status: 'active', identity });
  // The authoritative refresh still says Free: never force the continuation.
  await click(button('START 7-DAY FREE TRIAL'));
  expect(access.status).toBe('free'); expect(resume).not.toHaveBeenCalled();
  expect(document.querySelector('.rook-pro-paywall')).not.toBeNull();
});
