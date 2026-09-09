import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
async function open(notes){
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 const page=await context.newPage();await page.route('**/api/**',route=>route.fulfill({json:{available:false}}));
 await page.goto('http://127.0.0.1:4173');await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(notes);await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();return {context,page};
}
try{
 {
  const {page,context}=await open('MONDAY\nBench Press 3x8\nTechnique: controlled movement.');
  await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();assert.equal(await page.locator('.import-resolution').count(),0);assert.equal(await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).isEnabled(),true);await context.close();console.log('No blockers: direct clean final review');
 }
 {
  const {page,context}=await open('MONDAY\nUnknown movement omega 3x8');
  await page.getByRole('heading',{name:'Match this exercise',exact:true}).waitFor();assert.ok(!(await page.locator('.import-resolution').innerText()).includes('1 OF'));
  await page.locator('.import-decision-content:visible').getByPlaceholder('Search exercises',{exact:true}).fill('Squat');await page.locator('.import-decision-content:visible .import-resolution-options').getByRole('button',{name:'Squat',exact:true}).click();
  await page.getByRole('button',{name:'REVIEW PLAN',exact:true}).click();await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();assert.equal(await page.locator('.plan-import-choice').count(),0);await context.close();console.log('One exact match: one step, direct choice');
 }
 {
  const {page,context}=await open('MONDAY\nBench Press 3x8 50\nUnknown movement omega 3x8 L/R');
  await page.locator('.import-resolution').waitFor();assert.ok((await page.locator('.import-resolution').innerText()).includes('1 OF 3'));
  await page.getByRole('button',{name:'Leave load unspecified',exact:true}).click();await page.getByRole('button',{name:'CONTINUE',exact:true}).click();
  await page.getByLabel('Reviewed logging mode').selectOption('per_side');await page.getByRole('button',{name:'CONTINUE',exact:true}).click();
  await page.getByRole('button',{name:'KEEP AS CUSTOM',exact:true}).click();await page.getByRole('button',{name:'REVIEW PLAN',exact:true}).click();await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();await context.close();console.log('Three real types: prescriptions/logging/matches, no extra steps');
 }
 {
  const {page,context}=await open('MONDAY\n'+['alpha','beta','gamma','delta','epsilon','zeta','eta','theta'].map(name=>`Unknown ${name} movement 3x8`).join('\n'));
  await page.locator('.import-resolution').waitFor();
  for(let n=1;n<=8;n++){assert.ok((await page.locator('.import-decision-content:visible').innerText()).includes(`${n} OF 8`));await page.getByRole('button',{name:'KEEP AS CUSTOM',exact:true}).click();await page.getByRole('button',{name:n===8?'REVIEW PLAN':'CONTINUE',exact:true}).click();}
  await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();await page.getByRole('button',{name:'Edit exercise matches',exact:true}).click();
  await page.locator('.import-decision-content:visible').getByPlaceholder('Search exercises',{exact:true}).fill('Squat');await page.locator('.import-decision-content:visible .import-resolution-options').getByRole('button',{name:'Squat',exact:true}).click();for(let n=1;n<=8;n++)await page.getByRole('button',{name:n===8?'REVIEW PLAN':'CONTINUE',exact:true}).click();
  await page.getByRole('button',{name:'Back to start',exact:true}).click();await page.locator('.existing-plan-action').waitFor();
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')))||blankState();assert.equal(stored.program,null);assert.equal(stored.customExercises.length,0);console.log('Eight continuous matches; change remains possible; cancellation writes no plan/library data');await context.close();
 }
}finally{await browser.close();}
