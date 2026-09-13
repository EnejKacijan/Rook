import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {importResolutionNotes} from '../src/importResolutionFixture.js';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {openProfileArea} from './qa-current-navigation.mjs';

// Production build, real initial import flow, isolated storage; no mocked parser.
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/import-swipe-paste/swipe';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--overscroll-history-navigation=0']});
const results=[];
const cases=[320,390].flatMap(width=>['standard','premium'].flatMap(style=>['light','dark'].map(appearance=>({width,style,appearance,pwa:true,reduced:false}))));
cases.push(...[320,390].flatMap(width=>[{width,style:'standard',appearance:'dark',pwa:true,reduced:true},{width,style:'standard',appearance:'light',pwa:false,reduced:false}]));
cases.push(...[320,390].map(width=>({width,style:'standard',appearance:'dark',pwa:true,reduced:false,modal:true})));
let page;
try {for(const [index,test] of cases.entries()) {
 if(process.env.ROOK_SWIPE_CASE!=null&&index!==Number(process.env.ROOK_SWIPE_CASE))continue;
 const context=await browser.newContext({viewport:{width:test.width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:test.reduced?'reduce':'no-preference'});
 await context.addInitScript(pwa=>{if(pwa)Object.defineProperty(navigator,'standalone',{value:true});},test.pwa);
 if(test.modal){const state=createReturningUserFixture(0);state.activeWorkout=null;state.activeOptionalSession=null;await context.addInitScript(state=>localStorage.setItem('lift-v2-state',JSON.stringify(state)),state);}
 page=await context.newPage();page.setDefaultTimeout(12000);
 await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.tracing.start({snapshots:true,screenshots:false});
 await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173');
 if(test.modal){await openProfileArea(page,'program');await page.locator('.profile-separated-action').click();await page.getByRole('button',{name:/Import from Notes|Import a different plan/}).click();}
 else await page.locator('.existing-plan-action').click();
 await page.getByPlaceholder(/Paste your workout notes/).fill(importResolutionNotes);
 await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
 const root=page.locator('.import-resolution'),active=page.locator('.import-decision-content:visible');
 const next=page.locator('.import-resolution .sheet-action-footer button.primary');
 const step=n=>page.waitForFunction(n=>document.querySelector('.import-resolution .step-count')?.textContent===`STEP ${n}/5`,n);
 const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const snapshot=()=>root.evaluate(el=>({
   content:[...el.querySelectorAll('.import-decision-content')].map(e=>({
     fields:[...e.querySelectorAll('input,textarea,select')].map(n=>({label:n.getAttribute('aria-label'),value:n.value})),
     selected:[...e.querySelectorAll('[aria-pressed="true"]')].map(n=>n.textContent),
   })),
   scroll:el.querySelector('.import-decision-scroll').scrollTop,
   disabled:el.querySelector('.sheet-action-footer button')?.disabled,
 }));
 await step(1);await page.evaluate(t=>{document.documentElement.dataset.appearance=t.appearance;document.documentElement.dataset.style=t.style;},test);
 await root.evaluate(el=>{
   window.importAuditRoot=el;
   let fiber=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];
   while(fiber&&fiber.type?.name!=='PlanEditor')fiber=fiber.return;
   // Component names may be minified: retain the sourceReview-owning ancestor.
   if(!fiber){fiber=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];while(fiber&&!fiber.memoizedProps?.sourceReview)fiber=fiber.return;}
   window.importAuditReview=fiber?.memoizedProps.sourceReview;
 });
 const storage=await page.evaluate(()=>localStorage.getItem('lift-v2-state'));
 const bodyOverflow=await page.evaluate(()=>document.body.style.overflow);
 const parses=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-funnel-events-v1')||'[]').filter(e=>e.name==='plan_generation_started').length);
 const parseCount=await parses();assert.equal(parseCount,1);
 const cdp=await context.newCDPSession(page),evidence=[];
 // Remove the harness's about:blank entry. Chrome is not an installed PWA;
 // its native history gesture must not impersonate a ROOK navigation failure.
 // Unmodified browser-history ownership is tested by build-plan-swipe-safety.
 await cdp.send('Page.resetNavigationHistory');
 const historyLength=await page.evaluate(()=>history.length);
 const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:['touchEnd','touchCancel'].includes(type)?[]:[{x,y}]});
 async function gesture({kind='complete',capture=false,keepFocus=false}={}){
   if(!keepFocus)await page.evaluate(()=>{document.activeElement?.blur();getSelection()?.removeAllRanges();});
   const box=await root.boundingBox(),before=await root.locator('.step-count').innerText();
   // Start on the progress area's non-interactive space, not a result button.
   const scrollBox=await root.locator('.import-decision-scroll').boundingBox();
   // Regression: the real iPhone gesture begins at the viewport edge, NOT at
   // the padded wizard's left+3 (which hid the original registration defect).
   const x=3,y=scrollBox.y+10;
   if(capture)await page.screenshot({path:`${out}/${index}-before.png`});
   const hit=await page.evaluate(({x,y})=>{let el=document.elementFromPoint(x,y);return {tag:el?.tagName,cls:el?.className,back:el?.closest('.import-resolution')?.dataset.importStepBack};},{x,y});
   await touch('touchStart',x,y);
   const distance=kind==='short'?24:box.width*.60;
   for(let i=1;i<=5;i++)await touch('touchMove',x+distance*i/5,y+1);
   await frames();
   const held=await root.evaluate(el=>({transform:getComputedStyle(el.querySelector('.import-decision-scroll')).transform,x:new DOMMatrixReadOnly(getComputedStyle(el.querySelector('.import-decision-scroll')).transform).m41,rootTransform:getComputedStyle(el).transform,identity:el===window.importAuditRoot,overflow:document.documentElement.scrollWidth>innerWidth}));
   assert.equal(held.identity,true);assert.equal(held.overflow,false);assert.equal(held.rootTransform,'none');
   const moving=test.pwa&&!test.reduced&&!keepFocus;
   assert.ok(Math.abs(held.x-(moving?distance:0))<1,'only eligible normal-motion content follows the finger');
   if(capture)await page.screenshot({path:`${out}/${index}-drag.png`});
   // A short release held beyond the velocity window must cancel by distance.
   if(kind==='short')await page.evaluate(()=>new Promise(r=>setTimeout(r,120)));
   await touch(kind==='cancel'?'touchCancel':'touchEnd');
   await page.waitForFunction(()=>!document.documentElement.dataset.edgeBackActive);await frames();
   const after=await root.locator('.step-count').innerText();
   evidence.push({kind,before,after,held,hit,keepFocus});
   assert.equal(await root.locator('.import-decision-scroll').getAttribute('style'),null);
   if(capture)await page.screenshot({path:`${out}/${index}-after.png`});
 }
 // Cancellation at the first boundary must NOT exit the decision draft.
 await gesture({kind:'cancel'});await step(1);
 await active.getByRole('button',{name:/Leg Press · 3 × 9 · 155 kg/}).click();await next.click();await step(2);
 await active.getByLabel('Reviewed Min reps',{exact:true}).fill('8');assert.equal(await next.isDisabled(),true);
 await page.evaluate(()=>document.activeElement.blur());await frames();const partial=await snapshot();
 await page.getByRole('button',{name:'Back',exact:true}).click();await step(1);await next.click();await step(2);await frames();
 assert.deepEqual(await snapshot(),partial,'visible Back retains incomplete input and validation');
 await gesture({kind:'short'});await step(2);assert.deepEqual(await snapshot(),partial);
 await gesture({kind:'cancel'});await step(2);assert.deepEqual(await snapshot(),partial);
 await active.getByLabel('Reviewed Min reps',{exact:true}).focus();await gesture({keepFocus:true});await step(2);assert.deepEqual(await snapshot(),partial);
 for(let cycle=0;cycle<3;cycle++){
   await gesture({capture:index===0&&cycle===0});
   if(test.pwa){await step(1);await next.click();await step(2);}else await step(2);
   assert.deepEqual(await snapshot(),partial,'swipe and visible Back preserve the same draft/validation/scroll');
 }
 await active.getByLabel('Reviewed Max reps',{exact:true}).fill('10');await next.click();await step(3);
 await active.getByLabel('Reviewed Min reps',{exact:true}).fill('10');await active.getByLabel('Reviewed Max reps',{exact:true}).fill('12');await next.click();await step(4);
 await active.getByPlaceholder('Search exercises',{exact:true}).fill('press');
 await page.evaluate(()=>document.activeElement.blur());await frames();
 const scroller=root.locator('.import-decision-scroll');assert.ok(await scroller.evaluate(el=>el.scrollHeight>el.clientHeight));
 const beforeTop=await scroller.evaluate(el=>el.scrollTop),box=await root.boundingBox();
 await touch('touchStart',box.x+3,580);for(let i=1;i<=8;i++)await touch('touchMove',box.x+4,580-i*35);await touch('touchEnd');await frames();
 const afterTop=await scroller.evaluate(el=>el.scrollTop);assert.ok(afterTop>beforeTop,'first vertical edge touch scrolls the result list');await step(4);
 // Cancel and input ownership do not leak page locks; re-entering resets scroll
 // exactly as the visible Back handler already does, without parsing again.
 await page.getByRole('button',{name:'Back',exact:true}).click();await step(3);await next.click();await step(4);
 assert.equal(await scroller.evaluate(el=>el.scrollTop),0,'visible decision navigation resets the decision scrollport');
 await gesture();if(test.pwa){await step(3);await next.click();await step(4);assert.equal(await scroller.evaluate(el=>el.scrollTop),0);}
 assert.equal(await active.getByPlaceholder('Search exercises',{exact:true}).inputValue(),'press');
 await active.getByPlaceholder('Search exercises',{exact:true}).fill('BOSU Balance');
 await active.getByRole('button',{name:'BOSU Balance',exact:true}).click();await step(5);
 await gesture();if(!test.pwa)await page.getByRole('button',{name:'Back',exact:true}).click();await step(4);
 assert.equal(await active.getByRole('button',{name:'BOSU Balance ✓',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await active.getByPlaceholder('Search exercises',{exact:true}).inputValue(),'BOSU Balance');
 const identity=await root.evaluate(el=>{let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];while(f&&!f.memoizedProps?.sourceReview)f=f.return;return {root:el===window.importAuditRoot,review:!!window.importAuditReview&&f?.memoizedProps.sourceReview===window.importAuditReview};});
 assert.deepEqual(identity,{root:true,review:true});
 assert.equal(await page.evaluate(()=>localStorage.getItem('lift-v2-state')),storage);
 assert.equal(await page.evaluate(()=>history.length),historyLength);
 assert.equal(await page.evaluate(()=>document.body.style.overflow),bodyOverflow);
 // Step 1 has an existing Back to notes. Match it exactly; no parse/apply on
 // this gesture, no invented Back on the now-root From Notes surface.
 for(let n=3;n>=1;n--){await page.getByRole('button',{name:'Back',exact:true}).click();await step(n);}
 const bounds=await root.locator('.import-decision-scroll').boundingBox();
 await touch('touchStart',3,bounds.y+10);for(let i=1;i<=5;i++)await touch('touchMove',3+test.width*.6*i/5,bounds.y+11);await touch('touchEnd');
 if(test.pwa)await page.getByPlaceholder(/Paste your workout notes/).waitFor();else {await step(1);await page.getByRole('button',{name:'Back',exact:true}).click();}
 assert.equal(await page.getByPlaceholder(/Paste your workout notes/).inputValue(),importResolutionNotes);
 await page.evaluate(()=>document.activeElement.blur());
 await touch('touchStart',3,220);for(let i=1;i<=5;i++)await touch('touchMove',3+test.width*.6*i/5,220);await touch('touchEnd');await frames();
 assert.equal(await page.locator('.import-plan-screen.is-compose').count(),1,'From Notes must not gain swipe-to-exit');
 assert.equal(await page.evaluate(()=>localStorage.getItem('lift-v2-state')),storage);
 assert.equal(await parses(),parseCount,'Back does not call parsing/generation again');
 if(test.modal){await page.getByRole('button',{name:'Close import plan',exact:true}).click();await page.locator('.import-plan-screen').waitFor({state:'detached'});assert.equal(await page.locator('.modal-layer').count(),0);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');}
 assert.deepEqual(errors,[]);
 results.push({...test,result:'PASS',identity,vertical:{beforeTop,afterTop},evidence});
 await context.tracing.stop({path:`${out}/${index}.zip`});await context.close();console.log(`PASS import ${index}: ${test.width} ${test.style}/${test.appearance} reduced=${test.reduced} pwa=${test.pwa}`);
 }}catch(error){await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});console.error(await page?.locator('body').innerText().catch(()=>''));throw error;}
finally{await browser.close();await writeFile(`${out}/results${process.env.ROOK_SWIPE_CASE==null?'':`-${process.env.ROOK_SWIPE_CASE}`}.json`,JSON.stringify(results,null,2));}
console.log(`PASS ${results.length} final import swipe cases`);
