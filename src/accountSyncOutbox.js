import { syncEntities, syncMutationId } from './accountSyncModel.js';

export const ACCOUNT_SYNC_LEDGER_KEY = 'rook-account-sync-ledger-v1';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const failure = code => Object.assign(new Error(`ROOK sync needs attention (${code}). Local data is unchanged.`), { code });

export function readAccountSyncLedger(storage, profileId) {
  const raw = storage.getItem(ACCOUNT_SYNC_LEDGER_KEY);
  if (raw === null) return null;
  let ledger;
  try { ledger = JSON.parse(raw); } catch { throw failure('ledger-invalid'); }
  if (!object(ledger) || ledger.version !== 1 || ledger.profileId !== profileId || typeof ledger.deviceId !== 'string' || !ledger.deviceId || !object(ledger.acknowledged) || !Array.isArray(ledger.pending) || !Array.isArray(ledger.deleteIntents)) throw failure('ledger-identity-conflict');
  return ledger;
}

function writeLedger(storage, ledger) {
  const raw = JSON.stringify(ledger);
  storage.setItem(ACCOUNT_SYNC_LEDGER_KEY, raw);
  if (storage.getItem(ACCOUNT_SYNC_LEDGER_KEY) !== raw) throw failure('ledger-write-failed');
  return ledger;
}

export function ensureAccountSyncLedger(storage, profileId, { accountUid = null, deviceId = globalThis.crypto?.randomUUID?.() } = {}) {
  const existing = readAccountSyncLedger(storage, profileId);
  if (existing) {
    if (accountUid && existing.accountUid && existing.accountUid !== accountUid) throw failure('account-identity-conflict');
    if (accountUid && !existing.accountUid) return writeLedger(storage, { ...existing, accountUid });
    return existing;
  }
  if (!deviceId) throw failure('device-identity-unavailable');
  return writeLedger(storage, { version: 1, profileId, accountUid, deviceId, acknowledged: {}, pending: [], deleteIntents: [], lastSuccessAt: null, failureCount: 0, retryAfter: null });
}

// This runs only after the P0 primary write has succeeded. A lost sidecar does
// not erase the primary: the next scan rebuilds pending changes from the root.
export function captureAccountSyncMutations(storage, state, generation, { accountUid = null } = {}) {
  const profileId = state?.profile?.id;
  if (!profileId || !Number.isSafeInteger(generation) || generation < 0) throw failure('invalid-local-source');
  const ledger = ensureAccountSyncLedger(storage, profileId, { accountUid });
  const entities = syncEntities(state), pending = [...ledger.pending], intents = new Set(ledger.deleteIntents);
  const allKeys = new Set([...entities.keys(), ...Object.keys(ledger.acknowledged)]);
  const missingIntent = [];
  for (const entityKey of allKeys) {
    const local = entities.get(entityKey), base = ledger.acknowledged[entityKey];
    if ((local?.digest ?? null) === (base?.digest ?? null)) {
      for (let i = pending.length - 1; i >= 0; i--) if (pending[i].proposal.key === entityKey && !pending[i].attempted) pending.splice(i, 1);
      continue;
    }
    if (!local && !intents.has(entityKey)) {
      for (let i = pending.length - 1; i >= 0; i--) if (pending[i].proposal.key === entityKey && !pending[i].attempted) pending.splice(i, 1);
      missingIntent.push(entityKey); continue;
    }
    const operation = local ? 'upsert' : 'delete';
    const proposal = { key: entityKey, operation, ...(local && { entity: local }), baseRevision: base?.revision || 0 };
    const currentIndex = pending.findIndex(item => item.proposal.key === entityKey && !item.attempted);
    const item = { mutationId: syncMutationId({ profileId, deviceId: ledger.deviceId, generation, proposal }), generation, proposal, attempted: false };
    if (currentIndex >= 0) pending[currentIndex] = item;
    else if (!pending.some(old => old.proposal.key === entityKey && old.proposal.entity?.digest === local?.digest && old.proposal.operation === operation)) pending.push(item);
  }
  const next = { ...ledger, pending, missingIntent };
  writeLedger(storage, next);
  return { pending: pending.length, missingIntent };
}

export function recordAccountSyncDeleteIntent(storage, profileId, domain, entityId) {
  const ledger = ensureAccountSyncLedger(storage, profileId);
  const key = `${domain}:${JSON.stringify(entityId)}`;
  if (!['workouts','optionalSessions','savedWorkoutTemplates','customExercises','gymProfiles','weightCheckins'].includes(domain) || !entityId) throw failure('unsupported-delete-intent');
  if (!ledger.deleteIntents.includes(key)) writeLedger(storage, { ...ledger, deleteIntents: [...ledger.deleteIntents, key] });
  return key;
}

export function updateAccountSyncLedger(storage, profileId, transform) {
  const current = readAccountSyncLedger(storage, profileId);
  if (!current) throw failure('ledger-missing');
  const next = transform(structuredClone(current));
  if (next.profileId !== profileId || next.deviceId !== current.deviceId || next.accountUid !== current.accountUid) throw failure('ledger-identity-conflict');
  return writeLedger(storage, next);
}

export function accountSyncDiagnostics(storage, profileId) {
  try {
    const ledger = readAccountSyncLedger(storage, profileId);
    return { pendingCount: ledger?.pending.length || 0, lastSuccessfulSyncAt: ledger?.lastSuccessAt || null, failureCount: ledger?.failureCount || 0, accountLinked: Boolean(ledger?.accountUid), needsDeleteReview: Boolean(ledger?.missingIntent?.length) };
  } catch { return { pendingCount: null, lastSuccessfulSyncAt: null, failureCount: null, accountLinked: false, needsDeleteReview: true }; }
}
