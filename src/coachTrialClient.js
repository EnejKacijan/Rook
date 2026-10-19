import { billingIdentity } from './proBilling.js';
import { isDevPaywallPreview } from './devPaywallPreview.js';

async function coachAccessRequest(path, identity, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${identity.token}` },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok && !['limit', 'fair-use'].includes(result.status))
    throw new Error(result.error || 'Coach access could not be checked.');
  return result;
}

export async function beginCoachResponse(requestId, message) {
  if (import.meta.env.DEV && isDevPaywallPreview())
    return (await import('./devPaywallPreviewSession.js')).getPreviewSession().beginCoach(requestId);
  const identity = await billingIdentity();
  const result = await coachAccessRequest('/api/coach/begin', identity, { requestId, message });
  return { ...result, token: identity.token, requestId, uid: identity.uid };
}

export async function finishCoachResponse(ticket, succeeded) {
  if (import.meta.env.DEV && ticket?.localPaywallPreview)
    return (await import('./devPaywallPreviewSession.js')).getPreviewSession().finishCoach(ticket, succeeded);
  return coachAccessRequest('/api/coach/finish', ticket, { requestId: ticket.requestId, succeeded });
}
