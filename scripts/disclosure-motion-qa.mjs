import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, startWorkout, weekday, WEEKDAYS, isoDay } from '../src/domain.js';
const out='artifacts/disclosure-motion';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
function fixture(theme,style){
 const s=blankState(),today=weekday();Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:4,availableDays:[today,...WEEKDAYS.filter(x=>x!==today).slice(0,3)],sessionMinutes:60,equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true,recommendedWarmupsEnabled:true,rampUpSetsEnabled:true,appearancePreference:theme,stylePreference:style,themePreference:style==='premium'?'premium':theme});
 s.program=buildProgram(s.profile);s.selectedDay=today;s.selectedDate=isoDay();s.activeWorkout=startWorkout(s,s.program.days.find(d=>d.weekday===today));
 if(process.env.ROOK_DISCLOSURE_LONG){const steps=Array.from({length:14},(_,i)=>({id:`long-warmup-${i}`,label:`Controlled warm-up movement ${i+1} with a deliberately long instruction that wraps at narrow widths`,minutes:1,completed:false}));s.activeWorkout.warmup.general=steps;s.activeWorkout.warmup.stages[0].general=steps;}
 return s;
}
const results=[];
try{for(const width of [320,390])for(const theme of process.env.ROOK_DISCLOSURE_LONG?['dark']:['light','dark'])for(const style of process.env.ROOK_DISCLOSURE_LONG?['standard']:['standard','premium']){
 const key=`${width}-${theme}-${style}${process.env.ROOK_DISCLOSURE_LONG?'-long':''}`,context=await browser.newContext({viewport:{width,height:844},colorScheme:theme,serviceWorkers:'block'});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},fixture(theme,style));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();
 const toggle=page.locator('.workout-warmup-toggle'),panel=page.locator('.workout-warmup .rook-disclosure');await toggle.waitFor();await page.waitForTimeout(300);
 const geometry=()=>page.evaluate(()=>{const toggle=document.querySelector('.workout-warmup-toggle'),panel=document.querySelector('.workout-warmup .rook-disclosure'),next=document.querySelector('.exercise-heading');return {top:toggle.getBoundingClientRect().top,height:panel.getBoundingClientRect().height,next:next.getBoundingClientRect().top,content:!!panel.querySelector('.warmup-details'),scroll:scrollY};});
 const initial=await geometry();assert.equal(initial.height,0);await page.screenshot({path:`${out}/${key}-1-collapsed.png`});
 async function midpoint(name){
  await toggle.evaluate(b=>b.click());await page.waitForTimeout(35);
  // Pause real CSS transitions at their midpoint for an inspectable real-app frame.
  await panel.evaluate(el=>{for(const animation of el.getAnimations()){animation.pause();animation.currentTime=50;}});
  const frame=await geometry();assert.ok(frame.height>0);assert.ok(frame.content,'content retained while geometry is nonzero');assert.ok(Math.abs(frame.top-initial.top)<1,'header anchored');
  await page.screenshot({path:`${out}/${key}-${name}.png`});
  await panel.evaluate(el=>el.getAnimations().forEach(a=>a.play()));await page.waitForTimeout(300);return frame;
 }
 const opening=await midpoint('2-mid-expansion'),expanded=await geometry();assert.ok(expanded.height>opening.height);assert.equal(expanded.scroll,initial.scroll);await page.screenshot({path:`${out}/${key}-3-expanded.png`});
 const closing=await midpoint('4-mid-collapse');assert.ok(closing.height<expanded.height);assert.equal((await geometry()).height,0);await page.screenshot({path:`${out}/${key}-5-collapsed.png`});
 await toggle.click();await page.waitForTimeout(250);const step=page.locator('.workout-warmup button[aria-pressed="false"]').first();if(await step.count()){await step.click();await page.waitForTimeout(150);assert.ok(await page.locator('.workout-warmup button[aria-pressed="true"]').count());}
 const savedBefore=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout);
 await toggle.evaluate(async b=>{for(let i=0;i<5;i++){b.click();await new Promise(r=>setTimeout(r,25));}});await page.waitForTimeout(300);assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal((await geometry()).height,0);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout),savedBefore,'disclosure does not mutate warm-up/workout');
 await page.emulateMedia({reducedMotion:'reduce'});await toggle.click();assert.ok((await geometry()).height>0);assert.equal(await panel.evaluate(el=>getComputedStyle(el).transitionDuration),'0s');await toggle.click();assert.equal((await geometry()).height,0);
 assert.deepEqual(errors,[]);results.push({key,initial,opening,expanded,closing});await context.close();console.log(`PASS ${key}: anchored sequence, retained collapse, partial warm-up, rapid taps, reduced motion`);
}await writeFile(`${out}/geometry${process.env.ROOK_DISCLOSURE_LONG?'-long':''}.json`,JSON.stringify(results,null,2));}finally{await browser.close();}
