// Explicit, local development opt-in. Production builds reduce this to false.
export function isDevPaywallPreview() {
  return import.meta.env.DEV === true && typeof location !== 'undefined'
    && location.port === '4198'
    && new URLSearchParams(location.search).get('paywallPreview') === '1';
}

// Never pass a simulated Coach reservation to the real billing backend.
export function coachBillingTicket(ticket) {
  if (import.meta.env.DEV && ticket?.localPaywallPreview) {
    if (!isDevPaywallPreview()) throw new Error('Local paywall preview is no longer open.');
    return null;
  }
  return ticket;
}
