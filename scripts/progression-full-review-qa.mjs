import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {selectProgressionRows} from '../src/progressionOverview.js';

const url=process.env.ROOK_QA_URL||'http://127.0.0.1:4273';
const artifact='artifacts/progression-full-review-qa';
await mkdir(artifact,{recursive:true});
const longName='Single-Arm Behind-the-Body Cable Lateral Raise With Controlled Tempo';

function fixture(count,style,appearance) {
  const state=createReturningUserFixture(2);
  if(count!==25){
    state.workouts=count?[{...state.workouts[0],exercises:state.workouts[0].exercises.slice(0,count)}]:[];
  }
  if(count===25){
    const id=state.workouts.at(-1).exercises[0].exerciseId;
    for(const workout of state.workouts)for(const exercise of workout.exercises)
      if(exercise.exerciseId===id)exercise.importedName=longName;
  }
  state.activeWorkout=null;
  Object.assign(state.profile,{
    stylePreference:style,
    appearancePreference:appearance,
    themePreference:style==='premium'?'premium':appearance,
  });
  assert.equal(selectProgressionRows(state).length,count);
  return state;
}

const cases=[];
for(const width of [320,390,430])for(const style of ['standard','premium'])for(const appearance of ['light','dark'])
  cases.push({width,style,appearance,count:25});
for(const count of [0,1,4,5])cases.push({width:390,style:'standard',appearance:'dark',count});

const browser=await chromium.launch({channel:'chrome',headless:true});
let passed=0;
try {
  for(const {width,style,appearance,count} of cases){
    const standaloneCase=width===390&&style==='standard'&&appearance==='dark'&&count===25;
    const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce',hasTouch:standaloneCase,isMobile:standaloneCase});
    try {
      await context.addInitScript(({state,standalone})=>{
        localStorage.setItem('lift-v2-state',JSON.stringify(state));
        if(standalone)Object.defineProperty(navigator,'standalone',{value:true,configurable:true});
      },{state:fixture(count,style,appearance),standalone:standaloneCase});
      const page=await context.newPage();
      await page.route('**/api/**',route=>route.fulfill({json:{available:false}}));
      await page.goto(url);
      await page.getByRole('button',{name:'PROGRESS',exact:true}).click();
      const preview=page.locator('.progression-overview');
      const previewRows=preview.locator('.progression-row');
      const allAction=preview.locator('.progression-view-all');
      assert.equal(await previewRows.count(),Math.min(4,count));
      assert.equal(await allAction.count(),Number(count>4));
      if(count>=2)assert.match(await page.locator('.goal-progress-card').innerText(),new RegExp(`${count} exercises with progression guidance`));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      if(count<=4){passed++;continue;}

      assert.equal((await allAction.innerText()).trim(),`View all progression (${count})`);
      assert.equal(await allAction.locator('.navigation-chevron').count(),0);
      assert.ok((await allAction.boundingBox()).height>=44);
      assert.match(await allAction.getAttribute('class'),/exercise-row-feedback/);
      const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).workouts);
      if(standaloneCase){
        await page.screenshot({path:`${artifact}/progress-summary-390-standard-dark.png`});
        await allAction.scrollIntoViewIfNeeded();
        await page.screenshot({path:`${artifact}/progress-preview-390-standard-dark.png`});
      }
      await allAction.click();
      const overview=page.locator('.progression-all-screen');
      await overview.waitFor();
      const rows=overview.locator('.progression-row');
      assert.equal(await rows.count(),count);
      if(count===25)assert.match(await overview.innerText(),new RegExp(longName));
      assert.equal(new Set(await rows.evaluateAll(items=>items.map(item=>item.dataset.progressionExerciseId))).size,count);
      for(const row of await rows.all())assert.equal(await row.locator('.navigation-chevron').count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      if(standaloneCase)await page.screenshot({path:`${artifact}/progress-all-390-standard-dark.png`});

      const chosen=rows.nth(count>5?10:count-1);
      await chosen.scrollIntoViewIfNeeded();
      const exerciseId=await chosen.getAttribute('data-progression-exercise-id');
      const scroll=await overview.evaluate(element=>element.scrollTop);
      await chosen.click();
      const back=page.getByRole('button',{name:'Back to exercise progression'});
      await back.waitFor();
      await back.click();
      await overview.waitFor();
      await page.waitForTimeout(30);
      assert.ok(Math.abs((await overview.evaluate(element=>element.scrollTop))-scroll)<3,'return preserves list scroll');
      assert.equal(await page.evaluate(()=>document.activeElement?.dataset.progressionExerciseId),exerciseId);
      if(standaloneCase){
        await overview.evaluate((surface,dx)=>{
          const bounds=surface.getBoundingClientRect(),x=bounds.left+4,y=bounds.top+100;
          const touch=(type,points)=>surface.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:points.map(([clientX,clientY],identifier)=>new Touch({identifier,target:surface,clientX,clientY}))}));
          touch('touchstart',[[x,y]]);
          touch('touchmove',[[x+dx,y]]);
          touch('touchend',[]);
        },width*0.55);
      }else await overview.getByRole('button',{name:'Back to Progress'}).click();
      await overview.waitFor({state:'detached'});
      assert.equal(await previewRows.count(),4);
      assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).workouts),before,'navigation never writes workout history');
      passed++;
    } finally {await context.close();}
  }
} finally {await browser.close();}
console.log(`${passed} progression full-review viewport/theme/count paths passed`);
