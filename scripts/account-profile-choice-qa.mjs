// Actual ROOK app + hook + local persistence; only the provider/network boundary
// is mocked. No real accounts, Firebase writes, or owner browser storage used.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { hydrateStoredState, saveState } from '../src/domain.js';
import { ensureAccountSyncLedger } from '../src/accountSyncOutbox.js';
import { PRIMARY_KEY, RECOVERY_KEY, readLocalState } from '../src/localStateStorage.js';
import { syncEntities } from '../src/accountSyncModel.js';

const engine = process.env.ROOK_QA_BROWSER || 'chromium';
const origin = process.env.ROOK_QA_URL || 'http://127.0.0.1:4275';
const out = 'artifacts/account-profile-choice';
await mkdir(out, { recursive: true });
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'webkit' ? { headless: true } : { channel: 'chrome', headless: true });
const result = [];
const providerMock = `
const appName=()=>JSON.parse(localStorage.getItem('rook-active-profile-slot-v1')||'null')?.authAppName||'rook-sync';
const clients=new Map();
window.__accountQa={nextUid:'owner-a',error:null,logins:0,signOuts:0};
export const firebaseConfigured=()=>true;
export async function getFirebaseSyncClient(){
 const name=appName(); if(clients.has(name))return clients.get(name);
 const key='qa-auth:'+name, callbacks=new Set();
 const auth={currentUser:JSON.parse(sessionStorage.getItem(key)||'null'),authStateReady:async()=>{}};
 const set=user=>{auth.currentUser=user;sessionStorage.setItem(key,JSON.stringify(user));callbacks.forEach(fn=>queueMicrotask(()=>fn(user)));};
 const authApi={GoogleAuthProvider:class{setCustomParameters(){}},
 onAuthStateChanged:(a,fn)=>{callbacks.add(fn);queueMicrotask(()=>fn(a.currentUser));return()=>callbacks.delete(fn);},
 signInWithPopup:async()=>{window.__accountQa.logins++;if(window.__accountQa.error==='auth')throw new Error('Account sign-in unavailable');const user={uid:window.__accountQa.nextUid,isAnonymous:false,email:'a-very-long-synthetic-account-name@example.test'};set(user);return{user};},
 signInAnonymously:async()=>{const user={uid:'anon:'+name,isAnonymous:true};set(user);return{user};},
 signOut:async()=>{window.__accountQa.signOuts++;set(null);}};
 const client={auth,authApi};clients.set(name,client);return client;
}
export async function resolveFirebaseIdentity(client,{allowAnonymous=true}={}){
 await client.auth.authStateReady(); if(client.auth.currentUser)return{user:client.auth.currentUser,created:false};
 if(!allowAnonymous)return{user:null,created:false};return{...await client.authApi.signInAnonymously(),created:true};
}
const cloud=uid=>JSON.parse(sessionStorage.getItem('qa-cloud:'+uid)||'null')||{profileId:null,accountSchemaVersion:null,entities:[]};
const store=(uid,value)=>sessionStorage.setItem('qa-cloud:'+uid,JSON.stringify(value));
export function createFirebaseSyncAdapter(){return{
 read:async uid=>{if(window.__accountQa.error==='network')throw new Error('Account check unavailable. Your saved profile is protected.');const v=cloud(uid);return{...v,entities:new Map(v.entities)};},
 establish:async(uid,id)=>{const v=cloud(uid);if(v.profileId&&v.profileId!==id)throw new Error('lineage conflict');store(uid,{...v,profileId:id,accountSchemaVersion:1});},
 write:async(uid,id,p,mutationId)=>{const v=cloud(uid),map=new Map(v.entities),old=map.get(p.key);const record={syncSchemaVersion:1,profileId:id,domain:p.entity?.domain,entityId:p.entity?.entityId,ordinal:p.entity?.ordinal??null,revision:(old?.revision||0)+1,lastMutationId:mutationId,deleted:p.operation==='delete',digest:p.entity?.digest??null,value:p.entity?.value??null};map.set(p.key,record);store(uid,{...v,entities:[...map]});return record;}
};}
export async function linkGoogleAnonymousAccount(){throw new Error('Linking is outside this browser mock');}
`;
const remote = state => ({ profileId: state.profile.id, accountSchemaVersion: 1,
  entities: [...syncEntities(state)].map(([key, entity]) => [key, { ...entity, profileId: state.profile.id,
    syncSchemaVersion: 1, revision: 1, deleted: false }]) });
