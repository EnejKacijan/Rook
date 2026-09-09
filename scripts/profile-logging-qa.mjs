import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const out='artifacts/profile-logging';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const state=createReturningUserFixture(2);state.activeWorkout=null;state.ai.planUpgradeDismissed=true;
 Object.assign(state.profile,{name:'Alex',ageRange:'30–39',sex:'Prefer not to say',appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance,restTimerEnabled:true,restTimerAutoStart:true});
 const c=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 await c.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4190');
 const stored=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 await p.getByRole('button',{name:'PROFILE',exact:true}).click();const before=await stored();
 assert.equal(await p.locator('[data-profile-area]').count(),4);assert.equal(await p.getByRole('button',{name:/^Delete local data/}).count(),0);
 await p.locator('[data-profile-area="training"]').click();assert.match(await p.getByRole('button',{name:/Personal details/}).innerText(),/Alex.*30–39/);
 await p.getByRole('button',{name:/Personal details/}).click();await p.locator('.profile-sex-trigger').click();assert.equal(await p.getByRole('group',{name:'Sex',exact:true}).getByRole('radio').count(),5);await p.getByText('Intersex',{exact:true}).click();await p.getByRole('button',{name:'SAVE DETAILS',exact:true}).click();await p.keyboard.press('Escape');
 await p.getByRole('button',{name:'Back to Profile',exact:true}).click();await p.locator('[data-profile-area="preferences"]').click();await p.getByRole('button',{name:/Logging & increments/}).click();
 const rir=p.getByRole('switch',{name:'Track reps in reserve (RIR)',exact:true}),originalRir=await rir.isChecked();await p.getByRole('button',{name:'What is RIR?',exact:true}).click();await p.getByRole('tooltip').waitFor();assert.equal(await rir.isChecked(),originalRir);await p.keyboard.press('Escape');
 const unit=p.locator('.unit-segmented');await unit.getByRole('button',{name:'kg',exact:true}).click();const bar=p.getByRole('spinbutton',{name:'Barbell increment',exact:true});await bar.fill('5');await bar.blur();await unit.getByRole('button',{name:'lb',exact:true}).click();assert.equal(await bar.inputValue(),'11.02');await unit.getByRole('button',{name:'kg',exact:true}).click();assert.equal(await bar.inputValue(),'5');await bar.fill('0');await bar.blur();assert.equal(await bar.inputValue(),'5');
 const duration=p.getByRole('combobox',{name:'Rest duration',exact:true});await duration.selectOption('120');assert.equal(await duration.inputValue(),'120');await rir.press('Space');assert.equal(await rir.isChecked(),!originalRir);
 await p.screenshot({path:`${out}/${width}-${style}-${appearance}-current-logging.png`});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.keyboard.press('Escape');
 assert.deepEqual((await stored()).program,before.program);assert.deepEqual((await stored()).workouts,before.workouts);await p.reload();await p.getByRole('button',{name:'PROFILE',exact:true}).click();await p.locator('[data-profile-area="preferences"]').click();await p.getByRole('button',{name:/Logging & increments/}).click();assert.equal(await duration.inputValue(),'120');assert.equal(await rir.isChecked(),!originalRir);assert.equal(await bar.inputValue(),'5');assert.deepEqual(errors,[]);await c.close();console.log(`PASS ${width} ${style} ${appearance}: current hub, personal fields, logging, canonical units, invalid increment, reload and isolation`);
}}finally{await browser.close();}
