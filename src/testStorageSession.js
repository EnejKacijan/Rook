import { beforeEach } from 'vitest';
import { forgetStorageSession } from './localStateStorage.js';

// Each test models an independent installation with its own synthetic profile.
// Reset both jsdom storage and the observer between tests; retaining another
// test's initialized profile would correctly trip the profile continuity guard.
// Persistence/reload assertions keep their storage intact within each test.
beforeEach(() => {
  if (typeof globalThis.localStorage !== 'undefined') {
    globalThis.localStorage.clear();
    forgetStorageSession(globalThis.localStorage);
  }
});
