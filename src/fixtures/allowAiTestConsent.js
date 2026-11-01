import {beforeEach} from 'vitest';
import {savePrivacyPreference} from '../privacyPreferences.js';
// Existing network-behavior cases model an already-consenting user. Separate
// privacy tests assert the default-off, cancellation and withdrawal paths.
beforeEach(()=>savePrivacyPreference('ai',true));
