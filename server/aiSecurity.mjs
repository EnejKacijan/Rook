import { createHash, randomUUID } from 'node:crypto';

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; this.retryable = false; }
}
const unavailable = () => new ApiError(503, 'ai-disabled', 'AI is temporarily unavailable. Your local data is unchanged.');
const integer = (value, fallback, max) => {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) throw unavailable();
  return number;
};
export const PUBLIC_AI_OPERATIONS = new Set(['follow-ups', 'plan', 'coach', 'replacements', 'import-plan', 'interpret-import', 'physique-review', 'training-safety', 'combine-intent']);

export function securityConfiguration(env = process.env) {
  if (env.ROOK_AI_ENABLED !== 'true') throw unavailable();
  // Server credentials are never read from VITE_* or accepted from a request.
  if (env.ROOK_FIREBASE_PROJECT_ID !== 'rook-1d2c8') throw unavailable();
  if (!env.ROOK_FIREBASE_SERVICE_ACCOUNT_JSON && !env.GOOGLE_APPLICATION_CREDENTIALS) throw unavailable();
  // Authentication emulators deliberately accept unsigned identities. Never
  // allow that environment to authorize requests to a paid provider.
  if (env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST) throw unavailable();
  let prices;
  try { prices = JSON.parse(env.ROOK_AI_MODEL_PRICES_JSON || ''); } catch { throw unavailable(); }
  if (!prices || Array.isArray(prices) || typeof prices !== 'object' || !Object.keys(prices).length) throw unavailable();
  for (const [model, price] of Object.entries(prices)) {
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model) || !price ||
      ![price.input, price.output].every(value => Number.isFinite(value) && value > 0 && value <= 1000)) throw unavailable();
  }
  return {
    projectId: env.ROOK_FIREBASE_PROJECT_ID, prices,
    userPerMinute: integer(env.ROOK_AI_USER_PER_MINUTE, 12, 60),
    userPerDay: integer(env.ROOK_AI_USER_PER_DAY, 60, 500),
    globalPerMinute: integer(env.ROOK_AI_GLOBAL_PER_MINUTE, 40, 500),
    globalPerDay: integer(env.ROOK_AI_GLOBAL_PER_DAY, 500, 10000),
    userConcurrency: integer(env.ROOK_AI_USER_CONCURRENCY, 2, 4),
    globalConcurrency: integer(env.ROOK_AI_GLOBAL_CONCURRENCY, 8, 32),
    // Micro USD, not a commercial/product quota. Reservations are never
    // refunded, even for provider errors or retries.
    dailyBudget: integer(env.ROOK_AI_DAILY_BUDGET_MICRO_USD, 5_000_000, 100_000_000),
    maxOutputTokens: integer(env.ROOK_AI_MAX_OUTPUT_TOKENS, 12000, 16384),
    maxInputBytes: 256 * 1024, maxRequestBytes: 2 * 1024 * 1024,
    leaseMs: 150000,
  };
}

export async function readJsonBody(request, maxBytes) {
  if (!/^application\/json(?:\s*;|$)/i.test(String(request.headers?.['content-type'] || '')))
    throw new ApiError(415, 'content-type', 'Send JSON content.');
  const declared = Number(request.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) throw new ApiError(413, 'input-limit', 'Request is too large.');
  let bytes = 0; const chunks = [];
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += part.length;
    if (bytes > maxBytes) throw new ApiError(413, 'input-limit', 'Request is too large.');
    chunks.push(part);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(400, 'invalid-json', 'The request is not valid JSON.'); }
}

export async function readProviderJson(response, maxBytes = 1024 * 1024) {
  const reader = response.body?.getReader();
  if (!reader) throw new ApiError(502, 'provider-output', 'AI response could not be read safely.');
  let total = 0; const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new ApiError(502, 'provider-output', 'AI response exceeded the safety limit.'); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}

