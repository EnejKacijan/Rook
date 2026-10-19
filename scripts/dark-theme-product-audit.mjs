import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { blankState, weekday, isoDay, startWorkout, completeWorkout } from '../src/domain.js';
import { openProfileArea } from './qa-current-navigation.mjs';
import { inspectContrast } from './dark-theme-audit.mjs';
import { hevyCsv, hevyRow, strongCsv, genericCsv, genericRow } from './history-import-fixtures.mjs';
import { combineExample } from '../src/combineWorkouts.fixture.js';
import { createCustomExercise } from '../src/customExercises.js';

const phase=process.env.AUDIT_PHASE||'survey', base=process.env.ROOK_QA_URL||'http://127.0.0.1:5173';
const out=`artifacts/ROOK-DARK-THEME-AUDIT/${phase}`;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
const filter=(process.env.AUDIT_GROUPS||'profile,today,progress,build,scratch,active,coach').split(',');
let variant,context,page,appearance='dark';
const button=(name,scope=page)=>scope.getByRole('button',{name,exact:typeof name==='string'});
const click=async name=>button(name).click();
async function snap(name) {
 await page.evaluate(({style,appearance})=>Object.assign(document.documentElement.dataset,{appearance,style}),{style:variant.startsWith('premium')?'premium':'standard',appearance});
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
 const rows=await page.evaluate(inspectContrast);
 const record={variant,name,rows,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),headings:await page.locator('h1,h2').allTextContents()};
 if(variant.endsWith('390')||/edit-plan-exercise|logging|invalid|delete-confirm|replace-search|active-side|combine-review|import-result|photo-viewer|coach-loading/.test(name))await page.screenshot({path:`${out}/${variant}-${name}.png`});results.push(record);
 console.log(`${variant} ${name}: ${rows.filter(r=>r.ratio<r.required&&!r.disabled).length} contrast candidates`);
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
}
function fixture(kind='returning') {
 let state=kind==='new'?blankState():kind==='combine'?combineExample():createReturningUserFixture(5);
 Object.assign(state.profile,{appearancePreference:appearance,stylePreference:variant.startsWith('premium')?'premium':'standard',themePreference:variant.startsWith('premium')?'premium':appearance});
 if(kind==='new'||kind==='combine')return state;
 if(kind==='photos')state.workouts.slice(0,3).forEach((w,i)=>w.photoId=`dark-audit-photo-${i}`);
 if(kind==='custom')createCustomExercise(state,{name:'QA custom cable press',equipment:'cables',primaryMuscle:'Chest',loggingType:'weight_reps'});
 if(kind==='focus') { state.program.source='manual';state.program.goalAtCreation=null;state.progressFocusOverrideByPlanId={}; }
 if(kind==='weight') {state.profile.goal='Lose fat';state.program.goal='Lose fat';state.progressFocusOverrideByPlanId={[state.program.id]:'lose_fat'};state.weightTrackingEnabled=true;state.weightCheckins=Array.from({length:28},(_,i)=>({id:`qa-weight-${i}`,localDate:isoDay(new Date(Date.now()-(27-i)*86400000)),weightKg:80-i*.02,createdAt:Date.now()}));}
 if(kind==='transcript') {state.activeCoachConversationId='dark-qa';state.conversations=Array.from({length:12},(_,i)=>({id:`qa-message-${i}`,conversationId:'dark-qa',user:`Synthetic question ${i+1}`,reply:{text:'Synthetic answer without any training changes. '.repeat(7),action:null},createdAt:Date.now()-1000*(12-i)}));}
 state.activeWorkout=null;state.selectedDay=weekday();state.selectedDate=isoDay();
 let day=state.program.days.find(d=>d.weekday===weekday());
 if(!day){day=state.program.days[0];day.weekday=weekday();}state.program.rotationStartDate=null;
 if(kind==='empty')state.workouts=[];
 if(kind.startsWith('active')||kind==='completed'){
  if(kind==='active-side')day.exercises[0].loggingMode='per_side';
  if(kind==='active-timed'){day.exercises[0].exerciseId='plank';day.exercises[0].loggingMode='duration';day.exercises[0].durationSeconds=30;}
  if(kind==='active-bodyweight')day.exercises[0].exerciseId='push-up';
  state.activeWorkout=startWorkout(state,day);
  state.activeWorkout.exerciseIndex=0;
  state.profile.rirEnabled=true;
  if(kind==='completed'){
   state.activeWorkout.exercises.forEach(e=>e.sets.forEach(s=>{s.completed=true;s.reps=8;s.weight=20;}));state=completeWorkout(state);
   const copy=structuredClone(state.workouts.at(-1));copy.id+='-freestyle';copy.name='Freestyle workout';copy.source='freestyle';copy.workoutSource='freestyle';copy.dayId=null;copy.planDayId=null;copy.templateId=null;state.workouts.push(copy);
  }
 }
 return state;
}
async function open(kind='returning') {
 await context?.close();
 context=await browser.newContext({viewport:{width:Number(variant.split('-').at(-1)),height:844},colorScheme:appearance,serviceWorkers:'block',hasTouch:true,reducedMotion:variant.endsWith('320')?'reduce':'no-preference'});
 if(kind!=='new')await context.addInitScript(value=>localStorage.setItem('lift-v2-state',JSON.stringify(value)),fixture(kind));
 page=await context.newPage();page.setDefaultTimeout(6500);
 if(kind==='combine')await page.clock.setFixedTime(new Date('2026-09-12T12:00:00+02:00'));
 await page.route('**/api/ai/status',r=>r.fulfill({json:{available:filter.some(g=>['coach','combine','import','edges','physique'].includes(g)),provider:'local-qa-fixture'}}));
 await page.route('**/api/ai',r=>r.fulfill({json:{data:{text:'Synthetic QA response. Review proposed changes before applying them.',action:null}}}));
 await page.goto(base,{waitUntil:'networkidle'});
 if(kind==='photos'){
  const photoSeed=fixture(kind).workouts.filter(w=>w.photoId);
  await page.evaluate(async rows=>{
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('rook-workout-media',3);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');for(const w of rows)tx.objectStore('photos').put({id:w.photoId,workoutId:w.id,createdAt:w.completedAt,width:600,height:760,mimeType:'image/svg+xml',blob:new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="600" height="760"><rect width="600" height="760" fill="#315e4b"/><circle cx="300" cy="300" r="90" fill="#6d9681"/><text x="95" y="620" fill="white" font-size="28">SYNTHETIC QA IMAGE</text></svg>'],{type:'image/svg+xml'})});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  },photoSeed);await page.reload({waitUntil:'networkidle'});
 }
}
async function profile(area,entry){await open();await click('PROFILE');if(area)await openProfileArea(page,area);if(entry)await click(entry);}
async function run(name,fn){if(process.env.AUDIT_CASES&&!process.env.AUDIT_CASES.split(',').includes(name))return;try{await fn();}catch(e){results.push({variant,name,error:e.message});await page.screenshot({path:`${out}/${variant}-ERROR-${name}.png`}).catch(()=>{});console.log('FLOW ERROR',variant,name,e.message.split('\n')[0]);}}