async function setup(width, style, appearance) {
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
  const state = createReturningUserFixture(2);
  Object.assign(state.profile, { stylePreference: style, appearancePreference: appearance,
    themePreference: style === 'premium' ? 'premium' : appearance });
  assert.equal(saveState(state, { storage, reason: 'qa-account-owner' }), true);
  ensureAccountSyncLedger(storage, state.profile.id, { accountUid: 'owner-a' });
  const owner = readLocalState(storage, hydrateStoredState).state;
  const b = createReturningUserFixture(1); b.profile.id = 'synthetic-profile-b';
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true,
    hasTouch: true, reducedMotion: width === 320 ? 'reduce' : 'no-preference', serviceWorkers: 'block' });
  await context.addInitScript(({ seed, a, b }) => {
    // This account suite has no AI-service dependency. Resolve that already
    // mocked status in-page so rapid document reloads cannot abort a pending
    // Playwright-fulfilled request (WebKit reports that as an access-control error).
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => new URL(typeof input === 'string' ? input : input.url, location.href).pathname === '/api/ai/status'
      ? Promise.resolve(new Response(JSON.stringify({ available: false }), { headers: { 'Content-Type': 'application/json' } }))
      : fetch(input, init);
    if (sessionStorage.getItem('qa-seeded')) return;
    seed.forEach(([key, value]) => localStorage.setItem(key, value));
    sessionStorage.setItem('qa-auth:rook-sync', JSON.stringify({ uid: 'owner-a', isAnonymous: false,
      email: 'a-very-long-synthetic-account-name@example.test' }));
    sessionStorage.setItem('qa-cloud:owner-a', JSON.stringify(a));
    sessionStorage.setItem('qa-cloud:owner-b', JSON.stringify(b));
    sessionStorage.setItem('qa-seeded', 'true');
  }, { seed: [...data], a: remote(owner), b: remote(b) });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/firebaseSyncClient.js*', route => route.fulfill({ contentType: 'application/javascript', body: providerMock }));
  await page.route('**/api/**', route => route.fulfill({ json: { available: false } }));
  await page.route(/https:\/\/.*(googleapis|firebase|firebaseapp|gstatic)\./, route => route.abort());
  await page.goto(origin, { waitUntil: 'commit' });
  await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
  await page.getByRole('region', { name: 'Account and sync' }).getByRole('button', { name: /^Sign out/ }).waitFor();
  return { page, context, errors, owner, b, primary: storage.getItem(PRIMARY_KEY), backup: storage.getItem(RECOVERY_KEY) };
}
const primary = page => page.evaluate(key => localStorage.getItem(key), PRIMARY_KEY);
async function signOut(page) {
  await page.getByRole('region', { name: 'Account and sync' }).getByRole('button', { name: /^Sign out/ }).click();
  await page.getByRole('dialog', { name: 'Sign out?' }).getByRole('button', { name: 'SIGN OUT', exact: true }).click();
  await page.getByRole('heading', { name: 'This device has saved training data' }).waitFor();
}
async function choice(page) {
  await page.getByRole('button', { name: 'Use another ROOK profile', exact: true }).click();
  await page.getByRole('dialog', { name: 'Use another ROOK profile', exact: true }).waitFor();
}
async function fits(page, dialog) {
  // Wait for actual sheet geometry, not a fixed sleep or a mid-entry screenshot.
  await page.waitForFunction(() => {
    const panel = [...document.querySelectorAll('.account-confirm-sheet')].at(-1);
    if (!panel) return false;
    const r = panel.getBoundingClientRect();
    return r.top >= -1 && r.bottom <= innerHeight + 1;
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  const bounds = await dialog.boundingBox();
  assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= page.viewportSize().width + 1);
  const targets = await dialog.locator('button').evaluateAll(buttons => buttons.map(b => b.getBoundingClientRect().height));
  assert.ok(targets.every(h => h >= 43.99), `Touch targets: ${targets}`); // WebKit subpixel rounding
}
try {
  for (const width of [320, 390, 430]) for (const style of ['standard', 'premium']) for (const appearance of ['light', 'dark']) {
    const x = await setup(width, style, appearance), { page } = x;
    const original = await primary(page); // after canonical hydration/autosave
    await page.getByRole('region', { name: 'Account and sync' }).getByRole('button', { name: /^Sign out/ }).click();
    await fits(page, page.getByRole('dialog', { name: 'Sign out?' }));
    await page.getByRole('button', { name: 'CANCEL', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__accountQa.signOuts), 0);
    await signOut(page);
    assert.equal(await primary(page), original);
    assert.equal(await page.getByRole('button', { name: /Delete|Start over/ }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'PROFILE', exact: true }).count(), 0);
    await choice(page);
    await fits(page, page.getByRole('dialog', { name: 'Use another ROOK profile', exact: true }));
    if (width === 390 && appearance === 'dark') await page.screenshot({ path: `${out}/${engine}-${style}-choice.png` });
    await page.getByRole('button', { name: 'START WITHOUT AN ACCOUNT', exact: true }).click();
    await fits(page, page.getByRole('dialog', { name: 'Start a separate ROOK profile?' }));
    await page.getByRole('button', { name: 'Back to profile choices' }).click();
    await page.getByRole('button', { name: 'CANCEL', exact: true }).click();
    assert.equal(await primary(page), original);
    await page.getByRole('button', { name: 'CONTINUE WITH GOOGLE', exact: true }).click();
    await page.getByRole('button', { name: 'PROFILE', exact: true }).waitFor();
    assert.equal(JSON.parse(await primary(page)).profile.id, x.owner.profile.id);
    assert.deepEqual(JSON.parse(await primary(page)).workouts, JSON.parse(original).workouts);
    await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
    await signOut(page);
    const protectedRaw = await primary(page);
    await choice(page);
    await page.getByRole('button', { name: 'START WITHOUT AN ACCOUNT', exact: true }).click();
    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click();
    await page.getByText('STARTING POINT', { exact: true }).waitFor();
    const separateId = JSON.parse(await primary(page)).profile.id;
    assert.notEqual(separateId, x.owner.profile.id);
    assert.equal(await page.evaluate(([id, key]) => JSON.parse(localStorage.getItem('rook-profile-slot-v1:' + id)).bundle[key], [x.owner.profile.id, PRIMARY_KEY]), protectedRaw);
    await page.getByRole('button', { name: 'Back to plan options' }).click();
    await page.getByRole('heading', { name: 'A plan that fits your week.' }).waitFor();
    await page.getByRole('button', { name: 'Return to saved profile' }).click();
    await page.getByRole('heading', { name: 'This device has saved training data' }).waitFor();
    assert.equal(await primary(page), protectedRaw);
    assert.ok(await page.evaluate(id => localStorage.getItem('rook-profile-slot-v1:' + id), separateId));
    assert.deepEqual(x.errors, []);
    await x.context.close();
    result.push({ width, style, appearance, flow: 'signout/cancel/owner/choice/back/local/return', pass: true });
    console.log(`PASS ${engine} ${width} ${style} ${appearance}`);
  }
  for (const mode of ['existing', 'new', 'network-failure', 'auth-failure', 'wrong-owner']) {
    const x = await setup(390, 'standard', 'dark'), { page } = x;
    await signOut(page); const saved = await primary(page);
    await page.evaluate(mode => {
      window.__accountQa.nextUid = mode === 'new' ? 'new-owner' : 'owner-b';
      window.__accountQa.error = mode === 'network-failure' ? 'network' : mode === 'auth-failure' ? 'auth' : null;
    }, mode);
    if (mode === 'wrong-owner') await page.getByRole('button', { name: 'CONTINUE WITH GOOGLE', exact: true }).click();
    else { await choice(page); await page.getByRole('button', { name: 'SIGN IN WITH ANOTHER ACCOUNT', exact: true }).click(); }
    if (mode === 'existing') {
      await page.getByRole('button', { name: 'PROFILE', exact: true }).waitFor();
      const opened = JSON.parse(await primary(page));
      assert.equal(opened.profile.id, x.b.profile.id);
      assert.deepEqual(opened.workouts.map(w => w.id), x.b.workouts.map(w => w.id));
    } else if (mode === 'new') {
      await page.getByText('STARTING POINT', { exact: true }).waitFor();
      const opened = JSON.parse(await primary(page));
      assert.notEqual(opened.profile.id, x.owner.profile.id); assert.equal(opened.workouts.length, 0);
      await page.reload(); await page.getByText('STARTING POINT', { exact: true }).waitFor();
      assert.equal(JSON.parse(await primary(page)).profile.id, opened.profile.id);
      await page.getByRole('button', { name: 'Back to plan options' }).click();
      await page.getByRole('button', { name: 'Return to saved profile' }).click();
      await page.getByRole('heading', { name: 'This device has saved training data' }).waitFor();
      assert.equal(await primary(page), saved);
      assert.ok(await page.evaluate(id => localStorage.getItem('rook-profile-slot-v1:' + id), opened.profile.id));
    } else {
      await page.getByRole('alert').filter({ hasText: mode === 'wrong-owner' ? 'not the account' : 'unavailable' }).waitFor();
      assert.equal(await primary(page), saved);
      assert.equal(await page.getByText('STARTING POINT', { exact: true }).count(), 0);
    }
    assert.deepEqual(x.errors, []); await x.context.close();
    result.push({ width: 390, mode, pass: true }); console.log(`PASS ${engine} ${mode}`);
  }
  await writeFile(`${out}/${engine}-results.json`, JSON.stringify({ engine, provider: 'mocked, no real Google verification', cases: result }, null, 2));
  console.log(`PASS ${engine}: ${result.length} browser cases`);
} finally { await browser.close(); }
