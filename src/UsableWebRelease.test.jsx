import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync,existsSync} from 'node:fs';
import {expect,it} from 'vitest';
import {ProgressionTipsPreference} from './ProgressionTipsPreference.jsx';
import {availableAccountProviders} from './accountProviders.js';
import {createReturningUserFixture} from './demoFixture.js';

it('publishes only free progression visibility, without unfinished Detailed entry points or purchase code',()=>{
  const state=createReturningUserFixture(0);state.profile.progressionGuidance='detailed';
  const html=renderToStaticMarkup(<ProgressionTipsPreference state={state} update={()=>{}}/>);
  expect(html).toContain('Basic');expect(html).toContain('Off');expect(html).not.toMatch(/Detailed|ROOK Pro|paywall/i);
  const app=readFileSync('src/App.jsx','utf8');
  expect(app).not.toMatch(/DetailedProgression|progressionReviewRequest|Set-by-set review|\bonUnlock\s*=/);
  for(const filename of ['DetailedProgressionAccess.jsx','DetailedProgressionPaywall.jsx','ProgressionReview.jsx','progressionReview.js','nativeGoogleAuth.js','aiTransport.js'])
    expect(existsSync(`src/${filename}`)).toBe(false);
  expect(existsSync('ios')).toBe(false);expect(existsSync('capacitor.config.json')).toBe(false);
});
it('retains verified web Google and email choices while omitting unfinished Apple and native entry points',()=>{
  expect(availableAccountProviders({platform:{isNative:false},env:{VITE_ROOK_EMAIL_PASSWORD_ROLLOUT:'true'}})).toEqual(['google.com','password']);
  for(const file of ['accountProviders.js','AccountProviderButtons.jsx','firebaseSyncClient.js'])
    expect(readFileSync(`src/${file}`,'utf8')).not.toMatch(/apple\.com|signInWithApple|Continue with Apple|nativeGoogleAuth/);
  expect(readFileSync('netlify.toml','utf8')).toContain('VITE_ROOK_EMAIL_PASSWORD_ROLLOUT = "true"');
  expect(readFileSync('src/firebaseSyncClient.js','utf8')).toContain('return { auth, db, authApi, firestoreApi }');
});