try{for(appearance of (process.env.AUDIT_APPEARANCES||'dark').split(','))for(const style of (process.env.AUDIT_STYLES||'standard,premium').split(','))for(const width of (process.env.AUDIT_WIDTHS||'390,320').split(',').map(Number)){variant=`${style}-${appearance}-${width}`;
 if(filter.includes('profile')){
  for(const [area,entry,name] of [[null,null,'profile-root'],['program',null,'profile-program'],['training',null,'training-setup'],['preferences',null,'preferences'],['data',null,'data-backup'],['preferences',/^Logging & increments/,'logging'],['preferences',/^Appearance/,'appearance'],['training',/^Training priorities/,'priorities'],['training',/^Training restrictions/,'restrictions'],['training',/^Gym profiles/,'gym-profiles'],['training',/^Custom exercises/,'custom-exercises'],['program',/^Plan history/,'plan-history'],['program',/^Export workout plan/,'export-plan'],['program',/^Replace plan/,'replace-plan'],['data',/^Import workout history/,'history-import-source'],['data',/^Export workout history/,'history-export'],['data',/^Back up ROOK/,'backup'],['data',/^Restore backup/,'restore']]) await run(name,async()=>{await profile(area,entry);await snap(name);});
  await run('edit-plan',async()=>{await profile('program',/^Edit plan/);await snap('edit-plan');await button(/^Edit /).first().click();await snap('edit-plan-exercise');});
 }
 if(filter.includes('today')){
  await run('today',async()=>{await open();await snap('today-planned');await click('Today options');await snap('today-overflow');await click('Adjust week');await snap('adjust-week');});
  await run('rest-calendar',async()=>{await open();await page.locator('.week-strip .workout-rest').first().click();await snap('today-rest');console.log('calendar buttons',await page.locator('.week-navigation button,.week-row button').allTextContents());await button(/calendar/i).first().click();await snap('calendar');});
  await run('completed',async()=>{await open('completed');await snap('today-completed');await button(/Freestyle workout.*Finished/).click();await snap('completed-detail');await button('Delete workout').click();await snap('delete-confirm');});
 }
 if(filter.includes('progress'))for(const kind of ['empty','returning'])await run(`progress-${kind}`,async()=>{
  await open(kind);await click('PROGRESS');await snap(`progress-${kind}-top`);
  await page.getByText('WORKOUT PHOTOS',{exact:true}).scrollIntoViewIfNeeded();await snap(`progress-${kind}-photos`);
  if(kind==='returning'){
   const history=button(/View all logged exercises/);await history.click();await snap('exercise-history');await page.locator('.modal-layer .list-row').first().click();await snap('exercise-detail-history');
  }
 });
 if(filter.includes('build'))await run('build',async()=>{
  await open('new');await snap('welcome');await click('BUILD MY PLAN');await snap('build-personal');
  await page.getByRole('combobox',{name:'Age range'}).click();await snap('age-picker');await page.getByRole('option',{name:'18–29'}).click();await click('CONTINUE');await snap('build-goal');
  await click('Build muscle');await snap('build-experience');await page.waitForTimeout(360);await click(/^Beginner/);await snap('build-schedule');
  await click('3 days');await page.getByLabel('Any day works').check();await click('60 min');await snap('build-days-selected');await click('CONTINUE');await snap('build-equipment');
  await click('Commercial gym');await click('CONTINUE');await snap('build-priorities');await page.locator('.priority-emphasis-choice button').nth(0).click();await page.locator('.priority-emphasis-choice button').nth(1).click();await page.locator('.priority-emphasis-choice').scrollIntoViewIfNeeded();await snap('build-emphasis-limited');await click('Balanced');await click('CONTINUE');await snap('build-effort');
  await click(/Balanced starting point/);await click('CONTINUE');await snap('build-preferences');
  await click('Add movements or exercises to avoid');await snap('build-restrictions');await page.locator('.restriction-collapse').click();await click('Machines');await snap('build-exercise-preferences');
  await click(/I already have a preferred weekly structure/);await snap('build-specific-split');
  await button(/^Other/).click();await page.getByLabel('Other preferred split').fill('unrecognized structure');await snap('build-invalid-custom');await button('BUILD MY PLAN').scrollIntoViewIfNeeded();await snap('build-invalid-cta');
  await page.getByLabel('Other preferred split').fill('Push / Pull / Legs');await snap('build-valid-custom');await click('BUILD MY PLAN');await page.getByRole('heading',{name:'Your week is ready.',exact:true}).waitFor({timeout:45000});await snap('generated-preview');await click('Reorder');await snap('generated-reorder');
 });
 if(filter.includes('scratch'))await run('scratch',async()=>{
  await open('new');await click(/Start from scratch/i);await snap('scratch-available');for(const day of ['Mon','Wed','Fri'])await click(day);await click('CONTINUE');await snap('scratch-empty');
  const day=page.locator('[data-reorder-workout-section]').first();await button(/\+ Add (first )?exercise/i,day).click();await snap('scratch-picker');await day.getByPlaceholder('Search exercises',{exact:true}).fill('Bench Press');await snap('scratch-search');await day.getByRole('option',{name:'Bench Press',exact:true}).click();await snap('scratch-populated');
  await button('Edit warm-up for Mon',day).click();await snap('scratch-warmup');await button(/Workout options/,day).click();await snap('scratch-workout-options');
 });
 if(filter.includes('active'))await run('active',async()=>{
  await open('active');await click('RESUME WORKOUT');await snap('active-weighted');console.log('active buttons',await page.locator('.workout-screen button').allTextContents());
  await button('Exercise options').click();await snap('exercise-options');await button(/Add note|Edit note/).click();await snap('exercise-note');
 });
 if(filter.includes('active')){
  for(const kind of ['active-bodyweight','active-side','active-timed'])await run(kind,async()=>{await open(kind);await click('RESUME WORKOUT');await snap(kind);});
  await run('replace',async()=>{await open('active');await click('RESUME WORKOUT');await click('Replace');await snap('replace-picker');await click('Search all exercises');await snap('replace-search-shell');await page.getByPlaceholder('Search exercises').fill('press');await snap('replace-search');});
  await run('finish',async()=>{await open('active');await click('RESUME WORKOUT');await click('Finish');await snap('early-finish');});
  await run('timer',async()=>{await open('active');await click('RESUME WORKOUT');await button('Log set 1').click();await page.locator('.rest-timer').waitFor();await snap('rest-timer');});
  await run('illustration',async()=>{await open('active');await click('RESUME WORKOUT');await page.locator('.exercise-heading-art-button').click();await snap('illustration-viewer');});
 }
 if(filter.includes('coach'))await run('coach',async()=>{
  await open();await click('COACH');await snap('coach-initial');await page.getByLabel('Ask Coach').fill('Synthetic QA draft');await snap('coach-draft');await button('Send message').click();await page.getByText('Synthetic QA response. Review proposed changes before applying them.',{exact:true}).waitFor();await snap('coach-conversation');await button(/history/i).click();await snap('coach-history');
 });
 if(filter.includes('import'))await run('import',async()=>{
  await open('new');await page.locator('.existing-plan-action').click();await snap('import-paste');
  await page.getByPlaceholder(/Paste your workout notes/).fill('Monday: Home\nBench Press 3x8 60kg\nCable Row 3 sets\nThursday: Gym\nSuperset: Pull Up 3xAMRAP + Push Up 3x12');await click('CREATE PREVIEW');
  await snap('import-result');await page.locator('.plan-editor-exercise').first().getByRole('button',{name:/^Edit /}).click();await snap('import-edit-source');
 });
 if(filter.includes('import'))for(const [name,source]of [
  ['alternatives','Monday: Upper\nLeg Press 3x9 155kg / Leg press machine 3x8 173kg'],
  ['ai-offer','Monday: Upper\nBench Press 3x8\nPo želji še na koncu do failure dipsi']
 ])await run(`import-${name}`,async()=>{
  await open('new');await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(source);await click('CREATE PREVIEW');await snap(`import-${name}`);
  if(name==='ai-offer'){
   await page.unroute('**/api/ai');await page.route('**/api/ai',r=>{const b=r.request().postDataJSON();return r.fulfill({json:{data:{fragments:b.payload.fragments.map(f=>({id:f.id,kind:'exercise',nameQuote:'dipsi',facts:[{kind:'optional',value:'true',evidence:'Po želji'},{kind:'failure',value:'true',evidence:'do failure'}]}))}}});});
   await click('INTERPRET WITH AI');await page.locator('.import-resolution').waitFor();await snap('import-grouped-optional');
  }
 });
 if(filter.includes('history'))for(const [source,content]of [['hevy',hevyCsv([hevyRow({exercise_title:'Bench Press'}),hevyRow({exercise_title:'Mystery QA movement'})])],['strong',strongCsv()],['generic',genericCsv([genericRow()])]])await run(`history-${source}`,async()=>{
  await profile('data',/^Import workout history/);await button(source==='generic'?/Other CSV|Other app|Generic/i:new RegExp('^'+source,'i')).click();await snap(`history-${source}-upload`);await page.locator('input[type=file]').setInputFiles({name:`synthetic-${source}.csv`,mimeType:'text/csv',buffer:Buffer.from(content)});await page.getByRole('heading',{name:/Review import|Check columns & units/}).waitFor();
  if(await button('REVIEW IMPORT').isVisible()){await snap(`history-${source}-mapping`);await page.getByText('Review column mapping',{exact:true}).click();await snap(`history-${source}-columns`);if(source==='strong'){await page.getByLabel('Weight unit when absent from file').selectOption('kg');await page.getByLabel('Distance unit when absent from file').selectOption('km');}await click('REVIEW IMPORT');}
  await page.getByRole('heading',{name:'Review import',exact:true}).waitFor();await snap(`history-${source}-review`);
  await page.getByText(/Preview factual history/).click();await snap(`history-${source}-facts`);
  await button(/^IMPORT \d+ WORKOUT/).click();await page.getByRole('heading',{name:/workouts? imported/}).waitFor();await snap(`history-${source}-success`);
 });
 if(filter.includes('combine'))await run('combine',async()=>{
  await open('combine');await click('COACH');
  const send=async text=>{const count=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).conversations.length);await page.getByLabel('Ask Coach').fill(text);await button('Send message').click();await page.waitForFunction(n=>{const c=JSON.parse(localStorage.getItem('lift-v2-state')).conversations;return c.length>n&&c.at(-1).reply;},count);};
  await send('Combine Push and Pull');await snap('combine-time');await page.clock.setFixedTime(new Date('2026-09-12T12:00:03+02:00'));await send('60 min');await snap('combine-proposal');
  await button('REVIEW COMBINED WORKOUT').last().click();await page.locator('.combine-review-surface').waitFor();await snap('combine-review');await click('USE THIS WORKOUT');await page.getByText('Combined workout applied',{exact:true}).waitFor();await snap('combine-applied');await click('TODAY');await snap('combined-today');await click('START WORKOUT');await page.locator('.workout-screen').waitFor();await snap('combined-active');
 });
 if(filter.includes('photos'))await run('photos',async()=>{
  await open('photos');await click('PROGRESS');await page.locator('.workout-photo-entry-section').scrollIntoViewIfNeeded();await snap('progress-photo-populated');await page.locator('.workout-photo-entry-section button').click();await page.locator('.workout-photo-timeline-item img.is-ready').first().waitFor();await snap('photo-timeline');await page.locator('.workout-photo-timeline-item').first().click();await page.getByRole('dialog',{name:'Workout photo',exact:true}).waitFor();await snap('photo-viewer');await button('DELETE PHOTO').click();await snap('photo-delete-confirm');
 });
 if(filter.includes('custom'))await run('custom',async()=>{
  await open('custom');await click('PROFILE');await openProfileArea(page,'training');await click(/^Custom exercises/);await click(/QA custom cable press/);await snap('custom-exercise-editor');await button('Delete exercise').scrollIntoViewIfNeeded();await snap('custom-exercise-actions');await click('Delete exercise');await snap('custom-delete-confirm');
 });
 if(filter.includes('edges')){
  await run('progress-sections',async()=>{await open();await click('PROGRESS');for(const [selector,name]of [['.goal-progress-section','goal-progress'],['.progression-overview','progression'],['.recent-improvements-section','recent-improvements'],['.working-weights-section','working-weights']]){if(await page.locator(selector).count()){await page.locator(selector).scrollIntoViewIfNeeded();await snap(name);}}await page.locator('.working-weights-section .list-row').first().click();await page.locator('.modal-layer').evaluate(e=>e.scrollTop=e.scrollHeight);await snap('exercise-detail-chart');});
  await run('focus',async()=>{await open('focus');await click('PROGRESS');await click('CHOOSE FOCUS');await snap('progress-focus');});
  await run('weight',async()=>{await open('weight');await click('PROGRESS');await click('Open weight history');await snap('weight-chart');await click('ADD WEIGHT');await snap('weight-input');await click('SAVE');await snap('weight-invalid');});
  await run('coach-states',async()=>{
   await open('transcript');await click('COACH');await snap('coach-long-transcript');await button(/history/i).click();await page.locator('.coach-history-group button').first().click();await snap('coach-history-conversation');
   // Test the existing visualViewport contract, NOT an actual iOS keyboard.
   await page.evaluate(()=>{const vv=new EventTarget();Object.assign(vv,{height:500,width:innerWidth,offsetTop:0,offsetLeft:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:vv});window.dispatchEvent(new Event('resize'));vv.dispatchEvent(new Event('resize'));});
   await page.getByLabel('Ask Coach').fill('Synthetic multiline draft\nSecond line');await snap('coach-keyboard-emulated');
   await page.unroute('**/api/ai');let release;const gate=new Promise(r=>release=r);await page.route('**/api/ai',async r=>{await gate;await r.fulfill({status:503,json:{error:'Synthetic QA provider unavailable. Try again.'}});});await button('Send message').click();await button('Sending message').waitFor();await snap('coach-loading');release();await button('Send message').waitFor();await snap('coach-failed');
   await page.getByLabel('Ask Coach').fill('Retry synthetic question');await snap('coach-retry-ready');
  });
  await run('history-error',async()=>{await profile('data',/^Import workout history/);await button(/^Hevy/).click();await page.locator('input[type=file]').setInputFiles({name:'synthetic-invalid.csv',mimeType:'text/csv',buffer:Buffer.from('invalid\nrow')});await page.getByRole('alert').waitFor();await snap('history-error');});
  await run('active-warmup',async()=>{await open('active');await click('RESUME WORKOUT');await button(/^Warm-up/).click();await snap('active-warmup');});
  await run('input-states',async()=>{await profile('program',/^Edit plan/);await button(/^Edit /).first().click();const input=page.locator('.plan-editor input').first();await input.focus();await page.keyboard.press('Tab');await snap('editor-keyboard-focus');const target=button(/^Done/).first();if(await target.isVisible()){await target.hover();await snap('editor-hover');const box=await target.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await snap('editor-pressed');await page.mouse.up();}});
 }
 if(filter.includes('physique'))await run('physique',async()=>{
  await profile('training',/^Training priorities/);await page.locator('.physique-review-entry').click();await snap('physique-intro');await click('CONTINUE');await snap('physique-upload');
  await page.locator('.photo-inputs input').first().setInputFiles({name:'synthetic-pixel.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')});await page.getByText('synthetic-pixel.png · ready',{exact:true}).waitFor();
  await page.unroute('**/api/ai');await page.route('**/api/ai',r=>r.fulfill({json:{data:{status:'success',summary:'Synthetic optional suggestions, not objective conclusions.',suggestions:[{priorityId:'upper_chest',priorityLevel:'moderate',reason:'Synthetic optional emphasis.'},{priorityId:'lateral_delts',priorityLevel:'moderate',reason:'Synthetic optional emphasis.'}]}}}));await click('REVIEW PHOTOS');await page.locator('.physique-suggestions').waitFor();await snap('physique-selected');await page.locator('.physique-suggestions button').first().click();await snap('physique-unselected');
 });
 if(filter.includes('auxiliary')){
  await run('adjust-time',async()=>{await open();await click('ADJUST TODAY');await snap('adjust-today-options');await button(/Less time/).click();await snap('adjust-time');await page.locator('.adjust-chip-grid button').first().click();await snap('adjust-time-selected');await click('Custom');await snap('adjust-time-custom');});
  await run('scratch-drag',async()=>{await open('new');await click(/Start from scratch/i);for(const day of ['Mon','Wed','Fri'])await click(day);await click('CONTINUE');const handle=page.locator('.plan-workout-drag-surface').first();await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox(),cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+4,y:box.y+22}]});await page.locator('.plan-reorder-preview.workout').waitFor();await snap('scratch-drag-active');await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.locator('.plan-reorder-preview').waitFor({state:'detached'});await snap('scratch-drag-cancelled');});
 }
} }finally{await context?.close();await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
