import { getFirebaseSyncClient, resolveFirebaseIdentity } from './firebaseSyncClient.js';
import { ROOK_PRO_ENTITLEMENT } from './proPolicy.js';
import { annualTrialEligible } from './proPaywallPresentation.js';

let purchasesPromise;

export async function billingIdentity() {
  const client = await getFirebaseSyncClient();
  if (!client) throw new Error('Account access is not configured.');
  const { user } = await resolveFirebaseIdentity(client);
  if (!user) throw new Error('Account access is unavailable.');
  return { uid: user.uid, token: await user.getIdToken() };
}

async function purchasesFor(uid) {
  const key = import.meta.env.VITE_ROOK_REVENUECAT_PUBLIC_KEY;
  if (!key) throw new Error('ROOK Pro checkout is not configured.');
  purchasesPromise ||= import('@revenuecat/purchases-js').then(({ Purchases }) =>
    Purchases.isConfigured() ? Purchases.getSharedInstance() : Purchases.configure({ apiKey: key, appUserId: uid }));
  const purchases = await purchasesPromise;
  if (purchases.getAppUserId() !== uid) await purchases.changeUser(uid);
  return purchases;
}

export async function loadRookProBilling() {
  const identity = await billingIdentity();
  const purchases = await purchasesFor(identity.uid);
  purchases.invalidateOfferingsCache();
  const [info, offerings] = await Promise.all([purchases.getCustomerInfo(), purchases.getOfferings()]);
  if (offerings.current?.monthly?.product?.normalPeriodDuration !== 'P1M'
    || offerings.current?.annual?.product?.normalPeriodDuration !== 'P1Y')
    throw new Error('ROOK Pro monthly and annual billing periods are not configured.');
  if (offerings.current.monthly.product.defaultSubscriptionOption?.trial)
    throw new Error('ROOK Pro Monthly must not include a trial.');
  return {
    identity,
    info,
    products: {
      monthly: offerings.current?.monthly || null,
      annual: offerings.current?.annual || null,
    },
    sdkActive: Boolean(info.entitlements.active[ROOK_PRO_ENTITLEMENT]),
    managementUrl: info.managementURL || null,
  };
}

export async function trustedProAccess(identity) {
  const response = await fetch('/api/pro/access', {
    headers: { Authorization: `Bearer ${identity.token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('ROOK Pro access could not be verified.');
  return response.json();
}

export async function purchaseRookPro(rcPackage, expectedUid) {
  const identity = await billingIdentity();
  if (expectedUid && identity.uid !== expectedUid)
    throw new Error('Account changed during purchase. Open ROOK Pro again.');
  const purchases = await purchasesFor(identity.uid);
  // Re-check the real offer before checkout. Stale eligibility must not turn a
  // displayed free trial into an unexpected paid purchase.
  purchases.invalidateOfferingsCache();
  const offerings = await purchases.getOfferings();
  const key = rcPackage.product.normalPeriodDuration === 'P1Y' ? 'annual' : 'monthly';
  const current = offerings.current?.[key];
  if (!current || current.product.identifier !== rcPackage.product.identifier
    || current.product.normalPeriodDuration !== rcPackage.product.normalPeriodDuration
    || current.product.price.amountMicros !== rcPackage.product.price.amountMicros
    || current.product.price.currency !== rcPackage.product.price.currency
    || current.product.price.formattedPrice !== rcPackage.product.price.formattedPrice
    || annualTrialEligible(current) !== annualTrialEligible(rcPackage)
    || (key === 'monthly' && current.product.defaultSubscriptionOption?.trial))
    throw Object.assign(new Error('Subscription offer changed.'), { code: 'offer-changed' });
  const beforeCheckout = (await getFirebaseSyncClient()).auth.currentUser;
  if (beforeCheckout?.uid !== identity.uid || purchases.getAppUserId() !== identity.uid)
    throw new Error('Account changed during purchase. Open ROOK Pro again.');
  const result = await purchases.purchase({ rcPackage: current });
  if (!result.customerInfo?.entitlements?.active?.[ROOK_PRO_ENTITLEMENT])
    return { status: 'pending' };
  // A checkout callback alone is not authorization. The server verifies the
  // same UID and entitlement before any access-changing continuation.
  const currentUser = (await getFirebaseSyncClient()).auth.currentUser;
  if (currentUser?.uid !== identity.uid) throw new Error('Account changed during purchase. Open ROOK Pro again.');
  const verified = await trustedProAccess({ uid: identity.uid, token: await currentUser.getIdToken(true) });
  return verified.status === 'active' ? { status: 'active', identity } : { status: 'pending' };
}
