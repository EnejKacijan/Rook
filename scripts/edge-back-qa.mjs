import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, isoDay, weekday, WEEKDAYS } from '../src/domain.js';
const out = 'artifacts/edge-back'; await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
try {
for(const width of [320,390,430]) for(const appearance of ['light','dark']) for(const style of ['standard','premium']) {
 const state=blankState(),day=weekday();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:[day,WEEKDAYS[(WEEKDAYS.indexOf(day)+2)%7],WEEKDAYS[(WEEKDAYS.indexOf(day)+4)%7]],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true,appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});state.program=buildProgram(state.profile);state.selectedDate=isoDay();state.selectedDay=day;
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,colorScheme:appearance,serviceWorkers:'block'});
 await context.addInitScript(s=>{localStorage.setItem('lift-v2-state',JSON.stringify(s));Object.defineProperty(navigator,'standalone',{configurable:true,value:true});},state);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
 await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
 const cdp=await context.newCDPSession(page);
 const shot=async name=>page.screenshot({path:`${out}/${width}-${style}-${appearance}-${name}.png`});
 const swipe=async (distance, name, cancel=false)=>{
   await page.waitForTimeout(300);
   const box=await page.locator('.modal-layer > main').boundingBox();assert.ok(box);
   const heading=await page.locator('.modal-layer > main h1').boundingBox();
   const y=heading.y+heading.height/2,x=box.x+4;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+distance*i/8,y}]});await page.waitForTimeout(25);}
   if(await page.locator('.rook-edge-back-preview').count()!==1){console.log(await page.evaluate(({x,y})=>({target:document.elementFromPoint(x,y)?.outerHTML,focus:document.activeElement?.outerHTML,selection:String(getSelection()),box:document.querySelector('.modal-layer > main')?.getBoundingClientRect().toJSON()}),{x,y}));await shot('FAILED-gesture');}
   assert.equal(await page.locator('.rook-edge-back-preview').count(),1);
   if(name) await shot(`${name}-partial`);
   await page.waitForTimeout(130);
   await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await page.waitForTimeout(280);
   assert.equal(await page.locator('.rook-edge-back-preview').count(),0);assert.equal(await page.locator('[data-edge-back-active]').count(),0);
 };
 await page.getByRole('button',{name:'ADJUST WEEK',exact:true}).click();await page.getByRole('button',{name:/My available days changed/}).click();await page.waitForTimeout(300);
 await shot('flexible-before');await swipe(45,'flexible-cancel');assert.equal(await page.locator('.flexible-week-sheet h1').innerText(),'When can you train?');await shot('flexible-cancelled');
 await swipe(width*.5,'flexible-commit');assert.equal(await page.locator('.flexible-week-sheet h1').innerText(),'What changed?');await shot('flexible-destination');
 await page.getByRole('button',{name:/Move a workout Choose/}).click();await page.locator('.flexible-week-sheet .choice-row').first().click();await swipe(width*.5);assert.equal(await page.locator('.flexible-week-sheet h1').innerText(),'Choose a workout');
 await page.locator('.flexible-week-sheet .choice-row').first().click();await page.locator('.flexible-week-dates button:not([disabled])').first().click();await swipe(width*.5);assert.match(await page.locator('.flexible-week-sheet h1').innerText(),/^Move /);
 await page.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await page.locator('.flexible-week-sheet h1').innerText(),'Choose a workout');
 await page.getByRole('button',{name:'Close Adjust week',exact:true}).click();
 await page.getByRole('button',{name:'ADJUST TODAY',exact:true}).click();await page.getByRole('button',{name:/Less time Shorten/}).click();await page.waitForTimeout(300);
 await shot('adjust-before');await swipe(45,'adjust-cancel');await shot('adjust-cancelled');await swipe(width*.5,'adjust-commit');assert.equal(await page.locator('.adjust-today-sheet h1').innerText(),'What changed today?');await shot('adjust-destination');
 if(width===390 && style==='standard' && appearance==='light') {
   for(const mode of ['Different equipment','Low energy','Something is unavailable']) {
     await page.getByRole('button',{name:new RegExp(`^${mode}`)}).click();
     if(mode==='Different equipment')await page.getByRole('button',{name:/Choose equipment/}).click();
     if(mode==='Low energy') {
       await page.getByRole('button',{name:'REVIEW LOWER-FATIGUE WORKOUT',exact:true}).click();
       await page.getByText('Future workouts remain based on your original plan.').waitFor();
       await page.locator('.adjust-today-sheet').evaluate(el=>el.scrollTop=0);await swipe(width*.5);
       assert.equal(await page.getByRole('button',{name:'REVIEW LOWER-FATIGUE WORKOUT',exact:true}).count(),1);
     }
     await page.locator('.adjust-today-sheet').evaluate(el=>el.scrollTop=0);await swipe(width*.5);
     assert.equal(await page.locator('.adjust-today-sheet h1').innerText(),'What changed today?');
   }
 }
 await page.getByRole('button',{name:'Close Adjust today',exact:true}).click();
 await page.getByRole('button',{name:'PROFILE',exact:true}).click();await page.getByRole('button',{name:/Plan history/}).click();
 await page.locator('.plan-history-list button').first().click();await page.waitForTimeout(300);
 await shot('plan-before');await swipe(45,'plan-cancel');await shot('plan-cancelled');await swipe(width*.5,'plan-commit');assert.equal(await page.locator('.plan-version-detail').count(),0);await shot('plan-destination');
 assert.deepEqual(errors,[]);await context.close();console.log(`${width} ${style} ${appearance}: three nested flows passed`);
}
} finally {await browser.close();}
