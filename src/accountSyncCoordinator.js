import { applySyncDownloads, classifySyncBootstrap, planSyncReconciliation, syncEntities, syncMutationId } from './accountSyncModel.js';
import { captureAccountSyncMutations, ensureAccountSyncLedger, readAccountSyncLedger, updateAccountSyncLedger } from './accountSyncOutbox.js';

const asMap = value => new Map(Object.entries(value || {}));
const time = () => new Date().toISOString();
const status = (state, extra = {}) => ({ state, ...extra });
const blockedCloudError = error => ['permission-denied', 'unauthenticated', 'invalid-argument', 'resource-exhausted', 'lineage-conflict', 'revision-conflict'].includes(error?.code);

// A single bounded pass. Callers schedule another pass after a local write,
// foreground, reconnect, or a retry deadline. This never runs inside the
// synchronous logger write path and never publishes a cloud state directly.
export async function syncAccountOnce({ storage, local, accountUid, newlyCreatedAnonymous = false, cloud, checkpoint, commitRemote, isCurrent = () => true, isAccountCurrent = () => true }) {
  if (!local || local.status !== 'ready' || !local.state?.profile?.id) return status('local-unavailable');
  const profileId = local.state.profile.id;
  const startingGeneration = local.generation;
  // Even creating/scanning a sidecar is a write. An old pass must not create its
  // ledger in a freshly selected local-first namespace that has no ledger yet.
  if (!isCurrent(startingGeneration)) return status('retry', { category: 'local-changed' });
  let ledger;
  try {
    ledger = ensureAccountSyncLedger(storage, profileId);
    if (accountUid && ledger.accountUid && ledger.accountUid !== accountUid) return status('needs-attention', { category: 'account-identity-conflict' });
    captureAccountSyncMutations(storage, local.state, startingGeneration);
    ledger = readAccountSyncLedger(storage, profileId);
  } catch (error) { return status('needs-attention', { category: error.code || 'local-sync-ledger' }); }
  if (!accountUid) return status('auth-unavailable', { pendingCount: ledger.pending.length });
  if (!isCurrent(startingGeneration)) return status('retry', { category: 'local-changed' });
  let remote;
  try { remote = await cloud.read(accountUid); }
  catch (error) { return status(blockedCloudError(error) ? 'needs-attention' : 'offline', { pendingCount: ledger.pending.length, category: error.code || 'cloud-unavailable' }); }
  if (!isCurrent(startingGeneration)) return status('retry', { category: 'local-changed' });
  if (remote.accountSchemaVersion != null && remote.accountSchemaVersion !== 1) return status('needs-attention', { category: 'cloud-schema-unsupported' });
  const classification = classifySyncBootstrap({ localState: local.state, cloudProfileId: remote.profileId, cloudEntities: remote.entities, accountVerified: true });
  if (['different-lineage', 'cloud-identity-missing', 'cloud-recovery-required'].includes(classification)) return status('needs-attention', { category: classification });
  if (classification === 'empty') return status('waiting-for-training');
  if (!ledger.accountUid && !remote.profileId && !newlyCreatedAnonymous) return status('needs-attention', { category: 'unverified-account-binding' });
  if (!ledger.accountUid) ledger = ensureAccountSyncLedger(storage, profileId, { accountUid });
  if (classification === 'upload-local-after-checkpoint') {
    try {
      await checkpoint();
      if (!isCurrent(startingGeneration)) return status('retry', { category: 'local-changed' });
      await cloud.establish(accountUid, profileId);
      remote = await cloud.read(accountUid);
      if (remote.profileId !== profileId) return status('needs-attention', { category: 'different-lineage' });
    } catch (error) { return status(blockedCloudError(error) ? 'needs-attention' : 'offline', { category: error.code || 'bootstrap-failed', pendingCount: ledger.pending.length }); }
  }
  if (!isCurrent(startingGeneration)) return status('retry', { category: 'local-changed' });
  // A cloud transaction may have committed immediately before a crash. The
  // mutation ID lets us acknowledge it without replaying or duplicating work.
  const acknowledged = asMap(ledger.acknowledged);
  const completedPending = ledger.pending.filter(item => remote.entities.get(item.proposal.key)?.lastMutationId === item.mutationId);
  for (const item of completedPending) {
    const entity = remote.entities.get(item.proposal.key);
    acknowledged.set(item.proposal.key, { revision: entity.revision, digest: entity.digest });
  }
  if (completedPending.length) ledger = updateAccountSyncLedger(storage, profileId, current => ({ ...current, acknowledged: Object.fromEntries(acknowledged), pending: current.pending.filter(item => !completedPending.some(done => done.mutationId === item.mutationId)) }));
  const localEntities = syncEntities(local.state);
  const plan = planSyncReconciliation({ localEntities, cloudEntities: remote.entities, acknowledged, explicitDeletes: new Set(ledger.deleteIntents) });
  if (plan.blocked.length || plan.conflicts.length || ledger.missingIntent?.length) return status('needs-attention', { category: plan.blocked[0]?.reason || plan.conflicts[0]?.reason || 'delete-intent-missing', pendingCount: ledger.pending.length });
  if (plan.discarded.length) ledger = updateAccountSyncLedger(storage, profileId, current => ({
    ...current,
    pending: current.pending.filter(item => !plan.discarded.some(done => done.key === item.proposal.key)),
    deleteIntents: current.deleteIntents.filter(key => !plan.discarded.some(done => done.key === key)),
  }));
  if (plan.settled.length) {
    for (const item of plan.settled) {
      const entity = remote.entities.get(item.key);
      acknowledged.set(item.key, { revision: item.revision, digest: entity?.digest ?? null });
    }
    ledger = updateAccountSyncLedger(storage, profileId, current => ({ ...current, acknowledged: Object.fromEntries(acknowledged), pending: current.pending.filter(item => !plan.settled.some(done => done.key === item.proposal.key)) }));
  }
  if (plan.download.length) {
    try {
      await checkpoint();
      if (!isCurrent(startingGeneration)) return status('retry', { category: 'local-changed' });
      // Re-read the exact remote revisions just before applying local changes.
      const fresh = await cloud.read(accountUid);
      if (fresh.profileId !== profileId || plan.download.some(item => fresh.entities.get(item.key)?.revision !== item.entity.revision || fresh.entities.get(item.key)?.digest !== item.entity.digest)) return status('retry', { category: 'cloud-changed' });
      if (!isCurrent(startingGeneration)) return status('retry', { category: 'local-changed' });
      const merged = applySyncDownloads(local.state, plan.download);
      if (!await commitRemote(merged, startingGeneration)) return status('needs-attention', { category: 'local-merge-save-failed' });
      if (!isAccountCurrent()) return status('retry', { category: 'account-changed' });
      ledger = updateAccountSyncLedger(storage, profileId, current => {
        const next = { ...current.acknowledged };
        for (const item of plan.download) next[item.key] = { revision: item.entity.revision, digest: item.entity.digest };
        return { ...current, acknowledged: next, pending: current.pending.filter(item => !plan.download.some(done => done.key === item.proposal.key)) };
      });
      return status('retry', { category: 'remote-applied', pendingCount: ledger.pending.length });
    } catch (error) { return status('needs-attention', { category: error.code || 'remote-merge-failed' }); }
  }
  for (const item of plan.upload) {
    if (!isCurrent(startingGeneration)) return status('retry', { category: 'local-changed' });
    const existing = ledger.pending.find(pending => pending.proposal.key === item.key && pending.proposal.operation === item.operation && pending.proposal.entity?.digest === item.entity?.digest && pending.proposal.baseRevision === item.baseRevision);
    const mutationId = existing?.mutationId || syncMutationId({ profileId, deviceId: ledger.deviceId, generation: startingGeneration, proposal: item });
    try {
      ledger = updateAccountSyncLedger(storage, profileId, current => {
        const without = current.pending.filter(pending => pending.proposal.key !== item.key);
        return { ...current, pending: [...without, { generation: startingGeneration, mutationId, proposal: item, attempted: true }] };
      });
      const written = await cloud.write(accountUid, profileId, item, mutationId);
      // A response may arrive after sign-out or switching away and back. The
      // next current pass can acknowledge its mutation ID; this old one cannot.
      if (!isCurrent(startingGeneration)) return status('retry', { category: 'local-changed' });
      if (written.profileId !== profileId || written.revision !== item.baseRevision + 1 || written.digest !== (item.entity?.digest || null)) throw Object.assign(new Error('Cloud acknowledgement mismatch.'), { code: 'cloud-ack-mismatch' });
      ledger = updateAccountSyncLedger(storage, profileId, current => ({ ...current, acknowledged: { ...current.acknowledged, [item.key]: { revision: written.revision, digest: written.digest } }, pending: current.pending.filter(pending => pending.mutationId !== mutationId), deleteIntents: item.operation === 'delete' ? current.deleteIntents.filter(key => key !== item.key) : current.deleteIntents }));
    } catch (error) { return status(blockedCloudError(error) || error.code === 'cloud-ack-mismatch' ? 'needs-attention' : 'offline', { category: error.code || 'cloud-write-failed', pendingCount: ledger.pending.length }); }
  }
  if (!isCurrent(startingGeneration)) return status('retry', { category: 'local-changed' });
  ledger = updateAccountSyncLedger(storage, profileId, current => ({ ...current, lastSuccessAt: time(), failureCount: 0, retryAfter: null }));
  return status(ledger.pending.length ? 'syncing' : 'synced', { pendingCount: ledger.pending.length, lastSuccessAt: ledger.lastSuccessAt });
}
