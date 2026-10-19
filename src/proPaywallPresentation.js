// getOfferings returns customer-specific purchase options. A ROOK profile
// preference never determines trial eligibility.
export function annualTrialEligible(item) {
  const option = item?.product?.defaultSubscriptionOption;
  const trial = option?.trial;
  return item?.product?.normalPeriodDuration === 'P1Y'
    && ['P7D', 'P1W'].includes(trial?.periodDuration)
    && trial?.price === null && trial?.cycleCount === 1 && !option?.introPrice;
}

export function priceAmount(price) {
  if (Number.isFinite(price?.amountMicros)) return price.amountMicros / 1_000_000;
  // RevenueCat's legacy amount is in cents, not currency units.
  if (Number.isFinite(price?.amount)) return price.amount / 100;
  return null;
}

export function annualMonthlyEquivalent(annual, locale = 'en-IE') {
  const price = annual?.product?.price;
  const amount = priceAmount(price);
  if (amount === null || amount <= 0 || !price?.currency) return null;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: price.currency }).format(amount / 12);
  } catch { return null; }
}

export function annualSavingPercent(annual, monthly) {
  const yearly = annual?.product?.price, month = monthly?.product?.price;
  const a = priceAmount(yearly), m = priceAmount(month);
  if (a === null || m === null || a <= 0 || m <= 0 || !yearly?.currency || yearly.currency !== month?.currency) return null;
  const saving = Math.round((1 - a / (m * 12)) * 100);
  return saving > 0 && saving < 100 ? saving : null;
}

export function paywallSelection(key, products) {
  const annual = key === 'annual';
  const trial = annual && annualTrialEligible(products?.annual);
  const price = products?.[key]?.product?.price?.formattedPrice;
  const amount = price ? `${price}/${annual ? 'year' : 'month'}` : '';
  return {
    trial,
    cta: trial ? 'START 7-DAY FREE TRIAL' : `CONTINUE WITH ${annual ? 'ANNUAL' : 'MONTHLY'}`,
    summary: trial ? `7 days free → ${amount}` : amount,
    renewal: `Renews ${annual ? 'yearly' : 'monthly'} until canceled`,
    disclosure: trial ? `7 days free, then ${amount}` : amount,
  };
}
