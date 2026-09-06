import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { blankState,buildProgram,isoDay,weekday,WEEKDAYS } from '../src/domain.js';
const state=blankState(),day=weekday();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:[day,WEEKDAYS[(WEEKDAYS.indexOf(day)+2)%7],WEEKDAYS[(WEEKDAYS.indexOf(day)+4)%7]],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true});state.program=buildProgram(state.profile);state.selectedDate=isoDay();state.selectedDay=day;
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
try {
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));Object.defineProperty(navigator,'standalone',{value:true,configurable:true});},state);
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
const title=()=>page.locator('.modal-layer > main h1').innerText();
// Synthetic native TouchEvents test cancellation/guards deterministically;
// edge-back-qa separately sends real Chromium CDP touch sequences.
async function gesture({dx=180,dy=0,count=1,cancel=false,center=false,pause=140,end=true}={}) {
 await page.evaluate(({dx,dy,count,cancel,center,end})=>{
  const el=document.querySelector('.modal-layer > main'),r=el.getBoundingClientRect(),x=r.left+(center?100:4),y=r.top+210;
  window.rookQaTouch=(type,points)=>el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:points.map((p,i)=>new Touch({identifier:i,target:el,clientX:p[0],clientY:p[1]}))}));
  window.rookQaTouch('touchstart',[[x,y]]);window.rookQaTouch('touchmove',Array.from({length:count},()=>[x+dx,y+dy]));
 },{dx,dy,count,cancel,center,end});
 if(!end)return;
 await page.waitForTimeout(pause);await page.evaluate(cancel=>window.rookQaTouch(cancel?'touchcancel':'touchend',[]),cancel);await page.waitForTimeout(230);
 assert.equal(await page.locator('.rook-edge-back-preview').count(),0);
}
await page.getByRole('button',{name:'ADJUST WEEK',exact:true}).click();await page.waitForTimeout(300);
await gesture();assert.equal(await title(),'What changed?');
await page.getByRole('button',{name:/My available days changed/}).click();await page.waitForTimeout(300);
const original=await page.evaluate(()=>localStorage.getItem('lift-v2-state'));
for(const config of [{dx:30},{dx:-80},{dy:-240},{dx:25,dy:-25},{count:2},{cancel:true},{center:true}]){await gesture(config);assert.equal(await title(),'When can you train?');}
assert.equal(await page.evaluate(()=>localStorage.getItem('lift-v2-state')),original);
await page.evaluate(()=>Object.defineProperty(navigator,'standalone',{value:false,configurable:true}));await gesture();assert.equal(await title(),'When can you train?');
await page.evaluate(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));
await gesture({dx:70,pause:0});assert.equal(await title(),'What changed?');
await page.getByRole('button',{name:/My available days changed/}).click();await page.emulateMedia({reducedMotion:'reduce'});await gesture();assert.equal(await title(),'What changed?');await page.emulateMedia({reducedMotion:'no-preference'});
await page.getByRole('button',{name:/Move a workout Choose/}).click();await page.locator('.flexible-workout-list button').first().click();await page.locator('.flexible-week-sheet').evaluate(el=>el.scrollTop=180);await gesture();assert.equal(await title(),'Choose a workout');
await page.getByRole('button',{name:'Close Adjust week',exact:true}).click();await page.getByRole('button',{name:'ADJUST TODAY',exact:true}).click();await page.getByRole('button',{name:/Less time Shorten/}).click();
await page.getByRole('button',{name:'Custom',exact:true}).click();const input=page.locator('.adjust-today-sheet input');await input.fill('22');await gesture();assert.equal(await input.inputValue(),'22');assert.equal(await title(),'Time available');await input.blur();
await gesture({end:false});await page.locator('.modal-layer:not(.rook-edge-back-preview) > main .detail-header-back').evaluate(el=>el.click());await page.waitForTimeout(250);assert.equal(await title(),'What changed today?');assert.equal(await page.locator('.rook-edge-back-preview').count(),0);
await page.getByRole('button',{name:'Close Adjust today',exact:true}).click();
// Controlled unknown imported exercise forces the real manual-resolution path.
await page.evaluate(day=>{const s=JSON.parse(localStorage.getItem('lift-v2-state'));const e=s.program.days.find(d=>d.weekday===day).exercises[0];Object.assign(e,{exerciseId:'imported-custom-qa-unknown',exerciseSource:'imported-custom',importedName:'QA unknown exercise',originalImportedName:'QA unknown exercise',importedExercise:{id:'imported-custom-qa-unknown',name:'QA unknown exercise',pattern:null,muscles:null,equipment:null},matchStatus:'confirmed-custom'});s.program.source='ai-import';localStorage.setItem('lift-v2-state',JSON.stringify(s));},day);
await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'ADJUST TODAY',exact:true}).click();await page.getByRole('button',{name:/Something is unavailable/}).click();await page.locator('.adjust-check-list button').first().click();await page.getByRole('button',{name:'FIND REPLACEMENTS',exact:true}).click();await page.getByRole('button',{name:'Choose replacement',exact:true}).first().click();
const search=page.getByRole('searchbox',{name:'Search replacement exercises'});await search.fill('press');await search.blur();await gesture();assert.equal(await page.locator('.adjust-unresolved').count(),1);assert.equal(await page.getByRole('button',{name:'USE THIS WORKOUT',exact:true}).isDisabled(),true);
await page.locator('.adjust-today-sheet').evaluate(el=>el.scrollTop=0);await gesture();assert.equal(await title(),'Choose affected exercises');assert.equal(await page.locator('.adjust-check-list [aria-pressed="true"]').count(),1);
assert.deepEqual(errors,[]);console.log('Edge Back adversarial runtime passed: root/browser gates, direction, diagonal, vertical, multitouch, cancel, fast flick, reduced motion, scrolled view, input, state interruption and manual replacement preservation.');
}finally{await browser.close();}