export function validateAiInput(operation, payload, { admin = false } = {}) {
  if (!PUBLIC_AI_OPERATIONS.has(operation)) throw new ApiError(400, 'operation', 'Unsupported AI operation.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ApiError(400, 'payload', 'Invalid AI input.');
  let nodes = 0;
  const inspect = (value, depth = 0) => {
    if (++nodes > 30000 || depth > 24) throw new ApiError(413, 'input-limit', 'AI input is too large.');
    if (Array.isArray(value) && value.length > 1000) throw new ApiError(413, 'input-limit', 'AI input is too large.');
    if (typeof value === 'string' && value.length > (value.startsWith('data:image/') ? 700000 : 60000)) throw new ApiError(413, 'input-limit', 'AI input is too large.');
    if (value && typeof value === 'object') Object.values(value).forEach(item => inspect(item, depth + 1));
  };
  inspect(payload);
  if (operation === 'physique-review' && (!Array.isArray(payload.photos) || payload.photos.length < 1 || payload.photos.length > 3 ||
      payload.photos.some(photo => !/^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(photo?.dataUrl || ''))))
    throw new ApiError(400, 'photos', 'Use up to three locally prepared photos.');
  // Client-authored policy/admin flags must never become privileged context.
  const { expertReviewMode, expertPolicy, expertExamples, recentCandidateSignatures, variationSeed, ...safe } = payload;
  return admin && operation === 'plan' ? { ...safe, expertReviewMode: expertReviewMode === true, variationSeed: typeof variationSeed === 'string' ? variationSeed.slice(0, 200) : '' } : safe;
}

export function importRequestKey(uid, payload) {
  const id = String(payload?.importAttemptId || '');
  if (!id) return null;
  if (id.length > 200) throw new ApiError(400, 'attempt-id', 'Invalid import attempt identifier.');
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return createHash('sha256').update(JSON.stringify([uid, id, canonical(payload)])).digest('hex');
}

export function providerReservation(body, config) {
  const price = Object.hasOwn(config.prices, body.model) && config.prices[body.model];
  if (!price) throw unavailable();
  const images = Array.isArray(body.input) ? body.input.flatMap(item => item.content || []).filter(item => item.type === 'input_image') : [];
  const textInput = images.length ? body.input.map(item => ({ ...item, content: item.content.filter(part => part.type !== 'input_image') })) : body.input;
  const bytes = Buffer.byteLength(JSON.stringify({ ...body, input: textInput }));
  if (bytes > config.maxInputBytes) throw new ApiError(413, 'input-limit', 'AI context is too large. Use a smaller request.');
  // One UTF-8 byte per token is a deliberately conservative text upper bound,
  // including schema/instructions/framing. Low-detail images get a generous
  // 4096-token reservation each. Restrict callers to low detail.
  if (images.some(image => image.detail !== 'low')) throw unavailable();
  const cost = Math.ceil((bytes + 1024 + images.length * 4096) * price.input + config.maxOutputTokens * price.output);
  if (!Number.isSafeInteger(cost) || cost < 1 || cost > config.dailyBudget) throw new ApiError(429, 'spend-limit', 'AI usage limit reached. Try again later.');
  return cost;
}

export function reserveQuotaState(state = {}, { now, id, cost, config, global }) {
  if (!Number.isSafeInteger(Number(state.count || 0)) || Number(state.count || 0) < 0 || !Number.isSafeInteger(Number(state.spend || 0)) || Number(state.spend || 0) < 0 ||
      (state.recent != null && (!Array.isArray(state.recent) || state.recent.some(time => !Number.isFinite(time))))) throw unavailable();
  const day = new Date(now).toISOString().slice(0, 10);
  const leases = Object.fromEntries(Object.entries(state.leases || {}).filter(([, expiry]) => expiry > now));
  const recent = (state.recent || []).filter(time => time > now - 60000);
  const count = state.day === day ? Number(state.count || 0) : 0;
  const spend = state.day === day ? Number(state.spend || 0) : 0;
  if (recent.length >= (global ? config.globalPerMinute : config.userPerMinute) ||
      count >= (global ? config.globalPerDay : config.userPerDay) ||
      Object.keys(leases).length >= (global ? config.globalConcurrency : config.userConcurrency))
    throw new ApiError(429, 'rate-limit', 'AI is busy or your usage limit was reached. Try again later.');
  if (global && spend + cost > config.dailyBudget) throw new ApiError(429, 'spend-limit', 'AI usage limit reached. Try again later.');
  return { day, count: count + 1, spend: spend + (global ? cost : 0), recent: [...recent, now], leases: { ...leases, [id]: now + config.leaseMs } };
}

export function createFirestoreQuotaStore(db) {
  const ref = key => db.collection('rookAiSecurity').doc(key);
  const userKey = uid => `user-${createHash('sha256').update(uid).digest('hex')}`;
  return {
    async reserve(uid, cost, config) {
      const id = randomUUID(), keys = ['global', userKey(uid)];
      await db.runTransaction(async transaction => {
        const docs = await Promise.all(keys.map(key => transaction.get(ref(key))));
        const now = Date.now();
        const states = docs.map((doc, index) => reserveQuotaState(doc.exists ? doc.data() : {}, { now, id, cost, config, global: index === 0 }));
        states.forEach((state, index) => transaction.set(ref(keys[index]), state));
      });
      return async () => db.runTransaction(async transaction => {
        const docs = await Promise.all(keys.map(key => transaction.get(ref(key))));
        docs.forEach((doc, index) => {
          if (!doc.exists) return;
          const state = doc.data(), leases = { ...state.leases }; delete leases[id];
          transaction.set(ref(keys[index]), { ...state, leases });
        });
      });
    },
  };
}

export function createAiSecurity({ config, verifyToken, quotaStore, verifyAppCheck = null }) {
  return {
    config,
    async authenticate(request, { admin = false } = {}) {
      const match = /^Bearer ([^\s]{1,8192})$/.exec(String(request.headers?.authorization || ''));
      if (!match) throw new ApiError(401, 'sign-in-required', 'Sign in to use AI.');
      let user;
      try { user = await verifyToken(match[1]); }
      catch { throw new ApiError(401, 'invalid-identity', 'Your sign-in expired. Sign in again to use AI.'); }
      if (typeof user?.uid !== 'string' || !user.uid || !['google.com', 'password', 'apple.com'].includes(user.firebase?.sign_in_provider) || user.email_verified !== true)
        throw new ApiError(403, 'sign-in-required', 'Use a verified account to use AI.');
      if (admin && user.rookAdmin !== true) throw new ApiError(403, 'admin-required', 'Expert Lab requires administrator access.');
      if (verifyAppCheck) {
        try { await verifyAppCheck(request.headers?.['x-firebase-appcheck']); }
        catch { throw new ApiError(403, 'app-check', 'This request could not be verified.'); }
      }
      return { uid: user.uid, admin: user.rookAdmin === true };
    },
    async reserveProvider(user, body) {
      if (!user?.uid) throw new ApiError(401, 'sign-in-required', 'Sign in to use AI.');
      const cost = providerReservation(body, config);
      try { return await quotaStore.reserve(user.uid, cost, config); }
      catch (error) { if (error instanceof ApiError) throw error; throw unavailable(); }
    },
  };
}

let initialization;
export async function getAiSecurity() {
  const config = securityConfiguration();
  initialization ||= (async () => {
    const [{ initializeApp, getApps, cert, applicationDefault }, { getAuth }, { getFirestore }, { getAppCheck }] = await Promise.all([
      import('firebase-admin/app'), import('firebase-admin/auth'), import('firebase-admin/firestore'), import('firebase-admin/app-check'),
    ]);
    let credential;
    if (process.env.ROOK_FIREBASE_SERVICE_ACCOUNT_JSON) {
      const value = JSON.parse(process.env.ROOK_FIREBASE_SERVICE_ACCOUNT_JSON);
      if (value.project_id !== config.projectId) throw unavailable();
      credential = cert(value);
    } else credential = applicationDefault();
    const app = getApps().find(candidate => candidate.name === 'rook-ai-security') || initializeApp({ projectId: config.projectId, credential }, 'rook-ai-security');
    return createAiSecurity({ config, verifyToken: token => getAuth(app).verifyIdToken(token, true), quotaStore: createFirestoreQuotaStore(getFirestore(app)),
      verifyAppCheck: process.env.ROOK_AI_REQUIRE_APP_CHECK === 'true' ? token => getAppCheck(app).verifyToken(token) : null });
  })().catch(error => { initialization = null; throw error; });
  try { return await initialization; } catch { throw unavailable(); }
}
