import { sha256 } from '@noble/hashes/sha2.js';
import { ACCOUNT_SYNC_SCHEMA } from './accountSyncModel.js';
import { activeProfileSlot } from './profileSlotKeys.js';
import { rookPlatform } from './platform.js';

export function firebaseConfigurationStatus() {
  if (rookPlatform.isNative) return 'rollout-off';
  // Public Firebase config alone must not activate an unverified account flow.
  if (import.meta.env?.VITE_ROOK_ACCOUNT_SYNC_ROLLOUT !== 'true') return 'rollout-off';
  const env = import.meta.env || {};
  if (['VITE_ROOK_FIREBASE_API_KEY', 'VITE_ROOK_FIREBASE_AUTH_DOMAIN',
    'VITE_ROOK_FIREBASE_PROJECT_ID', 'VITE_ROOK_FIREBASE_APP_ID'].some(key => !env[key])) return 'missing-config';
  if (env.VITE_ROOK_FIREBASE_PROJECT_ID !== 'rook-1d2c8') return 'project-mismatch';
  return 'ready';
}

const firebaseConfig = () => {
  const status = firebaseConfigurationStatus();
  if (status === 'project-mismatch') throw new Error('ROOK Firebase project ID mismatch.');
  if (status !== 'ready') return null;
  const env = import.meta.env || {};
  const config = {
    apiKey: env.VITE_ROOK_FIREBASE_API_KEY,
    authDomain: env.VITE_ROOK_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_ROOK_FIREBASE_PROJECT_ID,
    appId: env.VITE_ROOK_FIREBASE_APP_ID,
  };
  if (env.VITE_ROOK_FIREBASE_STORAGE_BUCKET) config.storageBucket = env.VITE_ROOK_FIREBASE_STORAGE_BUCKET;
  if (env.VITE_ROOK_FIREBASE_MESSAGING_SENDER_ID) config.messagingSenderId = env.VITE_ROOK_FIREBASE_MESSAGING_SENDER_ID;
  return config;
};
const initializations = new Map();
export function firebaseConfigured() { return Boolean(firebaseConfig()); }
export async function getFirebaseSyncClient() {
  const config = firebaseConfig();
  if (!config) return null;
  // A separately chosen local profile keeps its own persisted anonymous Auth
  // identity. The original ROOK profile retains the legacy app name.
  const appName = activeProfileSlot()?.authAppName || 'rook-sync';
  if (!initializations.has(appName)) initializations.set(appName, (async () => {
    const [{ initializeApp, getApps }, authApi, firestoreApi] = await Promise.all([
      import('firebase/app'), import('firebase/auth'), import('firebase/firestore'),
    ]);
    const app = getApps().find(candidate => candidate.name === appName) || initializeApp(config, appName);
    if (app.options.projectId !== config.projectId || app.options.appId !== config.appId) throw new Error('ROOK Firebase app configuration mismatch.');
    const auth = authApi.getAuth(app);
    const db = firestoreApi.getFirestore(app);
    return { auth, db, authApi, firestoreApi };
  })());
  const initialization = initializations.get(appName);
  try { return await initialization; }
  catch (error) {
    // A transient failure must not poison this auth namespace for the session.
    if (initializations.get(appName) === initialization) initializations.delete(appName);
    throw error;
  }
}


export async function resolveFirebaseIdentity(client, { allowAnonymous = true } = {}) {
  await client.auth.authStateReady();
  if (client.auth.currentUser) return { user: client.auth.currentUser, created: false };
  if (!allowAnonymous) return { user: null, created: false };
  const result = await client.authApi.signInAnonymously(client.auth);
  return { user: result.user, created: true };
}

