import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const s=blankState();Object.assign(s.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
 const c=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});await c.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),s);const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');await p.locator('.existing-plan-action').click();await p.getByPlaceholder(/Paste your workout notes/).fill('MONDAY\nMystery movement 3x8');await p.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
 const footer=p.locator('.import-match-footer'),custom=footer.getByRole('button',{name:'KEEP AS CUSTOM',exact:true}),scroll=p.locator('.import-decision-scroll'),search=p.getByPlaceholder('Search exercises',{exact:true});await custom.waitFor();
 const bounds=async()=>{const f=await footer.boundingBox(),b=await custom.boundingBox(),r=await scroll.boundingBox();assert.ok(b.height>=52);assert.ok(b.y+b.height<=p.viewportSize().height);assert.ok(r.y+r.height<=f.y+1);return b;};
 const initial=await bounds();await scroll.evaluate(e=>e.scrollTop=e.scrollHeight);assert.equal((await bounds()).y,initial.y);assert.equal(await scroll.getByRole('button',{name:'KEEP AS CUSTOM',exact:true}).count(),0);
 for(const [kind,query] of [['short','BOSU Balance'],['long','press'],['none','zzzzz nonmatching']]){
  await search.fill(query);await bounds();const matches=p.locator('.import-resolution-options button');if(kind==='none')assert.equal(await matches.count(),0);else{assert.ok(await matches.count()>(kind==='long'?1:0));await matches.last().scrollIntoViewIfNeeded();assert.ok((await matches.last().boundingBox()).y+(await matches.last().boundingBox()).height<=(await footer.boundingBox()).y);}
  await p.screenshot({path:`${out}/import-custom-${width}-${style}-${appearance}-${kind}.png`});
 }
 await search.fill('press');await search.focus();await p.setViewportSize({width,height:480});await p.waitForFunction(()=>document.querySelector('.import-match-footer button').getBoundingClientRect().bottom<=innerHeight);await bounds();await search.fill('BOSU Balance');const input=await search.boundingBox();assert.ok(input.y>=0&&input.y+input.height<=(await footer.boundingBox()).y);await p.screenshot({path:`${out}/import-custom-${width}-${style}-${appearance}-reduced-viewport.png`});
 await custom.click();await p.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();assert.ok(await p.evaluate(()=>!JSON.parse(localStorage.getItem('lift-v2-state'))?.program));console.log(`PASS ${width} ${style} ${appearance}`);await c.close();
}}finally{await browser.close();}
