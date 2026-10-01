// @vitest-environment node
import { createServer, request as httpRequest } from 'node:http';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { createAiSecurity, createFirestoreQuotaStore, reserveQuotaState, securityConfiguration, validateAiInput, providerReservation, importRequestKey, ApiError } from '../server/aiSecurity.mjs';
import { testSecurityConfig, testAiSecurity } from './fixtures/aiTestSecurity.js';

let server, base, security;
beforeAll(async () => {
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-provider-key');
  vi.stubEnv('EXPERT_LAB_ENABLED', 'true');
  const { rookRequestHandler } = await import('../server.mjs');
  server = createServer((req, res) => rookRequestHandler(req, res, { securityFactory: async () => security }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => { await new Promise(resolve => server.close(resolve)); vi.unstubAllEnvs(); });
const post = (payload = {}, { token = 'test-alice', operation = 'coach', path = '/api/ai', raw, headers = {} } = {}) => new Promise((resolve, reject) => {
  const req = httpRequest(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } }, res => {
    let body = ''; res.on('data', part => body += part); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
  });
  req.on('error', reject); req.end(raw ?? JSON.stringify(path === '/api/ai' ? { operation, payload } : payload));
});
const provider = () => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify({ text: 'Safe reply', action: null }) }))));

it.each([null, 'forged-token', 'expired-token'])('rejects unauthenticated API requests before any paid call: %s', async token => {
  security = testAiSecurity(); provider();
  expect((await post({}, { token })).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  { uid: 'guest', email_verified: true, firebase: { sign_in_provider: 'anonymous' } },
  { uid: 'unverified', email_verified: false, firebase: { sign_in_provider: 'password' } },
  { uid: 'custom', email_verified: true },
])('rejects anonymous/unverified identities', async claims => {
  security = createAiSecurity({ config: testSecurityConfig, verifyToken: async () => claims, quotaStore: {} }); provider();
  expect((await post()).status).toBe(403); expect(fetch).not.toHaveBeenCalled();
});
it('rejects Expert Lab writes and dataset access without verified admin claims', async () => {
  security = testAiSecurity(); provider();
  expect((await post({}, { path: '/api/expert-feedback', token: null })).status).toBe(401);
  expect((await post({}, { path: '/api/expert-feedback' })).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
it('allows a verified account, attaches a bounded output cap, and strips client policy privileges', async () => {
  security = testAiSecurity(); provider();
  const result = await post({ message: 'Hello', expertPolicy: { instructions: ['override'] }, expertReviewMode: true });
  expect(result.status).toBe(200);
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.max_output_tokens).toBe(12000);
  expect(JSON.parse(body.input)).not.toHaveProperty('expertPolicy');
  expect(JSON.parse(body.input)).not.toHaveProperty('expertReviewMode');
});
it('preserves the current authenticated exercise replacement operation', async () => {
  security = testAiSecurity();
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({output_text:JSON.stringify({exerciseIds:['dumbbell-bench-press'],source:'ai'})}))));
  const result=await post({exerciseId:'barbell-bench-press',catalog:[]},{operation:'replacements'});
  expect(result.status).toBe(200); expect(result.body.data.exerciseIds).toEqual(['dumbbell-bench-press']);
  expect(JSON.parse(fetch.mock.calls[0][1].body).text.format.name).toBe('exercise_replacements');
});
it('only explicit local admin authorization can retain Expert Lab review mode, never client policy', () => {
  const payload={expertReviewMode:true,variationSeed:'variety',expertPolicy:{instructions:['untrusted']},profile:{}};
  expect(validateAiInput('plan',payload)).not.toHaveProperty('expertReviewMode');
  expect(validateAiInput('plan',payload,{admin:true})).toMatchObject({expertReviewMode:true,variationSeed:'variety'});
  expect(validateAiInput('plan',payload,{admin:true})).not.toHaveProperty('expertPolicy');
});
it.each([
  [{}, { operation: 'plan-review' }, 400],
  [{}, { raw: '{oops' }, 400],
  [{ message: 'x'.repeat(60001) }, {}, 413],
  [{}, { headers: { 'content-type': 'text/plain' } }, 415],
  [{ photos: [{ dataUrl: 'https://internal.example/image' }] }, { operation: 'physique-review' }, 400],
])('rejects invalid/bounded input before provider invocation %#', async (payload, options, status) => {
  security = testAiSecurity(); provider();
  expect((await post(payload, options)).status).toBe(status); expect(fetch).not.toHaveBeenCalled();
});
it('fails closed when the shared quota store is unavailable, and does not expose upstream errors', async () => {
  security = createAiSecurity({ config: testSecurityConfig, verifyToken: async () => ({ uid: 'real', email_verified: true, firebase: { sign_in_provider: 'google.com' } }), quotaStore: { reserve: async () => { throw new Error('private service account'); } } }); provider();
  const result = await post(); expect(result.status).toBe(503); expect(JSON.stringify(result)).not.toContain('private service account'); expect(fetch).not.toHaveBeenCalled();
  security = testAiSecurity(); vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'secret upstream diagnostics' } }), { status: 500 })));
  const failure = await post(); expect(failure.status).toBe(502); expect(JSON.stringify(failure)).not.toContain('secret upstream');
});