export function firebaseEntityDocumentId(entityKey) {
  const bytes = sha256(new TextEncoder().encode(entityKey));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createFirebaseSyncAdapter(client) {
  const { db, firestoreApi: f } = client;
  const root = uid => f.doc(db, 'rookAccounts', uid);
  const entity = (uid, entityKey) => f.doc(db, 'rookAccounts', uid, 'entities', firebaseEntityDocumentId(entityKey));
  return {
    async read(uid) {
      const [account, rows] = await Promise.all([
        f.getDocFromServer(root(uid)),
        f.getDocsFromServer(f.collection(db, 'rookAccounts', uid, 'entities')),
      ]);
      const entities = new Map();
      for (const row of rows.docs) {
        const value = row.data(), entityKey = `${value.domain}:${JSON.stringify(value.entityId)}`;
        if (row.id !== firebaseEntityDocumentId(entityKey) || entities.has(entityKey)) throw new Error('Cloud entity identity mismatch.');
        entities.set(entityKey, value);
      }
      return { profileId: account.exists() ? account.data().profileId : null, accountSchemaVersion: account.exists() ? account.data().syncSchemaVersion : null, entities };
    },
    async establish(uid, profileId) {
      return f.runTransaction(db, async transaction => {
        const ref = root(uid), current = await transaction.get(ref);
        if (current.exists()) {
          if (current.data().profileId !== profileId || current.data().syncSchemaVersion !== ACCOUNT_SYNC_SCHEMA) throw Object.assign(new Error('Account lineage mismatch.'), { code: 'lineage-conflict' });
          return current.data();
        }
        const anchor = { syncSchemaVersion: ACCOUNT_SYNC_SCHEMA, profileId, createdAt: f.serverTimestamp() };
        transaction.set(ref, anchor);
        return { syncSchemaVersion: ACCOUNT_SYNC_SCHEMA, profileId };
      });
    },
    async write(uid, profileId, proposal, mutationId) {
      return f.runTransaction(db, async transaction => {
        const accountRef = root(uid), target = entity(uid, proposal.key);
        const [anchor, current] = await Promise.all([transaction.get(accountRef), transaction.get(target)]);
        if (!anchor.exists() || anchor.data().profileId !== profileId || anchor.data().syncSchemaVersion !== ACCOUNT_SYNC_SCHEMA) throw Object.assign(new Error('Account lineage mismatch.'), { code: 'lineage-conflict' });
        if (current.exists() && current.data().lastMutationId === mutationId) return current.data();
        const revision = current.exists() ? current.data().revision : 0;
        if (revision !== proposal.baseRevision) throw Object.assign(new Error('Cloud revision conflict.'), { code: 'revision-conflict' });
        const domain = proposal.entity?.domain || proposal.key.slice(0, proposal.key.indexOf(':'));
        const entityId = proposal.entity?.entityId || JSON.parse(proposal.key.slice(proposal.key.indexOf(':') + 1));
        const record = {
          syncSchemaVersion: ACCOUNT_SYNC_SCHEMA,
          profileId, domain, entityId, ordinal: proposal.entity?.ordinal ?? (current.exists() ? current.data().ordinal : null), revision: revision + 1,
          lastMutationId: mutationId, updatedAt: f.serverTimestamp(),
          deleted: proposal.operation === 'delete',
          digest: proposal.operation === 'delete' ? null : proposal.entity.digest,
          value: proposal.operation === 'delete' ? null : proposal.entity.value,
        };
        transaction.set(target, record);
        return { ...record, updatedAt: null };
      });
    },
  };
}

// The caller must obtain a credential only from an explicitly configured
// provider UI. On collision, keep the anonymous account and its local data.
export async function linkExistingAnonymousUser(client, credential) {
  const before = client.auth.currentUser;
  if (!before?.isAnonymous) throw new Error('No anonymous ROOK account to link.');
  try {
    const result = await client.authApi.linkWithCredential(before, credential);
    if (result.user.uid !== before.uid || client.auth.currentUser?.uid !== before.uid) throw new Error('Account identity changed during linking.');
    return { status: 'linked', uid: before.uid, user: result.user };
  } catch (error) {
    if (client.auth.currentUser?.uid !== before.uid) throw new Error('Account identity changed during linking.');
    if (['auth/credential-already-in-use', 'auth/email-already-in-use', 'auth/account-exists-with-different-credential'].includes(error.code)) return { status: 'existing-account-conflict', uid: before.uid };
    throw error;
  }
}

// Popup is initiated directly by a user gesture. On ROOK's Netlify domain the
// default Firebase redirect helper would require additional same-origin proxy
// configuration in browsers that block third-party storage.
export async function linkGoogleAnonymousAccount(client) {
  const before = client.auth.currentUser;
  if (!before?.isAnonymous) throw new Error('No anonymous ROOK account to link.');
  try {
    const provider = new client.authApi.GoogleAuthProvider();
    provider.setCustomParameters?.({ prompt: 'select_account' });
    const result = await client.authApi.linkWithPopup(before, provider);
    if (result.user.uid !== before.uid || client.auth.currentUser?.uid !== before.uid) throw new Error('Account identity changed during linking.');
    return { status: 'linked', uid: before.uid, user: result.user };
  } catch (error) {
    if (client.auth.currentUser?.uid !== before.uid) throw new Error('Account identity changed during linking.');
    if (['auth/credential-already-in-use', 'auth/email-already-in-use', 'auth/account-exists-with-different-credential'].includes(error.code)) return { status: 'existing-account-conflict', uid: before.uid };
    throw error;
  }
}
