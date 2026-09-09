import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,buildProgram,weekday,isoDay,WEEKDAYS} from '../src/domain.js';
const out='artifacts/adjust-entry-polish';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const [width,appearance,style] of [[320,'dark','standard'],[390,'light','standard'],[390,'light','premium'],[390,'dark','premium']]){
 const state=blankState(),today=weekday(),other=WEEKDAYS[(WEEKDAYS.indexOf(today)+3)%7];
 Object.assign(state.profile,{onboardingComplete:true,goal:'Build muscle',experience:'Intermediate',daysPerWeek:2,availableDays:[today,other],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 state.program=buildProgram(state.profile);state.selectedDay=today;state.selectedDate=isoDay();state.ai.planUpgradeDismissed=true;
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
 await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4175');
 const entry=page.getByRole('button',{name:'ADJUST TODAY',exact:true}),sheet=page.locator('.adjust-today-sheet');
 await entry.waitFor();
 const stored=()=>page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('lift-v2-state'));return {program:s.program,workouts:s.workouts,todayAdaptation:s.todayAdaptation,activeWorkout:s.activeWorkout};});
 const before=await stored();await entry.click();await page.waitForTimeout(350);
 const cards=sheet.locator('.adjust-option-list > button'),note=sheet.locator('.adjust-today-note');
 assert.equal(await cards.count(),4);
 const metrics=await note.evaluate(e=>{const s=getComputedStyle(e);return {tag:e.tagName,tab:e.tabIndex,role:e.getAttribute('role'),bg:s.backgroundColor,border:s.borderTopWidth,left:e.getBoundingClientRect().left,cardLeft:e.previousElementSibling.getBoundingClientRect().left};});
 assert.equal(metrics.tag,'P');assert.equal(metrics.tab,-1);assert.equal(metrics.role,null);assert.equal(metrics.bg,'rgba(0, 0, 0, 0)');assert.equal(metrics.border,'0px');assert.equal(metrics.left,metrics.cardLeft);
 const geometry=await sheet.evaluate(s=>{const cards=()=>[...s.querySelectorAll('.choice-row')].map(e=>({width:e.offsetWidth,height:e.offsetHeight,top:e.offsetTop-s.querySelector('.choice-row').offsetTop}));const after=cards(),n=s.querySelector('.adjust-today-note');n.style.cssText='padding:12px 14px;border:1px solid transparent;border-radius:13px;background:#eee';const before=cards();n.removeAttribute('style');return {before,after};});assert.deepEqual(geometry.after,geometry.before,'option dimensions and internal spacing unchanged');
 assert.ok((await cards.evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height))).every(h=>h>=44));
 await page.screenshot({path:`${out}/${width}-${style}-${appearance}.png`});await note.scrollIntoViewIfNeeded();
 const box=await note.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=844);
 await page.screenshot({path:`${out}/${width}-${style}-${appearance}-helper.png`});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 for(const [label,step,heading] of [['Less time','time','Time available'],['Different equipment','equipment','Where are you training?'],['Low energy','energy','Keep the intent. Reduce the fatigue.'],['Specific exercise unavailable','unavailable','Choose affected exercises']]){
  const card=sheet.getByRole('button',{name:new RegExp(`^${label}`)});await card.focus();await page.keyboard.press('Enter');
  await sheet.getByRole('heading',{name:heading,exact:true}).waitFor();assert.equal(await page.locator(`.adjust-today-sheet.is-${step}-step`).count(),1);
  assert.equal(await page.locator('.adjust-today-sheet').count(),1);assert.deepEqual(await stored(),before);
  await sheet.getByRole('button',{name:'Back',exact:true}).click();await sheet.getByRole('heading',{name:'What changed today?',exact:true}).waitFor();assert.deepEqual(await stored(),before);
  await sheet.getByRole('button',{name:new RegExp(`^${label}`)}).click();await sheet.getByRole('heading',{name:heading,exact:true}).waitFor();
  await sheet.getByRole('button',{name:/Close Adjust today/i}).click();await sheet.waitFor({state:'detached'});assert.deepEqual(await stored(),before);
  await entry.click();await page.waitForTimeout(350);
 }
 assert.equal(await sheet.evaluate(e=>e.contains(document.activeElement)),true);
 await page.keyboard.press('Escape');await sheet.waitFor({state:'detached'});await page.waitForFunction(()=>document.activeElement?.textContent.trim()==='ADJUST TODAY');assert.equal(await entry.evaluate(e=>e===document.activeElement),true);assert.deepEqual(await stored(),before);assert.deepEqual(errors,[]);
 console.log(`PASS ${width} ${style} ${appearance}: 4 direct routes, keyboard/pointer, back/close, unchanged state/card geometry, noninteractive helper, screenshots`);await context.close();
}}finally{await browser.close();}
