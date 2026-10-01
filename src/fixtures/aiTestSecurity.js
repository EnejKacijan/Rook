import { createAiSecurity } from '../../server/aiSecurity.mjs';

export const testSecurityConfig = {
  prices: { 'gpt-5-mini': { input: 1, output: 1 } },
  userPerMinute: 100, userPerDay: 1000, globalPerMinute: 1000, globalPerDay: 10000,
  userConcurrency: 2, globalConcurrency: 8, dailyBudget: 10_000_000,
  maxOutputTokens: 12000, maxInputBytes: 256 * 1024, maxRequestBytes: 2 * 1024 * 1024, leaseMs: 150000,
};
export const testAiSecurity = () => createAiSecurity({ config: testSecurityConfig,
  verifyToken: async token => {
    if (!['test-alice', 'test-bob', 'test-admin'].includes(token)) throw new Error('Rejected');
    return { uid: token, email_verified: true, firebase: { sign_in_provider: 'google.com' }, rookAdmin: token === 'test-admin' };
  }, quotaStore: { reserve: async () => async () => {} },
});
