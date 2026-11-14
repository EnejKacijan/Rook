import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {shiftMonth} from '../src/workoutCalendar.js';
import {isoDay} from '../src/domain.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';await mkdir(out,{recursive:true});
const b=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const s=createReturningUserFixture(1),older=shiftMonth(isoDay(),-4);
 // The calendar range uses the performed date, not the scheduled occurrence.
 Object.assign(s.workouts[0],{startedAt:Date.parse(`${older}T11:00:00Z`),completedAt:`${older}T12:00:00Z`,endedAt:Date.parse(`${older}T12:00:00Z`)});
 Object.assign(s.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
 const c=await b.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'});await c.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},s);const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173');
 await p.evaluate(()=>Object.defineProperty(navigator,'standalone',{value:true}));
 p.on('pageerror',e=>console.log('ERROR',e.message));const trigger=p.getByRole('button',{name:/^Open calendar,/});await trigger.click();const dialog=p.getByRole('dialog',{name:'Workout calendar',exact:true});await dialog.waitFor();
 const grid=dialog.getByRole('grid');
 const settle=()=>p.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));await settle();
 await grid.locator('.is-today').tap();await dialog.waitFor({state:'detached'});await trigger.click();await dialog.waitFor();await settle();
 const read=()=>p.evaluate(()=>localStorage.getItem('lift-v2-state'));const before=await read();
 const title=()=>dialog.locator('h2').innerText();const initial=await title();
 assert.ok(await dialog.getByRole('button',{name:'Previous month',exact:true}).isEnabled(),'the fixture spans multiple months');
 const cdp=await c.newCDPSession(p);
 const swipe=async(dx,dy=0,target=grid.locator('.month-calendar-weekdays'))=>{
  await target.scrollIntoViewIfNeeded();
  const r=await target.boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let step=1;step<=4;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*step/4,y:y+dy*step/4}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 };
 const idle=()=>p.waitForFunction(()=>document.querySelector('.month-calendar-viewport').dataset.monthPhase==='idle');
 // Use a clear distance-based drag; short gestures below still exercise cancellation.
 const distance=120;
 await swipe(-distance);await idle();assert.equal(await title(),initial,'latest bound');
 await swipe(distance);await idle();assert.notEqual(await title(),initial);const previous=await title();
 await swipe(20);await idle();assert.equal(await title(),previous,'short drag');await swipe(8,65);await idle();assert.equal(await title(),previous,'vertical');await swipe(45,55);await idle();assert.equal(await title(),previous,'diagonal');
 await swipe(-distance);await idle();assert.equal(await title(),initial,'next month');
 await swipe(distance,0,dialog.locator('.month-calendar-legend'));await idle();assert.equal(await title(),initial,'legend excluded');
 for(let i=0;i<3;i++)await swipe(distance);await idle();
 for(let i=0;i<12&&await dialog.getByRole('button',{name:'Previous month',exact:true}).isEnabled();i++){const prior=await title();await swipe(distance);await idle();assert.notEqual(await title(),prior,'enabled previous swipe advances');}
 const earliest=await title();await swipe(distance);await idle();assert.equal(await title(),earliest,'earliest bound');
 for(let i=0;i<3;i++)await swipe(-distance);await idle();assert.equal(await read(),before,'browsing leaves state untouched');
 if(width===320)assert.equal(await grid.evaluate(e=>e.getAnimations().length),0,'reduced motion has no grid slides');
 await p.screenshot({path:`${out}/calendar-swipe-${width}-${style}-${appearance}.png`});
 const date=grid.locator('button[data-date]:not(:disabled):not(.is-other-month)').first();const key=await date.getAttribute('data-date');await date.tap();await dialog.waitFor({state:'detached'});await p.waitForFunction(key=>JSON.parse(localStorage.getItem('lift-v2-state')).selectedDate===key,key);
 await trigger.click();await dialog.waitFor();await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
 console.log(`PASS ${width} ${style} ${appearance}: touch directions, bounds, short/vertical/diagonal, scope, rapid navigation, tap, Escape`);await c.close();
}}finally{await b.close();}
