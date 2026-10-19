import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { loadRookProBilling, purchaseRookPro } from './proBilling.js';
const m = vi.hoisted(() => ({ key: null, uid: 'billing-user', offerings: null, customer: null, checkout: vi.fn(), info: vi.fn(), offers: vi.fn(), invalidate: vi.fn(), changeUser: vi.fn(), currentUid: 'billing-user', server: 'active' }));
vi.mock('./firebaseSyncClient.js', () => ({
  getFirebaseSyncClient: async () => ({ auth: { currentUser: { uid: m.currentUid, getIdToken: async () => 'refreshed-synthetic-token' } } }),
  resolveFirebaseIdentity: async () => ({ user: { uid: m.uid, getIdToken: async () => 'synthetic-token' } }),
}));
vi.mock('@revenuecat/purchases-js', () => {
  const sdk = { getAppUserId: () => m.uid, changeUser: m.changeUser, getCustomerInfo: m.info, getOfferings: m.offers, invalidateOfferingsCache: m.invalidate, purchase: m.checkout };
  return { Purchases: { isConfigured: () => false, configure: () => sdk } };
});
const item = (period, trial = false) => ({ product: { identifier: period, normalPeriodDuration: period, price: { amountMicros: period === 'P1Y' ? 39990000 : 5990000, currency: 'EUR', formattedPrice: period === 'P1Y' ? '€39.99' : '€5.99' }, defaultSubscriptionOption: { trial: trial ? { price: null, periodDuration: 'P7D', cycleCount: 1 } : null } } });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('VITE_ROOK_REVENUECAT_PUBLIC_KEY', 'synthetic-test-key');
  m.uid = m.currentUid = 'billing-user'; m.server = 'active';
  m.offerings = { current: { annual: item('P1Y', true), monthly: item('P1M') } };
  m.info.mockImplementation(async () => ({ entitlements: { active: {} } }));
  m.offers.mockImplementation(async () => m.offerings);
  m.checkout.mockImplementation(async () => ({ customerInfo: { entitlements: { active: { rook_pro: { periodType: 'trial', willRenew: false } } } } }));
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ status: m.server }) })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('loads account-specific offers without starting a trial', async () => {
  const value = await loadRookProBilling();
  expect(value.products.annual.product.defaultSubscriptionOption.trial.periodDuration).toBe('P7D');
  expect(m.checkout).not.toHaveBeenCalled(); expect(m.invalidate).toHaveBeenCalled();
});
it('refuses Monthly with a trial without changing product configuration', async () => {
  m.offerings.current.monthly = item('P1M', true);
  await expect(loadRookProBilling()).rejects.toThrow('Monthly must not include a trial');
  await expect(purchaseRookPro(m.offerings.current.monthly, m.uid)).rejects.toMatchObject({ code: 'offer-changed' });
  expect(m.checkout).not.toHaveBeenCalled();
});
it('success requires active SDK entitlement and independent server verification', async () => {
  const result = await purchaseRookPro(m.offerings.current.annual, m.uid);
  expect(result.status).toBe('active'); expect(result.identity.uid).toBe(m.uid);
  expect(fetch).toHaveBeenCalledOnce();
});
it('SDK success with no real entitlement never unlocks or calls server', async () => {
  m.checkout.mockResolvedValue({ customerInfo: { entitlements: { active: {} } } });
  expect(await purchaseRookPro(m.offerings.current.annual, m.uid)).toEqual({ status: 'pending' });
  expect(fetch).not.toHaveBeenCalled();
});
it('SDK entitlement alone cannot bypass server verification', async () => {
  m.server = 'free';
  expect(await purchaseRookPro(m.offerings.current.annual, m.uid)).toEqual({ status: 'pending' });
});
it('F: checkout cancel rejects without server verification or fake activation', async () => {
  m.checkout.mockRejectedValue({ errorCode: 1 });
  await expect(purchaseRookPro(m.offerings.current.annual, m.uid)).rejects.toMatchObject({ errorCode: 1 });
  expect(fetch).not.toHaveBeenCalled();
});
it('changing store eligibility before checkout refreshes the offer and prevents an unexpected charge', async () => {
  const shown = m.offerings.current.annual;
  m.offerings.current.annual = item('P1Y');
  await expect(purchaseRookPro(shown, m.uid)).rejects.toMatchObject({ code: 'offer-changed' });
  expect(m.checkout).not.toHaveBeenCalled();
});
it('a changed billing-account identity cannot purchase the previous account offer', async () => {
  await expect(purchaseRookPro(m.offerings.current.annual, 'previous-user')).rejects.toThrow('Account changed');
  expect(m.checkout).not.toHaveBeenCalled();
});
it('account change during checkout never verifies or grants the new account access', async () => {
  m.checkout.mockImplementation(async () => { m.currentUid = 'other-user'; return { customerInfo: { entitlements: { active: { rook_pro: {} } } } }; });
  await expect(purchaseRookPro(m.offerings.current.annual, m.uid)).rejects.toThrow('Account changed');
  expect(fetch).not.toHaveBeenCalled();
});
it('price changes between display and purchase stop checkout for review', async () => {
  const shown = structuredClone(m.offerings.current.annual);
  m.offerings.current.annual.product.price.amountMicros = 49990000;
  await expect(purchaseRookPro(shown, m.uid)).rejects.toMatchObject({ code: 'offer-changed' });
  expect(m.checkout).not.toHaveBeenCalled();
});
