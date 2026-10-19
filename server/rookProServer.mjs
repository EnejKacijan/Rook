import { createHash } from 'node:crypto';

const projectId = 'rook-1d2c8';
const freeLimit = 3;
const proMinuteLimit = 30;
const proConcurrentLimit = 2;
const proDailyLimit = 500;
const freeProviderDailyLimit = 30;
const pendingLeaseMs = 10 * 60 * 1000;

export function proServerConfigured(env = process.env) {
  return env.ROOK_PRO_ROLLOUT === 'true'
    && env.ROOK_PRO_PRODUCTS_READY === 'true'
    && Boolean(env.ROOK_REVENUECAT_SECRET_KEY)
    && Boolean(env.ROOK_FIREBASE_SERVICE_ACCOUNT_JSON);
}

let adminPromise;
async function admin() {
  adminPromise ||= (async () => {
    const [{ initializeApp, getApps, cert }, { getAuth }, { getFirestore }] = await Promise.all([
      import('firebase-admin/app'), import('firebase-admin/auth'), import('firebase-admin/firestore'),
    ]);
    const credentials = JSON.parse(process.env.ROOK_FIREBASE_SERVICE_ACCOUNT_JSON);
    if (credentials.project_id !== projectId) throw new Error('ROOK Pro Firebase project mismatch.');
    const app = getApps().find(item => item.name === 'rook-pro-server')
      || initializeApp({ credential: cert(credentials), projectId }, 'rook-pro-server');
    return { auth: getAuth(app), db: getFirestore(app) };
  })();
  return adminPromise;
}

export async function verifiedUid(request) {
  const match = /^Bearer (\S+)$/i.exec(String(request.headers?.authorization || ''));
  if (!match) throw Object.assign(new Error('Account authentication required.'), { statusCode: 401 });
  const { auth } = await admin();
  const token = await auth.verifyIdToken(match[1]);
  if (!token.uid) throw Object.assign(new Error('Account authentication required.'), { statusCode: 401 });
  return token.uid;
}

export function entitlementIsActive(record, now = Date.now()) {
  if (!record) return false;
  const expiration = record.grace_period_expires_date || record.expires_date;
  return expiration === null || (typeof expiration === 'string' && Date.parse(expiration) > now);
}

export async function serverEntitlement(uid, { fetcher = fetch, key = process.env.ROOK_REVENUECAT_SECRET_KEY } = {}) {
  if (!key) throw new Error('RevenueCat server verification is not configured.');
  const response = await fetcher(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error('RevenueCat entitlement verification failed.');
  const value = await response.json();
  return entitlementIsActive(value.subscriber?.entitlements?.rook_pro);
}

const usagePath = uid => `rookCoachUsage/${uid}`;
const requestPath = (uid, id) => `${usagePath(uid)}/requests/${id}`;
const safeCount = value => Math.max(0, Number.isInteger(value) ? value : 0);
const coachMessageHash = message => createHash('sha256').update(message).digest('hex');
function assertRequestId(requestId) {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId))
    throw Object.assign(new Error('Invalid Coach request identity.'), { statusCode: 400 });
}

export async function coachUsage(uid, dbOverride = null) {
  const db = dbOverride || (await admin()).db;
  const record = (await db.doc(usagePath(uid)).get()).data();
  return { freeCoachResponsesUsed: safeCount(record?.freeUsed) };
}

