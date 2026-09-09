import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {startWorkout,isoDay} from '../src/domain.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark'])for(const active of [false,true]){
 const s=createReturningUserFixture(1);s.selectedDate=isoDay();s.program.nameEdited=true;
 s.program.name=active?'Imported plan — Strength and muscle building with a deliberately long program name':'Imported plan';
 if(active)s.activeWorkout=startWorkout(s,s.program.days[0]);
 Object.assign(s.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
 const c=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 await c.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),s);const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');
 await p.locator('.today-program-name').waitFor();
 assert.equal(await p.locator('.screen-top > .eyebrow').count(),0);
 assert.equal(await p.locator('.today-program-name').innerText(),s.program.name);
 const nameStyle=await p.locator('.today-program-name').evaluate(e=>{const s=getComputedStyle(e);const probe=document.createElement('span');probe.style.color='var(--rook-secondary)';e.append(probe);const secondary=getComputedStyle(probe).color;probe.remove();return {font:s.fontSize,weight:s.fontWeight,color:s.color,secondary,nowrap:s.whiteSpace,overflow:s.textOverflow,height:e.clientHeight,line:parseFloat(s.lineHeight),truncated:e.scrollWidth>e.clientWidth};});
 assert.equal(nameStyle.font,'15px');assert.equal(nameStyle.weight,'600');assert.equal(nameStyle.color,nameStyle.secondary);assert.equal(nameStyle.nowrap,'nowrap');assert.equal(nameStyle.overflow,'ellipsis');assert.ok(nameStyle.height<=Math.ceil(nameStyle.line));if(active)assert.equal(nameStyle.truncated,true);
 const m=await p.locator('.screen-top').evaluate(e=>{const r=e.getBoundingClientRect(),n=e.querySelector('.week-navigation').getBoundingClientRect(),t=e.querySelector('.today-program-name').getBoundingClientRect();return {top:r.top,navTop:n.top,navBottom:n.bottom,titleTop:t.top,right:r.right,navRight:n.right,buttons:[...e.querySelectorAll('button')].map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height}))};});
 assert.equal(m.top,m.navTop);assert.ok(m.titleTop>=m.navBottom);assert.ok(Math.abs(m.right-m.navRight)<1);assert.ok(m.buttons.every(b=>b.w>=44&&b.h>=44));
 assert.equal(await p.locator('.week-strip button').count(),7);
 assert.equal(await p.locator('.bottom-nav').count(),1);
 if(active)await p.getByRole('button',{name:'RESUME WORKOUT',exact:true}).waitFor();
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.screenshot({path:`${out}/today-plan-name-${width}-${style}-${appearance}-${active?'active-long':'planned'}.png`});
 console.log(`PASS ${width} ${style} ${appearance} active=${active}`);await c.close();
}}finally{await browser.close();}
