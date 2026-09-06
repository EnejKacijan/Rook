import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { WEEKDAYS, blankState, buildProgram, completeWorkout, isoDay, startWorkout, weekday } from '../src/domain.js';

const phase=process.env.ROOK_QA_PHASE||'after';
const out='artifacts/today-day-header';await mkdir(out,{recursive:true});
const baseline=phase==='after'?await readFile(`${out}/before.json`,'utf8').then(JSON.parse).catch(()=>({})):{};
const results={};
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
function fixture(kind,appearance,style){
  const state=blankState(),today=weekday(),offset=n=>WEEKDAYS[(WEEKDAYS.indexOf(today)+n)%7];
  const resting=kind==='rest'||kind==='rest-notice';
  Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:2,availableDays:resting?[offset(1),offset(3)]:[today,offset(2)],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true,appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
  state.program=buildProgram(state.profile);state.program.name='Push / Pull / Legs / Upper / Lower';
  state.selectedDate=isoDay();state.selectedDay=today;
  const day=state.program.days.find(d=>d.weekday===today)||state.program.days[0];
  if(kind==='completed'||kind==='active'){
    state.activeWorkout=startWorkout(state,day);state.activeWorkout.startedAt=Date.now()-600000;
    if(kind==='completed'){for(const e of state.activeWorkout.exercises)for(const set of e.sets)Object.assign(set,{weight:70,reps:8,rir:1,completed:true});return completeWorkout(state);}
  }
  if(kind.endsWith('-notice')){
    const other=state.program.days.find(d=>d.weekday!==today);
    state.activeWorkout=startWorkout(state,other);
    state.activeWorkout.workoutDateKey=isoDay(new Date(Date.now()-86400000));
    state.activeWorkout.startedAt=Date.now()-600000;
  }
  return state;
}
try{
for(const width of [320,390,430])for(const appearance of ['light','dark'])for(const style of ['standard','premium']){
  const group={};
  for(const kind of ['rest','planned','completed','active',...(width===390&&appearance==='light'&&style==='standard'?['planned-notice','rest-notice']:[])]){
    const context=await browser.newContext({viewport:{width,height:844},colorScheme:appearance,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},fixture(kind,appearance,style));
    await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
    await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
    if(kind.endsWith('-notice'))await page.locator('.week-strip [aria-current="date"]').click();
    await page.locator('.today-day-header').waitFor();
    const geometry=await page.evaluate(()=>{
      const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
      const hero=document.querySelector('.today-day-header').parentElement,header=rect('.today-day-header'),strip=rect('.week-strip');
      return {header,strip,eyebrow:rect('.today-day-header .eyebrow'),action:rect('.flexible-week-entry'),title:rect('.today-day-header + h1'),nav:rect('.bottom-nav'),gap:header.y-strip.y-strip.height,padding:getComputedStyle(hero).paddingTop,margin:getComputedStyle(hero).marginTop,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    const key=`${width}-${style}-${appearance}-${kind}`;results[key]=geometry;group[kind]=geometry;
    await page.screenshot({path:`${out}/${phase}-${key}.png`});
    assert.equal(geometry.overflow,false,key);assert.ok(geometry.action.height>=44,key+' tap target');assert.deepEqual(errors,[]);
    if(phase==='after'){
      const old=baseline[key];
      if(old){
        assert.deepEqual(geometry.strip,old.strip,key+' calendar unchanged');assert.deepEqual(geometry.nav,old.nav,key+' nav unchanged');
        assert.equal(geometry.title.height,old.title.height,key+' title typography');
        assert.ok(Math.abs((geometry.title.y-geometry.header.y)-(old.title.y-old.header.y))<.1,key+' inner spacing unchanged');
        if(kind==='rest'||kind.endsWith('-notice'))assert.equal(geometry.header.y,old.header.y,key+' baseline/notice preserved');
      }
      if(!kind.endsWith('-notice')){
        assert.equal(geometry.header.y,group.rest.header.y,key+' shared row height');
        assert.equal(geometry.eyebrow.y,group.rest.eyebrow.y,key+' same label height');
        assert.equal(geometry.action.y,group.rest.action.y,key+' same Adjust Week height');
      }
    }
    // Real drill-in action stays usable after moving its parent section.
    await page.locator('.flexible-week-entry').click();await page.locator('.flexible-week-sheet').waitFor();
    await context.close();
  }
  console.log(`${width} ${style} ${appearance}: rest ${group.rest.gap}px; planned ${group.planned.gap}px; completed ${group.completed.gap}px; active ${group.active.gap}px`);
}
await writeFile(`${out}/${phase}.json`,JSON.stringify(results,null,2));
}finally{await browser.close();}
