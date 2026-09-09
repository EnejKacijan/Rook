import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const s=blankState();Object.assign(s.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
 const c=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});await c.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),s);
 const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');await p.locator('.existing-plan-action').click();await p.getByPlaceholder(/Paste your workout notes/).fill('MONDAY\nY Balance Reach – 2 kroga');await p.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
 const a=p.locator('.import-decision-content:visible');await a.getByLabel('Reviewed Min reps',{exact:true}).fill('11');const max=a.getByLabel('Reviewed Max reps',{exact:true});await max.fill('1');
 assert.equal(await p.locator('.import-resolution .sheet-action-footer button').isDisabled(),true);
 for(const input of await a.locator('.plan-import-prescription input').all()){await input.focus();const m=await input.evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(),clip=e.closest('.import-decision-scroll').getBoundingClientRect();return {offset:parseFloat(s.outlineOffset),outline:parseFloat(s.outlineWidth),left:r.left,right:r.right,clipLeft:clip.left,clipRight:clip.right};});assert.ok(m.outline>0);assert.ok(m.offset+m.outline<=0);assert.ok(m.left>=m.clipLeft&&m.right<=m.clipRight+.5);}
 await max.focus();await p.screenshot({path:`${out}/import-prescription-focus-${width}-${style}-${appearance}.png`});await max.fill('12');assert.equal(await p.locator('.import-resolution .sheet-action-footer button').isEnabled(),true);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);console.log(`PASS ${width} ${style} ${appearance}`);await c.close();
}}finally{await browser.close();}
