import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_STORAGE_KEY, FUNNEL_EVENTS, readFunnelEvents, trackFunnelEvent, trackFunnelEventOnce } from './analytics.js';

describe('privacy-conscious funnel analytics', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it('defines the complete product and monetization funnel without requiring an SDK', () => {
    expect(FUNNEL_EVENTS).toEqual(expect.arrayContaining(['app_open', 'onboarding_started', 'onboarding_completed', 'plan_generation_started', 'plan_generation_completed', 'plan_generation_failed', 'first_plan_viewed', 'first_workout_started', 'first_workout_completed', 'paywall_viewed', 'purchase_started', 'purchase_completed', 'purchase_failed']));
  });

  it('keeps only approved, non-content properties and emits an adapter event', () => {
    const listener = vi.fn(); addEventListener('lift:analytics', listener);
    trackFunnelEvent('onboarding_step_completed', { step: 'schedule', stepIndex: 4, name: 'Alex', notes: 'private injury detail' });
    expect(readFunnelEvents()[0]).toMatchObject({ name: 'onboarding_step_completed', properties: { step: 'schedule', stepIndex: 4 } });
    expect(localStorage.getItem(ANALYTICS_STORAGE_KEY)).not.toMatch(/Alex|injury/i); expect(listener).toHaveBeenCalledOnce(); removeEventListener('lift:analytics', listener);
  });

  it('deduplicates lifetime milestones and session app opens independently', () => {
    expect(trackFunnelEventOnce('first_plan_viewed')).toBe(true); expect(trackFunnelEventOnce('first_plan_viewed')).toBe(false);
    expect(trackFunnelEventOnce('app_open', {}, 'session')).toBe(true); expect(trackFunnelEventOnce('app_open', {}, 'session')).toBe(false);
    expect(readFunnelEvents().map(event => event.name)).toEqual(['first_plan_viewed', 'app_open']);
  });
});
