// Synthetic account-ready presentation only; no real Google/Firebase requests.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright-core';

const base = process.env.ROOK_QA_URL || 'http://127.0.0.1:4273';
const engine = process.env.ROOK_QA_BROWSER || 'chromium';
const out = 'artifacts/first-run-sign-in-qa';
await mkdir(out, { recursive: true });
await writeFile(`${out}/review.html`, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="root"></div><script type="module" src="./review.jsx"></script></body></html>');
await writeFile(`${out}/review.jsx`, `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {EntryLanding,FirstRunSignIn,RestoreBackupSheet} from '/src/App.jsx';
import {FirstRunNavigation} from '/src/FirstRunNavigation.jsx';
import {useSemanticSwipeBack} from '/src/useSemanticSwipeBack.js';
import {blankState} from '/src/domain.js';
${['styles','overrides','theme','landing','firstRunNavigation','startupRecovery'].map(name=>`import '/src/${name}.css';`).join('\n')}
const params=new URLSearchParams(location.search);
document.documentElement.dataset.style=params.get('style')||'standard';
document.documentElement.dataset.appearance=params.get('appearance')||'dark';
function Review(){const[mode,setMode]=useState('landing');useSemanticSwipeBack();return <FirstRunNavigation mode={mode} parents={{restore:'sign-in'}}>{route=>{
 if(route==='sign-in')return <FirstRunSignIn back={()=>setMode('landing')} restoreBackup={()=>setMode('restore')}
  providerReady signInWithGoogle={async()=>{throw Object.assign(new Error('cancel'),{code:'auth/popup-closed-by-user'});}} onSignedIn={()=>setMode('landing')}/>;
 if(route==='restore')return <RestoreBackupSheet state={blankState()} update={()=>{}} close={()=>setMode('sign-in')} backLabel="Back to sign in" firstRun/>;
 return <EntryLanding signIn={()=>setMode('sign-in')} personalize={()=>{}} ownWorkouts={()=>{}} trainFreestyle={()=>{}} bringPlan={()=>{}}/>;
}}</FirstRunNavigation>}
createRoot(document.getElementById('root')).render(<Review/>);
`);

const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'webkit' ? { headless: true } : { channel: 'chrome', headless: true });
const results = [];
try {
  for (const width of [320, 390, 430]) for (const style of ['standard', 'premium']) for (const appearance of ['light', 'dark']) {
    const label = `${width}-${style}-${appearance}`;
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`${base}/${out}/review.html?style=${style}&appearance=${appearance}`);
      await page.getByRole('heading', { name: 'A plan that fits your week.' }).waitFor();
      const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
      assert.ok((await signIn.boundingBox()).height >= 44);
      await signIn.click();
      await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
      await page.locator('[data-swipe-parent]').waitFor({ state: 'detached' });
      const signBack = await page.locator('.entry-sign-in .first-run-back-button').evaluate(node => ({
        color: getComputedStyle(node).color, height: node.getBoundingClientRect().height,
        left: node.getBoundingClientRect().left,
        path: node.querySelector('svg path')?.getAttribute('d'),
      }));
      assert.ok(signBack.height >= 44);
      const geometry = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth,
        overflow: [...document.querySelectorAll('body *')].filter(node => node.getBoundingClientRect().right > innerWidth + 1)
          .slice(0, 8).map(node => ({ className: node.className?.baseVal || node.className, right: node.getBoundingClientRect().right, text: node.textContent?.slice(0, 60) })) }));
      assert.ok(geometry.scrollWidth <= geometry.innerWidth, `${label} horizontal overflow: ${JSON.stringify(geometry)}`);
      assert.ok((await page.getByRole('button', { name: 'CONTINUE WITH GOOGLE' }).boundingBox()).height >= 44);
      await page.getByRole('button', { name: 'CONTINUE WITH GOOGLE' }).click();
      assert.equal(await page.locator('[role="alert"]').count(), 0, 'provider cancellation leaves sign-in intact');
      if (width === 390) await page.screenshot({ path: `${out}/${engine}-${label}.png` });
      await page.getByRole('button', { name: /Restore from backup/ }).click();
      await page.locator('.restore-backup-screen').waitFor();
      await page.locator('[data-swipe-parent]').waitFor({ state: 'detached' });
      const restoreBack = await page.locator('.restore-backup-screen .first-run-back-button').evaluate(node => ({
        color: getComputedStyle(node).color, height: node.getBoundingClientRect().height,
        left: node.getBoundingClientRect().left,
        path: node.querySelector('svg path')?.getAttribute('d'),
      }));
      assert.deepEqual(restoreBack, signBack, `${label} Restore and Sign in Back presentation`);
      if (width === 390) await page.screenshot({ path: `${out}/${engine}-${label}-restore.png` });
      await page.getByRole('button', { name: /Back/ }).first().click();
      await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
      await page.getByRole('button', { name: 'Back to start' }).click();
      await page.getByRole('heading', { name: 'A plan that fits your week.' }).waitFor();
      assert.deepEqual(errors, []);
      results.push({ label, passed: true });
    } finally { await context.close(); }
  }
} finally { await browser.close(); await writeFile(`${out}/${engine}-results.json`, JSON.stringify(results, null, 2)); }
console.log(`${engine}: ${results.length} first-run Sign in layouts passed`);
