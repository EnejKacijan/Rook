import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { isoDay, weekday } from '../src/domain.js';
const before=process.argv.includes('--before'),phase=before?'before':'after';
const output=`artifacts/main-navigation/${phase}`;await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
try{
for(const width of [320,390,430])for(const appearance of ['light','dark'])for(const style of ['standard','premium']){
 const state=createReturningUserFixture(3);state.activeWorkout=null;state.ai.planUpgradeDismissed=true;
 Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,colorScheme:appearance,reducedMotion:'reduce',serviceWorkers:'block'});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/ai/status',r=>r.fulfill({json:{available:true}}));
 await page.goto('http://127.0.0.1:4173');
 const measure=()=>page.locator('.bottom-nav').evaluate(nav=>{
   const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
   const css=getComputedStyle(nav);
   return {nav:box(nav),safePadding:parseFloat(css.paddingBottom),background:css.backgroundColor,buttons:[...nav.querySelectorAll('button')].map(b=>({box:box(b),current:b.getAttribute('aria-current'),label:b.textContent,font: getComputedStyle(b.querySelector('.nav-label')||b.querySelector('span')).fontSize,color:getComputedStyle(b).color,icon:b.querySelector('svg')?box(b.querySelector('svg')):null})),screenPadding:getComputedStyle(document.querySelector('main.screen')).paddingBottom,coach:document.querySelector('.coach-input')?box(document.querySelector('.coach-input')):null};
 });
 for(const tab of ['TODAY','COACH','PROGRESS','PROFILE']){
   await page.locator('.bottom-nav').getByRole('button',{name:tab,exact:true}).click();
   await page.locator(`.${tab.toLowerCase()}-screen`).waitFor();await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(()=>{window.scrollTo(0,0);document.querySelectorAll('main.screen').forEach(e=>e.scrollTop=0);});await page.waitForTimeout(100);
   const m=await measure();
   if(!before){
     assert.equal(await page.locator('html').getAttribute('data-appearance'),appearance);
     assert.equal(await page.locator('html').getAttribute('data-style'),style);
     assert.equal(m.nav.height,56);assert.equal(m.safePadding,0);
     assert.equal(m.buttons.filter(b=>b.current==='page').length,1);
     for(const b of m.buttons){assert.ok(b.box.height>=48);assert.equal(b.icon.width,22);assert.equal(b.icon.height,22);assert.equal(b.font,'9.5px');}
     const contrast=await page.locator('.bottom-nav').evaluate(nav=>{
       const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
       const lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
       const ratio=(a,b)=>{a=lum(rgb(a));b=lum(rgb(b));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
       const bg=getComputedStyle(nav).backgroundColor;
       return [...nav.querySelectorAll('button')].map(b=>({text:ratio(getComputedStyle(b).color,bg),icon:ratio(getComputedStyle(b).color,bg)}));
     });
     for(const c of contrast){assert.ok(c.text>=4.5,JSON.stringify(contrast));assert.ok(c.icon>=3,JSON.stringify(contrast));}m.contrast=contrast;
     assert.ok(await page.locator('.bottom-nav .nav-active').evaluate(b=>getComputedStyle(b).color!==getComputedStyle(b.parentElement.querySelector('button:not(.nav-active)')).color),'Active theme accent is not overridden');
     assert.ok(await page.locator('.bottom-nav').evaluate(nav=>[...nav.querySelectorAll('.nav-label')].every(el=>getComputedStyle(el).fontFamily===getComputedStyle(document.documentElement).fontFamily)),'Labels inherit the ROOK font');
     assert.ok(await page.locator('.nav-label').evaluateAll(labels=>labels.every(el=>getComputedStyle(el).fontWeight==='700')),'Approved v3 labels retain uniform 700 weight');
     assert.ok(await page.locator('.nav-icon').evaluateAll(icons=>icons.every(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(el.querySelector('.nav-icon-line')).strokeWidth==='1.6px')),'No capsule; approved uniform outline strokes');
     assert.ok(await page.locator('.bottom-nav button').evaluateAll(buttons=>buttons.every(b=>getComputedStyle(b.querySelector('.nav-icon-solid')).display===(b.getAttribute('aria-current')==='page'?'block':'none'))),'Solid variant only for the active destination');
     assert.ok(await page.locator('.bottom-nav button').evaluateAll(buttons=>buttons.every(b=>getComputedStyle(b).transitionDuration==='0s')),'Reduced motion removes color transitions');
     if(tab==='COACH')assert.ok(Math.abs(m.coach.bottom-m.nav.y)<1,`Coach gap: ${m.coach.bottom-m.nav.y}`);
   }
   results.push({width,appearance,style,tab,...m});
   await page.screenshot({path:`${output}/${width}-${style}-${appearance}-${tab.toLowerCase()}.png`,animations:'disabled'});
   if(!before&&tab!=='COACH'){
     const last=page.locator(`.${tab.toLowerCase()}-screen button:visible`).last();
     await page.locator(`.${tab.toLowerCase()}-screen`).evaluate(e=>{e.scrollTop=e.scrollHeight;window.scrollTo(0,document.documentElement.scrollHeight);});
     const r=await last.boundingBox();assert.ok(r.y+r.height<=m.nav.y+1,`${tab} last action covered: ${JSON.stringify(r)}`);
     await page.screenshot({path:`${output}/${width}-${style}-${appearance}-${tab.toLowerCase()}-scrolled.png`,animations:'disabled'});
   }
 }
 if(!before){
   await page.locator('.bottom-nav button').first().focus();await page.keyboard.press('Enter');
   assert.equal(await page.locator('.bottom-nav button').first().getAttribute('aria-current'),'page');
   assert.ok(await page.locator('.bottom-nav button').first().evaluate(e=>e.matches(':focus-visible')&&getComputedStyle(e).outlineStyle!=='none'));
   await page.evaluate(()=>document.documentElement.style.setProperty('--rook-nav-safe-bottom','34px'));await page.waitForTimeout(100);
   assert.equal((await measure()).nav.height,90,'34px safe area is added exactly once');
   await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});await page.waitForTimeout(100);
   for(const tab of ['TODAY','COACH','PROGRESS','PROFILE']){
     await page.locator('.bottom-nav').getByRole('button',{name:tab,exact:true}).click();await page.waitForTimeout(100);
     const enlarged=await measure();assert.equal(enlarged.safePadding,34);assert.ok(enlarged.nav.height>=90);
     for(const b of enlarged.buttons)assert.ok(b.box.height>=48);
     assert.ok(Math.max(...enlarged.buttons.map(b=>b.icon.y))-Math.min(...enlarged.buttons.map(b=>b.icon.y))<1,'Icons share one row even when a large label wraps');
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
     assert.ok(await page.locator('.bottom-nav').evaluate(nav=>Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-total-height'))-nav.getBoundingClientRect().height)<1));
     if(tab==='COACH')assert.ok(Math.abs(enlarged.coach.bottom-enlarged.nav.y)<1);
     await page.screenshot({path:`${output}/${width}-${style}-${appearance}-${tab.toLowerCase()}-large-text-safe-area.png`});
   }
   await page.evaluate(()=>{document.documentElement.style.fontSize='';document.documentElement.style.removeProperty('--rook-nav-safe-bottom');});
   await page.locator('.bottom-nav').getByRole('button',{name:'COACH',exact:true}).click();
   const input=page.locator('.coach-input textarea');await input.fill('A long local draft to check wrapping and composer growth. '.repeat(12));
   assert.equal(await page.locator('.bottom-nav').isVisible(),false,'Preserve existing mobile focus behavior');
   await page.setViewportSize({width,height:530});await page.waitForTimeout(100);
   assert.ok(await input.evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight));
   await page.screenshot({path:`${output}/${width}-${style}-${appearance}-coach-focused-resized.png`});
   await input.evaluate(e=>e.blur());await page.setViewportSize({width,height:844});await page.waitForTimeout(100);
   assert.equal(await page.locator('.bottom-nav').isVisible(),true);
   const m=await measure();assert.ok(Math.abs(m.coach.bottom-m.nav.y)<1);
   const planned=structuredClone(state);if(!planned.program.days.some(day=>day.weekday===weekday()))planned.program.days[0].weekday=weekday();planned.selectedDay=weekday();planned.selectedDate=isoDay();planned.page='today';
   await page.evaluate(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),planned);await page.reload();
   await page.locator('.bottom-nav').getByRole('button',{name:'TODAY',exact:true}).click();
   const start=page.getByRole('button',{name:'START WORKOUT',exact:true});await start.waitFor();
   assert.ok(await start.evaluate(e=>e.classList.contains('primary')));
   await page.evaluate(()=>{window.scrollTo(0,0);document.querySelectorAll('main.screen').forEach(e=>e.scrollTop=0);});
   await page.screenshot({path:`${output}/${width}-${style}-${appearance}-today-start-workout.png`,animations:'disabled'});
   await start.click();await page.locator('.workout-screen').waitFor();assert.equal(await page.locator('.bottom-nav').count(),0,'Persistent footer remains absent in active workout');
 }
 assert.deepEqual(errors,[]);await context.close();console.log(`${phase} ${width} ${style} ${appearance}: four tabs passed`);
}
await writeFile(`${output}/geometry.json`,JSON.stringify(results,null,2));
for(const width of [320,390,430])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const board=await browser.newPage({viewport:{width:width*4,height:872}});
 const images=await Promise.all(['today','coach','progress','profile'].map(async tab=>`<section><header>${width}px · ${style} ${appearance} · ${tab}</header><img width="${width}" height="844" src="data:image/png;base64,${(await readFile(`${output}/${width}-${style}-${appearance}-${tab}.png`)).toString('base64')}"></section>`));
 await board.setContent(`<body style="margin:0;display:flex;background:#ddd;font:12px Arial"><style>header{height:28px;display:grid;place-items:center}img{display:block}</style>${images.join('')}</body>`);await board.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));await board.screenshot({path:`${output}/${width}-${style}-${appearance}-comparison.png`});await board.close();
}
}finally{await browser.close();}
