import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { RookProPaywall } from './RookProPaywall.jsx';
import { getPreviewSession } from './devPaywallPreviewSession.js';
import './devPaywallPreview.css';

function PreviewHeader({ Header, ...props }) {
  return <><Header {...props}/><p className="local-paywall-preview-label">Local preview · Example prices · No payment</p></>;
}

export default function DevPaywallPreviewProvider({ children, Modal, Header, AccessContext }) {
  const session = getPreviewSession();
  const access = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [paywall, setPaywall] = useState(null);
  const backgroundRef = useRef(null), returnFocusRef = useRef(null), inFlight = useRef(false), pendingRef = useRef(null);
  pendingRef.current = paywall;
  useEffect(() => {
    document.documentElement.dataset.localPaywallPreview = 'true';
    return () => { delete document.documentElement.dataset.localPaywallPreview; };
  }, []);
  const close = useCallback(() => { pendingRef.current = null; setPaywall(null); }, []);
  const openPaywall = useCallback((context, onVerified) => {
    if (pendingRef.current) return false;
    backgroundRef.current = Array.from(document.querySelectorAll('.modal-layer')).at(-1) || document.querySelector('.app-shell');
    returnFocusRef.current = document.activeElement;
    const pending = { context, onVerified };
    pendingRef.current = pending;
    setPaywall(pending);
    return true;
  }, []);
  const purchase = useCallback(async item => {
    const pending = pendingRef.current;
    if (!pending || inFlight.current) return { status: 'unavailable' };
    inFlight.current = true;
    try {
      const result = await session.purchase(item);
      if (pendingRef.current === pending) {
        close();
        await pending.onVerified?.(result.identity);
      }
      return result;
    } finally { inFlight.current = false; }
  }, [session, close]);
  return <AccessContext.Provider value={{ ...access, openPaywall, purchase, refresh: session.refresh }}>
    <div className="local-paywall-preview-strip"><span>Local preview · No payment · {access.status === 'active' ? 'Pro' : 'Free'}</span>
      {access.status === 'active' && <button type="button" onClick={session.resetAccess}>Reset to Free</button>}
    </div>
    {children}
    {paywall && Modal && Header && createPortal(<Modal close={close} backgroundRef={backgroundRef} returnFocusRef={returnFocusRef}
      lockDocument={!backgroundRef.current?.matches('.modal-layer')}>
      {requestClose => <RookProPaywall context={paywall.context} products={access.products} close={requestClose}
        purchase={purchase} refresh={session.refresh} Header={props => <PreviewHeader Header={Header} {...props}/>} />}
    </Modal>, document.body)}
  </AccessContext.Provider>;
}
