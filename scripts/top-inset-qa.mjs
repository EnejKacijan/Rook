import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
const phase=process.argv.includes('--before')?'before':'after';
const out=`artifacts/top-inset-visible/${phase}`;await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
const results=[];
const before=phase==='after'?JSON.parse(await readFile('artifacts/top-inset-visible/before/geometry.json','utf8')):null;
try {
 for(const width of [320,390,430]) for(const appearance of ['light','dark']) for(const style of ['standard','premium']) {
  const state=createReturningUserFixture(2);
  Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
  const context=await browser.newContext({viewport:{width,height:844},colorScheme:appearance,reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
  const page=await context.newPage();await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
  await page.goto('http://127.0.0.1:4173');
  for(const tab of ['TODAY','COACH','PROGRESS','PROFILE']) {
   await page.getByRole('button',{name:tab,exact:true}).click();
   const screen=page.locator(`.${tab.toLowerCase()}-screen`);await screen.waitFor();
   await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(()=>{window.scrollTo(0,0);document.querySelectorAll('main.screen').forEach(e=>e.scrollTop=0);});
   const data=await screen.evaluate((el,tab)=>{
    const label=tab==='TODAY'?el.querySelector('.week-calendar-trigger span'):[...el.querySelectorAll('.eyebrow')].find(e=>e.textContent.trim()===tab);
    if(!label)throw new Error('Missing first header '+tab);
    const row=tab==='TODAY'?label.closest('.screen-top'):label;
    const css=getComputedStyle(el),r=row.getBoundingClientRect(),l=label.getBoundingClientRect();
    const box=e=>{if(!e)return null;const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height,left:b.left,right:b.right,width:b.width};};
    const range=document.createRange();range.selectNodeContents(label);
    const text=range.getBoundingClientRect();
    const heading=el.querySelector(tab==='TODAY'?'.today-program-name':'h1');
    const nav=el.querySelector('.week-navigation');
    return {pageTop:el.getBoundingClientRect().top,paddingTop:parseFloat(css.paddingTop),firstChildTop:el.firstElementChild.getBoundingClientRect().top,rowTop:r.top,rowHeight:r.height,labelTop:l.top,labelBottom:l.bottom,labelHeight:l.height,labelLineHeight:getComputedStyle(label).lineHeight,textTop:text.top,textBottom:text.bottom,textCenter:(text.top+text.bottom)/2,heading:box(heading),headingText:heading?.textContent,eyebrowToHeading:heading?heading.getBoundingClientRect().top-l.bottom:null,visualRowHeight:tab==='TODAY'?parseFloat(getComputedStyle(row).gridTemplateRows.split(' ')[0]):r.height,rowAlign:getComputedStyle(row).alignItems,rowGap:getComputedStyle(row).rowGap,nav:box(nav),hitTargets:nav?[...nav.querySelectorAll('button')].map(box):[],scrollY:scrollY,standalone:matchMedia('(display-mode: standalone)').matches,theme:document.documentElement.dataset.appearance,style:document.documentElement.dataset.style,ancestors:[label.parentElement,label.parentElement.parentElement].map(p=>({class:p.className,top:p.getBoundingClientRect().top,marginTop:getComputedStyle(p).marginTop,paddingTop:getComputedStyle(p).paddingTop}))};
   },tab);
   assert.equal(data.theme,appearance);assert.equal(data.style,style);
   assert.equal(data.paddingTop,24,'Browser viewport uses the shared 24px page inset');
   assert.equal(data.firstChildTop,data.pageTop+data.paddingTop,'No tab-specific space precedes the first content block');
   for(const hit of data.hitTargets){assert.ok(hit.height>=44&&hit.width>=44,'Preserve accessible week targets');assert.ok(hit.top>=0,'No clipped target');}
   if(phase==='after')assert.ok(Math.abs((tab==='TODAY'?data.rowTop:data.labelTop)-24)<2,'Header begins at shared top rhythm');
   if(before){
    const previous=before.find(r=>r.width===width&&r.appearance===appearance&&r.style===style&&r.tab===tab);
    if(tab!=='TODAY'){assert.equal(data.textTop,previous.textTop);assert.deepEqual(data.heading,previous.heading,'Other layouts remain unchanged');}
    if(tab==='TODAY'&&width>350)for(const hit of data.hitTargets)assert.ok(hit.bottom<=data.heading.top,'Expanded hit target does not overlap program name');
   }
   if(tab==='TODAY')assert.ok(data.ancestors.every(p=>p.marginTop==='0px'&&p.paddingTop==='0px'),'Today adds no extra top inset');
   results.push({width,appearance,style,tab,...data});
   await page.screenshot({path:`${out}/${width}-${style}-${appearance}-${tab.toLowerCase()}.png`,animations:'disabled'});
   if(tab==='TODAY'&&phase==='after'){
    const arrow=page.locator('.week-navigation button:not(:disabled)').first();
    const initial=await page.locator('.week-navigation span').textContent();
    await page.keyboard.press('Tab');await arrow.focus();assert.ok(await arrow.evaluate(e=>e===document.activeElement&&e.matches(':focus-visible')));
    const hit=await arrow.boundingBox();await page.mouse.click(hit.x+hit.width/2,hit.y+2);
    await page.waitForFunction(value=>document.querySelector('.week-navigation span')?.textContent!==value,initial);
   }
  }
  await context.close();
  const board=await browser.newPage({viewport:{width:width*4,height:844},deviceScaleFactor:1});
  const images=await Promise.all(['today','coach','progress','profile'].map(async tab=>`<img alt="${tab}" width="${width}" height="844" src="data:image/png;base64,${(await readFile(`${out}/${width}-${style}-${appearance}-${tab}.png`)).toString('base64')}">`));
  await board.setContent(`<body style="margin:0;display:flex">${images.join('')}</body>`);
  await board.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
  await board.screenshot({path:`${out}/${width}-${style}-${appearance}-comparison.png`});await board.close();
 }
 await writeFile(`${out}/geometry.json`,JSON.stringify(results,null,2));
 for(const width of [320,390,430])console.log(JSON.stringify(results.filter(r=>r.width===width&&r.appearance==='light'&&r.style==='standard')));
 console.log(`Measured ${results.length} tab/theme/width states`);
}finally{await browser.close();}
