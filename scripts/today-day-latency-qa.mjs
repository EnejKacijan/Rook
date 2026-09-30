import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {isoDay,startWorkout} from '../src/domain.js';

const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const context=await browser.newContext({viewport:{width:Number(process.env.ROOK_QA_WIDTH||390),height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const state=createReturningUserFixture(0);
  for(let i=1;i<=Number(process.env.ROOK_QA_HISTORY||0);i++){
    const date=new Date(Date.now()-i*86400000),prior=startWorkout(state,state.program.days[i%state.program.days.length]);
    prior.source='freestyle';prior.id=`latency-history-${i}`;prior.startedAt=date.getTime()-2400000;
    prior.completedAt=date.toISOString();prior.endedAt=date.getTime();prior.workoutDateKey=isoDay(date);
    prior.canonicalPlanDate=isoDay(date);prior.exercises[0].sets[0].completed=true;
    state.workouts.push(prior);
  }
  if(process.env.ROOK_QA_THEME){const [style,appearance]=process.env.ROOK_QA_THEME.split('-');
    Object.assign(state.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});}
  await context.addInitScript(data=>{
    localStorage.setItem('lift-v2-state',JSON.stringify(data));
    window.__rookTiming={clone:[],storage:[]};
    const originalClone=window.structuredClone.bind(window);
    window.structuredClone=(...args)=>{const start=performance.now();const result=originalClone(...args);window.__rookTiming.clone.push(performance.now()-start);return result;};
    const originalSet=Storage.prototype.setItem;
    Storage.prototype.setItem=function(...args){const start=performance.now();const result=originalSet.apply(this,args);window.__rookTiming.storage.push({key:args[0],ms:performance.now()-start});return result;};
  },state);
  const page=await context.newPage();page.on('pageerror',error=>console.error('PAGE ERROR',error.stack));
  await page.route('**/api/**',route=>route.fulfill({json:{available:false}}));
  await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4273',{waitUntil:'domcontentloaded'});
  await page.locator('.week-strip button').first().waitFor();
  if(process.env.ROOK_QA_NO_SETTLE!=='1')await page.waitForTimeout(2000);
  const samples=[];
  for(let i=0;i<5;i++) {
    const sample=await page.evaluate(()=>new Promise(resolve=>{
      const buttons=[...document.querySelectorAll('.week-pager-page[data-week-offset="0"] .week-strip button')];
      const target=buttons.find(button=>button.getAttribute('aria-pressed')!=='true'&&!button.disabled);
      if(!target)throw Error('No other selectable day: '+JSON.stringify({buttons:buttons.map(b=>[b.textContent,b.disabled,b.getAttribute('aria-pressed')]),body:document.body.innerText.slice(0,600)}));
      const initial=document.querySelector('.today-hero')?.textContent;
      const beforeDate=JSON.parse(localStorage.getItem('lift-v2-state')).selectedDate;
      const cloneStart=window.__rookTiming.clone.length,storageStart=window.__rookTiming.storage.length;
      const start=performance.now();target.click();
      const eventReturn=performance.now()-start;
      requestAnimationFrame(()=>resolve({beforeDate,eventReturn,frame:performance.now()-start,
        selected:target.getAttribute('aria-pressed'),heroChanged:document.querySelector('.today-hero')?.textContent!==initial,
        cloneCount:window.__rookTiming.clone.length-cloneStart,
        cloneMs:window.__rookTiming.clone.slice(cloneStart).reduce((sum,n)=>sum+n,0),
        storage:window.__rookTiming.storage.slice(storageStart)}));
    }));
    assert.equal(sample.selected,'true');assert.equal(sample.heroChanged,true);
    assert.equal(sample.storage.length,0,'date navigation must not write storage before first paint');
    await page.waitForTimeout(80);
    const persistedDate=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).selectedDate);
    assert.notEqual(persistedDate,sample.beforeDate,'date selection persists after first paint');
    samples.push(sample);
  }
  const medianClones=[...samples].map(sample=>sample.cloneCount).sort((a,b)=>a-b)[Math.floor(samples.length/2)];
  assert(medianClones<1000,`day taps repeatedly recalculated calendar schedules: ${medianClones} median clones`);
  console.log(JSON.stringify(samples,null,2));
  await context.close();
} finally {await browser.close();}