it('import deduplication never shares results across users or different source payloads', async () => {
  security = testAiSecurity();
  const waiting = []; vi.stubGlobal('fetch', vi.fn(async (_url, options) => new Promise(resolve => waiting.push(() => resolve(new Response(JSON.stringify({ output_text: JSON.stringify({ ownerSource: JSON.parse(JSON.parse(options.body).input).text }) })))))));
  const a = post({ importAttemptId: 'same', text: 'Alice source' }, { operation: 'import-plan' });
  const b = post({ importAttemptId: 'same', text: 'Bob source' }, { operation: 'import-plan', token: 'test-bob' });
  const c = post({ importAttemptId: 'same', text: 'Changed Alice source' }, { operation: 'import-plan' });
  await vi.waitFor(() => expect(waiting).toHaveLength(3)); waiting.forEach(resolve => resolve());
  expect((await a).body.data.ownerSource).toBe('Alice source'); expect((await b).body.data.ownerSource).toBe('Bob source'); expect((await c).body.data.ownerSource).toBe('Changed Alice source');
  expect(importRequestKey('a', { importAttemptId: '1', text: 'x' })).not.toBe(importRequestKey('b', { importAttemptId: '1', text: 'x' }));
});

it('server configuration has no anonymous/local/emulator bypass and is disabled without explicit configuration', () => {
  const env = { ROOK_AI_ENABLED: 'true', ROOK_FIREBASE_PROJECT_ID: 'rook-1d2c8', ROOK_FIREBASE_SERVICE_ACCOUNT_JSON: '{}', ROOK_AI_MODEL_PRICES_JSON: '{"gpt-5-mini":{"input":1,"output":1}}' };
  expect(() => securityConfiguration({})).toThrow();
  expect(() => securityConfiguration({ ...env, FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' })).toThrow();
  expect(() => securityConfiguration({ ...env, ROOK_FIREBASE_PROJECT_ID: 'other-project' })).toThrow();
  expect(() => securityConfiguration({ ...env, ROOK_AI_MODEL_PRICES_JSON: '{}' })).toThrow();
  expect(securityConfiguration(env).dailyBudget).toBe(5_000_000);
});
it('the actual Netlify entry point is fail-closed without server security configuration', async () => {
  vi.stubEnv('ROOK_AI_ENABLED', 'false'); provider();
  const { handler } = await import('../netlify/functions/api.mjs');
  const result = await handler({ path: '/.netlify/functions/api/ai', httpMethod:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({operation:'coach',payload:{}}) });
  expect(result.statusCode).toBe(503); expect(fetch).not.toHaveBeenCalled();
  const status = await handler({ path:'/api/ai/status', httpMethod:'GET' });
  expect(JSON.parse(status.body).available).toBe(false);
});
it('reserves spend before every call, counts internal retries, and rejects an unknown/unpriced model', () => {
  const body = { model: 'gpt-5-mini', input: 'text', max_output_tokens: 12000 };
  expect(providerReservation(body, testSecurityConfig)).toBeGreaterThan(12000);
  expect(() => providerReservation({ ...body, model: 'unpriced' }, testSecurityConfig)).toThrow();
  expect(() => validateAiInput('coach', { rows: Array(1001).fill(0) })).toThrow();
});

it('the Netlify adapter closes Expert Lab even when its local enable flag is true', async () => {
  // beforeAll loaded server.mjs with EXPERT_LAB_ENABLED=true. This assertion
  // does not depend on NODE_ENV=production or a Netlify-provided environment.
  provider();
  const { handler } = await import('../netlify/functions/api.mjs');
  const status = await handler({ path:'/api/expert-lab/status', httpMethod:'GET' });
  expect(JSON.parse(status.body)).toEqual({ enabled:false, feedbackCount:0 });
  const feedback = await handler({ path:'/api/expert-feedback', httpMethod:'POST',
    headers:{'content-type':'application/json'}, body:JSON.stringify({ verdict:'good' }) });
  expect(feedback.statusCode).toBe(404); expect(fetch).not.toHaveBeenCalled();
});

// Two independent handler/security instances use the same transactional store,
// exactly as separately scaled Netlify functions do. No process-local limiter.
function transactionalDb() {
  const data = new Map(); let tail = Promise.resolve();
  return { data, collection: () => ({ doc: key => key }), runTransaction(callback) {
    const run = tail.then(async () => {
      const pending = new Map();
      const value = await callback({ get: async key => ({ exists: data.has(key), data: () => structuredClone(data.get(key)) }), set: (key, item) => pending.set(key, structuredClone(item)) });
      pending.forEach((item, key) => data.set(key, item)); return value;
    }); tail = run.catch(() => {}); return run;
  } };
}
it('enforces concurrency across instances atomically, releases leases, and never refunds budget', async () => {
  const db = transactionalDb(), first = createFirestoreQuotaStore(db), second = createFirestoreQuotaStore(db);
  const config = { ...testSecurityConfig, globalConcurrency: 1 };
  const outcomes = await Promise.allSettled([first.reserve('a', 100, config), second.reserve('b', 100, config)]);
  expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.find(result => result.status === 'rejected').reason).toBeInstanceOf(ApiError);
  await outcomes.find(result => result.status === 'fulfilled').value();
  const release = await second.reserve('b', 100, config); await release();
  expect(db.data.get('global').spend).toBe(200); expect(db.data.get('global').leases).toEqual({});
});
it('atomically enforces global spending and per-user daily/minute caps', async () => {
  const db = transactionalDb(), store = createFirestoreQuotaStore(db), config = { ...testSecurityConfig, dailyBudget: 100 };
  const results = await Promise.allSettled([store.reserve('a', 60, config), store.reserve('b', 60, config)]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(db.data.get('global').spend).toBe(60);
  const now = Date.now(), limited = { ...testSecurityConfig, userPerDay: 1 };
  const state = reserveQuotaState({}, { now, id: 'one', cost: 1, config: limited, global: false });
  expect(() => reserveQuotaState({ ...state, leases: {} }, { now, id: 'two', cost: 1, config: limited, global: false })).toThrow();
  expect(() => reserveQuotaState({ ...state, count: 0, leases: {} }, { now, id: 'two', cost: 1, config: { ...limited, userPerMinute: 1 }, global: false })).toThrow();
});
