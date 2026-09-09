import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
const out='artifacts/build-plan-questionnaire';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
const state=blankState();Object.assign(state.profile,{appearancePreference:'light',stylePreference:'standard',themePreference:'light'});
await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4175');await page.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();
const shot=async name=>{await page.waitForTimeout(400);await page.evaluate(()=>{window.scrollTo(0,0);const e=document.querySelector('.onboarding');e.scrollTop=0;});await page.screenshot({path:`${out}/${name}.png`,fullPage:true});console.log(name);};
const next=()=>page.getByRole('button',{name:'CONTINUE',exact:true}).click();
await shot('01-starting-point');await page.getByRole('combobox',{name:'Age range'}).click();await page.getByRole('option',{name:'18–29',exact:true}).click();await next();
await shot('02-goal');await page.getByRole('button',{name:'Build muscle',exact:true}).click();
await shot('03-experience');await page.getByRole('button',{name:/^Beginner/}).click();
await shot('04-schedule');await page.getByRole('button',{name:'3 days',exact:true}).click();await page.getByLabel('Any day works').check();await page.getByRole('button',{name:'60 min',exact:true}).click();await next();
await shot('05-training-setup');await page.getByRole('button',{name:'Commercial gym',exact:true}).click();await next();
await shot('06-priorities');await page.getByRole('button',{name:'Balanced',exact:true}).click();await next();
await shot('07-effort');await page.getByRole('button',{name:/Balanced starting point/}).click();await next();
await shot('08-preferences');
}finally{await browser.close();}
