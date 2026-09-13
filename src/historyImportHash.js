import { sha256 } from '@noble/hashes/sha2.js';

export class HistoryImportHashError extends Error {
  constructor() {
    super("ROOK couldn't verify this import file on this device. Your existing history was not changed.");
    this.name = 'HistoryImportHashError';
    this.code = 'import-verification-failed';
  }
}

// Keep canonicalization at the caller: persisted import identities already use
// SHA-256 of these exact UTF-8 strings. Only the local digest implementation may
// vary. In particular, LAN HTTP workers on iOS may have crypto but no subtle.
export async function hashCanonicalImportData(text) {
  try {
    const bytes = new TextEncoder().encode(text);
    let digest;
    try {
      const subtle = globalThis.crypto?.subtle;
      if (typeof subtle?.digest === 'function') {
        digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
      }
    } catch {
      // A present API can still be unavailable in the current runtime.
    }
    if (digest?.length !== 32) digest = sha256(bytes);
    if (digest.length !== 32) throw new Error('Invalid digest');
    return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    // Do not expose implementation errors or source data through the worker/UI.
    throw new HistoryImportHashError();
  }
}
