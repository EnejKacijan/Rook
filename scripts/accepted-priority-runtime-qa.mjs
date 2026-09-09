import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const phase=process.argv[2]||'after',out='artifacts/accepted-priority-runtime';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
try {for(const [width,style,appearance] of [[390,'standard','light'],[320,'standard','dark'],[390,'premium','dark'],[390,'premium','light']]) {
 const state=createReturningUserFixture(1);state.activeWorkout=null;state.ai.planUpgradeDismissed=true;
 Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance,priorities:['Balanced'],prioritySources:{manual:['Balanced'],physiqueConfirmed:[],physiqueSuggested:[]}});
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
 const page=await context.newPage();await page.goto(phase==='before'?'http://127.0.0.1:4186':'http://127.0.0.1:4190');
 await page.getByRole('button',{name:'PROFILE',exact:true}).click();await page.locator('[data-profile-area="training"]').click();await openProfileArea(page, 'training'); await page.getByRole('button',{name:/Training priorities/}).click();
 const sheet=page.locator('.priority-settings'),entry=sheet.locator('.physique-review-entry'),footer=sheet.locator('.sheet-action-footer');await sheet.waitFor();
 await page.screenshot({path:`${out}/${phase}-${width}-${style}-${appearance}.png`,animations:'disabled'});
 const bounds=await entry.boundingBox(),bottom=await footer.boundingBox();results.push({width,style,appearance,bounds,footer:bottom});
 if(phase==='after') {
  assert.ok(bounds.y+bounds.height<bottom.y,'help visible above sticky Save');
  assert.equal(await sheet.getByText('Balanced plan',{exact:true}).count(),0);
  const last=sheet.getByRole('button',{name:'Abs / core',exact:true});await last.evaluate(e=>{for(let n=e.parentElement;n;n=n.parentElement)if(n.scrollHeight>n.clientHeight&&['auto','scroll'].includes(getComputedStyle(n).overflowY)){n.scrollTop=n.scrollHeight;break;}});
  const lastBox=await last.boundingBox();assert.ok(lastBox.y+lastBox.height<=(await footer.boundingBox()).y+1,'last choice clears sticky Save');
  await page.screenshot({path:`${out}/${phase}-${width}-${style}-${appearance}-scrolled.png`,animations:'disabled'});
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  const initial=await stored();
  await sheet.getByRole('button',{name:'Chest',exact:true}).click();await sheet.getByRole('button',{name:'Back',exact:true}).click();
  const third=sheet.getByRole('button',{name:'Shoulders',exact:true});assert.equal(await third.getAttribute('aria-disabled'),'true');
  await third.evaluate(button=>button.click());assert.deepEqual((await stored()).profile.prioritySources,initial.profile.prioritySources);
  assert.equal(await third.getAttribute('aria-pressed'),'false');
  await entry.click();await page.getByText(/Optional online analysis:/).waitFor();await page.getByRole('button',{name:'SKIP',exact:true}).click();await sheet.waitFor();
  await sheet.getByRole('button',{name:'SAVE PRIORITIES',exact:true}).click();const saved=await stored();
  assert.deepEqual(saved.profile.prioritySources.manual,['Chest','Back']);assert.deepEqual(saved.program,initial.program);assert.deepEqual(saved.workouts,initial.workouts);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await context.close();
}}finally{await browser.close();await writeFile(`${out}/${phase}.json`,JSON.stringify(results,null,2));}
console.log(`${phase} priority QA passed`);
