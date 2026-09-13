import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const base=process.env.ROOK_QA_URL||'http://127.0.0.1:4177',phase=process.env.ROOK_HIERARCHY_PHASE||'after';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/scratch-hierarchy';
await mkdir(`${out}/screenshots`,{recursive:true});await mkdir(`${out}/traces`,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{for(const width of phase==='before'?[390]:[320,390])for(const style of phase==='before'?['standard']:['standard','premium'])for(const appearance of phase==='before'?['dark']:['light','dark'])for(const count of phase==='before'?[3]:[3,6]){
 const key=`${phase}-${width}-${style}-${appearance}-${count}`;
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'});
 await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
 await context.tracing.start({screenshots:true,snapshots:true});
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
 await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto(base);
 await p.getByRole('button',{name:/Start from scratch/i}).click();
 const selectedDays=count===3?['Mon','Wed','Fri']:['Mon','Tue','Wed','Thu','Fri','Sat'];
 for(const name of selectedDays)await p.getByRole('button',{name,exact:true}).click();
 await p.getByRole('button',{name:'CONTINUE',exact:true}).click();
 await p.evaluate(({style,appearance})=>Object.assign(document.documentElement.dataset,{style,appearance}),{style,appearance});
 const root=p.locator('.scratch-editor-screen'),days=root.locator('[data-reorder-workout-section]');
 let immediateScroll;
 if(phase==='after'){
  await root.waitFor({state:'visible'});
  await root.evaluate(e=>{window.scratchFirstScroll={readyAt:performance.now(),before:e.scrollTop};e.addEventListener('touchstart',()=>window.scratchFirstScroll.touchAt=performance.now(),{once:true,passive:true});e.addEventListener('scroll',()=>window.scratchFirstScroll.scrolledAt=performance.now(),{once:true,passive:true});});
  const cdp=await context.newCDPSession(p),touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:x==null?[]:[{x,y}]});
  await touch('touchStart',width-65,530);for(let i=1;i<=8;i++){await touch('touchMove',width-65,530-22*i);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));}await touch('touchEnd');
  immediateScroll=await root.evaluate(e=>({...window.scratchFirstScroll,after:e.scrollTop}));assert.ok(immediateScroll.after-immediateScroll.before>20,'first intentional swipe scrolls');assert.ok(immediateScroll.scrolledAt>=immediateScroll.touchAt);
  await root.evaluate(e=>e.scrollTo({top:0,behavior:'instant'}));
 }
 const settle=()=>p.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
 const snap=async name=>{await settle();if(count===3&&(width===390&&style==='standard'&&appearance==='dark'||phase==='after'&&name==='initial'))await p.screenshot({path:`${out}/screenshots/${key}-${name}.png`});};
 await snap('initial');
 const firstAction=await days.first().getByRole('button',{name:'+ Add first exercise',exact:true}).boundingBox();
 const footer=await root.locator('.sheet-action-footer').boundingBox();
 if(phase==='before'){
  await days.first().scrollIntoViewIfNeeded();await snap('empty-day');
  results.push({key,firstAction,footer});await context.tracing.stop({path:`${out}/traces/${key}.zip`});await context.close();continue;
 }
 assert.ok(firstAction.y>=0&&firstAction.y+firstAction.height<footer.y,'first add action visible above footer');
 assert.equal(await root.getByText('MANUAL PLAN',{exact:true}).count(),0);
 assert.equal(await root.getByText('Build your week.',{exact:true}).count(),1);
 assert.equal(await root.locator('.sheet-action-footer').getByRole('button').count(),1);
 assert.equal(await root.getByRole('button',{name:'USE THIS PLAN',exact:true}).isDisabled(),true);
 assert.equal(await root.locator('.scratch-day-status').count(),0);
 assert.equal(await root.locator('.plan-workout-tools .plan-workout-overflow').count(),0);
 assert.equal(await root.locator('.plan-workout-reorder-bar .plan-workout-overflow').count(),count);
 assert.equal(await root.getByText('Warm-up · Automatic',{exact:true}).count(),count);
 for(const day of await days.all()){
  const handle=day.locator('.plan-workout-drag-surface'),options=day.getByRole('button',{name:/Workout options/});
  const geometry=await options.boundingBox();assert.ok(geometry.height>=44&&geometry.width>=44);
  assert.equal(await options.getAttribute('data-reorder-kind'),null);assert.equal(await handle.getAttribute('data-reorder-kind'),'workout');
  const add=await day.locator('.plan-workout-add').boundingBox(),warmup=await day.locator('.scratch-warmup-row').boundingBox();assert.ok(warmup.y>=add.y+add.height);
 }
 await days.first().scrollIntoViewIfNeeded();await snap('empty-day');
 const warmups=root.getByLabel('Recommended warm-ups',{exact:true}),warmupLabel=root.locator('.plan-warmup-preference .setting-switch');await warmupLabel.click();assert.equal(await warmups.isChecked(),false);assert.equal(await root.getByText('Warm-up · Off',{exact:true}).count(),count);await warmupLabel.click();assert.equal(await warmups.isChecked(),true);
 await days.first().getByRole('button',{name:/Workout options/}).click();await p.getByRole('button',{name:'Collapse workout',exact:true}).click();await p.locator('.plan-workout-actions-sheet').waitFor({state:'detached'});
 assert.equal(await days.first().locator('.scratch-warmup-row').count(),0);await days.first().getByRole('button',{name:/Workout options/}).click();await p.getByRole('button',{name:'Expand workout',exact:true}).click();await p.locator('.plan-workout-actions-sheet').waitFor({state:'detached'});
 const add=async(day,name)=>{await day.getByRole('button',{name:/\+ Add (first )?exercise/i}).click();await day.getByPlaceholder('Search exercises',{exact:true}).fill(name);await day.getByRole('option',{name,exact:true}).click();};
 await add(days.first(),'Bench Press');await snap('mixed');
 const warmup=days.first().locator('.scratch-warmup-row');await warmup.getByRole('button',{name:'Edit warm-up for Mon',exact:true}).click();await warmup.locator('.plan-warmup-editor').waitFor();
 assert.equal(await warmup.getByText('Warm-up · Recommended',{exact:true}).count(),1);
 await warmup.getByRole('button',{name:'+ ADD MOVEMENT',exact:true}).click();await warmup.getByLabel(/Warm-up movement/).last().fill('Owner custom preparation');assert.equal(await warmup.getByText('Warm-up · Custom',{exact:true}).count(),1);
 await warmup.getByRole('button',{name:'Finish editing warm-up for Mon',exact:true}).click();
 for(let i=1;i<count;i++)await add(days.nth(i),i===1?'Squat':'Seated Cable Row');
 const longName='Upper strength and technique with controlled tempo';await days.first().getByRole('textbox',{name:'Mon workout name',exact:true}).fill(longName);
 await p.setViewportSize({width,height:500});await days.first().getByRole('textbox',{name:'Mon workout name',exact:true}).focus();assert.equal(await days.first().getByRole('textbox',{name:'Mon workout name',exact:true}).inputValue(),longName);assert.equal(await root.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);await p.setViewportSize({width,height:844});
 await root.getByRole('button',{name:'USE THIS PLAN',exact:true}).scrollIntoViewIfNeeded();assert.equal(await root.getByRole('button',{name:'USE THIS PLAN',exact:true}).isEnabled(),true);await snap('ready');
 assert.equal(await root.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);assert.deepEqual(errors,[]);
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')||'null')?.program||null),null);
 await root.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await root.waitFor({state:'detached'});await p.reload();
 const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.equal(saved.program.days.length,count);assert.ok(saved.program.days.every(d=>d.exercises.length===1));assert.equal(saved.program.days[0].workoutName,longName);assert.ok(saved.program.days[0].warmupPlan.items.some(i=>i.label==='Owner custom preparation'));
 results.push({key,passed:true,firstAction,footer,immediateScroll,customWarmup:true,collapseExpand:true,saveReload:true});console.log('PASS',key);
 await context.tracing.stop({path:`${out}/traces/${key}.zip`});await context.close();
}}finally{await browser.close();await writeFile(`${out}/${phase}-results.json`,JSON.stringify(results,null,2));}