// One transaction reserves a Free slot before any provider work. A second tab
// cannot reserve the third slot concurrently. Request IDs are idempotency keys.
export async function reserveCoachResponse(uid, requestId, pro, now = Date.now(), dbOverride = null, message = null) {
  assertRequestId(requestId);
  if (message !== null && (typeof message !== 'string' || !message.trim() || message.length > 4000))
    throw Object.assign(new Error('Invalid Coach question.'), { statusCode: 400 });
  const messageHash = message === null ? null : coachMessageHash(message);
  const db = dbOverride || (await admin()).db;
  const usageRef = db.doc(usagePath(uid)), requestRef = db.doc(requestPath(uid, requestId));
  return db.runTransaction(async tx => {
    const [usageDoc, requestDoc] = await Promise.all([tx.get(usageRef), tx.get(requestRef)]);
    const usage = usageDoc.data() || {}, existing = requestDoc.data();
    if (existing?.messageHash && existing.messageHash !== messageHash)
      throw Object.assign(new Error('Coach request identity belongs to another question.'), { statusCode: 409 });
    if (existing && existing.status !== 'failed' && !(existing.status === 'pending' && existing.leaseUntil < now))
      return { status: existing.status, pro: existing.pro === true };
    const used = safeCount(usage.freeUsed);
    const reservations = Object.entries(usage.freeReservations || {})
      .filter(([,expires]) => Number(expires) > now);
    const freeReservations = Object.fromEntries(reservations);
    const proReservations = Object.fromEntries(Object.entries(usage.proReservations || {})
      .filter(([,expires]) => Number(expires) > now));
    const minute = Math.floor(now / 60000);
    const proCount = usage.proMinute === minute ? safeCount(usage.proCount) : 0;
    const day = Math.floor(now / 86400000);
    const proDailyCount = usage.proDay === day ? safeCount(usage.proDailyCount) : 0;
    if (!pro && used + reservations.length >= freeLimit) return { status: 'limit' };
    if (pro && (proCount >= proMinuteLimit || proDailyCount >= proDailyLimit
      || Object.keys(proReservations).length >= proConcurrentLimit))
      return { status: 'fair-use' };
    if (!pro) freeReservations[requestId] = now + pendingLeaseMs;
    else proReservations[requestId] = now + pendingLeaseMs;
    tx.set(usageRef, { freeUsed: used, freeReservations, proReservations,
      proMinute: minute, proCount: pro ? proCount + 1 : proCount,
      proDay: day, proDailyCount: pro ? proDailyCount + 1 : proDailyCount }, { merge: true });
    if (existing) tx.set(requestRef, { status: 'pending', pro, createdAt: now, leaseUntil: now + pendingLeaseMs,
      providerCalls: 0, providerInFlight: 0, cancelRequested: false, messageHash });
    else tx.create(requestRef, { status: 'pending', pro, createdAt: now, leaseUntil: now + pendingLeaseMs,
      providerCalls: 0, providerInFlight: 0, cancelRequested: false, messageHash });
    return { status: 'pending', pro };
  });
}

export async function finishCoachResponse(uid, requestId, succeeded, dbOverride = null) {
  assertRequestId(requestId);
  const db = dbOverride || (await admin()).db;
  const usageRef = db.doc(usagePath(uid)), requestRef = db.doc(requestPath(uid, requestId));
  return db.runTransaction(async tx => {
    const [usageDoc, requestDoc] = await Promise.all([tx.get(usageRef), tx.get(requestRef)]);
    const request = requestDoc.data();
    if (!request) throw Object.assign(new Error('Coach reservation missing.'), { statusCode: 409 });
    if (request.status !== 'pending') return { status: request.status };
    if (request.leaseUntil < Date.now()) throw Object.assign(new Error('Coach reservation expired. Retry the request.'), { statusCode: 409 });
    if (!succeeded && (safeCount(request.providerInFlight) > 0 || request.usableAnswerReady === true)) {
      if (safeCount(request.providerInFlight) > 0) tx.update(requestRef, { cancelRequested: true });
      return { status: 'pending' };
    }
    const usage = usageDoc.data() || {};
    if (succeeded && !request.pro && safeCount(usage.freeUsed) >= freeLimit)
      throw Object.assign(new Error('Free Coach response limit reached.'), { statusCode: 402 });
    const reservations = { ...(usage.freeReservations || {}) };
    const proReservations = { ...(usage.proReservations || {}) };
    delete reservations[requestId];
    delete proReservations[requestId];
    const status = succeeded ? 'completed' : 'failed';
    tx.set(usageRef, { freeUsed: safeCount(usage.freeUsed) + (succeeded && !request.pro ? 1 : 0),
      freeReservations: reservations, proReservations }, { merge: true });
    tx.update(requestRef, { status, finishedAt: Date.now() });
    return { status };
  });
}

export async function assertCoachReservation(uid, requestId) {
  assertRequestId(requestId);
  const { db } = await admin();
  const record = (await db.doc(requestPath(uid, requestId)).get()).data();
  if (!record || record.status !== 'pending' || record.leaseUntil < Date.now())
    throw Object.assign(new Error('Coach access check expired.'), { statusCode: 403 });
}

export function isUsableCoachProviderAnswer(operation, data) {
  return operation === 'coach' && typeof data?.text === 'string' && data.text.trim().length > 0;
}

