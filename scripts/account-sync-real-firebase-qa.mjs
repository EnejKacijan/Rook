import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';

if (process.env.ROOK_REAL_FIREBASE_TEST !== '1') {
  throw new Error('Set ROOK_REAL_FIREBASE_TEST=1 to use isolated synthetic accounts against the real rook-1d2c8 project.');
}

const baseUrl = process.env.ROOK_REAL_FIREBASE_URL || 'http://127.0.0.1:4273';
const url = `${baseUrl}/__firebase_probe__`;
const fixture = createReturningUserFixture(1);
fixture.savedWorkoutTemplates = [{
  schemaVersion: 1, id: 'qa-template', name: 'QA template', revision: 1,
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  exercises: [{ id: 'qa-exercise', exerciseId: 'bench-press', sets: [{ id: 'qa-set' }] }],
}];
fixture.workouts[0].photoId = 'local-only-qa-photo';

const engine = process.env.ROOK_REAL_FIREBASE_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === webkit ? { headless: true } : { channel: 'chrome', headless: true });
const context = await browser.newContext({ serviceWorkers: 'block' });
const page = await context.newPage();
await page.route('**/__firebase_probe__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated ROOK Firebase QA</title>' }));
try {
  await page.goto(url);
  const first = await page.evaluate(async state => {
    const { getFirebaseSyncClient, resolveFirebaseIdentity, createFirebaseSyncAdapter } = await import('/src/firebaseSyncClient.js');
    const { syncAccountOnce } = await import('/src/accountSyncCoordinator.js');
    const { syncEntities } = await import('/src/accountSyncModel.js');
    const { saveState, hydrateStoredState } = await import('/src/domain.js');
    const { readLocalSyncSnapshot, checkpointCurrentLocalState } = await import('/src/localStateStorage.js');
    const client = await getFirebaseSyncClient();
    const identity = await resolveFirebaseIdentity(client);
    const adapter = createFirebaseSyncAdapter(client);
    if (!saveState(state, { reason: 'first-run:user-confirmed' })) throw Error('Initial local save failed');
    const local = readLocalSyncSnapshot(localStorage, hydrateStoredState);
    const result = await syncAccountOnce({ storage: localStorage, local, accountUid: identity.user.uid,
      newlyCreatedAnonymous: identity.created, cloud: adapter,
      checkpoint: () => checkpointCurrentLocalState(localStorage, hydrateStoredState),
      commitRemote: async () => { throw Error('Initial upload must not merge remote'); },
    });
    const remote = await adapter.read(identity.user.uid);
    return { uid: identity.user.uid, anonymous: identity.user.isAnonymous, created: identity.created,
      result, profileId: local.state.profile.id, remoteProfileId: remote.profileId,
      localCount: syncEntities(local.state).size, remoteCount: remote.entities.size,
      pendingCount: JSON.parse(localStorage.getItem('rook-account-sync-ledger-v1')).pending.length,
      workoutIds: local.state.workouts.map(item => item.id),
      cloudWorkoutIds: [...remote.entities.values()].filter(item => item.domain === 'workouts' && !item.deleted).sort((a,b) => a.ordinal-b.ordinal).map(item => item.entityId),
      photosUploaded: [...remote.entities.values()].some(item => item.domain === 'workouts' && (item.value?.photoId || item.value?.photoBlob)),
    };
  }, fixture);
  assert.equal(first.anonymous, true);
  assert.equal(first.result.state, 'synced', JSON.stringify(first.result));
  assert.equal(first.profileId, first.remoteProfileId);
  assert.equal(first.remoteCount, first.localCount);
  assert.equal(first.pendingCount, 0);
  assert.deepEqual(first.cloudWorkoutIds, first.workoutIds);
  assert.equal(first.photosUploaded, false);
  console.log(`PASS anonymous first sync: ${first.remoteCount} entities, exact lineage/order, no photos`);

  const restored = await page.evaluate(async expected => {
    const { resolveAccountStartup } = await import('/src/accountStartup.js');
    const { getFirebaseSyncClient, createFirebaseSyncAdapter, resolveFirebaseIdentity } = await import('/src/firebaseSyncClient.js');
    const { hydrateStoredState } = await import('/src/domain.js');
    const { readLocalState, PRIMARY_KEY, RECOVERY_KEY } = await import('/src/localStateStorage.js');
    const { syncEntities } = await import('/src/accountSyncModel.js');
    localStorage.removeItem(PRIMARY_KEY);
    localStorage.removeItem(RECOVERY_KEY);
    const missing = readLocalState(localStorage, hydrateStoredState);
    const trace = [];
    const timed = (label, action) => async (...args) => {
      const started = performance.now();
      try {
        const value = await action(...args);
        trace.push({ label, ms: Math.round(performance.now() - started) });
        return value;
      } catch (error) {
        trace.push({ label, ms: Math.round(performance.now() - started), code: error.code || error.message });
        throw error;
      }
    };
    const recoveryStartedAt = performance.now();
    const decision = await resolveAccountStartup(missing, {
      getClient: timed('client', getFirebaseSyncClient),
      resolveIdentity: timed('identity', resolveFirebaseIdentity),
      getAdapter: client => {
        const adapter = createFirebaseSyncAdapter(client);
        return { ...adapter, read: timed('cloud-read', adapter.read) };
      },
    });
    const recoveryElapsedMs = Math.round(performance.now() - recoveryStartedAt);
    if (decision.code !== 'cloud-recovery-available') {
      const { blankState } = await import('/src/domain.js');
      const { materializeCloudProfile, planSyncReconciliation } = await import('/src/accountSyncModel.js');
      const client = await getFirebaseSyncClient();
      const remote = await createFirebaseSyncAdapter(client).read(client.auth.currentUser.uid);
      let materializeError = null;
      try { materializeCloudProfile(blankState(), remote); } catch (error) { materializeError = error.message; }
      const plan = planSyncReconciliation({ localEntities: new Map(), cloudEntities: remote.entities });
      const { firebaseConfigured } = await import('/src/firebaseSyncClient.js');
      const ledger = JSON.parse(localStorage.getItem('rook-account-sync-ledger-v1') || 'null');
      return { missing: missing.code, decision: decision.code, recoveryElapsedMs, trace, materializeError, remoteCount: remote.entities.size,
        configured: firebaseConfigured(), primaryPresent: localStorage.getItem(PRIMARY_KEY) !== null,
        recoveryPresent: localStorage.getItem(RECOVERY_KEY) !== null, startupRecoveryPresent: Boolean(missing.recovery),
        uidPreserved: client.auth.currentUser?.uid === expected.uid,
        ledgerMatches: ledger?.accountUid === expected.uid && ledger?.profileId === expected.profileId,
        cloudProfileMatches: remote.profileId === expected.profileId, accountSchemaVersion: remote.accountSchemaVersion,
        invalidEntitySchemas: [...remote.entities.values()].filter(record => record.syncSchemaVersion !== 1).length,
        blocked: plan.blocked, conflicts: plan.conflicts, uploads: plan.upload.length };
    }
    const result = await decision.restoreCloud();
    const client = await getFirebaseSyncClient();
    const remote = await createFirebaseSyncAdapter(client).read(client.auth.currentUser.uid);
    const localEntities = syncEntities(result.state);
    return {
      missing: missing.code, decision: decision.code, status: result.status,
      profileId: result.state.profile.id,
      expectedProfileId: expected.profileId,
      programId: result.state.program?.id,
      workoutIds: result.state.workouts.map(item => item.id),
      templateIds: result.state.savedWorkoutTemplates.map(item => item.id),
      exactEntities: [...localEntities].every(([key, item]) => remote.entities.get(key)?.digest === item.digest),
      entityCount: localEntities.size,
    };
  }, { profileId: first.profileId, uid: first.uid });
  assert.equal(restored.missing, 'primary-missing');
  assert.equal(restored.decision, 'cloud-recovery-available', JSON.stringify(restored));
  assert.equal(restored.status, 'ready');
  assert.equal(restored.profileId, first.profileId);
  assert.deepEqual(restored.workoutIds, first.workoutIds);
  assert.deepEqual(restored.templateIds, ['qa-template']);
  assert.equal(restored.entityCount, first.localCount);
  assert.equal(restored.exactEntities, true);
  console.log(`PASS protected real-cloud restore: exact ${restored.entityCount} entities and workout IDs`);

  const other = await browser.newContext({ serviceWorkers: 'block' });
  const otherPage = await other.newPage();
  await otherPage.route('**/__firebase_probe__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Other anonymous user</title>' }));
  try {
    await otherPage.goto(url);
    const cross = await otherPage.evaluate(async firstUid => {
      const { getFirebaseSyncClient, resolveFirebaseIdentity, createFirebaseSyncAdapter } = await import('/src/firebaseSyncClient.js');
      const client = await getFirebaseSyncClient();
      const own = await resolveFirebaseIdentity(client);
      const adapter = createFirebaseSyncAdapter(client);
      const errorCode = async work => { try { await work(); return 'ALLOWED'; } catch (error) { return error.code || error.message; } };
      return {
        differentUid: own.user.uid !== firstUid,
        crossRead: await errorCode(() => adapter.read(firstUid)),
        crossWrite: await errorCode(() => adapter.establish(firstUid, 'foreign-profile')),
        unknownPath: await errorCode(() => client.firestoreApi.getDocFromServer(client.firestoreApi.doc(client.db, 'unknown', 'path'))),
      };
    }, first.uid);
    assert.equal(cross.differentUid, true);
    assert.equal(cross.crossRead, 'permission-denied');
    assert.equal(cross.crossWrite, 'permission-denied');
    assert.equal(cross.unknownPath, 'permission-denied');
  } finally { await other.close(); }
  const unauth = await browser.newContext({ serviceWorkers: 'block' });
  const unauthPage = await unauth.newPage();
  await unauthPage.route('**/__firebase_probe__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Unauthenticated user</title>' }));
  try {
    await unauthPage.goto(url);
    const result = await unauthPage.evaluate(async firstUid => {
      const { getFirebaseSyncClient, createFirebaseSyncAdapter } = await import('/src/firebaseSyncClient.js');
      const client = await getFirebaseSyncClient();
      await client.auth.authStateReady();
      try { await createFirebaseSyncAdapter(client).read(firstUid); return 'ALLOWED'; }
      catch (error) { return error.code || error.message; }
    }, first.uid);
    assert.equal(result, 'permission-denied');
  } finally { await unauth.close(); }
  console.log('PASS live security: own access, foreign read/write denied, unauthenticated denied, unknown path denied');

  const tombstone = await page.evaluate(async uid => {
    const { saveState, hydrateStoredState } = await import('/src/domain.js');
    const { readLocalState, readLocalSyncSnapshot, checkpointCurrentLocalState } = await import('/src/localStateStorage.js');
    const { recordAccountSyncDeleteIntent, ACCOUNT_SYNC_LEDGER_KEY } = await import('/src/accountSyncOutbox.js');
    const { syncAccountOnce } = await import('/src/accountSyncCoordinator.js');
    const { getFirebaseSyncClient, createFirebaseSyncAdapter } = await import('/src/firebaseSyncClient.js');
    const client = await getFirebaseSyncClient(), adapter = createFirebaseSyncAdapter(client);
    const before = readLocalState(localStorage, hydrateStoredState);
    const oldState = structuredClone(before.state), oldLedger = localStorage.getItem(ACCOUNT_SYNC_LEDGER_KEY);
    recordAccountSyncDeleteIntent(localStorage, before.state.profile.id, 'savedWorkoutTemplates', 'qa-template');
    const changed = structuredClone(before.state);
    changed.savedWorkoutTemplates = changed.savedWorkoutTemplates.filter(item => item.id !== 'qa-template');
    if (!saveState(changed, { reason: 'qa-template-remove' })) throw Error('Local deletion failed');
    const local = readLocalSyncSnapshot(localStorage, hydrateStoredState);
    const deletion = await syncAccountOnce({ storage: localStorage, local, accountUid: uid, cloud: adapter,
      checkpoint: () => checkpointCurrentLocalState(localStorage, hydrateStoredState),
      commitRemote: async () => { throw Error('Delete should not merge'); },
    });
    const remote = await adapter.read(uid);
    const record = remote.entities.get('savedWorkoutTemplates:"qa-template"');
    const map = new Map([[ACCOUNT_SYNC_LEDGER_KEY, oldLedger]]);
    const staleStorage = { getItem: key => map.has(key) ? map.get(key) : null,
      setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
    let staleState = oldState;
    const stale = await syncAccountOnce({ storage: staleStorage,
      local: { status: 'ready', state: staleState, generation: before.generation }, accountUid: uid, cloud: adapter,
      checkpoint: async () => {}, commitRemote: async merged => { staleState = merged; return true; },
    });
    return { deletion, tombstone: record && { deleted: record.deleted, revision: record.revision, value: record.value },
      stale, staleTemplateIds: staleState.savedWorkoutTemplates.map(item => item.id) };
  }, first.uid);
  assert.equal(tombstone.deletion.state, 'synced', JSON.stringify(tombstone.deletion));
  assert.equal(tombstone.tombstone.deleted, true);
  assert.equal(tombstone.tombstone.value, null);
  assert.equal(tombstone.stale.state, 'retry', JSON.stringify(tombstone.stale));
  assert.deepEqual(tombstone.staleTemplateIds, []);
  console.log('PASS live tombstone: stale store downloaded deletion without resurrection');

  const offlineMutation = await page.evaluate(async () => {
    const { saveState, hydrateStoredState } = await import('/src/domain.js');
    const { readLocalState } = await import('/src/localStateStorage.js');
    const current = readLocalState(localStorage, hydrateStoredState);
    const changed = structuredClone(current.state);
    const date = '2026-09-28';
    changed.weightCheckins.push({ localDate: date, weightKg: 77.7 });
    if (!saveState(changed, { reason: 'qa-offline-weight-entry' })) throw Error('Offline test mutation was not saved locally');
    return { date, saved: readLocalState(localStorage, hydrateStoredState).state.weightCheckins.some(item => item.localDate === date) };
  });
  assert.equal(offlineMutation.saved, true);
  await context.route('https://firestore.googleapis.com/**', route => route.abort('internetdisconnected'));
  await page.goto(`${baseUrl}/`);
  await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Account and sync' });
  await panel.waitFor();
  await panel.getByText('Offline · saved on this device').waitFor({ timeout: 30000 });
  const offlineLocal = await page.evaluate(date => JSON.parse(localStorage.getItem('lift-v2-state')).weightCheckins.some(item => item.localDate === date), offlineMutation.date);
  assert.equal(offlineLocal, true);
  console.log('PASS live offline startup: populated local app opened, mutation retained, status is local-only');
  await context.unroute('https://firestore.googleapis.com/**');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await panel.getByText('Synced', { exact: true }).waitFor({ timeout: 45000 });
  const reconnected = await page.evaluate(async date => {
    const { getFirebaseSyncClient, createFirebaseSyncAdapter } = await import('/src/firebaseSyncClient.js');
    const client = await getFirebaseSyncClient(), adapter = createFirebaseSyncAdapter(client);
    const firstRead = await adapter.read(client.auth.currentUser.uid);
    const record = firstRead.entities.get(`weightCheckins:${JSON.stringify(date)}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    const secondRead = await adapter.read(client.auth.currentUser.uid);
    return { revision: record?.revision, value: record?.value?.weightKg,
      afterRevision: secondRead.entities.get(`weightCheckins:${JSON.stringify(date)}`)?.revision,
      pending: JSON.parse(localStorage.getItem('rook-account-sync-ledger-v1')).pending.length };
  }, offlineMutation.date);
  assert.equal(reconnected.revision, 1);
  assert.equal(reconnected.value, 77.7);
  assert.equal(reconnected.afterRevision, 1);
  assert.equal(reconnected.pending, 0);
  console.log('PASS live reconnect: queued mutation uploaded once, UI returned to Synced');

  const startupSafety = await page.evaluate(async () => {
    const { resolveAccountStartup } = await import('/src/accountStartup.js');
    const { getFirebaseSyncClient, createFirebaseSyncAdapter } = await import('/src/firebaseSyncClient.js');
    const client = await getFirebaseSyncClient();
    const emptyStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const error = await resolveAccountStartup({ status: 'empty' }, {
      storage: emptyStorage, getClient: async () => client,
      getAdapter: () => ({ read: async () => { throw Object.assign(new Error('Simulated Firestore outage'), { code: 'unavailable' }); } }),
    });
    const ledger = { version: 1, profileId: 'foreign-profile', accountUid: 'foreign-auth-uid' };
    const conflictStorage = { ...emptyStorage, getItem: key => key === 'rook-account-sync-ledger-v1' ? JSON.stringify(ledger) : null };
    const conflict = await resolveAccountStartup({ status: 'empty' }, {
      storage: conflictStorage, getClient: async () => client, getAdapter: createFirebaseSyncAdapter,
    });
    return { error: { status: error.status, code: error.code }, conflict: { status: conflict.status, code: conflict.code } };
  });
  assert.deepEqual(startupSafety.error, { status: 'account-recovery', code: 'unavailable' });
  assert.deepEqual(startupSafety.conflict, { status: 'account-recovery', code: 'account-identity-conflict' });
  console.log('PASS startup safety: injected cloud-read error and real-service identity conflict cannot enter onboarding');

  await page.goto(url);
  await page.evaluate(() => {
    for (const key of ['lift-v2-state', 'rook-recovery-v1', 'rook-install-meta-v1', 'rook-account-sync-ledger-v1']) localStorage.removeItem(key);
  });
  await page.goto(`${baseUrl}/`);
  await page.getByRole('heading', { name: 'Your training data was found.' }).waitFor({ timeout: 60000 });
  assert.equal(await page.getByRole('button', { name: 'BUILD MY PLAN' }).count(), 0);
  await page.getByRole('button', { name: 'RESTORE DATA' }).click();
  await page.getByRole('button', { name: 'PROFILE', exact: true }).waitFor({ timeout: 60000 });
  const freshRestore = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('lift-v2-state'));
    return { profileId: state?.profile?.id, workoutIds: state?.workouts?.map(item => item.id),
      weight: state?.weightCheckins?.find(item => item.localDate === '2026-09-28')?.weightKg,
      templates: state?.savedWorkoutTemplates?.map(item => item.id) };
  });
  assert.equal(freshRestore.profileId, first.profileId);
  assert.deepEqual(freshRestore.workoutIds, first.workoutIds);
  assert.equal(freshRestore.weight, 77.7);
  assert.deepEqual(freshRestore.templates, []);
  console.log('PASS missing-primary startup: protected real-cloud restore kept exact workout IDs, no onboarding');

  const emptyDevice = await page.evaluate(async () => {
    const { resolveAccountStartup } = await import('/src/accountStartup.js');
    const { getFirebaseSyncClient, createFirebaseSyncAdapter } = await import('/src/firebaseSyncClient.js');
    const { saveState, hydrateStoredState } = await import('/src/domain.js');
    const { readLocalState } = await import('/src/localStateStorage.js');
    const map = new Map();
    const storage = { getItem: key => map.has(key) ? map.get(key) : null,
      setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
    const startup = readLocalState(storage, hydrateStoredState);
    const client = await getFirebaseSyncClient();
    const result = await resolveAccountStartup(startup, { storage, getClient: async () => client,
      getAdapter: createFirebaseSyncAdapter, readLocal: readLocalState,
      save: (state, options) => saveState(state, { ...options, storage }),
    });
    return { initial: startup.status, result: result.status, restored: result.restoredFromCloud,
      profileId: result.state?.profile?.id, workoutIds: result.state?.workouts?.map(item => item.id) };
  });
  assert.equal(emptyDevice.initial, 'empty');
  assert.equal(emptyDevice.result, 'ready');
  assert.equal(emptyDevice.restored, true);
  assert.equal(emptyDevice.profileId, first.profileId);
  assert.deepEqual(emptyDevice.workoutIds, first.workoutIds);
  console.log('PASS genuinely empty local store + same authenticated account: real cloud restored without onboarding');

  const newContext = await browser.newContext({ serviceWorkers: 'block' });
  const newPage = await newContext.newPage();
  try {
    await newPage.goto(`${baseUrl}/`);
    await newPage.getByRole('button', { name: 'BUILD MY PLAN' }).waitFor({ timeout: 30000 });
    assert.equal(await newPage.getByRole('heading', { name: 'We couldn’t check your training data.' }).count(), 0);
  } finally { await newContext.close(); }
  console.log('PASS genuinely new local and cloud-empty account: onboarding allowed');
} finally {
  await context.close();
  await browser.close();
}
