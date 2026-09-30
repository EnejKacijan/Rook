import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {exerciseCatalog} from '../src/domain.js';

const url=process.env.ROOK_QA_URL || 'http://127.0.0.1:4273';
const artifact='artifacts/progress-view-all-chevron-qa';
const ids=Object.keys(exerciseCatalog);
assert.ok(ids.length>100,'catalog can represent the 100+ count case');
await mkdir(artifact,{recursive:true});

function fixture(count,style,appearance) {
  const state=createReturningUserFixture(2);
  const base=state.workouts[0].exercises[0];
  state.workouts=[{
    ...state.workouts[0],
    id:`qa-progress-${count}`,
    exercises:ids.slice(0,count).map((exerciseId,index)=>({
      ...structuredClone(base),
      id:`qa-exercise-${index}`,
      exerciseId,
      importedName:null,
      importedExercise:null,
      sets:[{...structuredClone(base.sets[0]),id:`qa-set-${index}`,completed:true}],
    })),
  }];
  state.activeWorkout=null;
  Object.assign(state.profile,{
    stylePreference:style,
    appearancePreference:appearance,
    themePreference:style==='premium'?'premium':appearance,
  });
  return state;
}

const browser=await chromium.launch({channel:'chrome',headless:true});
let passed=0;
try {
  for(const width of [320,390,430]) for(const style of ['standard','premium']) for(const appearance of ['light','dark']) for(const count of [1,9,22,101]) {
    const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
    try {
      await context.addInitScript(state=>localStorage.setItem('lift-v2-state',JSON.stringify(state)),fixture(count,style,appearance));
      const page=await context.newPage();
      await page.route('**/api/**',route=>route.fulfill({json:{available:false}}));
      await page.goto(url);
      await page.getByRole('button',{name:'PROGRESS',exact:true}).click();
      const preview=page.locator('.logged-exercises-preview');
      const rows=preview.locator('.logged-exercise-row');
      const action=preview.locator('.logged-exercises-all');
      await action.scrollIntoViewIfNeeded();
      assert.equal(await action.getAttribute('type'),'button');
      assert.equal((await action.innerText()).trim(),`View all logged exercises (${count})`);
      assert.equal(await rows.count(),Math.min(6,count));
      assert.equal(await action.locator('.navigation-chevron').count(),0);
      assert.equal(await action.getByText('›',{exact:true}).count(),0);
      for(const row of await rows.all()) assert.equal(await row.locator('.navigation-chevron').count(),1);
      const geometry=await action.evaluate(element=>{
        const row=element.closest('section').querySelector('.logged-exercise-row');
        const outer=element.getBoundingClientRect(),label=element.firstElementChild.getBoundingClientRect();
        return {height:outer.height,width:outer.width,left:outer.left,labelLeft:label.left,rowLabelLeft:row.firstElementChild.getBoundingClientRect().left,overflow:document.documentElement.scrollWidth>innerWidth+1,textAlign:getComputedStyle(element).textAlign};
      });
      assert.ok(geometry.height>=44,`full action target stays >=44px: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.width>width/2,'action remains a whole-row target');
      assert.ok(Math.abs(geometry.labelLeft-geometry.rowLabelLeft)<1,'action text aligns with exercise names');
      assert.equal(geometry.textAlign,'left');
      assert.equal(geometry.overflow,false);
      assert.match(await action.getAttribute('class'),/exercise-row-feedback/);
      await action.focus();
      assert.equal(await action.evaluate(element=>document.activeElement===element),true);
      await action.locator('span').evaluate((element,text)=>{element.textContent=text;},`Prikaži vse zabeležene vaje in zadnje podrobnosti treningov (${count})`);
      assert.equal(await action.evaluate(element=>document.documentElement.scrollWidth>innerWidth+1||element.scrollWidth>element.clientWidth+1),false,'long localized action text wraps without overflow');
      await action.locator('span').evaluate((element,text)=>{element.textContent=text;},`View all logged exercises (${count})`);
      if(width===390&&style==='standard'&&appearance==='dark'&&count===22) await page.screenshot({path:`${artifact}/progress-view-all-390-standard-dark.png`});
      await action.click();
      await page.locator('.logged-exercises-sheet').waitFor();
      assert.equal(await page.locator('.logged-exercises-sheet .logged-exercise-row').count(),count);
      passed++;
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
console.log(`${passed} Progress view-all viewport/theme/count cases passed`);
