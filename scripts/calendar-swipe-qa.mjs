import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';await mkdir(out,{recursive:true});
const b=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const s=createReturningUserFixture(1);s.workouts[0].canonicalPlanDate='2026-05-15';s.workouts[0].workoutDateKey='2026-05-15';Object.assign(s.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
 const c=await b.newContext({viewport:{width,height:844},hasTouch:true,serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'});await c.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},s);const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');
 await p.evaluate(()=>Object.defineProperty(navigator,'standalone',{value:true}));
 p.on('pageerror',e=>console.log('ERROR',e.message));const trigger=p.getByRole('button',{name:/^Open calendar,/});await trigger.click();const dialog=p.getByRole('dialog',{name:'Workout calendar',exact:true});await dialog.waitFor();
 const settle=()=>p.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));await settle();
 await dialog.locator('.is-today').tap();await dialog.waitFor({state:'detached'});await trigger.click();await dialog.waitFor();await settle();
 const read=()=>p.evaluate(()=>localStorage.getItem('lift-v2-state'));const before=await read();
 const title=()=>dialog.locator('h2').innerText();const initial=await title();
 const cdp=await c.newCDPSession(p);
 const swipe=async(dx,dy=0,selector='.month-calendar-grid')=>{const r=await dialog.locator(selector).boundingBox();const x=r.x+r.width/2,y=r.y+Math.min(95,r.height/2);await cdp.send('Input.synthesizeScrollGesture',{x,y,xDistance:dx,yDistance:dy,gestureSourceType:'touch',speed:600,preventFling:true});};
 await swipe(-90);assert.equal(await title(),initial,'latest bound');await swipe(90);assert.notEqual(await title(),initial);await settle();const previous=await title();
 await swipe(20);await settle();assert.equal(await title(),previous,'short drag');await swipe(8,65);await settle();assert.equal(await title(),previous,'vertical');await swipe(45,55);await settle();assert.equal(await title(),previous,'diagonal');
 await swipe(-90);await settle();assert.equal(await title(),initial,'next month');
 await swipe(80,0,'.month-calendar-legend');await settle();assert.equal(await title(),initial,'legend excluded');
 for(let i=0;i<3;i++)await swipe(80);await settle();
 for(let i=0;i<12&&await dialog.getByRole('button',{name:'Previous month',exact:true}).isEnabled();i++){const prior=await title();await swipe(80);await settle();assert.notEqual(await title(),prior,'enabled previous swipe advances');}
 const earliest=await title();await swipe(80);assert.equal(await title(),earliest,'earliest bound');
 for(let i=0;i<3;i++)await swipe(-80);await settle();assert.equal(await read(),before,'browsing leaves state untouched');
 if(width===320)assert.equal(await dialog.locator('.month-calendar-grid').evaluate(e=>e.getAnimations().length),0,'reduced motion has no grid slides');
 await p.screenshot({path:`${out}/calendar-swipe-${width}-${style}-${appearance}.png`});
 const date=dialog.locator('button[data-date]:not(:disabled):not(.is-other-month)').first();const key=await date.getAttribute('data-date');await date.tap();await dialog.waitFor({state:'detached'});assert.equal(JSON.parse(await read()).selectedDate,key,'tap selection');
 await trigger.click();await dialog.waitFor();await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
 console.log(`PASS ${width} ${style} ${appearance}: touch directions, bounds, short/vertical/diagonal, scope, rapid navigation, tap, Escape`);await c.close();
}}finally{await b.close();}
