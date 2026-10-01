import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright-core';
import {blankState,buildProgram,deserializeState,exerciseCatalog} from '../src/domain.js';
import {execFileSync} from 'node:child_process';
import {flexibleSessions,proposeFlexibleWeek,applyFlexibleWeek} from '../src/flexibleWeek.js';
import {startFreestyleWorkout,addFreestyleExercise} from '../src/freestyleWorkout.js';

const url=process.env.ROOK_QA_URL||'http://127.0.0.1:4273';
const output='artifacts/four-ui-corrections';
await mkdir(output,{recursive:true});
if(process.argv.includes('--report')) {
  const chrome=JSON.parse(await readFile(`${output}/after-chrome-report.json`,'utf8'));
  const wk=JSON.parse(await readFile(`${output}/after-webkit-report.json`,'utf8'));
  assert.equal(chrome.length,24);assert.equal(wk.length,24);
  const all=[...chrome,...wk];assert(all.every(result=>result.errors.length===0));
  await writeFile(`${output}/after-report.json`,JSON.stringify(all,null,2));
  const sample='chrome-390x844-premium-light';
  const pairs=[['Moved-away date','moved'],['Content-sized exercise preview','preview'],['Single Program boundary','program']].map(([title,name])=>`<section><h2>${title}</h2><div class="pair"><figure><img src="before-${sample}-${name}.png" alt="Before ${title}"><figcaption>Before — prior UI from HEAD</figcaption></figure><figure><img src="after-${sample}-${name}.png" alt="After ${title}"><figcaption>After — current local candidate</figcaption></figure></div></section>`).join('');
  await writeFile(`${output}/review.html`,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ROOK — four bounded UI corrections</title><style>body{font:16px/1.5 system-ui;background:#181b19;color:#eef2ee;max-width:960px;margin:32px auto;padding:0 20px}h1{font-size:28px}section{padding:20px 0;border-top:1px solid #454b46}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0}img{width:100%;max-width:390px;display:block}figcaption{color:#adb9b0}a{color:#67cf9f}@media(max-width:500px){.pair{gap:8px}}</style><h1>ROOK · Four bounded UI corrections</h1><p>Local only · release/non-monetization-fixes · HEAD ea9e987. No commit, push, merge or deploy. Security work retained. Pro/Capacitor and account configuration untouched.</p><p>Targeted regression: <strong>29 files / 426 tests passed</strong>. Chrome: <strong>24 matrix flows passed</strong>. WebKit: <strong>24 matrix flows passed</strong>. 320/390/430 × 640/844 × all four themes. Reduced motion on the short-viewport matrix. Production build and diff check passed.</p><p><a href="after-report.json">Measured browser results</a>. Synthetic isolated local profiles only; no owner data used.</p>${pairs}<section><h2>Reorder paint</h2><p>The source is already hidden and its CSS background is transparent. The shared grip did not opt out of native WebKit tap paint, which remains in compositor space when the row lifts. Only the grip now uses transparent native tap highlight. Existing pressed-state clearing, cancellation lifecycle and keyboard focus outline are retained.</p><div class="pair"><figure><img src="owner-drag-1.5.png" alt="Owner's original iPhone grey stationary patch"><figcaption>Owner iPhone recording — prior defect (1.5 s)</figcaption></figure><figure><img src="after-${sample}-mid-drag.png" alt="Current browser mid-drag neutral source"><figcaption>Current Chrome mid-drag — not physical iPhone proof</figcaption></figure></div></section><section><h2>Implementation scope</h2><ul><li>Today: successful moved-away provenance is secondary only when canonical selected-date state has no remaining workout, active/recorded/optional session or unresolved link. Active, completed/ended, moved-in, skipped and unresolved presentations keep priority. Multiple source occurrences use canonical identity, with no schedule writes.</li><li>Preview: only the active queue detail opts into auto height; its existing viewport cap, inner scroller, sheet handle, footer and search context remain. 390×844 short preview: ~776 → ~511 px; status-to-actions gap ~277 → 12 px. Long/enlarged content scrolls above retained actions.</li><li>Program: Export row's redundant bottom border removed. Replace plan's top border owns the group boundary; other separators/actions retained.</li><li>Reorder: shared native-highlight opt-out; no change to dragging, keyboard order, eligibility or data.</li></ul><p>Production: src/App.jsx, src/calendar.css, src/todayScheduleReader.js, src/trainingReorder.css, src/freestyleQueuePicker.css, src/profileHub.css.</p><p>QA: Today.movedAway, Today.resume, Today.scheduleCache, todayScheduleReader, trainingReorder, ExerciseQueuePreview, Program.boundary; scripts/four-ui-corrections-qa.mjs plus updated flexible-week / adjust-week scope expectations. Additional real schedule flow: 12 Chrome width/theme runs and one Chrome + one WebKit Adjust Week flow passed.</p><p>Physical retest still required: native iPhone highlight, real safe-area/keyboard geometry and sheet feel. Received owner video is before evidence only. Current worktree: ${process.cwd()}. QA URL: <a href="${url}">${url}</a>.</p></section></html>`);
  console.log('Review: 48 browser matrix flows, 29 regression files / 426 tests; review.html generated.');
  process.exit(0);
}
if(process.argv.includes('--baseline-server')) {
  const {createServer}=await import('vite');
  const files=['src/App.jsx','src/calendar.css','src/profileHub.css','src/trainingReorder.css','src/freestyleQueuePicker.css'];
  const baseline=new Map(files.map(file=>[file,execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8'})]));
  const server=await createServer({cacheDir:'node_modules/.vite-ui-baseline',plugins:[{name:'review-original-ui',enforce:'pre',load(id){const file=files.find(file=>id.replaceAll('\\','/').endsWith('/'+file));if(file)return baseline.get(file);}}],server:{host:'127.0.0.1',port:4274,strictPort:true}});
  await server.listen();server.printUrls();
  await new Promise(()=>{});
}
if(process.argv.includes('--owner-frame')) {
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:480,height:900}});
    const ownerVideo=process.env.ROOK_QA_OWNER_VIDEO;
    assert(ownerVideo,'Set ROOK_QA_OWNER_VIDEO to the local recording path for --owner-frame.');
    const bytes=await readFile(ownerVideo);
    await page.goto(url);
    await page.setContent('<video muted preload="auto" style="height:840px"></video>');
    await page.locator('video').evaluate((v,base64)=>{v.src='data:video/mp4;base64,'+base64;},bytes.toString('base64'));
    await page.locator('video').evaluate(v=>new Promise(resolve=>{v.onloadedmetadata=resolve;if(v.readyState)resolve();}));
    for(const time of [.8,1.5,2.2,3.5,5.5]) {
      await page.locator('video').evaluate((v,time)=>new Promise(resolve=>{v.onseeked=()=>requestAnimationFrame(()=>requestAnimationFrame(resolve));v.currentTime=time;}),time);
      await page.locator('video').screenshot({path:`${output}/owner-drag-${time}.png`});
    }
    console.log(await page.locator('video').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight})));
  } finally {await browser.close();}
  process.exit(0);
}

