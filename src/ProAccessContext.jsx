import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getFirebaseSyncClient } from './firebaseSyncClient.js';
import { loadRookProBilling, purchaseRookPro, trustedProAccess } from './proBilling.js';
import { ROOK_PRO_ENTITLEMENT, ROOK_PRO_ROLLOUT } from './proPolicy.js';
import { RookProPaywall } from './RookProPaywall.jsx';
import { isDevPaywallPreview } from './devPaywallPreview.js';

const ProAccessContext = createContext(null);
const disabled = { rollout: false, status: 'disabled', entitlement: null, products: null, managementUrl: null };

const LocalPreviewProvider = import.meta.env.DEV
  ? React.lazy(() => import('./DevPaywallPreviewProvider.jsx')) : null;

export function ProAccessProvider(props) {
  if (LocalPreviewProvider && isDevPaywallPreview())
    return <React.Suspense fallback={<p role="status">Opening local preview…</p>}>
      <LocalPreviewProvider {...props} AccessContext={ProAccessContext}/>
    </React.Suspense>;
  return <StoreProAccessProvider {...props}/>;
}

function StoreProAccessProvider({ children, Modal, Header }) {
  const [access, setAccess] = useState(() => ROOK_PRO_ROLLOUT
    ? { ...disabled, rollout: true, status: 'loading' } : disabled);
  const [paywall, setPaywall] = useState(null);
  const backgroundRef = useRef(null);
  const returnFocusRef = useRef(null);
  const refreshRun = useRef(0);
  const purchaseInFlight = useRef(false);
  const completedPaywall = useRef(null);
  const currentPaywall = useRef(paywall);
  currentPaywall.current = paywall;
  const refresh = useCallback(async () => {
    if (!ROOK_PRO_ROLLOUT) return disabled;
    const run = ++refreshRun.current;
    try {
      const billing = await loadRookProBilling();
      const server = await trustedProAccess(billing.identity);
      if (run !== refreshRun.current) return null;
      if (!server.rollout || !billing.products.monthly || !billing.products.annual) {
        setAccess(disabled); return disabled;
      }
      const next = {
        rollout: true,
        status: server.status === 'active' && billing.sdkActive ? 'active' : server.status === 'free' ? 'free' : 'unknown',
        entitlement: server.status === 'active' && billing.sdkActive ? ROOK_PRO_ENTITLEMENT : null,
        products: billing.products,
        managementUrl: billing.managementUrl,
        identityUid: billing.identity.uid,
        freeCoachResponsesUsed: server.freeCoachResponsesUsed,
      };
      setAccess(current => ({ ...next, lastVerifiedActive: next.status === 'active'
        || (next.status === 'unknown' && current.lastVerifiedActive === true) }));
      return next;
    } catch {
      if (run !== refreshRun.current) return null;
      setAccess(current => current.rollout ? { ...current, status: 'unknown' } : current);
      return null;
    }
  }, []);
  useEffect(() => { if (ROOK_PRO_ROLLOUT) refresh(); }, [refresh]);
  useEffect(() => {
    if (!ROOK_PRO_ROLLOUT) return undefined;
    let stopped = false, unsubscribe = () => {};
    Promise.all([getFirebaseSyncClient(), import('firebase/auth')]).then(([client, { onAuthStateChanged }]) => {
      if (stopped || !client) return;
      unsubscribe = onAuthStateChanged(client.auth, user => {
        setPaywall(current => current && current.uid !== user?.uid ? null : current);
        setAccess(current => current.identityUid && current.identityUid !== user?.uid
          ? { ...disabled, rollout: true, status: 'loading' } : current);
        refresh();
      });
    }).catch(() => {});
    const onForeground = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onForeground);
    return () => { stopped = true; unsubscribe(); document.removeEventListener('visibilitychange', onForeground); };
  }, [refresh]);
  const purchase = useCallback(async (rcPackage, expectedUid) => {
    try {
      const result = await purchaseRookPro(rcPackage, expectedUid);
      if (result.status === 'active') {
        const verified = await refresh();
        if (verified?.status !== 'active' || verified.identityUid !== result.identity.uid)
          return { status: 'pending' };
      }
      return result;
    } catch (error) {
      if (error?.code === 'offer-changed') await refresh();
      throw error;
    }
  }, [refresh]);
  const openPaywall = useCallback((context, onVerified) => {
    if (!access.rollout || access.status === 'unknown' || access.status === 'loading') return false;
    if (paywall) return false;
    backgroundRef.current = Array.from(document.querySelectorAll('.modal-layer')).at(-1)
      || document.querySelector('.app-shell');
    returnFocusRef.current = document.activeElement;
    setPaywall({ context, onVerified, uid: access.identityUid });
    return true;
  }, [access.rollout, access.status, access.identityUid, paywall]);
  const closePaywall = useCallback(() => { currentPaywall.current = null; setPaywall(null); }, []);
  const buy = useCallback(async rcPackage => {
    const pending = paywall;
    if (!pending || purchaseInFlight.current || completedPaywall.current === pending)
      return { status: 'unavailable' };
    purchaseInFlight.current = true;
    try {
      const result = await purchase(rcPackage, pending.uid);
      if (result.status !== 'active' || result.identity.uid !== pending.uid) return { status: 'pending' };
      if (currentPaywall.current !== pending) return result;
      completedPaywall.current = pending;
      setPaywall(null);
      await pending.onVerified?.(result.identity);
      return result;
    } finally { purchaseInFlight.current = false; }
  }, [paywall, purchase]);
  return <ProAccessContext.Provider value={{ ...access, refresh, purchase, openPaywall }}>
    {children}
    {paywall && Modal && Header && createPortal(<Modal close={closePaywall} backgroundRef={backgroundRef} returnFocusRef={returnFocusRef}
      lockDocument={!backgroundRef.current?.matches('.modal-layer')}>
      {requestClose => <RookProPaywall context={paywall.context} products={access.products} managementUrl={access.managementUrl}
        close={requestClose} purchase={buy} refresh={refresh} Header={Header} />}
    </Modal>, document.body)}
  </ProAccessContext.Provider>;
}

export function useProAccess() {
  return useContext(ProAccessContext) || { ...disabled, refresh: async () => disabled,
    purchase: async () => ({ status: 'unavailable' }), openPaywall: () => false };
}
