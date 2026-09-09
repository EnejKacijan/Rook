import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
const measure=process.env.ROOK_MEASURE==='1';let passed=0;
try{for(const [width,height] of [[320,568],[320,844],[390,844]])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const c=await browser.newContext({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce'}),s=blankState();Object.assign(s.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});await c.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),s);
 const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');await p.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();
 const next=()=>p.getByRole('button',{name:'CONTINUE',exact:true}).click();
 await p.getByRole('combobox',{name:'Age range'}).click();await p.getByRole('option',{name:'18–29',exact:true}).click();await next();await p.getByRole('button',{name:'Build muscle',exact:true}).click();await p.getByRole('button',{name:/^Beginner/}).click();await p.getByRole('button',{name:'3 days',exact:true}).click();await p.getByLabel('Any day works').check();await p.getByRole('button',{name:'60 min',exact:true}).click();await next();await p.getByRole('button',{name:'Commercial gym',exact:true}).click();await next();
 const root=p.locator('.onboarding-priorities'),body=root.locator('.onboarding-content');await root.waitFor();
 await root.evaluate(async e=>{await Promise.all(e.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));});
 for(const selection of [0,1,2]){
  if(selection===1)await root.getByRole('button',{name:'Chest',exact:true}).click();
  if(selection===2)await body.getByRole('button',{name:'Back',exact:true}).click();
  await body.evaluate(e=>e.scrollTop=0);
  const geometry=await root.evaluate(e=>{const content=e.querySelector('.onboarding-content'),f=e.querySelector('.onboarding-footer').getBoundingClientRect(),r=content.getBoundingClientRect();const tiles=[...e.querySelectorAll('.priority-choice-group:last-child button')].map(b=>{const x=b.getBoundingClientRect();return {text:b.innerText,top:x.top,bottom:x.bottom,height:x.height};});return {footer:f.top,bodyTop:r.top,bodyBottom:r.bottom,scrollHeight:content.scrollHeight,clientHeight:content.clientHeight,tiles};});
  console.log(JSON.stringify({width,height,style,appearance,selection,footer:geometry.footer,lastRowBottom:geometry.tiles.at(-1).bottom,peek:geometry.tiles.filter(t=>t.top<geometry.bodyBottom&&t.bottom>geometry.bodyBottom).map(t=>geometry.bodyBottom-t.top)}));
  if(!measure&&height===568){const peek=geometry.tiles.filter(t=>t.top<geometry.bodyBottom&&t.bottom>geometry.bodyBottom);assert.ok(peek.some(t=>geometry.bodyBottom-t.top>=20&&geometry.bodyBottom-t.top<=28),'20–28px next-row peek');}
  const continueBox=await p.getByRole('button',{name:'CONTINUE',exact:true}).boundingBox();assert.ok(continueBox.y>=0&&continueBox.y+continueBox.height<=height);
  await p.screenshot({path:`${out}/priority-fit-${measure?'before-':''}${width}x${height}-${style}-${appearance}-${selection}.png`});
  if(!measure){assert.equal(geometry.tiles.length,8);assert.ok(geometry.tiles.every(t=>t.height>=48));if(height===844)assert.ok(geometry.tiles.every(t=>t.top>=geometry.bodyTop&&t.bottom<=Math.min(geometry.footer,geometry.bodyBottom)+1),'all options visible initially');else{assert.ok(geometry.scrollHeight>geometry.clientHeight);assert.ok(geometry.tiles.some(t=>t.top<geometry.bodyBottom&&t.bottom>geometry.bodyBottom),'partially visible row signals more options');}assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 }
 if(!measure){await root.getByRole('button',{name:'Shoulders',exact:true}).dispatchEvent('click');assert.notEqual(await root.getByRole('button',{name:'Shoulders',exact:true}).getAttribute('aria-pressed'),'true');const last=root.getByRole('button',{name:'Abs / core',exact:true});await last.scrollIntoViewIfNeeded();assert.ok(await last.evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('.onboarding-footer').getBoundingClientRect().top));await root.getByRole('button',{name:'Balanced',exact:true}).click();assert.equal(await root.locator('.priority-selection-summary').count(),0);await root.locator('.physique-review-entry').click();await p.locator('.physique-review-screen').waitFor();await p.getByRole('button',{name:'SKIP',exact:true}).click();await root.waitFor();await next();await p.getByText('STEP 7/8',{exact:true}).waitFor();}
 await c.close();passed++;if(measure)break;
}}finally{await browser.close();}
console.log(`${passed} viewport/theme cases passed`);
