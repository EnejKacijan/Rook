import assert from 'node:assert/strict';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import {blankState,buildProgram,isoDay,weekday,WEEKDAYS} from '../src/domain.js';
const out='artifacts/TODAY-OVERFLOW-REVIEW',before=process.argv.includes('--before');
await mkdir(`${out}/screenshots`,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function sourceHashes(){const result={};for(const file of await readdir('src',{recursive:true}))if(/\.(jsx?|css)$/.test(file))result[file.replaceAll('\\','/')]=hash(await readFile(`src/${file}`));return result;}
if(before)await writeFile(`${out}/source-before.json`,JSON.stringify(await sourceHashes(),null,2));
else if(process.argv.includes('--verify-scope')){
 const initial=JSON.parse(await readFile(`${out}/source-before.json`)),current=await sourceHashes();
 for(const [file,value]of Object.entries(initial))if(!['App.jsx','overrides.css'].includes(file))assert.equal(current[file],value,`${file} unchanged`);
 const appBefore=(await readFile(`${out}/App.before.jsx`,'utf8')).replaceAll('\r\n','\n');
 const expected=appBefore.replace('if (detail?.todayActions) return <main className="sheet today-actions-sheet">','if (detail?.todayActions) return <main className="screen detail-screen today-actions-sheet">');
 assert.notEqual(expected,appBefore);assert.equal((await readFile('src/App.jsx','utf8')).replaceAll('\r\n','\n'),expected,'exactly the one scoped production edit');
 const cssBefore=(await readFile(`${out}/overrides.before.css`,'utf8')).replaceAll('\r\n','\n');
 const cssExpected=cssBefore.replace('.modal-layer > .detail-screen.export-sheet {','/* This compact menu keeps its header inside the responsive content gutters. */\n:root .modal-layer > .screen.today-actions-sheet > .detail-header {\n  margin-inline: 0;\n  padding-inline: 0;\n}\n.modal-layer > .detail-screen.export-sheet {');
 assert.notEqual(cssExpected,cssBefore);assert.equal((await readFile('src/overrides.css','utf8')).replaceAll('\r\n','\n'),cssExpected,'only the Today menu gutter rule added');
}
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
const settle=page=>page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
try{for(const width of before?[390]:[320,390])for(const appearance of before?['light']:['light','dark'])for(const style of before?['standard']:['standard','premium']){
 const state=blankState(),today=weekday();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:[0,2,4].map(n=>WEEKDAYS[(WEEKDAYS.indexOf(today)+n)%7]),sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true,appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 state.program=buildProgram(state.profile);state.selectedDate=isoDay();state.selectedDay=today;state.ai.planUpgradeDismissed=true;
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));Object.defineProperty(navigator,'standalone',{value:true});},state);
 const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
 const trigger=page.getByRole('button',{name:'Today options',exact:true}),panel=page.locator('.today-actions-sheet'),handle=panel.getByRole('button',{name:'Drag down or tap to close',exact:true});
 await trigger.waitFor();assert.deepEqual(await page.evaluate(()=>[document.documentElement.dataset.appearance,document.documentElement.dataset.style]),[appearance,style]);
 const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 const cdp=await context.newCDPSession(page),key=`${width}-${appearance}-${style}`;
 const open=async()=>{await trigger.scrollIntoViewIfNeeded();const scroll=await page.evaluate(()=>({y:scrollY,body:document.body.getAttribute('style')}));await trigger.click();await panel.waitFor();await settle(page);return scroll;};
 const clean=async scroll=>{await page.locator('.modal-layer').waitFor({state:'detached'});await page.waitForFunction(y=>Math.abs(scrollY-y)<1,scroll.y);assert.equal(await page.evaluate(()=>document.body.getAttribute('style')||''),scroll.body||'');assert.equal(await page.locator('.app-content').evaluate(e=>e.inert),false);};
 const first=await open();
 const actions=await panel.locator(':scope > button.list-row').allTextContents();assert.deepEqual(actions,['Adjust week','Start freestyle workout']);
 if(before){assert.equal(await handle.count(),0);await page.screenshot({path:`${out}/screenshots/before-${key}.png`});results.push({key,handleCount:0,actions});await context.close();continue;}
 assert.equal(await handle.count(),1);assert.equal(await panel.getByRole('button',{name:'Close More options',exact:true}).count(),1);
 const metrics=await panel.evaluate(e=>{const r=e.getBoundingClientRect(),h=e.querySelector('.modal-drag-handle i').getBoundingClientRect(),x=e.querySelector('.detail-header-close').getBoundingClientRect();return {x:r.x,width:r.width,bottom:r.bottom,paddingBottom:getComputedStyle(e).paddingBottom,handleWidth:h.width,handleHeight:h.height,handleTop:h.top,sheetTop:r.top,closeSize:[x.width,x.height],scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};});
 console.log('METRICS',key,JSON.stringify(metrics));
 assert.ok(metrics.handleWidth>=36&&metrics.handleHeight>=4&&metrics.handleTop>metrics.sheetTop);assert.equal(metrics.bottom,844);assert.ok(parseFloat(metrics.paddingBottom)>=20);assert.ok(metrics.scrollWidth<=metrics.clientWidth);assert.ok(metrics.width<=width);
 await page.screenshot({path:`${out}/screenshots/after-${key}.png`});
 await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{bottom:34}});
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.today-actions-sheet')).paddingBottom==='54px');
 assert.equal(await panel.evaluate(e=>e.getBoundingClientRect().bottom),844);
 if(key==='390-dark-standard')await page.screenshot({path:`${out}/screenshots/safe-area-${key}.png`});
 await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{bottom:0}});
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.today-actions-sheet')).paddingBottom==='20px');
 await panel.getByRole('button',{name:'Close More options',exact:true}).click();await clean(first);
 for(let cycle=0;cycle<3;cycle++){
  await page.evaluate(()=>scrollTo(0,80));const scroll=await open(),r=await handle.boundingBox(),x=r.x+r.width/2,y=r.y+14;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+i*24}]});await page.waitForTimeout(16);}
  assert.notEqual(await panel.evaluate(e=>getComputedStyle(e).transform),'none');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await clean(scroll);
 }
 const backdropScroll=await open();const bounds=await panel.boundingBox();await page.mouse.click(width/2,Math.max(1,bounds.y-24));await clean(backdropScroll);
 const cancelScroll=await open();const r=await handle.boundingBox(),x=r.x+r.width/2,y=r.y+14;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+20}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await settle(page);assert.ok(await panel.isVisible());await page.keyboard.press('Escape');await clean(cancelScroll);
 await open();await panel.getByRole('button',{name:'Adjust week',exact:true}).click();await page.locator('.flexible-week-sheet').waitFor();await settle(page);assert.equal(await page.locator('.flexible-week-sheet .modal-drag-handle').count(),1);await page.getByRole('button',{name:'Close Adjust week',exact:true}).click();await page.locator('.modal-layer').waitFor({state:'detached'});
 await open();await panel.getByRole('button',{name:'Start freestyle workout',exact:true}).click();await page.locator('.freestyle-entry').waitFor();await page.getByRole('button',{name:'Close Freestyle workout',exact:true}).click();await page.locator('.modal-layer').waitFor({state:'detached'});
 await page.getByRole('button',{name:/^Open calendar,/}).click();const calendar=page.getByRole('dialog',{name:'Workout calendar',exact:true});await calendar.waitFor();await page.keyboard.press('Escape');await calendar.waitFor({state:'detached'});
 await page.getByRole('button',{name:'PROFILE',exact:true}).click();await page.getByRole('button',{name:'TODAY',exact:true}).click();await trigger.waitFor();
 const final=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));for(const field of ['program','workouts','activeWorkout','activeOptionalSession','flexibleWeek','selectedDate'])assert.deepEqual(final[field],initial[field],`${field} unchanged`);
 assert.equal(await page.locator('.modal-layer').count(),0);assert.deepEqual(errors,[]);
 results.push({key,passed:true,cycles:3,actions,metrics,safeArea34:true,scrollRestored:true,overlayCleanup:true,adjustWeekCalendarUnchanged:true});console.log('PASS',key);await context.close();
}}finally{await browser.close();await writeFile(`${out}/${before?'before':'results'}.json`,JSON.stringify(results,null,2));}