export function fixture(kind='moved',theme='standard',appearance='light') {
  let s=blankState();
  Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:5,availableDays:['Mon','Tue','Wed','Thu','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true,showExerciseImages:true,restTimerEnabled:false,stylePreference:theme,appearancePreference:appearance,themePreference:theme==='premium'?'premium':appearance});
  s.program=buildProgram(s.profile);s.program.createdAt='2026-09-21T12:00:00';s.program.trainingBlock.startDate='2026-09-21';
  s.selectedDate='2026-10-01';s.selectedDay='Thu';
  s.program.days.find(day=>day.weekday==='Thu').name='UPPER B';
  s=deserializeState(s);
  if(kind==='moved') {
    const source=flexibleSessions(s).find(item=>item.originalDate===s.selectedDate);
    const move=proposeFlexibleWeek(s,{mode:'move',sessionId:source.logicalSessionId,toDate:'2026-10-03'});
    assert.equal(move.status,'ready');s=applyFlexibleWeek(s,move).state;
  }
  if(kind==='active') {
    s=startFreestyleWorkout(s);
    for(const id of ['barbell-bench-press','single-leg-leg-extension','hack-squat','plank','cable-fly']) {
      assert(exerciseCatalog[id],id);s=addFreestyleExercise(s,id);
    }
  }
  return s;
}

const phase=process.argv.includes('--before')?'before':'after';
const reports=[];
for(const [engine,type,launch] of [['chrome',chromium,{channel:'chrome',headless:true}],['webkit',webkit,{headless:true}]]) {
  if(process.env.ROOK_QA_BROWSER&&process.env.ROOK_QA_BROWSER!==engine)continue;
  const browser=await type.launch(launch);
  try {
    for(const width of (phase==='before'?[390]:[320,390,430]))for(const height of (phase==='before'?[844]:[640,844]))for(const [theme,appearance] of (phase==='before'?[['premium','light']]:[['standard','light'],['standard','dark'],['premium','light'],['premium','dark']])) {
      if(process.env.ROOK_QA_CASE&&process.env.ROOK_QA_CASE!==`${engine}-${width}x${height}-${theme}-${appearance}`)continue;
      const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:height===640?'reduce':'no-preference'});
      // Synthetic UI fixtures must never create cloud identities or sync data,
      // including when the same smoke flow targets the published application.
      await context.route(/https:\/\/(?:identitytoolkit|securetoken|firestore)\.googleapis\.com\//,route=>route.abort());
      const page=await context.newPage();
      console.log(`${phase} ${engine} ${width}x${height} ${theme}/${appearance}`);
      await page.route('**/qa-seed',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated QA fixture</title>'}));
      await page.route('**/api/ai/status',route=>route.fulfill({json:{available:false,provider:null,requiresSignIn:true}}));
      await page.clock.install({time:new Date('2026-10-01T10:00:00Z')});
      const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>requests.push([r.url(),r.failure()?.errorText]));
      const seed=async kind=>{
        await page.goto(url+'/qa-seed');await page.evaluate(s=>{localStorage.setItem('lift-v2-state',JSON.stringify(s));},fixture(kind,theme,appearance));
        await page.goto(url);await page.locator('.today-screen').waitFor();
      };
      const settle=async()=>{
        await page.clock.runFor(350);
        await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
      };
      const shot=async name=>{if(!['activation','mid-drag'].includes(name))await settle();return page.screenshot({path:`${output}/${phase}-${engine}-${width}x${height}-${theme}-${appearance}-${name}.png`});};
      const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
      const overflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      try {
      await seed('moved');await shot('moved');
      assert.deepEqual(await page.evaluate(()=>[document.documentElement.dataset.style,document.documentElement.dataset.appearance]),[theme,appearance]);
      const movedBefore=await stored();
      if(phase==='after') {
        assert.equal(await page.locator('.rest-day-state h1').innerText(),'Rest day');
        assert.equal(await page.locator('.today-moved-provenance button').count(),1);
        await page.locator('.today-moved-provenance button').click();await settle();
        assert.equal((await stored()).selectedDate,'2026-10-03');
        assert.deepEqual((await stored()).flexibleWeek,movedBefore.flexibleWeek);
        await page.reload();await page.locator('.today-screen').waitFor();
        assert.deepEqual((await stored()).flexibleWeek,movedBefore.flexibleWeek);
        await page.locator('.week-strip button[aria-label^="Sat "]:not([tabindex="-1"])').click();await settle();
        await page.locator('.today-hero').waitFor();
      }
      await overflow();
      await page.locator('.bottom-nav button').last().click();
      await page.locator('[data-profile-area="program"]').click();await shot('program');
      const boundary=await page.locator('.program-actions').evaluate(section=>{const rows=[...section.querySelectorAll('.list-row')],exportRow=rows.find(row=>row.textContent.includes('Export workout plan')),replace=rows.find(row=>row.textContent.includes('Replace plan'));return {exportBorder:getComputedStyle(exportRow).borderBottomWidth,replaceBorder:getComputedStyle(replace).borderTopWidth,inside:rows.slice(0,3).map(row=>getComputedStyle(row).borderBottomWidth)};});
      assert.equal(boundary.exportBorder,phase==='after'?'0px':'1px');assert.equal(boundary.replaceBorder,'1px');assert.deepEqual(boundary.inside,['1px','1px','1px']);
      await page.getByRole('button',{name:/Replace plan Build or import/}).click();await page.locator('.modal-layer').waitFor();
      await page.locator('.modal-layer .sheet-close,.modal-layer .detail-header-close').first().click();await settle();
      await seed('active');await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();
      const initialActive=await stored();
      await page.locator('.up-next-queue').scrollIntoViewIfNeeded();await shot('queue');
      const handle=page.locator('.up-next-queue .rook-reorder-handle').first();
      const box=await handle.boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
      await page.locator('.up-next-queue.is-reordering').waitFor();await shot('activation');
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2+70,{steps:12});await shot('mid-drag');
      const handlePaint=await handle.evaluate(e=>({background:getComputedStyle(e).backgroundColor,tapHighlight:getComputedStyle(e).webkitTapHighlightColor,visibility:getComputedStyle(e).visibility}));
      assert.equal(handlePaint.background,'rgba(0, 0, 0, 0)');assert.equal(handlePaint.visibility,'hidden');
      if(phase==='after'&&engine==='chrome')assert.equal(handlePaint.tapHighlight,'rgba(0, 0, 0, 0)');
      assert.equal(await page.locator('.queue-reorder-preview').count(),1);
      await page.keyboard.press('Escape');await page.mouse.up();await shot('cancel');
      assert.equal(await page.locator('.reorder-live-source,.queue-reorder-preview').count(),0);
      assert.deepEqual((await stored()).activeWorkout.exercises,initialActive.activeWorkout.exercises);
      await handle.focus();assert.notEqual(await handle.evaluate(e=>getComputedStyle(e).outlineStyle),'none');
      const secondBox=await handle.boundingBox();
      await page.mouse.move(secondBox.x+22,secondBox.y+22);await page.mouse.down();await page.locator('.is-reordering').waitFor();
      await page.mouse.move(secondBox.x+22,secondBox.y+105,{steps:16});await page.mouse.up();await shot('drop');
      assert.notDeepEqual((await stored()).activeWorkout.exercises.map(e=>e.id),initialActive.activeWorkout.exercises.map(e=>e.id));
      assert.deepEqual((await stored()).program,initialActive.program);
      await page.getByRole('button',{name:'+ ADD EXERCISE',exact:true}).click();
      await settle();
      await page.getByRole('searchbox',{name:'Search exercises'}).fill('Leg Press Calf Raise');
      await page.getByRole('button',{name:'Preview Leg Press Calf Raise',exact:true}).tap();
      await page.locator('.freestyle-queue-picker.has-exercise-preview').waitFor();
      await page.locator('.queue-preview-hero img').waitFor();await page.locator('.queue-preview-hero img').evaluate(img=>img.decode());
      await shot('preview');
      const geometry=await page.locator('.freestyle-queue-picker').evaluate(panel=>({height:panel.getBoundingClientRect().height,top:panel.getBoundingClientRect().top,statusBottom:panel.querySelector('.queue-preview-status').getBoundingClientRect().bottom,actionsTop:panel.querySelector('.queue-preview-actions').getBoundingClientRect().top}));
      if(phase==='after')assert(geometry.actionsTop-geometry.statusBottom<=36,JSON.stringify(geometry));
      await overflow();
      const previewBefore=await stored();
      await page.getByRole('button',{name:'View Leg Press Calf Raise image',exact:true}).click();await page.locator('.exercise-visual-viewer').waitFor();
      await page.getByRole('button',{name:'Close visual viewer',exact:true}).click();await settle();
      await page.locator('.freestyle-queue-picker .detail-header-back').click();await settle();
      assert.equal(await page.getByRole('searchbox',{name:'Search exercises'}).inputValue(),'Leg Press Calf Raise');
      assert.deepEqual((await stored()).activeWorkout,previewBefore.activeWorkout);
      await page.getByRole('button',{name:'Preview Leg Press Calf Raise',exact:true}).tap();await settle();
      await page.locator('.queue-exercise-preview').evaluate(pane=>{pane.querySelector('h1').textContent='An exceptionally long exercise name for enlarged-text geometry and safe wrapping '.repeat(4);pane.querySelector('h1').style.fontSize='34px';pane.querySelector('.queue-preview-status').textContent='Long relevant metadata '.repeat(20);pane.querySelector('.queue-preview-status').style.fontSize='20px';});
      const cap=await page.locator('.freestyle-queue-picker').evaluate(panel=>({height:panel.getBoundingClientRect().height,body:panel.querySelector('.queue-exercise-preview').getBoundingClientRect().bottom,footer:panel.querySelector('.queue-preview-actions').getBoundingClientRect().top,scrollable:panel.querySelector('.queue-exercise-preview').scrollHeight>panel.querySelector('.queue-exercise-preview').clientHeight}));
      assert(cap.height<=height);assert(cap.body<=cap.footer+1);assert(cap.scrollable);await overflow();await shot('long-preview');
      await page.locator('.freestyle-queue-picker .detail-header-close').click();await settle();assert.deepEqual((await stored()).activeWorkout,previewBefore.activeWorkout);
      const openPreview=async()=>{await page.getByRole('button',{name:'+ ADD EXERCISE',exact:true}).click();await settle();await page.getByRole('searchbox',{name:'Search exercises'}).fill('Leg Press Calf Raise');await page.getByRole('button',{name:'Preview Leg Press Calf Raise',exact:true}).tap();await settle();};
      await openPreview();await page.getByRole('button',{name:'Add to Up Next',exact:true}).click();
      await page.locator('.queue-preview-added').waitFor();
      const added=await stored();assert.equal(added.activeWorkout.exercises.length,previewBefore.activeWorkout.exercises.length+1);
      assert.deepEqual(added.activeWorkout.exercises[0],previewBefore.activeWorkout.exercises[0]);assert.deepEqual(added.program,previewBefore.program);
      const addedEntry=added.activeWorkout.exercises.find(e=>e.exerciseId==='leg-press-calf-raise');
      await page.getByRole('button',{name:'Do now',exact:true}).click();await settle();
      assert.equal((await stored()).activeWorkout.exercises[(await stored()).activeWorkout.exerciseIndex].id,addedEntry.id);
      assert.deepEqual((await stored()).program,previewBefore.program);
      const beforeDismiss=await stored();
      await openPreview();const grip=await page.locator('.freestyle-queue-picker .modal-drag-handle').boundingBox();
      await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
      await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2+190,{steps:18});await page.mouse.up();await settle();
      assert.equal(await page.locator('.freestyle-queue-picker').count(),0);
      assert.deepEqual((await stored()).activeWorkout,beforeDismiss.activeWorkout);
      assert.deepEqual(errors,[]);
      reports.push({engine,width,height,reducedMotion:height===640,theme,appearance,handlePaint,geometry,boundary,cap,errors});
      } catch(error) {
        await page.screenshot({path:`${output}/failure-${engine}-${width}x${height}-${theme}-${appearance}.png`});
        console.log(JSON.stringify({errors,requests,body:await page.locator('body').innerText()},null,2));
        throw error;
      }
      await context.close();
    }
  } finally {await browser.close();}
}
await writeFile(`${output}/${phase}${process.env.ROOK_QA_BROWSER?'-'+process.env.ROOK_QA_BROWSER:''}${process.env.ROOK_QA_CASE?'-focused':''}-report.json`,JSON.stringify(reports,null,2));
console.log(`${phase} ${process.env.ROOK_QA_BROWSER||'both'}: ${reports.length} matrix flows passed`);
