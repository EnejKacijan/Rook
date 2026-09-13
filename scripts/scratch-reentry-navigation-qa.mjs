import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const out=process.env.ROOK_REENTRY_OUTPUT||'artifacts/SCRATCH-REENTRY-REVIEW';await mkdir(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{for(const width of [320,390])for(const appearance of ['light','dark'])for(const style of ['standard','premium']){
 const c=await b.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:appearance==='dark'?'reduce':'no-preference'});
 await c.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
 const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173');
 await p.getByRole('button',{name:/Start from scratch/i}).tap();for(const day of ['Mon','Wed','Fri'])await p.getByRole('button',{name:day,exact:true}).tap();
 await p.evaluate(({appearance,style})=>Object.assign(document.documentElement.dataset,{appearance,style}),{appearance,style});
 const continueInto=async()=>{await p.getByRole('button',{name:'CONTINUE',exact:true}).tap();await p.locator('.scratch-editor-screen .plan-editor').waitFor();};
 await continueInto();await p.getByRole('button',{name:'Back to plan setup'}).tap();await continueInto();
 const cdp=await c.newCDPSession(p),touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:x==null?[]:[{x,y}]});
 const frame=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
 async function gesture(dx,dy,y=180){await touch('touchStart',3,y);for(let i=1;i<=8;i++){await touch('touchMove',3+dx*i/8,y+dy*i/8);await frame();}await touch('touchEnd');await frame();}
 await gesture(25,0);assert.equal(await p.locator('.scratch-editor-screen').isVisible(),true,'short drag cancels');
 const scroller=p.locator('.scratch-editor-screen');
 const before=await scroller.evaluate(e=>e.scrollTop);await gesture(0,-160,400);const delta=await scroller.evaluate(e=>e.scrollTop)-before;assert.ok(delta>20,'near-edge vertical gesture scrolls the editor panel');
 assert.equal(await p.evaluate(()=>scrollY),0,'document is no longer the editor scroll owner');
 await scroller.evaluate(e=>e.scrollTo({top:0,behavior:'instant'}));await frame();
 await gesture(width*.55,0);await p.locator('.scratch-plan-screen').waitFor();
 assert.equal(await p.locator('.scratch-day-options .selected').count(),3);assert.equal(await p.locator('[data-edge-back-active],.plan-reorder-preview,.modal-layer').count(),0);
 await continueInto();const field=p.getByRole('textbox',{name:'Mon workout name',exact:true});await field.fill('Input remains editable');assert.equal(await field.inputValue(),'Input remains editable');
 results.push({width,appearance,style,shortCancel:true,edgeVerticalDelta:delta,edgeBack:true,daysRetained:true,reentryInput:true});console.log(`PASS ${width} ${appearance} ${style}`);await c.close();
}}finally{await b.close();await writeFile(`${out}/navigation-results.json`,JSON.stringify(results,null,2));}
