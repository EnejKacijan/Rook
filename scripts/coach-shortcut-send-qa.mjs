import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,buildProgram,weekday,WEEKDAYS} from '../src/domain.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW';await mkdir(out,{recursive:true});const results=[];
const b=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark'])for(const intent of ['Explain my next workout','Explain my program','Move a workout this week']){
 const s=blankState();Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:[1,2,3].map(n=>WEEKDAYS[(WEEKDAYS.indexOf(weekday())+n)%7]),sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true,stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});s.program=buildProgram(s.profile);s.ai.planUpgradeDismissed=true;
 const c=await b.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});await c.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),s);
 const p=await c.newPage();await p.route('**/api/ai/status',r=>r.fulfill({json:{available:true}}));await p.route('**/api/ai',r=>r.fulfill({json:{data:{text:'We can review your training together. No changes have been applied.',action:null}}}));
 await p.route('**/src/aiService.js*',async r=>{const response=await r.fetch();const text=await response.text();assert.ok(text.includes('async coach(state, message) {'));await r.fulfill({response,body:text.replace('async coach(state, message) {','async coach(state, message) { window.shortcutCalls=(window.shortcutCalls||0)+1; await new Promise(r=>window.releaseCoach=r);')});});
 await p.goto('http://127.0.0.1:4173');await p.getByRole('button',{name:'COACH',exact:true}).click();
 // Delay only in QA, before the real Coach implementation, to exercise busy state.
 const input=p.getByRole('textbox',{name:'Ask Coach'}),draft='  My unsent question\nkeep this exactly  ';await input.fill(draft);await input.focus();
 if(width===320)await p.setViewportSize({width,height:520}); // Reduced visual space representative of an open keyboard, not physical iOS proof.
 const snapshot=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('lift-v2-state'));return JSON.stringify([s.program,s.weekScheduleOverrides,s.workouts]);});
 await p.getByRole('button',{name:intent,exact:true}).evaluate(el=>{el.click();el.click();});
 await p.locator('.user-message').waitFor();assert.deepEqual(await p.locator('.user-message').allTextContents(),[intent]);assert.equal(await p.evaluate(()=>window.shortcutCalls),1);assert.equal(await input.inputValue(),draft);assert.equal(await input.isDisabled(),false);
 assert.equal(await p.getByRole('button',{name:'Sending message'}).isDisabled(),true);
 if(width===390&&style==='standard'&&appearance==='light'&&intent==='Move a workout this week'){
  await p.getByRole('button',{name:'Conversation history'}).click();await p.getByRole('button',{name:'NEW',exact:true}).click();
  for(const button of await p.locator('.prompt-list button').all())assert.ok(await button.isDisabled(),'shortcuts remain disabled while Coach responds');
  assert.equal(await p.evaluate(()=>window.shortcutCalls),1);
 }
 await p.evaluate(()=>window.releaseCoach());await p.waitForFunction(()=>!document.querySelector('.coach-send').disabled);
 assert.equal(await input.inputValue(),draft);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).coachDraft),draft);
 assert.equal(await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('lift-v2-state'));return JSON.stringify([s.program,s.weekScheduleOverrides,s.workouts]);}),snapshot,'no plan/schedule/history mutation');
 // The ordinary Send path still clears the draft and submits that custom question.
 await p.getByRole('button',{name:'Send message',exact:true}).click();assert.equal(await input.inputValue(),'');assert.equal(await p.locator('.user-message').last().textContent(),draft.trim());await p.evaluate(()=>window.releaseCoach());await p.waitForFunction(()=>document.querySelector('.coach-send').getAttribute('aria-busy')==='false');
 results.push({width,style,appearance,intent,result:'PASS'});await c.close();
}console.log(`PASS ${results.length}/24 shortcut/draft/busy/double-tap/custom-send cases`);}finally{await writeFile(`${out}/coach-shortcut-send-results.json`,JSON.stringify(results,null,2));await b.close();}
