import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,buildProgram,isoDay,startWorkout,weekday} from '../src/domain.js';

const out='artifacts/completion-feedback';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
function fixture(style,appearance,kind){
 const state=blankState();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:[...new Set([weekday(),'Tue','Sat','Mon'])].slice(0,3),sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true,rirEnabled:true,appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 state.program=buildProgram(state.profile);state.selectedDate=isoDay();state.selectedDay=weekday();state.ai.planUpgradeDismissed=true;state.activeWorkout=startWorkout(state,state.program.days.find(d=>d.weekday===weekday()));state.activeWorkout.startedAt=Date.now()-3600000;
 for(const exercise of state.activeWorkout.exercises)for(const set of exercise.sets)Object.assign(set,{weight:70,reps:8,rir:1,completed:kind!=='empty'});
 if(kind==='early')state.activeWorkout.exercises.at(-1).sets.at(-1).completed=false;
 if(kind==='record'||kind==='repeat'){
  const prior=structuredClone(state.activeWorkout);prior.id='prior-baseline';prior.completedAt=new Date(Date.now()-7*86400000).toISOString();prior.canonicalPlanDate=isoDay(new Date(Date.now()-7*86400000));prior.status='completed';
  for(const exercise of prior.exercises)for(const set of exercise.sets)set.reps=kind==='record'?7:8;
  state.workouts=[prior];
 }
 return state;
}
try{for(const width of (process.env.ROOK_COMPLETION_EXTRAS?[390]:[320,390]))for(const style of (process.env.ROOK_COMPLETION_EXTRAS?['standard']:['standard','premium']))for(const appearance of ['light','dark']){
 for(const kind of (process.env.ROOK_COMPLETION_EXTRAS?['milestone','lb','save-failure']:process.env.ROOK_COMPLETION_BASELINE?['record']:['record','repeat','early','empty'])){
  const context=await browser.newContext({viewport:{width,height:844},colorScheme:appearance,serviceWorkers:'block',reducedMotion:kind==='repeat'?'reduce':'no-preference'});
  const source=fixture(style,appearance,kind==='milestone'?'repeat':['lb','save-failure'].includes(kind)?'record':kind);
  if(kind==='milestone')source.workouts=Array.from({length:9},(_,i)=>({...structuredClone(source.workouts[0]),id:`history-${i}`}));
  if(kind==='lb')source.profile.units='lb';
  await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));window.haptics=[];navigator.vibrate=pattern=>{window.haptics.push(pattern);return true;};},source);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();await page.evaluate(()=>window.haptics=[]);
  if(kind==='save-failure')await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='lift-v2-state')throw new DOMException('Quota','QuotaExceededError');return original.call(this,k,v);};});
  await page.getByRole('button',{name:'Finish',exact:true}).click();
  if(kind==='early'||kind==='empty')await page.getByRole('button',{name:'FINISH ANYWAY',exact:true}).click();
  await page.locator('.complete-screen').waitFor();assert.equal(await page.getByRole('button',{name:'DONE',exact:true}).isEnabled(),true);
  const prefix=`${width}-${style}-${appearance}-${kind}${process.env.ROOK_COMPLETION_BASELINE?'-before':''}`;
  if(kind==='record'&&((width===320&&style==='standard'&&appearance==='dark')||(width===390&&style==='standard'&&appearance==='light'))){
   await page.evaluate(()=>{window.completionAnimations=document.querySelector('.complete-screen').getAnimations({subtree:true});window.completionAnimations.forEach(a=>a.pause());});
   const geometry=[];
   for(const time of [0,100,220,400,650]){
    await page.evaluate(t=>window.completionAnimations.forEach(a=>a.currentTime=t),time);
    await page.screenshot({path:`${out}/${prefix}-${time}ms.png`});
    geometry.push(await page.locator('.complete-done-dock').boundingBox());
   }
   geometry.forEach(box=>assert.deepEqual(box,geometry[0],'completion never moves DONE'));
  }
  await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(!process.env.ROOK_COMPLETION_BASELINE){
   assert.equal(await page.locator('.completion-recognition').count(),['record','lb','milestone'].includes(kind)?1:0);
   if(kind==='record')assert.match(await page.locator('.completion-recognition').innerText(),/New rep PR/);
   if(kind==='empty')assert.equal(await page.getByRole('heading',{name:'Workout ended',exact:true}).count(),1);
   if(kind==='milestone')assert.match(await page.locator('.completion-recognition').innerText(),/10 workouts logged/);
   if(kind==='lb')assert.match(await page.locator('.completion-recognition').innerText(),/lb/);
   if(['record','lb','milestone'].includes(kind)){
    const contrasts=await page.locator('.complete-screen').evaluate(root=>{
     const rgb=value=>value.startsWith('#')?value.slice(1).match(/../g).map(v=>parseInt(v,16)):value.match(/[\d.]+/g).slice(0,3).map(Number);
     const luminance=color=>rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
     const bg=luminance(getComputedStyle(document.documentElement).getPropertyValue('--rook-bg').trim());
     return [...root.querySelectorAll('.completion-recognition > *, .stat-grid small, .workout-photo-heading > p > small, .session-note-editor > small')].map(e=>{const fg=luminance(getComputedStyle(e).color);return (Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05);});
    });assert.ok(contrasts.every(r=>r>=4.5),`recognition contrast ${contrasts}`);
   }
   const haptics=await page.evaluate(()=>window.haptics);assert.equal(haptics.length,kind==='save-failure'?0:1,'one successful finish haptic only');
   if(kind==='repeat')assert.equal(await page.locator('.complete-screen').evaluate(e=>e.getAnimations({subtree:true}).length),0,'reduced motion is immediate');
   if(kind==='early'||kind==='empty')assert.equal(await page.locator('.complete-mark').evaluate(e=>getComputedStyle(e,'::after').content),'none');
  }
  await page.screenshot({path:`${out}/${prefix}.png`});
  if(kind==='save-failure'){await page.locator('.persistence-warning').waitFor();assert.equal(await page.getByRole('button',{name:'DONE',exact:true}).isEnabled(),true);await context.close();console.log(`PASS ${prefix}`);continue;}
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.equal(stored.workouts.length,source.workouts.length+1);assert.equal(stored.activeWorkout,null);assert.equal(stored.workouts.at(-1).status,kind==='early'||kind==='empty'?'ended-early':'completed');
  if(kind==='record'){await page.getByRole('button',{name:'About right',exact:true}).click();assert.equal(await page.evaluate(()=>window.haptics.length),1,'feedback rerender never replays haptic');}
  assert.deepEqual(errors,[]);await page.getByRole('button',{name:'DONE',exact:true}).click();await page.locator('.today-screen').waitFor();
  await page.reload({waitUntil:'networkidle'});await page.locator('.today-screen').waitFor();assert.equal(await page.locator('.complete-screen').count(),0);assert.deepEqual(await page.evaluate(()=>window.haptics),[],'reload never replays completion');
  await context.close();console.log(`PASS ${prefix}`);
 }
}}finally{await browser.close();}
