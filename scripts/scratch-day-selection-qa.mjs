import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
const out='artifacts/scratch-day-selection';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['dark','light']){
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),state=blankState();Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173');await page.getByRole('button',{name:/Start from scratch/i}).click();
 const days=page.locator('.scratch-day-options');
 for(const name of ['Mon','Wed','Fri'])await days.getByRole('button',{name,exact:true}).click();
 assert.equal(await days.locator('.selected').count(),3);
 const colors=await days.evaluate(el=>{const selected=getComputedStyle(el.querySelector('.selected')),other=getComputedStyle(el.querySelector('button:not(.selected)'));return {selected:selected.backgroundColor,other:other.backgroundColor,text:selected.color};});
 assert.notEqual(colors.selected,colors.other);
 const luminance=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
 const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
 assert.ok(contrast(colors.selected,colors.text)>=4.5,JSON.stringify(colors));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.waitForTimeout(250);await page.screenshot({path:`${out}/${width}-${style}-${appearance}.png`});
 await days.getByRole('button',{name:'Wed',exact:true}).click();assert.equal(await days.locator('.selected').count(),2);
 await page.getByRole('button',{name:'Clear',exact:true}).click();assert.equal(await days.locator('.selected').count(),0);assert.equal(await page.getByRole('button',{name:'CONTINUE',exact:true}).isDisabled(),true);
 console.log(`PASS ${width} ${style} ${appearance}: selected/unselected, contrast, toggle, Clear`);await context.close();
}}finally{await browser.close();}
