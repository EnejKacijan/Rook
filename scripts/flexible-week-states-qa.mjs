import { openAdjustWeek } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, weekday, WEEKDAYS } from '../src/domain.js';
import { insufficientDaysState } from '../src/fixtures/insufficientDaysState.js';
import { buildBackupArchive } from '../src/backup.js';
const out = new URL('../artifacts/flexible-week/', import.meta.url); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true });
let recoveryState;
try {
for (const width of [320,390,430]) {
  const state=insufficientDaysState({single:true});
  state.program.days[0].name='Lower strength and controlled accessory work with a deliberately long name';
  const context=await browser.newContext({viewport:{width,height:700},serviceWorkers:'block',reducedMotion:'reduce'});
  try {
    await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
    const page=await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-04T12:00:00'));
    await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
    await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173');
    const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
    const initial=await read();
    const sheet=page.locator('.flexible-week-sheet');
    const button=name=>sheet.getByRole('button',{name,exact:typeof name==='string'});
    const shot=async name=>{
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:fileURLToPath(new URL(width+'-extended-'+name+'.png',out))});
    };
    const openReview=async()=>{
      await openAdjustWeek(page);
      await button(/^My available days changed/).click();
      const todayOption=sheet.locator('[data-available-date="2026-10-04"]');
      if(await todayOption.getAttribute('aria-pressed')==='true')await todayOption.click();
      await button('REVIEW SCHEDULE').click();
    };
    await openReview();
    await button('MOVE LATER').waitFor();
    assert.equal(await button('APPLY SCHEDULE').isDisabled(),true);
    await shot('insufficient-days');
    await button('MOVE LATER').click();
    await sheet.locator('[data-move-date="2026-10-06"]').click();
    assert.equal(await button('APPLY SCHEDULE').isEnabled(),true);
    assert.match(await sheet.locator('.flexible-week-review').innerText(),/Oct 3.*Oct 6/);
    await shot('carry-review');
    const footer=sheet.locator('.flexible-week-footer');
    await sheet.evaluate(panel=>{panel.scrollTop=panel.scrollHeight;});
    const rowBox=await sheet.locator('.flexible-week-review > article').last().boundingBox(),footerBox=await footer.boundingBox();
    assert.ok(rowBox.y+rowBox.height<=footerBox.y+1,'last change can scroll above the footer');
    await button('CANCEL').click();
    await sheet.waitFor({state:'detached'});
    assert.deepEqual((await read()).flexibleWeek,initial.flexibleWeek);
    await openReview();
    await button('Skip this workout').click();
    await button('KEEP IT').click();
    assert.equal(await button('APPLY SCHEDULE').isDisabled(),true);
    await button('Skip this workout').click();
    await button('SKIP WORKOUT').click();
    assert.deepEqual((await read()).flexibleWeek,initial.flexibleWeek,'skip remains a draft before Apply');
    await button('APPLY SCHEDULE').click();
    await sheet.waitFor({state:'detached'});
    recoveryState=await read();
    assert.equal(Object.values(recoveryState.flexibleWeek.sessions).filter(session=>session.skipped).length,1);
    assert.deepEqual(recoveryState.workouts,initial.workouts);
    await shot('skipped');
    console.log(width,'carry review, cancel and explicit skip passed');
  } finally { await context.close(); }
}
// Persistence failure: storage writes fail only at the explicit schedule commit.
{
  const state=blankState();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:2,availableDays:[weekday(),WEEKDAYS[(WEEKDAYS.indexOf(weekday())+2)%7]],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true});state.program=buildProgram(state.profile);
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);const page=await context.newPage();await page.route('**/api/ai/status',r=>r.fulfill({status:200,contentType:'application/json',body:'{"available":false}'}));await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173',{waitUntil:'networkidle'});
  await openAdjustWeek(page);await page.getByRole('button',{name:/Move a workout Choose/}).click();await page.locator('.flexible-workout-list [data-session-id]').first().click();await page.locator('.flexible-week-dates button:not(:disabled)').first().click();
  await page.evaluate(()=>{ const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='lift-v2-state' && JSON.parse(value).flexibleWeek)throw new DOMException('Full','QuotaExceededError');return original.call(this,key,value);};});
  await page.getByRole('button',{name:'MOVE WORKOUT',exact:true}).click();assert.match(await page.getByRole('alert').innerText(),/couldn’t save/);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).flexibleWeek),null);await page.screenshot({path:fileURLToPath(new URL('390-persistence-failure.png',out))});await context.close();
}
{
  const archive = await buildBackupArchive(recoveryState, []);
  const path = fileURLToPath(new URL('flexible-week-recovery.zip',out)); await writeFile(path,archive.bytes);
  const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}), page=await context.newPage();
  await page.route('**/api/ai/status',r=>r.fulfill({status:200,contentType:'application/json',body:'{"available":false}'}));
  await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:/Restore.*backup/i}).click();
  await page.getByLabel('Choose ROOK backup file').setInputFiles(path);
  await page.getByRole('button',{name:'RESTORE & REPLACE',exact:true}).click();
  await page.getByRole('button',{name:'TODAY',exact:true}).waitFor();
  const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  assert.deepEqual(restored.flexibleWeek,recoveryState.flexibleWeek);
  await page.screenshot({path:fileURLToPath(new URL('390-clean-install-restore.png',out))}); await context.close();
}
} finally { await browser.close(); }
console.log('Flexible Week: missed, fewer-days, carry bridge, long reviews, skip, persistence failure and clean-install ZIP restore passed.');
