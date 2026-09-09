import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {buildProgram} from '../src/domain.js';
import {openProfileArea} from './qa-current-navigation.mjs';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark'])for(const long of [false,true]){
 const s=createReturningUserFixture(1);if(!long){s.profile.daysPerWeek=2;s.profile.availableDays=['Mon','Thu'];s.program=buildProgram(s.profile);}
 s.program.days[0].exercises[0].notes='QA private note';
 Object.assign(s.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
 const c=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 await c.addInitScript(s=>{localStorage.setItem('lift-v2-state',JSON.stringify(s));navigator.share=async data=>{window.qaShared=data;};},s);
 const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');
 await p.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(p,'program');await p.getByRole('button',{name:/Export workout plan/}).click();
 const sheet=p.locator('.export-sheet'),share=sheet.getByRole('button',{name:'SHARE',exact:true});await share.waitFor();
 const before=await sheet.evaluate(e=>{const r=e.getBoundingClientRect(),a=e.querySelector('.export-actions').getBoundingClientRect(),v=e.querySelector('.export-preview').getBoundingClientRect();return {scroll:e.scrollTop,bottom:r.bottom,actionsTop:a.top,actionsBottom:a.bottom,previewHeight:v.height,previewBottom:v.bottom};});
 assert.equal(before.scroll,0);assert.ok(before.actionsTop>=0&&before.actionsBottom<=844-12,JSON.stringify(before));assert.ok(before.previewHeight>=80);assert.ok(before.previewBottom<=before.actionsTop);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.screenshot({path:`${out}/export-height-${width}-${style}-${appearance}-${long?'long':'short'}.png`});
 assert.ok(!(await p.locator('.export-preview').innerText()).includes('QA private note'));
 await p.getByText('Include notes',{exact:true}).click();assert.ok((await p.locator('.export-preview').innerText()).includes('QA private note'));
 await p.locator('.export-preview').evaluate(e=>e.scrollTop=e.scrollHeight);
 const after=await share.boundingBox();assert.ok(after.y>=0&&after.y+after.height<=844);
 await share.click();assert.ok((await p.evaluate(()=>window.qaShared.text)).includes('QA private note'));
 assert.equal(await sheet.getByRole('button',{name:'COPY',exact:true}).count(),1);assert.equal(await sheet.getByRole('button',{name:'DOWNLOAD .TXT',exact:true}).count(),1);
 console.log(`PASS ${width} ${style} ${appearance} ${long?'long':'short'} ${JSON.stringify(before)}`);await c.close();
}}finally{await browser.close();}
