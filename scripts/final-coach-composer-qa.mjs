import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{for(const width of [320,390])for(const appearance of ['light','dark'])for(const style of ['standard','premium']){
 const state=createReturningUserFixture(1);state.activeWorkout=null;state.conversations=[];state.activeCoachConversationId=null;
 Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 const context=await browser.newContext({viewport:{width,height:520},hasTouch:true,isMobile:true,serviceWorkers:'block'});
 await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);const page=await context.newPage();
 await page.route('**/api/ai/status',r=>r.fulfill({json:{available:true}}));
 let release,received,calls=0;const requested=new Promise(resolve=>received=resolve);
 await page.route('**/api/ai',async route=>{calls++;received();await new Promise(resolve=>release=resolve);await route.fulfill({json:{data:{text:'Your training question is noted. No changes applied.',action:null}}});});
 await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173');await page.getByRole('button',{name:'COACH',exact:true}).click();
 const input=page.getByRole('textbox',{name:'Ask Coach'}),send=page.getByRole('button',{name:'Send message',exact:true});
 await input.fill('My training question\nPlease explain.');await input.focus();const box=await send.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=520);await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
 await Promise.race([requested,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Coach request not received')),10000))]);
 assert.equal(await page.locator('.user-message').textContent(),'My training question\nPlease explain.');assert.equal(await input.inputValue(),'');assert.ok(await input.evaluate(e=>e===document.activeElement));
 await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);assert.equal(calls,1);
 await input.fill('Next unsent draft');release();await page.locator('.coach-message').getByText('Your training question is noted. No changes applied.').waitFor();assert.equal(await input.inputValue(),'Next unsent draft');
 await page.getByRole('button',{name:'Conversation history',exact:true}).click();await page.getByRole('button',{name:'Back to Coach',exact:true}).click();assert.equal(await input.inputValue(),'Next unsent draft');
 results.push({width,appearance,style,sendOnce:true,focus:true,draft:true,passed:true});console.log(`PASS composer ${width} ${appearance} ${style}`);await context.close();
}}finally{await browser.close();await writeFile('artifacts/ROOK-FINAL-HARDENING/composer-results.json',JSON.stringify(results,null,2));}
