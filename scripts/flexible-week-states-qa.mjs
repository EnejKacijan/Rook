import { openAdjustWeek } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, deserializeState, isoDay, weekday, WEEKDAYS } from '../src/domain.js';
import { addCalendarDays } from '../src/flexibleWeek.js';
import { buildBackupArchive } from '../src/backup.js';
const out = new URL('../artifacts/flexible-week/', import.meta.url); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true });
const today = isoDay(), label = d => new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric'}).format(new Date(`${d}T12:00:00`));
let recoveryState;
for (const width of [320,390,430]) {
  const state = blankState(); Object.assign(state.profile,{ goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'], sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true });
  state.program = buildProgram(state.profile); state.program.trainingBlock.startDate = addCalendarDays(today,-6);
  state.program.days[0].name = 'Upper strength and controlled accessory work with a deliberately long workout name';
  const context = await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
  await context.addInitScript(s => { if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(s)); },state);
  const page = await context.newPage(); await page.route('**/api/ai/status',r=>r.fulfill({status:200,contentType:'application/json',body:'{"available":false}'}));
  await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  const shot = async name => {await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);await page.screenshot({path:fileURLToPath(new URL(`${width}-extended-${name}.png`,out))});};
  await shot('01-missed');
  await openAdjustWeek(page);
  await page.getByRole('button',{name:/My available days changed/}).click();
  await page.locator('.flexible-week-dates').getByRole('button',{name:label(today),exact:true}).click();
  await page.locator('.flexible-week-dates').getByRole('button',{name:label(addCalendarDays(today,1)),exact:true}).click();
  await shot('02-available');
  await page.getByRole('button',{name:'REVIEW SCHEDULE',exact:true}).click();
  await page.getByRole('heading',{name:'More training days needed'}).waitFor(); await shot('03-fewer-days');
  await page.getByRole('button',{name:'SHOW MORE DATES',exact:true}).click();
  while (await page.locator('.flexible-week-dates button[aria-pressed="false"]:not(:disabled)').count()) await page.locator('.flexible-week-dates button[aria-pressed="false"]:not(:disabled)').first().click();
  await page.getByRole('button',{name:'REVIEW SCHEDULE',exact:true}).click();
  await page.locator('.flexible-week-review').waitFor(); await shot('04-carry-review');
  await page.locator('.flexible-week-sheet').evaluate(el => { el.scrollTop = el.scrollHeight; });
  const lastRow = await page.locator('.flexible-week-review article').last().boundingBox();
  const footer = await page.locator('.flexible-week-footer').boundingBox();
  assert.ok(lastRow.y + lastRow.height <= footer.y, 'last change scrolls fully above the sticky action area');
  await shot('05-carry-footer');
  await page.getByRole('button',{name:'USE THIS SCHEDULE',exact:true}).click(); await shot('06-applied-bridge');
  await openAdjustWeek(page); await page.getByRole('button',{name:/Move a workout Choose/}).click();
  await page.locator('.flexible-week-sheet .choice-row').first().click();
  await page.getByRole('button',{name:'Skip this session',exact:true}).click(); await shot('07-skip-review');
  await page.getByRole('button',{name:'USE THIS SCHEDULE',exact:true}).click();
  const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  recoveryState = saved;
  assert.equal(Object.values(saved.flexibleWeek.sessions).filter(s=>s.skipped).length,1);
  await shot('08-skipped');
  await context.close();
}
// Persistence failure: storage writes fail only at the explicit schedule commit.
{
  const state=blankState();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:2,availableDays:[weekday(),WEEKDAYS[(WEEKDAYS.indexOf(weekday())+2)%7]],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true});state.program=buildProgram(state.profile);
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);const page=await context.newPage();await page.route('**/api/ai/status',r=>r.fulfill({status:200,contentType:'application/json',body:'{"available":false}'}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  await openAdjustWeek(page);await page.getByRole('button',{name:/Move a workout Choose/}).click();await page.locator('.flexible-week-sheet .choice-row').first().click();await page.locator('.flexible-week-dates button:not(:disabled)').first().click();
  await page.evaluate(()=>{ const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='lift-v2-state' && JSON.parse(value).flexibleWeek)throw new DOMException('Full','QuotaExceededError');return original.call(this,key,value);};});
  await page.getByRole('button',{name:'USE THIS SCHEDULE',exact:true}).click();assert.match(await page.getByRole('alert').innerText(),/couldn’t save/);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).flexibleWeek),null);await page.screenshot({path:fileURLToPath(new URL('390-persistence-failure.png',out))});await context.close();
}
{
  const archive = await buildBackupArchive(recoveryState, []);
  const path = fileURLToPath(new URL('flexible-week-recovery.zip',out)); await writeFile(path,archive.bytes);
  const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}), page=await context.newPage();
  await page.route('**/api/ai/status',r=>r.fulfill({status:200,contentType:'application/json',body:'{"available":false}'}));
  await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:/Restore.*backup/i}).click();
  await page.getByLabel('Choose ROOK backup file').setInputFiles(path);
  await page.getByRole('button',{name:'RESTORE & REPLACE',exact:true}).click();
  await page.getByRole('button',{name:'TODAY',exact:true}).waitFor();
  const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  assert.deepEqual(restored.flexibleWeek,recoveryState.flexibleWeek);
  await page.screenshot({path:fileURLToPath(new URL('390-clean-install-restore.png',out))}); await context.close();
}
await browser.close();console.log('Flexible Week: missed, fewer-days, carry bridge, long reviews, skip, persistence failure and clean-install ZIP restore passed.');
