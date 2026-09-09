import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {startWorkout} from '../src/domain.js';
const out='artifacts/profile-hub';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
const groups={program:[/Training block/,/Edit plan/,/Plan history/,/Export workout plan/,/Replace plan/],training:[/Personal details/,/Availability/,/Gym profiles/,/Training restrictions/,/Training priorities/,/Custom exercises/],preferences:[/Logging & increments/,/Appearance/],data:[/Import workout history/,/Export workout history/,/Back up ROOK/,/Restore backup/,/Delete local data/]};
try{for(const [width,appearance,style,active,complete] of [[390,'light','standard',false,false],[320,'dark','standard',false,false],[390,'light','premium',false,true],[390,'dark','premium',false,true],[320,'dark','premium',false,true],[390,'light','standard',true,true]]){
 const state=createReturningUserFixture(2);state.activeWorkout=active?startWorkout(state,state.program.days[0]):null;state.profile.ageRange=complete?'25–34':null;
 if(complete)Object.assign(state.profile,{name:'Alex',ageRange:'18–29',sex:'Male'});
 Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4175');await page.getByRole('button',{name:'PROFILE',exact:true}).click();
 const root=page.locator('.profile-screen');await root.waitFor();const prefix=`${out}/${width}-${style}-${appearance}${active?'-active':''}`;
 const saved=()=>page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('lift-v2-state'));return {program:s.program,workouts:s.workouts,active:s.activeWorkout,profile:s.profile};});const before=await saved();
 assert.equal(await root.locator('[data-profile-area]').count(),4);assert.equal(await root.getByText('COMPLETE YOUR PROFILE',{exact:true}).count(),complete?0:1);assert.equal(await root.getByText('Ask Coach to adjust',{exact:true}).count(),0);
 const shot=async name=>{await page.waitForTimeout(150);await page.screenshot({path:`${prefix}-${name}.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);};await shot('main');
 for(const [area,labels] of Object.entries(groups)){
  await root.locator(`[data-profile-area="${area}"]`).click();await root.locator('.profile-subpage-header').waitFor();assert.equal(await root.locator('h1').count(),0);assert.equal(await page.getByRole('button',{name:'PROFILE',exact:true}).getAttribute('aria-current'),'page');await shot(area);
  if(area==='preferences')assert.equal(await root.getByRole('button',{name:/Notifications/}).count(),0,'standalone Notifications entry is absent');
  if(area==='training'){
    assert.equal(await root.getByRole('button',{name:/Personal details/}).count(),1);
    if(complete)assert.match(await root.getByRole('button',{name:/Personal details/}).textContent(),/Alex · 18–29 · Male/);
    assert.equal(await root.getByRole('button',{name:/Training priorities/}).count(),1);
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(200);
    const bounds=await page.getByRole('button',{name:'Back to Profile',exact:true}).boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<844);await shot('training-deep');await page.evaluate(()=>window.scrollTo(0,0));
  }
  for(const label of labels){
   const row=root.getByRole('button',{name:label});assert.equal(await row.count(),1,`${area}: ${label}`);
   if(active&&String(label)==='/Edit plan/'){assert.equal(await row.isDisabled(),true);assert.match(await row.innerText(),/Finish your active workout first/);continue;}
   await row.click();await page.locator('.modal-layer').waitFor();assert.ok(await page.locator('.modal-layer').innerText(),`${label}: destination rendered`);
   if(String(label)==='/Logging & increments/')await page.getByText('Rest timer notifications',{exact:true}).waitFor();
   if(String(label)==='/Delete local data/')await page.getByRole('button',{name:'BACK UP FIRST',exact:true}).waitFor();
   await page.waitForTimeout(250);await page.keyboard.press('Escape');await page.locator('.modal-layer').waitFor({state:'detached'});assert.equal(await root.locator('[data-profile-area]').count(),0,`close returns to same category: ${label}`);
  }
  await page.getByRole('button',{name:'Back to Profile',exact:true}).click();assert.equal(await root.locator(`[data-profile-area="${area}"]`).evaluate(e=>document.activeElement===e),true);
 }
 if(width===320){
  await page.setViewportSize({width,height:480});await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(200);const position=await page.evaluate(()=>scrollY);
  await root.locator('[data-profile-area="data"]').click();await page.getByRole('button',{name:'Back to Profile',exact:true}).click();assert.equal(await page.evaluate(()=>scrollY),position,'hub scroll restored');
  await root.locator('[data-profile-area="preferences"]').click();await page.keyboard.press('Escape');assert.equal(await root.locator('[data-profile-area]').count(),4);
 }
 assert.deepEqual(await saved(),before,'navigation does not alter training or preferences');assert.deepEqual(errors,[]);console.log(`PASS ${prefix}: all destinations, back focus, conditional completion, active guard, no mutation`);await context.close();
}}finally{await browser.close();}
