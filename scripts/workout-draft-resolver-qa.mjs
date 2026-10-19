import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright-core';
const out='artifacts/workout-draft-resolvers',results=[],retry=process.env.DRAFT_QA_RETRY==='matching';await mkdir(out,{recursive:true});
const proof=page=>page.evaluate(()=>window.draftReview.read());
const tap=async(page,node)=>{const r=await node.boundingBox();assert.ok(r&&r.y>=0&&r.y+r.height<=844,JSON.stringify(r));await page.touchscreen.tap(r.x+r.width*.7,r.y+r.height/2);};
async function open(browser,{width,theme,kind='weighted',reduced=false,rirOff=false}){
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 await page.goto(`http://127.0.0.1:4198/scripts/workout-draft-resolver-review.html?theme=${theme}&kind=${kind}${rirOff?'&rirOff=1':''}`);
 await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).tap();await page.locator('[data-set-id]').first().waitFor();await page.waitForTimeout(300);
 const helper=page.locator(kind==='recommendation'?'.recommendation':'.freestyle-copy-helper');await helper.evaluate(n=>n.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(100);
 return {context,page,errors};
}
async function previousCase(browser,browserName,options,field,raw,screenshot=false){
 const {page,context,errors}=await open(browser,options),row=page.locator('[data-set-id]').first(),input=row.locator(`[data-workout-field="${field}"] input`),apply=page.locator('.freestyle-copy');
 await tap(page,input);if(raw!=='')await input.fill(raw);
 await page.evaluate(()=>{window.draftReview.clearEvents();window.reviewInput=document.querySelector('[data-set-id] input');window.reviewRow=document.querySelector('[data-set-id]');});
 const before=await proof(page),scroll=await page.evaluate(()=>document.scrollingElement.scrollTop);
 await tap(page,apply);await page.getByText('Previous values applied',{exact:false}).waitFor();
 const frames=await page.evaluate(async()=>{const values=[];for(let i=0;i<12;i++){await new Promise(requestAnimationFrame);values.push({value:window.reviewInput.value,sameInput:window.reviewInput===document.querySelector('[data-set-id] input'),sameRow:window.reviewRow===document.querySelector('[data-set-id]'),scroll:document.scrollingElement.scrollTop});}return values;});
 const applied=await proof(page),set=applied.state.activeWorkout.exercises[0].sets[0],expectedWrites=options.kind==='matching'?0:1;
 assert.equal(applied.writes.length-before.writes.length,expectedWrites,'exactly one canonical write');assert.equal(set.reps,options.kind==='timed'?45:7);assert.equal(set.weight,options.kind==='timed'||options.kind==='bodyweight'?null:90);
 assert.ok(frames.every(f=>f.sameInput&&f.sameRow),'stable nodes');assert.ok(frames.every(f=>Math.abs(f.scroll-scroll)<2),'stable scroll');
 assert.ok(frames.every(f=>f.value===frames[0].value),'no blank flash');
 const types=applied.events.map(e=>e.type);assert.ok(types.includes('pointerdown')&&types.includes('blur')&&types.includes('click'),JSON.stringify(applied.events));
 assert.ok(types.indexOf('pointerdown')<types.indexOf('blur')&&types.indexOf('blur')<types.indexOf('click'),'native pointerdown → blur → click');
 if(screenshot)await page.screenshot({path:`${out}/${browserName}-${options.width}-${options.theme}.png`});
 await tap(page,page.getByRole('button',{name:'Undo',exact:true}));await page.waitForTimeout(260);
 const undone=await proof(page);assert.deepEqual(undone.state.activeWorkout,before.state.activeWorkout);assert.deepEqual(undone.state.workouts,before.state.workouts);assert.equal(await input.inputValue(),raw);assert.equal(undone.writes.length-before.writes.length,expectedWrites*2);
 if(options.kind==='matching'){
  assert.equal(await apply.isEnabled(),true,'restored raw edit can be replaced again');await tap(page,apply);await page.waitForTimeout(260);await tap(page,page.getByRole('button',{name:'Undo',exact:true}));await page.waitForTimeout(260);
  assert.equal(await input.inputValue(),raw);assert.deepEqual((await proof(page)).state.activeWorkout,before.state.activeWorkout);assert.equal((await proof(page)).writes.length,before.writes.length);
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 results.push({browser:browserName,...options,field,raw,writes:expectedWrites,eventOrder:applied.events,frames});console.log(`PASS ${browserName} ${options.width} ${options.theme} ${options.kind||'weighted'} ${field} ${JSON.stringify(raw)}`);await context.close();
}
async function recommendationCase(browser,browserName,invalidReps){
 const options={width:390,theme:'premium-dark',kind:'recommendation'}, {page,context,errors}=await open(browser,options),row=page.locator('[data-set-id]').first(),input=row.locator(`[data-workout-field="${invalidReps?'reps':'weight'}"] input`);
 await tap(page,input);const before=await proof(page);await tap(page,page.locator('.recommendation button'));await page.waitForTimeout(260);const after=await proof(page);
 if(invalidReps){assert.deepEqual(after.state.activeWorkout,before.state.activeWorkout);assert.equal(after.writes.length,before.writes.length);assert.equal(await input.evaluate(n=>n===document.activeElement),true);}
 else{assert.equal(after.writes.length-before.writes.length,1);assert.ok(after.state.activeWorkout.exercises[0].sets.every(s=>s.weight===90));assert.equal(await input.inputValue(),'90');}
 assert.deepEqual(errors,[]);results.push({browser:browserName,...options,invalidReps});console.log(`PASS ${browserName} recommendation invalidReps=${invalidReps}`);await context.close();
}
try{
 for(const [browserName,type] of Object.entries({chromium,webkit})){
  const browser=await type.launch(browserName==='chromium'?{channel:'chrome',headless:true}:{headless:true});
  try{
   if(retry){await previousCase(browser,browserName,{width:320,theme:'premium-dark',kind:'matching',reduced:true,rirOff:true},'weight','095,50');continue;}
   for(const width of [320,390,430])for(const theme of ['standard-light','standard-dark','premium-light','premium-dark']){
    for(const [field,raw] of [['weight',''],['reps',''],['weight','53,'],['weight','082,50'],['weight','.']])await previousCase(browser,browserName,{width,theme},field,raw,field==='weight'&&raw==='');
   }
   for(const [kind,field,raw] of [['per-side','sides.left',''],['per-side','sides.right','005'],['bodyweight','weight',''],['assisted','weight','.'],['timed','reps',''],['matching','weight','095,50']])await previousCase(browser,browserName,{width:320,theme:'premium-dark',kind,reduced:true,rirOff:true},field,raw);
   await recommendationCase(browser,browserName,false);await recommendationCase(browser,browserName,true);
  }finally{await browser.close();}
 }
}finally{await writeFile(`${out}/${retry?'matching-recheck':'results'}.json`,JSON.stringify(results,null,2));}
console.log(`Passed ${results.length} real-touch browser cases`);
