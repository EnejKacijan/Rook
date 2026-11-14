
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { adjustWeekReorderState } from '../src/fixtures/adjustWeekReorderState.js';
import { addCalendarDays } from '../src/flexibleWeek.js';

const origin = process.env.ROOK_QA_URL || 'http://127.0.0.1:4175';
const observationOnly = process.argv.includes('--observe');
const onlyWidth = Number(process.env.ROOK_QA_WIDTH || 0);
const historyCount = Number(process.env.ROOK_QA_HISTORY || 160);
const cpuRate = Number(process.env.ROOK_QA_CPU || 4);
const date = '2026-10-05';
const trackedKeys = ['lift-v2-state', 'rook-install-meta-v1', 'rook-recovery-v1'];
const emptyProbe = {writes: [], fullStateStrings: 0, historyStrings: 0, clones: 0};
const browser = await chromium.launch({channel:'chrome', headless:true});

try {
  for (const [width, style, appearance] of [[390,'standard','dark'], [320,'standard','light'], [430,'premium','dark'], [390,'premium','light']]) {
    if (onlyWidth && width!==onlyWidth) continue;
    const state = adjustWeekReorderState();
    Object.assign(state.profile, {stylePreference:style, appearancePreference:appearance, themePreference:style==='premium'?'premium':appearance});
    for (let i=1; i<=historyCount; i++) {
      const day = addCalendarDays(date,-i);
      state.workouts.push({
        id:'sheet-history-'+i, name:'Older workout', source:'freestyle', workoutDateKey:day,
        startedAt:Date.parse(day+'T09:30:00'), completedAt:day+'T10:00:00', durationSeconds:1800,
        exercises:state.program.days[i%3].exercises.map(entry=>({...entry,
          sets:entry.sets.map(set=>({...set,completed:true,reps:8,weight:20}))})),
      });
    }
    const context = await browser.newContext({
      viewport:{width,height:width===320?700:844}, isMobile:true, hasTouch:true, serviceWorkers:'block',
      reducedMotion:width===320?'reduce':'no-preference',
    });
    try {
      await context.addInitScript(({state,date,trackedKeys,emptyProbe})=>{
        const NativeDate=Date, offset=Date.parse(date+'T12:00:00')-Date.now();
        window.Date=class extends NativeDate {
          constructor(...args){super(...(args.length?args:[NativeDate.now()+offset]));}
          static now(){return NativeDate.now()+offset;}
        };
        if (!localStorage.getItem(trackedKeys[0])) localStorage.setItem(trackedKeys[0],JSON.stringify(state));
        window.sheetProbe={...emptyProbe,writes:[]};
        const stringify=JSON.stringify;
        JSON.stringify=function(value,...args){
          if(value?.profile&&Array.isArray(value.workouts))sheetProbe.fullStateStrings++;
          if(Array.isArray(value)&&typeof value[0]==='string'&&value[0].startsWith('fw2:')&&Array.isArray(value[6]))sheetProbe.historyStrings++;
          return stringify.call(this,value,...args);
        };
        const clone=window.structuredClone;
        window.structuredClone=function(...args){sheetProbe.clones++;return clone(...args);};
        const set=Storage.prototype.setItem;
        Storage.prototype.setItem=function(key,value){
          if(trackedKeys.includes(key))sheetProbe.writes.push(key);
          return set.call(this,key,value);
        };
      }, {state,date,trackedKeys,emptyProbe});
      const page=await context.newPage(), errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/api/**',route=>route.fulfill({json:{available:false}}));
      await page.goto(origin,{waitUntil:'networkidle'});
      const today=page.getByRole('button',{name:'Today options',exact:true});
      await today.waitFor();
      const cdp=await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpuRate});
      const menu=page.locator('.today-actions-sheet');
      const sheet=page.locator('.flexible-week-sheet');
      const reset=()=>page.evaluate(data=>Object.assign(sheetProbe,data),emptyProbe);
      const read=()=>page.evaluate(()=>sheetProbe);
      const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
      const waitMotion=panel=>panel.evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
      const close=async panel=>{
        await panel.getByRole('button',{name:'Drag down or tap to close'}).click();
        await panel.waitFor({state:'detached'});
      };
      const noRewrites=async label=>{
        const probe=await read();
        assert.deepEqual(probe.writes,[],label+' never writes training storage');
        if (!observationOnly) {
          assert.equal(probe.fullStateStrings,0,label+' never serializes the full profile');
          assert.equal(probe.historyStrings,0,label+' never builds a stale-check receipt for an unopened review');
        }
      };
      const openToday=async label=>{
        await reset();
        const ms=await today.evaluate(target=>new Promise(resolve=>{
          const start=performance.now();
          target.click();
          requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(Math.round(performance.now()-start))));
        }));
        await waitMotion(menu);
        console.log(width,style,appearance,label,JSON.stringify({frameMs:ms,...await read()}));
        await noRewrites(label);
      };
      const initial=await stored();
      await openToday('Today options before swap');
      await menu.getByRole('button',{name:'Swap with another workout',exact:true}).click();
      await sheet.locator('.adjust-option-list [data-session-id]').first().click();
      await reset();
      await sheet.getByRole('button',{name:'SWAP WORKOUTS',exact:true}).click();
      await sheet.waitFor({state:'detached'});
      const saved=await stored(), writes=(await read()).writes;
      assert.equal(writes.filter(key=>key===trackedKeys[0]).length,1,'Apply commits the primary state once');
      assert.equal(Object.keys(saved.flexibleWeek.sessions).length,2);
      assert.deepEqual(saved.program,initial.program);
      assert.deepEqual(saved.workouts,initial.workouts);
      await openToday('Today options after swap');
      await reset();
      await menu.getByRole('button',{name:'Schedule changes',exact:true}).click();
      await waitMotion(sheet);
      assert.equal(await sheet.locator('.flexible-schedule-changes [data-session-id]').count(),2);
      await close(sheet);
      await noRewrites('Schedule changes inspection');
      if(observationOnly)break;
      await openToday('Today options before drag');
      const handle=await menu.getByRole('button',{name:'Drag down or tap to close'}).boundingBox();
      const x=handle.x+handle.width/2,y=handle.y+12;
      await reset();
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+32}]});
      await menu.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.notEqual(await menu.evaluate(el=>el.style.transform),'','sheet tracks the finger');
      await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
      await page.waitForFunction(()=>{
        const panel=document.querySelector('.today-actions-sheet');
        return panel && panel.style.transform==='' && !panel.parentElement.querySelector('.sheet-drag-scrim');
      });
      assert.equal(await menu.isVisible(),true);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for (const distance of [30,60,90,120,160]) {
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+distance}]});
      }
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await menu.waitFor({state:'detached'});
      await noRewrites('Cancel and dismiss by touch');

      await reset();
      const calendar=page.getByRole('dialog',{name:'Workout calendar',exact:true});
      await page.getByRole('button',{name:/^Open calendar,/}).click();
      await calendar.getByRole('grid').waitFor();
      await close(calendar);
      await noRewrites('Calendar open and close');
      assert.deepEqual((await stored()).flexibleWeek,saved.flexibleWeek);
      await page.reload({waitUntil:'networkidle'});
      await today.waitFor();
      assert.deepEqual((await stored()).flexibleWeek,saved.flexibleWeek,'swap survives reload');
      if (!observationOnly) {
        await reset();
        await page.getByRole('button',{name:'PROGRESS',exact:true}).click();
        await page.locator('.workout-photo-entry-card').click();
        await page.locator('.modal-layer').waitFor();
        await page.keyboard.press('Escape');
        await page.locator('.modal-layer').waitFor({state:'detached'});
        await noRewrites('Progress photos open and close');
        await reset();
        await page.getByRole('button',{name:'COACH',exact:true}).click();
        // Entering Coach can establish a durable chat ID. History is read-only.
        await page.waitForFunction(()=>Boolean(JSON.parse(localStorage.getItem('lift-v2-state')).activeCoachConversationId));
        await reset();
        await page.locator('.coach-history-trigger').click();
        await page.getByRole('heading',{name:'Chat history'}).waitFor();
        await page.getByRole('button',{name:'Back to Coach',exact:true}).click();
        await page.locator('.coach-history-surface').waitFor({state:'detached'});
        await noRewrites('Coach history open and close');
        await reset();
        await page.getByRole('button',{name:'PROFILE',exact:true}).click();
        await page.locator('[data-profile-area="display"]').click();
        await page.getByRole('button',{name:/^Appearance/}).click();
        await page.getByRole('button',{name:'Close Appearance',exact:true}).click();
        await page.locator('.modal-layer').waitFor({state:'detached'});
        await noRewrites('Profile appearance open and close');
        assert.deepEqual((await stored()).flexibleWeek,saved.flexibleWeek);
      }
      assert.deepEqual(errors,[]);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
