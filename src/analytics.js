export const FUNNEL_EVENTS = Object.freeze([
  'app_open',
  'onboarding_started',
  'onboarding_step_viewed',
  'onboarding_step_completed',
  'onboarding_completed',
  'plan_generation_started',
  'plan_generation_completed',
  'plan_generation_failed',
  'first_plan_viewed',
  'first_workout_started',
  'first_workout_completed',
  'paywall_viewed',
  'purchase_started',
  'purchase_completed',
  'purchase_failed'
]);

export const ANALYTICS_STORAGE_KEY = 'lift-funnel-events-v1';
const LIFETIME_ONCE_KEY = 'lift-funnel-once-v1';
const SESSION_ONCE_KEY = 'lift-funnel-session-once-v1';
const MAX_EVENTS = 250;
const allowedProperties = new Set(['path', 'step', 'stepIndex', 'totalSteps', 'planType', 'source', 'durationMs', 'daysPerWeek', 'sessionMinutes', 'exerciseCount', 'setCount', 'endedEarly', 'placement', 'offeringId', 'productId', 'reason']);

function readJson(storage, key, fallback) {
  try { const value = JSON.parse(storage?.getItem(key) || 'null'); return value ?? fallback; }
  catch { return fallback; }
}

function safeProperties(properties = {}) {
  return Object.fromEntries(Object.entries(properties).filter(([key, value]) => allowedProperties.has(key) && ['string', 'number', 'boolean'].includes(typeof value) && (typeof value !== 'number' || Number.isFinite(value))).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 80) : value]));
}

export function readFunnelEvents() { return readJson(globalThis.localStorage, ANALYTICS_STORAGE_KEY, []); }

export function trackFunnelEvent(name, properties = {}) {
  if (!FUNNEL_EVENTS.includes(name)) return false;
  const event = { name, properties: safeProperties(properties), occurredAt: new Date().toISOString() };
  try {
    const events = readFunnelEvents(); events.push(event); globalThis.localStorage?.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
    globalThis.dispatchEvent?.(new CustomEvent('lift:analytics', { detail: event }));
    return true;
  } catch { return false; }
}

export function trackFunnelEventOnce(name, properties = {}, scope = 'lifetime') {
  const storage = scope === 'session' ? globalThis.sessionStorage : globalThis.localStorage; const key = scope === 'session' ? SESSION_ONCE_KEY : LIFETIME_ONCE_KEY;
  const recorded = readJson(storage, key, []); if (recorded.includes(name)) return false;
  if (!trackFunnelEvent(name, properties)) return false;
  try { storage?.setItem(key, JSON.stringify([...recorded, name])); } catch { /* Analytics must never block the product. */ }
  return true;
}

