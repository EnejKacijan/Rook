import {chromium,webkit} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const out='artifacts/final-stabilization/week-range',before=process.argv.includes('--before');
await mkdir(out,{recursive:true});
const base=process.env.ROOK_QA_URL||'http://127.0.0.1:4198',results=[];
// A synthetic Today owner extends date bounds for the year-boundary case.
// The rendered pager, styles and gesture controller are the actual product code.
const html=`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module">
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Today} from '/src/App.jsx';
import {calendarStatusFixture} from '/src/calendarStatus.fixture.js';
import {weekday} from '/src/domain.js';
import '/src/styles.css';import '/src/overrides.css';import '/src/overlay.css';import '/src/calendar.css';import '/src/theme.css';
const theme=new URLSearchParams(location.search).get('theme');document.documentElement.dataset.style=theme.startsWith('premium')?'premium':'standard';document.documentElement.dataset.appearance=theme.endsWith('dark')?'dark':'light';
const initial=calendarStatusFixture('all-three');initial.program.createdAt='2025-12-01T12:00:00';initial.workouts.push({id:'earliest',completedAt:'2025-12-01T12:00:00',exercises:[]});initial.flexibleWeek={sessions:{future:{id:'future',scheduledDate:'2027-01-18'}}};initial.selectedDate='2026-09-21';initial.selectedDay='Mon';
function Review(){const[state,setState]=useState(initial);window.rangeQA={select:date=>setState(s=>({...s,selectedDate:date,selectedDay:weekday(date)})),date:state.selectedDate};return React.createElement('div',{className:'app-shell'},React.createElement('div',{className:'app-content'},React.createElement(Today,{state,update:fn=>setState(s=>fn(structuredClone(s))),setPage:()=>{},setDetail:()=>{}})));}
createRoot(document.getElementById('root')).render(React.createElement(Review));</script>`;
await writeFile(`${out}/probe.jsx`,html.split('<script type="module">')[1].split('</script>')[0]);
await writeFile(`${out}/probe.html`,html.replace(/<script type="module">[\s\S]*<\/script>/,'<script type="module" src="./probe.jsx"></script>'));
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const read=p=>p.evaluate(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
 const viewport=document.querySelector('.week-range-viewport'),track=document.querySelector('.week-range-track'),day=document.querySelector('.week-pager-viewport'),days=document.querySelector('.week-pager-track');
 const labels=[...track.children].map(e=>{const range=document.createRange();range.selectNodeContents(e);return {text:e.textContent,order:e.style.order,box:rect(e),textBox:rect(range),overflow:e.scrollWidth-e.clientWidth};}).sort((a,b)=>a.box.x-b.box.x);
 const v=rect(viewport),visible=labels.filter(l=>l.textBox.right>v.x&&l.textBox.x<v.right);
 return {date:rangeQA.date,aria:document.querySelector('.week-calendar-trigger').getAttribute('aria-label'),phase:document.querySelector('.week-selector').dataset.weekPhase,viewport:v,labels,visible,dayWidth:day.getBoundingClientRect().width,dayStride:day.getBoundingClientRect().width+parseFloat(getComputedStyle(days).columnGap),dayX:new DOMMatrixReadOnly(getComputedStyle(days).transform).m41,labelX:new DOMMatrixReadOnly(getComputedStyle(track).transform).m41,labelStride:labels[1].box.x-labels[0].box.x,icon:rect(document.querySelector('.week-calendar-trigger svg')),arrows:[...document.querySelectorAll('.week-navigation>button')].map(rect),overflow:document.documentElement.scrollWidth-innerWidth};
});
const approx=(a,b,message)=>assert.ok(Math.abs(a-b)<.7,`${message}: ${a} versus ${b}`);
for(const [engine,type] of (before?[['chromium',chromium]]:[['chromium',chromium],['webkit',webkit]])){
 const browser=await type.launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{for(const width of (before?[390]:[320,390,430]))for(const theme of (before?['premium-dark']:['standard-light','standard-dark','premium-light','premium-dark'])){
  const ctx=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
  await page.goto(`${base}/${out}/probe.html?theme=${theme}`);await page.locator('.week-selector').waitFor();await frames(page);
  const session=engine==='chromium'?await ctx.newCDPSession(page):null;let origin;
  const start=async()=>{const r=await page.locator('.week-pager-viewport').boundingBox();origin={x:r.x+r.width*.75,y:r.y+r.height/2};if(session)await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...origin,id:1}]});else{await page.mouse.move(origin.x,origin.y);await page.mouse.down();}};
  const move=async(dx,paint=true)=>{if(session)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:origin.x+dx,y:origin.y,id:1}]});else await page.mouse.move(origin.x+dx,origin.y);if(paint)await frames(page);};
  const end=async()=>{if(session)await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();};
  const idle=()=>page.waitForFunction(()=>document.querySelector('.week-selector').dataset.weekPhase==='idle');
  const select=async date=>{await page.evaluate(d=>rangeQA.select(d),date);await frames(page);};
  const samples=[];
  for(const date of (before?['2026-09-21','2026-09-28']:['2026-09-14','2026-09-21','2026-09-28','2026-12-28'])){
   await select(date);const initial=await read(page);
   if(!before)assert.ok(initial.labels.every(l=>l.textBox.y>=initial.viewport.y-.5&&l.textBox.bottom<=initial.viewport.bottom+.5),'text remains vertically contained in the clipped viewport');
   if(!before)await page.evaluate(()=>{window.rangeFrames=[];window.recordRange=true;const sample=()=>{const viewport=document.querySelector('.week-range-viewport'),current=document.querySelector('.week-range-track').children[0];rangeFrames.push({date:rangeQA.date,text:current.textContent,x:current.getBoundingClientRect().left-viewport.getBoundingClientRect().left});if(window.recordRange)requestAnimationFrame(sample);};requestAnimationFrame(sample);});
   await start();
   for(const fraction of [.2,.35,.5,.6]){await move(-initial.dayStride*fraction);const sample=await read(page);samples.push({date,fraction,...sample});
    if(!before){assert.ok(Math.abs(sample.labelX/sample.labelStride-sample.dayX/sample.dayStride)<.005,'same normalized progress');assert.deepEqual(sample.icon,initial.icon);assert.deepEqual(sample.arrows,initial.arrows);assert.equal(sample.aria,initial.aria);assert.equal(sample.date,date);assert.ok(sample.labels.every(l=>l.overflow<=1));assert.equal(sample.overflow,0);if(sample.visible.length===2)assert.ok(sample.visible[1].textBox.x-sample.visible[0].textBox.right>=32,'separated complete label pages');}
    if(engine==='chromium'&&(before||date==='2026-09-21'||date==='2026-12-28'))await page.screenshot({path:`${out}/${before?'before':'after'}-${width}-${theme}-${date}-${fraction}.png`});
   }
   await end();await idle();const next=new Date(`${date}T12:00:00`);next.setDate(next.getDate()+7);const expected=next.toLocaleDateString('en-CA');assert.equal((await read(page)).date,expected);
   if(!before){await frames(page);const recorded=await page.evaluate(()=>{window.recordRange=false;return rangeFrames;});const committed=recorded.filter(f=>f.date===expected);assert.ok(committed.length&&committed.every(f=>Math.abs(f.x)<.7),'first painted committed label is already recentered');const settled=await read(page);approx(settled.labelX,-settled.labelStride,'recenter');approx(settled.viewport.w,initial.viewport.w,'stable range viewport across dates');await page.getByRole('button',{name:'Previous week',exact:true}).tap();await idle();assert.equal((await read(page)).date,date);}
  }
  if(!before){
   await select('2026-09-21');let initial=await read(page);await start();await move(-initial.dayWidth*.2);const held=await read(page);await page.waitForTimeout(400);approx((await read(page)).labelX,held.labelX,'hold remains finger-owned');await end();await idle();assert.equal((await read(page)).date,'2026-09-21');
   // A short, fast flick commits below the distance threshold using the same owner.
   // Do not insert screenshot/rAF waits between the fast move and release:
   // those waits can age velocity beyond the product's intentional 100ms window.
   await start();await move(-initial.dayWidth*.05,false);await move(-initial.dayWidth*.24,false);await end();await idle();assert.equal((await read(page)).date,'2026-09-28');
   await select('2026-09-21');
   const nextBox=await page.getByRole('button',{name:'Next week',exact:true}).boundingBox(),prevBox=await page.getByRole('button',{name:'Previous week',exact:true}).boundingBox();
   for(const box of [nextBox,prevBox,nextBox])await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
   await idle();assert.equal((await read(page)).date,'2026-09-28','rapid contacts commit only the owned transition');
   await select('2026-09-21');await start();
   if(session)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:origin.x+6,y:origin.y+80,id:1}]});else await page.mouse.move(origin.x+6,origin.y+80);
   await end();await frames(page);assert.equal((await read(page)).date,'2026-09-21','vertical movement does not page');
   await start();await move(-80);await page.setViewportSize({width:width+20,height:844});await end();await frames(page);let resized=await read(page);assert.equal(resized.date,'2026-09-21');approx(resized.labelX,-resized.labelStride,'resize cancels and recenters');
   await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Next week',exact:true}).tap();await idle();assert.equal((await read(page)).date,'2026-09-28');assert.equal(await page.locator('.week-range-track').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
  }
  assert.deepEqual(errors,[]);results.push({engine,width,theme,samples});await writeFile(`${out}/${before?'before':'after'}-results.json`,JSON.stringify(results,null,2));console.log(`PASS ${engine} ${width} ${theme}`);await ctx.close();
 }}finally{await browser.close();}
}
