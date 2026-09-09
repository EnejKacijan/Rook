import {chromium} from 'playwright-core';
import {mkdir} from 'node:fs/promises';
import {createReturningUserFixture} from '../src/demoFixture.js';
const outputRoot=process.env.ROOK_CURRENT_REVIEW||'artifacts/release-regression/current-review';
await mkdir(`${outputRoot}/35-offline`,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
for(const [width,appearance] of [[390,'light'],[390,'dark'],[320,'dark']]){
 const state=createReturningUserFixture(2);state.activeWorkout=null;Object.assign(state.profile,{appearancePreference:appearance,stylePreference:'standard',themePreference:appearance});
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
 await context.route('**/api/ai/status',r=>r.fulfill({json:{available:true}}));
 const page=await context.newPage();await page.goto('http://127.0.0.1:4173');await page.locator('.bottom-nav').waitFor();
 await context.setOffline(true);
 await page.getByRole('button',{name:'COACH',exact:true}).click();await page.locator('.coach-screen .offline-banner').waitFor();
 await page.screenshot({path:`${outputRoot}/35-offline/offline-surface-${width}-${appearance}.png`});
 await context.close();
}
}finally{await browser.close();}
console.log('Offline Coach surface captured only. No cached cold-start/reload or installed PWA verification.');
