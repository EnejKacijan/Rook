import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const before=process.argv.includes('--before'),out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW';await mkdir(`${out}/traces`,{recursive:true});const results=[];
const b=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of before?[390]:[320,390])for(const style of before?['standard']:['standard','premium'])for(const appearance of before?['light']:['light','dark'])for(const mobile of before?[true]:[true,false]){
 const s=createReturningUserFixture(1);s.activeWorkout=null;s.conversations=[];s.activeCoachConversationId=null;Object.assign(s.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
 const c=await b.newContext({viewport:{width,height:600},hasTouch:mobile,isMobile:mobile,serviceWorkers:'block'});await c.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),s);const p=await c.newPage();const press=(x,y)=>mobile?p.touchscreen.tap(x,y):p.mouse.click(x,y);
 await p.route('**/api/ai/status',r=>r.fulfill({json:{available:true}}));await p.route('**/api/ai',r=>r.fulfill({json:{data:{text:'Your question is noted. No changes applied.',action:null}}}));
 await p.route('**/src/aiService.js*',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace('async coach(state, message) {','async coach(state, message) { window.sendCalls=(window.sendCalls||0)+1; await new Promise(r=>window.releaseSend=r);')});});
 await p.goto('http://127.0.0.1:4173');await p.getByRole('button',{name:'COACH',exact:true}).click();const input=p.getByRole('textbox',{name:'Ask Coach'}),send=p.locator('.coach-send');
 await p.evaluate(()=>{window.sendTrace=[];window.sendNode=document.querySelector('.coach-send');for(const type of ['pointerdown','touchstart','blur','focusout','click','submit'])document.addEventListener(type,e=>{const button=document.querySelector('.coach-send');window.sendTrace.push({type,target:e.target.className,focus:document.activeElement.className,buttonY:button.getBoundingClientRect().y,same:button===window.sendNode});},true);});
 for(const text of before?['My training question']:['My training question','Line one\nLine two']){
  await input.fill(text);await input.focus();const rect=await send.boundingBox();await press(rect.x+rect.width/2,rect.y+rect.height/2);
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const calls=await p.evaluate(()=>window.sendCalls||0);
  if(before){results.push({width,style,text,calls,trace:await p.evaluate(()=>window.sendTrace)});break;}
  assert.equal(await p.locator('.user-message').last().textContent(),text);assert.equal(await input.inputValue(),'');assert.ok(await input.evaluate(el=>document.activeElement===el),'focus retained after send');assert.ok(await send.isDisabled());
  const n=calls;await press(rect.x+rect.width/2,rect.y+rect.height/2);assert.equal(await p.evaluate(()=>window.sendCalls),n,'no duplicate while busy');
  await input.fill('next draft while responding');await p.evaluate(()=>window.releaseSend());await p.waitForFunction(()=>!document.querySelector('.coach-send').disabled);assert.equal(await input.inputValue(),'next draft while responding');
 }
 if(!before){await input.fill('   ');assert.ok(await send.isDisabled());await input.fill('');assert.ok(await send.isDisabled());await p.getByRole('button',{name:'Conversation history'}).click();assert.equal(await p.locator('.coach-input textarea').evaluate(el=>document.activeElement===el),false,'outside control can take focus');await p.getByRole('button',{name:'Back to Coach'}).click();results.push({width,style,appearance,mobile,result:'PASS',trace:await p.evaluate(()=>window.sendTrace)});}
 await c.close();
}console.log(JSON.stringify(before?results:{passed:results.length},null,2));}finally{await writeFile(`${out}/traces/coach-mobile-send-${before?'before':'after'}.json`,JSON.stringify(results,null,2));await b.close();}
