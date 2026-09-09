import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { importHardeningFixtures } from '../src/importHardeningFixtures.js';
const root='artifacts/import-context';await mkdir(root,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 for(const scenario of ['restrictions','equipment','long','preview'])for(const theme of scenario==='long'||scenario==='preview'?['light']:['light','dark','premium-light','premium-dark']){
  const width=scenario==='long'?320:scenario==='preview'?430:390;
  const state=createReturningUserFixture(3);state.activeWorkout=null;
  Object.assign(state.profile,{appearancePreference:theme.endsWith('dark')?'dark':'light',stylePreference:theme.startsWith('premium')?'premium':'standard',themePreference:theme.startsWith('premium')?'premium':theme});
  if(scenario==='restrictions'){
    state.profile.avoid='Avoid Leg Press';state.profile.trainingSafetyAnalysis={sourceText:'Avoid Leg Press',analysis:{schemaVersion:2,findings:[{kind:'explicit_avoidance',confidence:0.99,targetText:'Leg Press',evidence:[{quote:'Leg Press',start:6,end:15}]}],unresolved:[]}};
  }
  if(scenario==='equipment'){
    state.gymProfiles=[{schemaVersion:1,id:'gym-qa-home',name:'Home Gym',environment:'Home gym',equipment:['dumbbells'],createdAt:'2026-09-01T12:00:00Z',updatedAt:'2026-09-01T12:00:00Z'}];state.defaultGymProfileId='gym-qa-home';
  }
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
  await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
  const page=await context.newPage();await page.goto('http://127.0.0.1:4173');
  await page.getByRole('button',{name:'PROFILE',exact:true}).click();
  await openProfileArea(page, 'program'); await page.getByRole('button',{name:/Replace plan/}).click();
  await page.getByRole('button',{name:/Import from Notes|Import a different plan/}).click();
  await page.getByPlaceholder(/Paste your workout notes/).fill(scenario==='long'?importHardeningFixtures.find(f=>f.name.startsWith('S ')).text:'Monday - Legs\nLeg Press 3x8 RIR 2');
  await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
  await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();
  if(scenario==='restrictions')await page.getByText(/Leg Press conflicts with your saved restrictions/).waitFor();
  if(scenario==='equipment')await page.getByText(/Not available at Home Gym/).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`${root}/${width}-${theme}-${scenario}.png`,fullPage:true});
  const captureVisible=async(locator,suffix)=>{
    await locator.evaluate(el=>{
      const screen=el.closest('.detail-screen');
      screen.scrollTop+=el.getBoundingClientRect().top-screen.getBoundingClientRect().top-180;
    });
    await page.screenshot({path:`${root}/${width}-${theme}-${scenario}-${suffix}.png`,animations:'disabled'});
  };
  if(scenario==='restrictions')await captureVisible(page.getByText(/Leg Press conflicts with your saved restrictions/),'warning');
  if(scenario==='equipment')await captureVisible(page.getByText(/Not available at Home Gym/),'warning');
  if(scenario==='long'){
    await captureVisible(page.locator('.plan-editor-exercise').nth(15),'middle');
    await captureVisible(page.locator('.plan-editor-exercise').last(),'bottom');
  }
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).program.id),state.program.id);
  await context.close();console.log(`${width} ${theme} ${scenario}: passed`);
 }
}finally{await browser.close();}
