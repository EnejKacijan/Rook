import { beforeEach } from 'vitest';
import { forgetStorageSession } from './localStateStorage.js';

// Each test models an independent app instance. Production keeps this observer
// for the lifetime of a tab to catch missing/changed storage during an edit.
beforeEach(() => {
  if (typeof globalThis.localStorage !== 'undefined') forgetStorageSession(globalThis.localStorage);
});