export async function consumeCoachProviderCall(uid, requestId, operation, payload, dbOverride = null) {
  assertRequestId(requestId);
  const db = dbOverride || (await admin()).db;
  const ref = db.doc(requestPath(uid, requestId)), usageRef = db.doc(usagePath(uid));
  await db.runTransaction(async tx => {
    const [snapshot, usageDoc] = await Promise.all([tx.get(ref), tx.get(usageRef)]);
    const record = snapshot.data(), usage = usageDoc.data() || {};
    const rewrite = operation === 'coach' && typeof payload?.previousLanguageMismatch === 'string';
    if (!record || !['pending', 'completed'].includes(record.status) || record.leaseUntil < Date.now()
      || (record.status === 'completed' && (!rewrite || safeCount(record.providerCalls) >= 3)))
      throw Object.assign(new Error('Coach access check expired.'), { statusCode: 403 });
    if (record.messageHash && record.messageHash !== coachMessageHash(String(payload?.message || '')))
      throw Object.assign(new Error('Coach question does not match its access check.'), { statusCode: 403 });
    const count = safeCount(record.providerCalls);
    if (count >= 3) throw Object.assign(new Error('Too many model attempts for this Coach request.'), { statusCode: 429 });
    const day = Math.floor(Date.now() / 86400000);
    const freeAttempts = usage.freeProviderDay === day ? safeCount(usage.freeProviderCount) : 0;
    if (!record.pro && freeAttempts >= freeProviderDailyLimit)
      throw Object.assign(new Error('Coach is temporarily busy. Please try again later.'), { statusCode: 429 });
    if (!record.pro) tx.set(usageRef, { freeProviderDay: day,
      freeProviderCount: freeAttempts + 1 }, { merge: true });
    tx.update(ref, { providerCalls: count + 1,
      providerInFlight: safeCount(record.providerInFlight) + 1 });
  });
}

// A client timeout cannot release a Free reservation while an already-started
// model call is still running. The server settles it after the provider returns.
export async function settleCoachProviderCall(uid, requestId, operation, data, dbOverride = null) {
  assertRequestId(requestId);
  const db = dbOverride || (await admin()).db;
  const usageRef = db.doc(usagePath(uid)), requestRef = db.doc(requestPath(uid, requestId));
  return db.runTransaction(async tx => {
    const [usageDoc, requestDoc] = await Promise.all([tx.get(usageRef), tx.get(requestRef)]);
    const request = requestDoc.data();
    if (!request || safeCount(request.providerInFlight) < 1)
      throw Object.assign(new Error('Coach provider reservation missing.'), { statusCode: 409 });
    const remaining = request.providerInFlight - 1;
    const successful = isUsableCoachProviderAnswer(operation, data);
    let status = request.status;
    if (status === 'pending' && (request.leaseUntil < Date.now()
      || (request.cancelRequested && request.usableAnswerReady !== true))) status = 'failed';
    // Provider success is not proof that the answer reached the app. Keep the
    // Free reservation until the client acknowledges its usable final reply.
    const changes = { providerInFlight: remaining, status,
      usableAnswerReady: request.usableAnswerReady === true || successful,
      ...(remaining === 0 ? { cancelRequested: false } : {}) };
    if (status !== request.status) {
      changes.finishedAt = Date.now();
      const usage = usageDoc.data() || {};
      const reservations = { ...(usage.freeReservations || {}) };
      const proReservations = { ...(usage.proReservations || {}) };
      delete reservations[requestId];
      delete proReservations[requestId];
      tx.set(usageRef, { freeUsed: safeCount(usage.freeUsed),
        freeReservations: reservations, proReservations }, { merge: true });
    }
    tx.update(requestRef, changes);
    return { status };
  });
}

export async function rookProResponse(request, response, readBody) {
  if (!proServerConfigured()) {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ rollout: false, status: 'disabled' }));
    return;
  }
  try {
    const uid = await verifiedUid(request);
    if (request.url === '/api/pro/access') {
      const active = await serverEntitlement(uid);
      const usage = await coachUsage(uid);
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ rollout: true, status: active ? 'active' : 'free', ...usage }));
      return;
    }
    const { requestId, succeeded, message } = await readBody(request);
    if (request.url === '/api/coach/begin') {
      if (typeof message !== 'string' || !message.trim())
        throw Object.assign(new Error('Invalid Coach question.'), { statusCode: 400 });
      const pro = await serverEntitlement(uid);
      const result = await reserveCoachResponse(uid, requestId, pro, Date.now(), null, message);
      response.writeHead(result.status === 'limit' ? 402 : result.status === 'fair-use' ? 429 : 200,
        { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(result));
      return;
    }
    if (request.url === '/api/coach/finish') {
      const result = await finishCoachResponse(uid, requestId, succeeded === true);
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(result));
    }
  } catch (error) {
    response.writeHead(error.statusCode || 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ error: error.message || 'ROOK Pro access is unavailable.' }));
  }
}

