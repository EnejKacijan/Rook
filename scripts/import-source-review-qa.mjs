import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, STORAGE_KEY } from '../src/domain.js';
const output = new URL('../artifacts/import-source-review/', import.meta.url);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
  for(const width of (process.env.ROOK_QA_CHOICES_ONLY ? [] : [320,390,430])) for(const theme of ['light','dark','premium','premium-light']) {
    const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',colorScheme:theme==='dark'||theme==='premium'?'dark':'light'});
    const state=blankState();Object.assign(state.profile,{appearancePreference:theme==='dark'||theme==='premium'?'dark':'light',stylePreference:theme.startsWith('premium')?'premium':'standard',themePreference:theme.startsWith('premium')?'premium':theme});
    await context.addInitScript(({state,key})=>localStorage.setItem(key,JSON.stringify(state)),{state,key:STORAGE_KEY});
    const page=await context.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173');
    await page.waitForFunction(expected=>document.documentElement.dataset.style===expected,theme.startsWith('premium')?'premium':'standard');
    await page.getByRole('button',{name:/Already have a plan/i}).click();
    await page.getByPlaceholder(/Paste your workout notes/).fill('Day 1 - Push\nBench Press 3x8 @2 at 70%\nCable Fly 2x12 / Push-up 2x10');
    await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
    await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor().catch(async error=>{ console.error(errors,await page.locator('body').innerText()); throw error; });
    const usePlan=page.getByRole('button',{name:'USE THIS PLAN',exact:true});
    assert.equal(await usePlan.isDisabled(),true);
    const reviewLink=page.locator('.import-review-remaining');
    assert.match(await reviewLink.innerText(), /3 decisions remaining/);
    const savedBefore=await page.evaluate(key=>JSON.parse(localStorage.getItem(key))?.program,STORAGE_KEY);
    await reviewLink.scrollIntoViewIfNeeded();
    await page.screenshot({path:fileURLToPath(new URL(`${width}-${theme}-footer.png`,output))});
    await reviewLink.click();
    const panel=page.locator('.plan-import-issues');
    assert.equal(await page.locator('.plan-import-notes').count(),0);
    await page.getByRole('button',{name:/^Cable Fly · 2 × 12$/}).click();
    assert.equal(await usePlan.isDisabled(),true,'preserved notes cannot resolve weekday or RIR');
    assert.match(await reviewLink.innerText(), /2 decisions remaining/);
    assert.equal(await page.getByLabel('Reviewed RIR',{exact:true}).inputValue(),'__choose');
    assert.equal(await page.getByRole('button',{name:'CONFIRM REVIEW',exact:true}).count(),0);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({path:fileURLToPath(new URL(`${width}-${theme}-day.png`,output))});
    await page.getByLabel('Workout day',{exact:true}).selectOption('Mon');
    assert.match(await reviewLink.innerText(), /1 decision remaining/);
    await page.getByLabel('Reviewed RIR',{exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:fileURLToPath(new URL(`${width}-${theme}-one-choice.png`,output))});
    await page.getByLabel('Workout day',{exact:true}).selectOption('Tue');
    await page.getByLabel('Workout day',{exact:true}).selectOption('Mon');
    await page.getByLabel('Reviewed RIR',{exact:true}).selectOption('');
    assert.equal(await usePlan.isDisabled(),false,'explicit unspecified is a valid decision');
    await page.getByLabel('Reviewed RIR',{exact:true}).selectOption('2');
    await page.screenshot({path:fileURLToPath(new URL(`${width}-${theme}-rir.png`,output))});
    assert.equal(await page.getByText('READY TO USE',{exact:true}).count(),1);
    assert.equal(await reviewLink.count(),0);
    assert.equal(await usePlan.isDisabled(),false);
    assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key))?.program,STORAGE_KEY),savedBefore,'all choices remain in the draft');
    await usePlan.scrollIntoViewIfNeeded();
    await page.screenshot({path:fileURLToPath(new URL(`${width}-${theme}-ready.png`,output))});
    await usePlan.click();
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key))?.program?.source==='ai-import',STORAGE_KEY);
    const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).program,STORAGE_KEY);
    assert.equal(saved.days[0].weekday,'Mon');
    assert.equal(saved.days[0].exercises[0].targetRir,2);
    assert.match(saved.days[0].exercises[0].notes,/70%/);
    assert.match(saved.days[0].exercises[1].notes,/Push-up/);
    assert.equal(saved.days[0].exercises.length,2,'excluded alternative is not a third exercise');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    await context.close();
    console.log(`${width} ${theme}: passed`);
  }
  for(const [name,notes] of [
    ['load','MONDAY - Push\nBench Press 3x8 50'],
    ['prescription','MONDAY - Push\nBench Press 3 rounds'],
    ['loggingMode','MONDAY - Push\nDumbbell Curl 3x8 left/right'],
    ['advanced','MONDAY - Push\nBench Press 3x8 drop set'],
  ]) {
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:4173');
    await page.getByRole('button',{name:/Already have a plan/i}).click();
    await page.getByPlaceholder(/Paste your workout notes/).fill(notes);
    await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
    await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();

    const use=page.getByRole('button',{name:'USE THIS PLAN',exact:true});
    assert.equal(await use.isDisabled(),true);
    const pending=()=>page.locator('.plan-import-choice[data-unresolved="true"]');
    if(name==='load'){
      const input=page.getByLabel('Reviewed load',{exact:true});
      await input.focus();await input.blur();assert.equal(await pending().count(),1,'empty default is not accepted');
      await input.fill('50');assert.equal(await pending().count(),0,'valid typing resolves before blur');await input.blur();
      await page.getByLabel('Reviewed load unit',{exact:true}).selectOption('lb');
      await input.fill('-1');await input.blur();assert.equal(await pending().count(),1,'invalid correction blocks apply again');
      await page.getByRole('button',{name:'Leave load unspecified',exact:true}).click();assert.equal(await pending().count(),0);
      await input.fill('50');await input.blur();
    } else if(name==='prescription'){
      for(const [label,value] of [['Sets','4'],['Min reps','6'],['Max reps','8']]){
        const input=page.getByLabel(`Reviewed ${label}`,{exact:true});await input.fill(value);await input.blur();
      }
      assert.equal(await pending().count(),0);
      const min=page.getByLabel('Reviewed Min reps',{exact:true});await min.fill('20');await min.blur();assert.equal(await pending().count(),1);
      await min.fill('6');await min.blur();
    } else if(name==='loggingMode') await page.getByLabel('Reviewed logging mode',{exact:true}).selectOption('per_side');
    else {
      await page.getByLabel('Reviewed set method',{exact:true}).selectOption('drop');
      await page.getByLabel('Reviewed special set',{exact:true}).selectOption('0');
      await page.getByLabel('Reviewed set method',{exact:true}).selectOption('amrap');
    }
    assert.equal(await pending().count(),0);

    assert.equal(await use.isDisabled(),false);
    assert.equal(await page.evaluate(key=>!!JSON.parse(localStorage.getItem(key))?.program,STORAGE_KEY),false);
    await use.click();
    await page.waitForFunction(key=>!!JSON.parse(localStorage.getItem(key))?.program,STORAGE_KEY);
    const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).program,STORAGE_KEY);
    const exercise=saved.days[0].exercises[0];
    if(name==='load')assert.equal(exercise.sets[0].weight,22.68);
    if(name==='prescription'){assert.equal(exercise.sets.length,4);assert.equal(exercise.repMin,6);assert.equal(exercise.repMax,8);}
    if(name==='loggingMode')assert.equal(exercise.loggingMode,'per_side');
    if(name==='advanced'){assert.equal(exercise.sets[0].setType,'amrap');assert.ok(exercise.sets.slice(1).every(set=>set.setType!=='drop'));}
    await page.reload();
    assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).program,STORAGE_KEY),saved,'applied plan survives reload');
    await context.close();console.log(`${name}: direct decision, correction, apply and reload passed`);
  }
  // Source-review drafts were already transient; reload must not silently apply
  // or acknowledge them. Do not introduce a new draft persistence model.
  const reloadContext=await browser.newContext({serviceWorkers:'block'});
  const reloadPage=await reloadContext.newPage();
  await reloadPage.goto('http://127.0.0.1:4173');
  await reloadPage.getByRole('button',{name:/Already have a plan/i}).click();
  await reloadPage.getByPlaceholder(/Paste your workout notes/).fill('Day 1 - Push\nBench Press 3x8 @2 at 70%\nCable Fly 2x12 / Push-up 2x10');
  await reloadPage.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
  await reloadPage.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();

  await reloadPage.getByLabel('Workout day',{exact:true}).selectOption('Mon');
  await reloadPage.reload();
  await reloadPage.getByRole('button',{name:/Already have a plan/i}).waitFor();
  assert.equal(await reloadPage.evaluate(key=>!!JSON.parse(localStorage.getItem(key))?.program,STORAGE_KEY),false);
  assert.equal(await reloadPage.getByRole('button',{name:'USE THIS PLAN',exact:true}).count(),0);
  await reloadContext.close();
  console.log('Unapplied review remains transient on reload; no premature apply.');
} finally { await browser.close(); }
