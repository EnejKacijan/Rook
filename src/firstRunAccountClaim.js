// A provider login on an empty device is not itself a ROOK profile. This
// sidecar records the *verified empty* account and the in-memory first-run ID
// without writing a fabricated training profile to primary storage.
export const FIRST_RUN_ACCOUNT_CLAIM_KEY = 'rook-first-run-account-claim-v1';

export function readFirstRunAccountClaim(storage) {
  const raw = storage.getItem(FIRST_RUN_ACCOUNT_CLAIM_KEY);
  if (raw === null) return null;
  let claim;
  try { claim = JSON.parse(raw); } catch { throw new Error('First-run account identity needs review.'); }
  if (claim?.version !== 1 || typeof claim.uid !== 'string' || !claim.uid ||
      typeof claim.profileId !== 'string' || !claim.profileId)
    throw new Error('First-run account identity needs review.');
  return claim;
}

export function writeFirstRunAccountClaim(storage, { uid, profileId }) {
  const existing = readFirstRunAccountClaim(storage);
  if (existing && (existing.uid !== uid || existing.profileId !== profileId))
    throw new Error('A different account is already associated with this setup.');
  const raw = JSON.stringify({ version: 1, uid, profileId });
  storage.setItem(FIRST_RUN_ACCOUNT_CLAIM_KEY, raw);
  if (storage.getItem(FIRST_RUN_ACCOUNT_CLAIM_KEY) !== raw)
    throw new Error('Could not safely remember this account.');
}

export function clearFirstRunAccountClaim(storage, uid, profileId) {
  const claim = readFirstRunAccountClaim(storage);
  if (claim?.uid === uid && claim.profileId === profileId)
    storage.removeItem(FIRST_RUN_ACCOUNT_CLAIM_KEY);
}
