import { describe, expect, it, vi } from 'vitest';
import { coachUsage, consumeCoachProviderCall, entitlementIsActive, finishCoachResponse,
  isUsableCoachProviderAnswer, reserveCoachResponse, serverEntitlement,
  settleCoachProviderCall } from '../server/rookProServer.mjs';

function memoryFirestore() {
  const records = new Map();
  let serial = Promise.resolve();
  const snapshot = path => ({ data: () => structuredClone(records.get(path)) });
  return {
    doc: path => ({ path, get: async () => snapshot(path) }),
    runTransaction(callback) {
      const run = serial.then(async () => {
        const writes = [];
        const tx = {
          get: async ref => snapshot(ref.path),
          set: (ref, data, options) => writes.push(() => records.set(ref.path,
            options?.merge ? { ...records.get(ref.path), ...structuredClone(data) } : structuredClone(data))),
          create: (ref, data) => writes.push(() => {
            if (records.has(ref.path)) throw Error('already exists');
            records.set(ref.path, structuredClone(data));
          }),
          update: (ref, data) => writes.push(() => records.set(ref.path,
            { ...records.get(ref.path), ...structuredClone(data) })),
        };
        const result = await callback(tx);
        writes.forEach(write => write());
        return result;
      });
      serial = run.catch(() => {});
      return run;
    },
    records,
  };
}

const id = n => `request-identity-${n.toString().padStart(3, '0')}`;

