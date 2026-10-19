import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {startWorkout,completeWorkout,serializeState,STORAGE_KEY,isoDay} from '../src/domain.js';

const output='artifacts/seven-issues',base='http://127.0.0.1:4198';
await mkdir(output,{recursive:true});
const results=[];const run=(process.env.QA_ENGINE||'all')+(process.env.QA_RIR==='off'?'-rir-off':'');const checkpoint=()=>writeFile(`${output}/results-${run}.json`,JSON.stringify(results,null,2));
const themes=['light','dark','premium-light','premium-dark'];
function fixture(kind,theme,rir=true){
 const s=createReturningUserFixture(0);s.ai.planUpgradeDismissed=true;
 Object.assign(s.profile,{rirEnabled:rir,showExerciseImages:true,restTimerEnabled:false,appearancePreference:theme.endsWith('dark')?'dark':'light',stylePreference:theme.startsWith('premium')?'premium':'standard',themePreference:theme.startsWith('premium')?'premium':theme});
 s.selectedDate=isoDay();const template=structuredClone(s.program.days[0]);
 template.exercises=template.exercises.slice(0,1);const e=template.exercises[0];
 Object.assign(e,{exerciseId:kind==='timed'?'plank':kind==='bodyweight'?'pull-up':kind==='reps-only'?'band-row':'barbell-bench-press',loggingMode:kind==='per-side'?'per_side':'normal',repMin:7,repMax:7,targetRir:null});
 s.activeWorkout=startWorkout(s,template);const ex=s.activeWorkout.exercises[0];
 ex.sets=ex.sets.slice(0,2);ex.importedName=kind==='per-side'?'Rear Delt Fly with a deliberately long exercise name':undefined;
 ex.sets.forEach(set=>Object.assign(set,{weight:['timed','bodyweight','reps-only'].includes(kind)?null:35,reps:kind==='timed'?45:7,completed:false,rir:null,...kind==='per-side'?{sides:{left:{reps:null},right:{reps:null}}}:{}}));
 return s;
}
async function boot(browser,width,theme,state){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await context.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:STORAGE_KEY,value:serializeState(state)});
 const page=await context.newPage();page.setDefaultTimeout(10000);
 await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(base);
 await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();
 assert.equal(await page.locator('html').getAttribute('data-appearance'),theme.endsWith('dark')?'dark':'light');
 assert.equal(await page.locator('html').getAttribute('data-style'),theme.startsWith('premium')?'premium':'standard');
 return {context,page};
}
for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 if(process.env.QA_ENGINE&&process.env.QA_ENGINE!==engine)continue;
 const browser=await type.launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{
 for(const width of [320,390,430].filter(w=>!process.env.QA_WIDTH||w===Number(process.env.QA_WIDTH)))for(const theme of themes.filter(t=>!process.env.QA_THEME||t===process.env.QA_THEME)){
  for(const kind of (engine==='chromium'?['per-side','weighted','bodyweight','reps-only','timed']:['per-side'])){
   const {context,page}=await boot(browser,width,theme,fixture(kind,theme,process.env.QA_RIR!=='off'));
   const row=page.locator('.set-row').first();await row.waitFor();
   const measurements=await row.evaluate(n=>{
    const rect=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};};
    const controls=[...n.querySelectorAll('button,input')].map(e=>({label:e.getAttribute('aria-label'),...rect(e)}));
    const overlaps=controls.flatMap((a,i)=>controls.slice(i+1).filter(b=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.5).map(b=>[a.label,b.label]));
    return {overflow:document.documentElement.scrollWidth>innerWidth,controls,overlaps};
   });
   assert.equal(measurements.overflow,false);assert.deepEqual(measurements.overlaps,[]);
   if(kind==='per-side'){
    const controls=measurements.controls.filter(c=>/^(Increase|Decrease)/.test(c.label));
    assert.ok(controls.every(c=>c.w>=43.9&&c.h>=44));
    assert.equal(await row.getByRole('group',{name:'Reps per side for set 1'}).count(),1);
    await row.locator('.check').click({force:true});
    assert.equal(await row.locator('input[aria-invalid=true]').count(),2);
    const left=row.getByRole('textbox',{name:'left reps for set 1',exact:true}),right=row.getByRole('textbox',{name:'right reps for set 1',exact:true});
    await left.fill('7');await row.getByRole('button',{name:'Increase left reps for set 1',exact:true}).click();
    assert.equal(await left.inputValue(),'8');assert.equal(await right.inputValue(),'');await right.fill('6');
    await row.locator('.check').click({force:true});
    assert.equal(await row.getAttribute('data-set-state'),'completed');
    await page.screenshot({path:`${output}/${engine}-${width}-${theme}-per-side.png`});
   }
   results.push({engine,width,theme,kind,...measurements});await checkpoint();await context.close();
  }
  if(process.env.QA_LOGGER_ONLY){console.log(`${engine} ${width} ${theme}: RIR OFF logger passed`);continue;}
  // Search: deep scroll, edits, clear and same-query return.
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(10000);
  await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
  await page.goto(`${base}/scripts/search-keyboard-review.html?theme=${theme}`);
  await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();await page.getByRole('button',{name:'+ ADD EXERCISE',exact:true}).click();
  const input=page.getByRole('searchbox',{name:'Search exercises',exact:true}),list=page.locator('.exercise-search-body > [data-exercise-search-scroll]');
  await page.locator('.queue-search-row').first().waitFor();
  for(const query of ['cable','cable o','cable','press','pre','']){
   await list.evaluate(n=>n.scrollTop=180);await input.fill(query);
   assert.equal(await list.evaluate(n=>n.scrollTop),0,`query ${query}`);
  }
  await input.fill('press');await list.evaluate(n=>n.scrollTop=80);
  const preview=list.locator('.queue-search-body').nth(2);await preview.scrollIntoViewIfNeeded();const before=await list.evaluate(n=>n.scrollTop);
  await preview.tap();
  try{await page.locator('.queue-exercise-preview h1').waitFor({timeout:2500});}catch(e){await page.screenshot({path:`${output}/${engine}-${width}-${theme}-preview-failure.png`});await writeFile(`${output}/preview-failure.html`,await page.content());throw e;}
  await page.getByRole('button',{name:'Back',exact:true}).click();
  assert.equal(await input.inputValue(),'press');assert.equal(await list.evaluate(n=>n.scrollTop),before);
  await page.getByRole('button',{name:'Clear search',exact:true}).click();assert.equal(await list.evaluate(n=>n.scrollTop),0);
  await page.waitForFunction(()=>[...document.querySelectorAll('.queue-search-row')].slice(0,3).every(row=>{const image=row.querySelector('img');return !image||image.complete&&image.naturalWidth>0;}));
  const artwork=await page.locator('.queue-search-row img').evaluateAll(images=>images.map(i=>({loading:i.loading,priority:i.fetchPriority,loaded:i.complete&&i.naturalWidth>0})));
  assert.ok(artwork.length>0);assert.ok(artwork.slice(0,3).every(i=>i.loading==='eager'&&i.loaded));
  results.push({engine,width,theme,search:true,artwork});await checkpoint();await context.close();
  console.log(`${engine} ${width} ${theme}: logger/search passed`);
 }
 } finally {await browser.close();}
}
await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
console.log(`PASS ${results.length} cases`);
