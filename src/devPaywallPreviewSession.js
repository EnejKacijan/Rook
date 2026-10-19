import { isDevPaywallPreview } from './devPaywallPreview.js';
import { FREE_COACH_RESPONSES, ROOK_PRO_ENTITLEMENT } from './proPolicy.js';

// Disposable UI simulation. No billing SDK, auth calls, store receipts, local
// storage, expiry clock or account/subscription mutations belong here.
const example = (period, amount, trial = false) => ({ product: {
  identifier: `local-app-preview-${period}`, normalPeriodDuration: period,
  price: { amountMicros: Math.round(amount * 1e6), currency: 'EUR', formattedPrice: `€${amount.toFixed(2)}` },
  defaultSubscriptionOption: { trial: trial ? { periodDuration: 'P7D', price: null, cycleCount: 1 } : null, introPrice: null },
} });

export function createPreviewSession() {
  if (!import.meta.env.DEV) throw new Error('Local paywall preview is development-only.');
  const products = { annual: example('P1Y', 39.99, true), monthly: example('P1M', 5.99) };
  const identity = Object.freeze({ uid: 'local-paywall-preview' });
  const listeners = new Set(), reservations = new Map();
  let snapshot = { rollout: true, status: 'free', entitlement: null, identityUid: identity.uid,
    products, managementUrl: null, freeCoachResponsesUsed: 0, localPaywallPreview: true };
  const publish = changes => {
    snapshot = { ...snapshot, ...changes };
    listeners.forEach(listener => listener());
    return snapshot;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    refresh: async () => snapshot,
    resetAccess: () => publish({ status: 'free', entitlement: null, lastVerifiedActive: false }),
    purchase: async item => {
      if (![products.annual, products.monthly].includes(item)) throw new Error('Unknown local preview package.');
      publish({ status: 'active', entitlement: ROOK_PRO_ENTITLEMENT, lastVerifiedActive: true });
      return { status: 'active', identity, localPaywallPreview: true };
    },
    beginCoach: (requestId) => {
      const existing = reservations.get(requestId);
      if (existing) return existing;
      const pro = snapshot.status === 'active';
      const pending = [...reservations.values()].filter(ticket => !ticket.pro && ticket.status === 'pending').length;
      if (!pro && snapshot.freeCoachResponsesUsed + pending >= FREE_COACH_RESPONSES) return { status: 'limit' };
      const ticket = { status: 'pending', pro, requestId, uid: identity.uid, localPaywallPreview: true };
      reservations.set(requestId, ticket);
      return ticket;
    },
    finishCoach: (ticket, succeeded) => {
      const reserved = reservations.get(ticket.requestId);
      if (!reserved || reserved.status !== 'pending') return { status: reserved?.status || 'failed' };
      reserved.status = succeeded ? 'completed' : 'failed';
      if (succeeded && !reserved.pro) publish({ freeCoachResponsesUsed: snapshot.freeCoachResponsesUsed + 1 });
      if (!succeeded) reservations.delete(ticket.requestId);
      return { status: reserved.status };
    },
  };
}

let session;
export function getPreviewSession() {
  if (!isDevPaywallPreview()) throw new Error('Local paywall preview is not enabled.');
  return session ||= createPreviewSession();
}
