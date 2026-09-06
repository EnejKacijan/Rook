import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
const out='artifacts/calendar-range-contrast';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
for(const width of [320,390,430])for(const appearance of ['light','dark'])for(const style of ['standard','premium']){
 const state=createReturningUserFixture(0);Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 const context=await browser.newContext({viewport:{width,height:844},colorScheme:appearance,serviceWorkers:'block'});
 await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
 const page=await context.newPage();await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
 await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
 const metrics=await page.locator('.week-navigation span').evaluate(node=>{
  const rgb=c=>c.match(/[\d.]+/g).slice(0,3).map(Number);
  let parent=node,bg;while(parent){const value=getComputedStyle(parent).backgroundColor;if(!value.includes('rgba')||!value.endsWith(', 0)')){bg=rgb(value);break;}parent=parent.parentElement;}
  const fg=rgb(getComputedStyle(node).color),lum=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const a=lum(fg),b=lum(bg||[255,255,255]);return {fg,bg,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
 });
 const name=`${width}-${style}-${appearance}`;results.push({name,...metrics});
 await page.screenshot({path:`${out}/${name}-today.png`});
 assert.ok(metrics.contrast>=4.5,`${name}: week range needs readable normal-text contrast, got ${metrics.contrast}`);
 await context.close();
}
await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log('12 calendar range contrast/theme/viewport cases passed');
