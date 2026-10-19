import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { RookProPaywall } from './RookProPaywall.jsx';
import { annualMonthlyEquivalent, annualSavingPercent, annualTrialEligible } from './proPaywallPresentation.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
export const pkg = (amount, period, eligible = false, currency = 'EUR') => ({ product: {
  identifier: `test-${period}`, normalPeriodDuration: period,
  price: { amountMicros: Math.round(amount * 1e6), currency, formattedPrice: `€${amount.toFixed(2)}` },
  defaultSubscriptionOption: { trial: eligible ? { periodDuration: 'P7D', price: null, cycleCount: 1 } : null, introPrice: null },
} });
const products = eligible => ({ annual: pkg(39.99, 'P1Y', eligible), monthly: pkg(5.99, 'P1M') });
const Header = ({ onClose }) => <button onClick={onClose}>Close ROOK Pro</button>;
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent === label);
async function show(props = {}) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const defaults = { context: 'generated_plan_apply', products: products(true), close: vi.fn(), purchase: vi.fn(async () => ({ status: 'pending' })), refresh: vi.fn(async () => ({ status: 'free' })), Header };
  const value = { ...defaults, ...props };
  await act(async () => root.render(<RookProPaywall {...value} />));
  return value;
}
const click = async target => act(async () => target.click());
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); root = null; host = null; });

it('A/D: eligible Annual shows explicit CTA and annual charge; opening/selecting never starts a trial', async () => {
  const { purchase } = await show();
  expect(button('START 7-DAY FREE TRIAL')).toBeTruthy();
  expect(host.querySelector('.rook-pro-annual').textContent).toContain('€3.33 / month');
  expect(host.textContent).toContain('7 days free, then €39.99/year');
  expect(host.textContent).toContain('SAVE 44%');
  expect(host.textContent).not.toContain('billed yearly');
  expect(host.querySelector('.rook-pro-price').getAttribute('aria-label')).toContain('equivalent, billed yearly');
  expect(purchase).not.toHaveBeenCalled();
  await click(host.querySelectorAll('.rook-pro-plan')[1]);
  await click(host.querySelector('.rook-pro-annual'));
  expect(purchase).not.toHaveBeenCalled();
});
it.each([false, undefined])('B: ineligible/unknown Annual has no trial claims (%s)', async eligible => {
  await show({ products: products(eligible) });
  expect(host.textContent).not.toMatch(/free trial|days free/i);
  expect(button('CONTINUE WITH ANNUAL')).toBeTruthy();
  expect(host.querySelector('.rook-pro-summary').textContent).toBe('€39.99/year');
});
it('C/M: Monthly never offers a trial; switching updates CTA and sticky summary immediately', async () => {
  const { purchase, products: items } = await show();
  const month = host.querySelectorAll('.rook-pro-plan')[1];
  expect(month.textContent).not.toMatch(/trial|free/i);
  await click(month);
  expect(button('CONTINUE WITH MONTHLY')).toBeTruthy();
  expect(host.querySelector('.rook-pro-summary').textContent).toBe('€5.99/month');
  expect(month.getAttribute('aria-pressed')).toBe('true');
  expect(host.querySelector('.rook-pro-footer').textContent).not.toMatch(/trial|free/i);
  await click(button('CONTINUE WITH MONTHLY'));
  expect(purchase).toHaveBeenCalledWith(items.monthly);
  await click(host.querySelector('.rook-pro-annual'));
  expect(button('START 7-DAY FREE TRIAL')).toBeTruthy();
  expect(host.querySelector('.rook-pro-summary').textContent).toBe('7 days free → €39.99/year');
});
it('F: canceling checkout leaves the paywall with no success, error or trial activation', async () => {
  const purchase = vi.fn(async () => { throw { errorCode: 1 }; });
  await show({ purchase });
  await click(button('START 7-DAY FREE TRIAL'));
  expect(host.querySelector('[role=alert]')).toBeNull();
  expect(host.querySelector('[role=status]')).toBeNull();
  expect(button('START 7-DAY FREE TRIAL').disabled).toBe(false);
});
it('failure is recoverable without exposing provider details or claiming activation', async () => {
  await show({ purchase: vi.fn(async () => { throw Error('internal provider details'); }) });
  await click(button('START 7-DAY FREE TRIAL'));
  expect(host.querySelector('[role=alert]').textContent).toBe('Purchase could not be completed. Please try again.');
  expect(host.textContent).not.toContain('internal provider details');
  expect(button('START 7-DAY FREE TRIAL').disabled).toBe(false);
});
it.each(['active', 'free', 'unknown'])('N: restore reflects verified %s status and never buys', async status => {
  const { purchase, refresh } = await show({ refresh: vi.fn(async () => ({ status })) });
  await click(button('Restore purchases'));
  expect(refresh).toHaveBeenCalledOnce(); expect(purchase).not.toHaveBeenCalled();
  if (status === 'active') {
    expect(host.textContent).toContain('Close this sheet and retry your action');
    expect(host.querySelector('.rook-pro-options')).toBeNull();
  } else expect(host.textContent).toContain(status === 'free' ? 'No active ROOK Pro purchase' : 'could not be verified');
});
it('O: production purchase component never renders a local-review/example-price label', async () => {
  await show();
  expect(host.textContent).not.toMatch(/local review|example prices|no payment/i);
});
it('canonical store price changes update equivalent and savings, without parsing formatted strings', () => {
  expect(annualMonthlyEquivalent(pkg(39.99, 'P1Y'))).toBe('€3.33');
  expect(annualSavingPercent(pkg(39.99, 'P1Y'), pkg(5.99, 'P1M'))).toBe(44);
  expect(annualMonthlyEquivalent(pkg(48, 'P1Y'))).toBe('€4.00');
  expect(annualSavingPercent(pkg(48, 'P1Y'), pkg(8, 'P1M'))).toBe(50);
  expect(annualSavingPercent(pkg(96, 'P1Y'), pkg(8, 'P1M'))).toBeNull();
  expect(annualSavingPercent(pkg(48, 'P1Y'), pkg(8, 'P1M', false, 'USD'))).toBeNull();
  expect(annualMonthlyEquivalent({ product: { price: { formattedPrice: '€39.99' } } })).toBeNull();
  expect(annualMonthlyEquivalent({ product: { price: { amount: 3999, currency: 'EUR' } } })).toBe('€3.33');
});
it('trial eligibility requires the customer-specific seven-day free Annual offer', () => {
  expect(annualTrialEligible(pkg(39.99, 'P1Y', true))).toBe(true);
  expect(annualTrialEligible(pkg(5.99, 'P1M', true))).toBe(false);
  const a = pkg(39.99, 'P1Y', true);
  a.product.defaultSubscriptionOption.trial.periodDuration = 'P14D';
  expect(annualTrialEligible(a)).toBe(false);
  a.product.defaultSubscriptionOption.trial.periodDuration = 'P7D';
  a.product.defaultSubscriptionOption.trial.price = { amountMicros: 1000000 };
  expect(annualTrialEligible(a)).toBe(false);
});