describe('trusted Coach response reservations', () => {
  it('consumes exactly three successful Free responses for a UID across time and same-UID linking', async () => {
    const db = memoryFirestore();
    for (let n = 0; n < 3; n++) {
      expect((await reserveCoachResponse('anonymous-uid', id(n), false, Date.now() + n * 31 * 86400000, db)).status).toBe('pending');
      expect((await finishCoachResponse('anonymous-uid', id(n), true, db)).status).toBe('completed');
      expect((await finishCoachResponse('anonymous-uid', id(n), true, db)).status).toBe('completed');
    }
    expect(await coachUsage('anonymous-uid', db)).toEqual({ freeCoachResponsesUsed: 3 });
    expect((await reserveCoachResponse('anonymous-uid', id(3), false, Date.now() + 365 * 86400000, db)).status).toBe('limit');
    expect(await coachUsage('different-uid', db)).toEqual({ freeCoachResponsesUsed: 0 });
  });
  it('does not consume failures and permits an idempotent retry', async () => {
    const db = memoryFirestore();
    await reserveCoachResponse('u', id(1), false, Date.now(), db);
    await finishCoachResponse('u', id(1), false, db);
    expect(await coachUsage('u', db)).toEqual({ freeCoachResponsesUsed: 0 });
    expect((await reserveCoachResponse('u', id(1), false, Date.now(), db)).status).toBe('pending');
    await finishCoachResponse('u', id(1), true, db);
    expect(await coachUsage('u', db)).toEqual({ freeCoachResponsesUsed: 1 });
  });
  it('reserves the final Free slot atomically across two tabs', async () => {
    const db = memoryFirestore();
    for (let n = 0; n < 2; n++) {
      await reserveCoachResponse('u', id(n), false, Date.now(), db);
      await finishCoachResponse('u', id(n), true, db);
    }
    const results = await Promise.all([reserveCoachResponse('u', id(2), false, Date.now(), db),
      reserveCoachResponse('u', id(3), false, Date.now(), db)]);
    expect(results.map(result => result.status).sort()).toEqual(['limit', 'pending']);
  });
  it('binds one idempotency key to one question without storing message text', async () => {
    const db = memoryFirestore();
    await reserveCoachResponse('u', id(0), false, Date.now(), db, 'How should I train?');
    expect(JSON.stringify([...db.records.values()])).not.toContain('How should I train?');
    await expect(reserveCoachResponse('u', id(0), false, Date.now(), db, 'Another question'))
      .rejects.toThrow('another question');
    await expect(consumeCoachProviderCall('u', id(0), 'coach', {message:'Another question'}, db))
      .rejects.toThrow('does not match');
    await consumeCoachProviderCall('u', id(0), 'coach', {message:'How should I train?'}, db);
  });
  it('Pro replies do not consume unused Free allowance; expiry resumes what remains', async () => {
    const db = memoryFirestore();
    await reserveCoachResponse('u', id(0), false, Date.now(), db);
    await finishCoachResponse('u', id(0), true, db);
    for (let n = 1; n < 20; n++) {
      await reserveCoachResponse('u', id(n), true, Date.now(), db);
      await finishCoachResponse('u', id(n), true, db);
    }
    expect(await coachUsage('u', db)).toEqual({ freeCoachResponsesUsed: 1 });
    expect((await reserveCoachResponse('u', id(20), false, Date.now(), db)).status).toBe('pending');
  });
  it('bounds provider calls for one reservation and applies a generous per-minute Pro safety limit', async () => {
    const db = memoryFirestore();
    await reserveCoachResponse('u', id(0), true, Date.now(), db);
    for (let n = 0; n < 3; n++) await consumeCoachProviderCall('u', id(0), 'coach', {message:'same'}, db);
    await expect(consumeCoachProviderCall('u', id(0), 'coach', {message:'same'}, db)).rejects.toThrow('Too many model attempts');
    await finishCoachResponse('u', id(0), true, db);
    for (let n = 1; n < 30; n++) {
      await reserveCoachResponse('u', id(n), true, Date.now(), db);
      await finishCoachResponse('u', id(n), true, db);
    }
    expect((await reserveCoachResponse('u', id(30), true, Date.now(), db)).status).toBe('fair-use');
  });
  it('limits simultaneous Pro generations without consuming the Free allowance', async () => {
    const db = memoryFirestore();
    expect((await reserveCoachResponse('u', id(0), true, Date.now(), db)).status).toBe('pending');
    expect((await reserveCoachResponse('u', id(1), true, Date.now(), db)).status).toBe('pending');
    expect((await reserveCoachResponse('u', id(2), true, Date.now(), db)).status).toBe('fair-use');
    await finishCoachResponse('u', id(0), true, db);
    expect((await reserveCoachResponse('u', id(2), true, Date.now(), db)).status).toBe('pending');
    expect(await coachUsage('u', db)).toEqual({freeCoachResponsesUsed:0});
  });
  it('has generous daily abuse ceilings separate from lifetime Free response usage', async () => {
    const db = memoryFirestore(), day = Math.floor(Date.now()/86400000);
    db.records.set('rookCoachUsage/pro', { proDay: day, proDailyCount: 500 });
    expect((await reserveCoachResponse('pro', id(0), true, Date.now(), db)).status).toBe('fair-use');
    db.records.set('rookCoachUsage/free', { freeProviderDay: day, freeProviderCount: 30 });
    await reserveCoachResponse('free', id(0), false, Date.now(), db);
    await expect(consumeCoachProviderCall('free', id(0), 'coach', {message:'one'}, db)).rejects.toThrow('temporarily busy');
    expect(await coachUsage('free', db)).toEqual({freeCoachResponsesUsed:0});
  });
  it('does not count internal intent interpretation or an unusable answer', async () => {
    const db = memoryFirestore();
    await reserveCoachResponse('u', id(0), false, Date.now(), db);
    await consumeCoachProviderCall('u', id(0), 'combine-intent', {message:'combine'}, db);
    expect(isUsableCoachProviderAnswer('combine-intent', {text:'interpreted'})).toBe(false);
    expect(isUsableCoachProviderAnswer('coach', {text:'  '})).toBe(false);
    expect(await coachUsage('u', db)).toEqual({freeCoachResponsesUsed:0});
    await consumeCoachProviderCall('u', id(0), 'coach', {message:'combine'}, db);
    expect(isUsableCoachProviderAnswer('coach', {text:'Here is your answer.'})).toBe(true);
    await finishCoachResponse('u', id(0), true, db);
    expect(await coachUsage('u', db)).toEqual({freeCoachResponsesUsed:1});
    await expect(consumeCoachProviderCall('u', id(0), 'combine-intent', {message:'another'}, db)).rejects.toThrow('expired');
    await expect(consumeCoachProviderCall('u', id(0), 'coach', {message:'another'}, db)).rejects.toThrow('expired');
  });
  it('does not release an in-flight Free slot on a client timeout, or deliver a canceled result', async () => {
    const db = memoryFirestore();
    await reserveCoachResponse('u', id(0), false, Date.now(), db);
    await consumeCoachProviderCall('u', id(0), 'coach', {message:'one'}, db);
    expect(await finishCoachResponse('u', id(0), false, db)).toEqual({status:'pending'});
    expect((await reserveCoachResponse('u', id(1), false, Date.now(), db)).status).toBe('pending');
    expect((await settleCoachProviderCall('u', id(0), 'coach', {text:'late answer'}, db)).status).toBe('failed');
    expect(await coachUsage('u', db)).toEqual({freeCoachResponsesUsed:0});
    expect((await reserveCoachResponse('u', id(0), false, Date.now(), db)).status).toBe('pending');
  });
  it('counts a usable provider answer once across intent extraction and its rewrite', async () => {
    const db = memoryFirestore();
    await reserveCoachResponse('u', id(0), false, Date.now(), db);
    await consumeCoachProviderCall('u', id(0), 'combine-intent', {message:'one'}, db);
    await settleCoachProviderCall('u', id(0), 'combine-intent', {intent:'maybe'}, db);
    await consumeCoachProviderCall('u', id(0), 'coach', {message:'one'}, db);
    expect((await settleCoachProviderCall('u', id(0), 'coach', {text:'answer'}, db)).status).toBe('pending');
    expect(await coachUsage('u', db)).toEqual({freeCoachResponsesUsed:0});
    await consumeCoachProviderCall('u', id(0), 'coach', {message:'one',previousLanguageMismatch:'Rewrite'}, db);
    expect((await settleCoachProviderCall('u', id(0), 'coach', {text:'rewritten'}, db)).status).toBe('pending');
    expect((await finishCoachResponse('u', id(0), true, db)).status).toBe('completed');
    expect((await finishCoachResponse('u', id(0), true, db)).status).toBe('completed');
    expect(await coachUsage('u', db)).toEqual({freeCoachResponsesUsed:1});
    await expect(consumeCoachProviderCall('u', id(0), 'coach', {message:'one',previousLanguageMismatch:'Again'}, db)).rejects.toThrow('expired');
  });
  it('holds an unacknowledged answer for same-request retry without consuming lifetime usage', async () => {
    const db = memoryFirestore();
    await reserveCoachResponse('u', id(0), false, Date.now(), db, 'My question');
    await consumeCoachProviderCall('u', id(0), 'coach', {message:'My question'}, db);
    expect((await settleCoachProviderCall('u', id(0), 'coach', {text:'usable answer'}, db)).status).toBe('pending');
    expect(await coachUsage('u', db)).toEqual({freeCoachResponsesUsed:0});
    expect((await finishCoachResponse('u', id(0), false, db)).status).toBe('pending');
    expect(await coachUsage('u', db)).toEqual({freeCoachResponsesUsed:0});
    expect((await reserveCoachResponse('u', id(0), false, Date.now(), db, 'My question')).status).toBe('pending');
    await consumeCoachProviderCall('u', id(0), 'coach', {message:'My question'}, db);
    expect((await settleCoachProviderCall('u', id(0), 'coach', {text:'retry answer'}, db)).status).toBe('pending');
    expect((await finishCoachResponse('u', id(0), true, db)).status).toBe('completed');
    expect(await coachUsage('u', db)).toEqual({freeCoachResponsesUsed:1});
  });
  it('checks entitlement expiry from server response, including grace period', async () => {
    expect(entitlementIsActive(null)).toBe(false);
    expect(entitlementIsActive({ expires_date: null })).toBe(true);
    expect(entitlementIsActive({ expires_date: '2020-01-01T00:00:00Z' }, Date.now())).toBe(false);
    expect(entitlementIsActive({ expires_date: '2020-01-01T00:00:00Z', grace_period_expires_date: '2099-01-01T00:00:00Z' })).toBe(true);
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ subscriber: { entitlements: { rook_pro: { expires_date: null } } } }) }));
    expect(await serverEntitlement('verified-uid', { fetcher, key: 'server-only' })).toBe(true);
    expect(fetcher.mock.calls[0][0]).toContain('/verified-uid');
  });
});
