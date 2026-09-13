import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {importResolutionNotes} from '../src/importResolutionFixture.js';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {openProfileArea} from './qa-current-navigation.mjs';

const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/forward-swipe/import';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--overscroll-history-navigation=0']}),results=[];
const cases=[320,390].flatMap(width=>['standard','premium'].flatMap(style=>['light','dark'].map(appearance=>({width,style,appearance,pwa:true,reduced:false}))));
cases.push(...[320,390].flatMap(width=>[{width,style:'standard',appearance:'dark',pwa:true,reduced:true},{width,style:'standard',appearance:'light',pwa:false,reduced:false},{width,style:'standard',appearance:'dark',pwa:true,reduced:false,modal:true}]));
let page;
try{for(const[index,t]of cases.entries()){
 if(process.env.ROOK_SWIPE_CASE!=null&&index!==Number(process.env.ROOK_SWIPE_CASE))continue;
 const context=await browser.newContext({viewport:{width:t.width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:t.reduced?'reduce':'no-preference'});
 await context.addInitScript(t=>{if(t.pwa)Object.defineProperty(navigator,'standalone',{value:true});window.planWrites=0;const write=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='lift-v2-state'&&JSON.parse(v)?.program)window.planWrites++;return write.call(this,k,v);};},t);
 if(t.modal){const s=createReturningUserFixture(0);s.activeWorkout=null;s.activeOptionalSession=null;await context.addInitScript(s=>{localStorage.setItem('lift-v2-state',JSON.stringify(s));window.planWrites=0;},s);}
 page=await context.newPage();page.setDefaultTimeout(9000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 await context.tracing.start({snapshots:true,screenshots:false});await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173');
 if(t.modal){await openProfileArea(page,'program');await page.locator('.profile-separated-action').click();await page.getByRole('button',{name:/Import from Notes|Import a different plan/}).click();}else await page.locator('.existing-plan-action').click();
 await page.getByPlaceholder(/Paste your workout notes/).fill(importResolutionNotes);await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
 const root=page.locator('.import-resolution'),current=page.locator('.import-decision-content:visible'),next=()=>root.locator('.sheet-action-footer button.primary');
 const step=n=>page.waitForFunction(n=>document.querySelector('.import-resolution .step-count')?.textContent===`STEP ${n}/5`,n);
 const back=()=>page.getByRole('button',{name:'Back',exact:true}).click();
 // Separate intentional match choices respect the existing 350ms double-tap
 // guard. Gesture checks never wait on this guard or submit a choice.
 const choose=async locator=>{await page.waitForFunction(()=>!window.lastQAMatch||Date.now()-window.lastQAMatch>=350);await locator.click();await page.evaluate(()=>window.lastQAMatch=Date.now());};
 const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await step(1);await page.evaluate(t=>Object.assign(document.documentElement.dataset,{style:t.style,appearance:t.appearance}),t);
 const cdp=await context.newCDPSession(page);await cdp.send('Page.resetNavigationHistory');
 const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:['touchEnd','touchCancel'].includes(type)?[]:[{x,y}]});
 const persisted=await page.evaluate(()=>localStorage.getItem('lift-v2-state')),history=await page.evaluate(()=>window.history.length),evidence=[];
 const writesBefore=await page.evaluate(()=>window.planWrites);
 await root.evaluate(el=>window.originalImportRoot=el);
 async function drag({allowed=false,cancel=false,short=false,input=false,capture=false}={}){
  if(!input)await page.evaluate(()=>{document.activeElement?.blur();getSelection()?.removeAllRanges();});
  const before=await root.locator('.step-count').innerText();
  const fields=await root.locator('input').evaluateAll(nodes=>nodes.map(n=>n.value));
  await root.evaluate(el=>{let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];while(f&&!f.memoizedProps?.onResolve)f=f.return;window.beforeForward={program:f.memoizedProps.program,review:f.memoizedProps.review,resolved:f.memoizedProps.resolved};});
  const bounds=await root.locator('.import-decision-scroll').boundingBox(),x=t.width-3,y=bounds.y+10,dx=short?24:t.width*.6;
  if(capture)await page.screenshot({path:`${out}/${index}-before.png`});
  await touch('touchStart',x,y);for(let i=1;i<=5;i++)await touch('touchMove',x-dx*i/5,y+1);await frames();
  const held=await root.evaluate(el=>({x:new DOMMatrixReadOnly(getComputedStyle(el.querySelector('.import-decision-scroll')).transform).m41,root:el===window.originalImportRoot,transform:getComputedStyle(el).transform,overflow:document.documentElement.scrollWidth>innerWidth}));
  const enabled=allowed&&t.pwa&&!input;assert.ok(Math.abs(held.x-(enabled&&!t.reduced?-dx:0))<1,JSON.stringify({t,before,held,allowed}));assert.equal(held.root,true);assert.equal(held.transform,'none');assert.equal(held.overflow,false);
  if(capture)await page.screenshot({path:`${out}/${index}-drag.png`});
  await touch(cancel?'touchCancel':'touchEnd');
  if(enabled&&!cancel&&!short)await step(Number(before.match(/STEP (\d+)/)[1])+1);
  else{await page.waitForFunction(()=>!document.querySelector('[data-edge-back-active]'));assert.equal(await root.locator('.step-count').innerText(),before);}
  await frames();
  assert.deepEqual(await root.locator('input').evaluateAll(nodes=>nodes.map(n=>n.value)),fields);
  const identity=await root.evaluate(el=>{let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];while(f&&!f.memoizedProps?.onResolve)f=f.return;return ['program','review','resolved'].every(k=>f.memoizedProps[k]===window.beforeForward[k]);});assert.equal(identity,true,'Forward never resolves/matches/normalizes a draft');
  assert.equal(await root.locator('.import-decision-scroll').getAttribute('style'),null);
  evidence.push({before,after:await root.locator('.step-count').innerText(),allowed,cancel,short,input,held,identity});
  if(capture)await page.screenshot({path:`${out}/${index}-after.png`});
 }
 await drag(); // Unresolved first visit.
 await current.getByRole('button',{name:/Leg Press · 3 × 9 · 155 kg/}).click();await drag(); // Valid is not yet visited/committed.
 await next().click();await step(2);await current.getByLabel('Reviewed Min reps',{exact:true}).fill('8');await back();await step(1);
 await drag({allowed:true,cancel:true});await drag({allowed:true,short:true});
 if(!t.pwa){await drag({allowed:true});await step(1);results.push({...t,result:'PASS',evidence,nativeNotIntercepted:true});await context.tracing.stop({path:`${out}/${index}.zip`});await context.close();continue;}
 for(let n=0;n<3;n++){await drag({allowed:true,capture:index===0&&n===0});await step(2);assert.equal(await current.getByLabel('Reviewed Min reps',{exact:true}).inputValue(),'8');if(n<2){await back();await step(1);}}
 await current.getByLabel('Reviewed Max reps',{exact:true}).fill('10');await drag();await next().click();await step(3);await back();await step(2);
 await current.getByLabel('Reviewed Min reps',{exact:true}).focus();await drag({allowed:true,input:true});
 await current.getByLabel('Reviewed Min reps',{exact:true}).fill('');await drag();assert.equal(await next().isDisabled(),true);
 await current.getByLabel('Reviewed Min reps',{exact:true}).fill('7');await drag();assert.equal(await next().isEnabled(),true); // New valid edit still needs explicit Continue.
 await next().click();await step(3);await back();await step(2);await drag({allowed:true});await step(3);
 await current.getByLabel('Reviewed Min reps',{exact:true}).fill('10');await current.getByLabel('Reviewed Max reps',{exact:true}).fill('12');await next().click();await step(4);await drag();
 await current.getByPlaceholder('Search exercises').fill('press');await page.evaluate(()=>document.activeElement.blur());
 const scroll=root.locator('.import-decision-scroll'),box=await root.boundingBox(),beforeTop=await scroll.evaluate(e=>e.scrollTop);
 await touch('touchStart',box.x+box.width-3,570);for(let i=1;i<=8;i++)await touch('touchMove',box.x+box.width-4,570-i*30);await touch('touchEnd');await frames();assert.ok(await scroll.evaluate(e=>e.scrollTop)>beforeTop);await step(4);
 await current.getByPlaceholder('Search exercises').fill('BOSU Balance');await choose(current.getByRole('button',{name:'BOSU Balance',exact:true}));await step(5);await back();await step(4);await drag({allowed:true});await step(5);
 await back();await step(4);await current.getByPlaceholder('Search exercises').fill('BOSU');await drag();
 await choose(current.getByRole('button',{name:'BOSU Balance ✓',exact:true}));await step(5);await drag();
 await choose(root.getByRole('button',{name:'KEEP AS CUSTOM',exact:true}));await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();
 const apply=page.getByRole('button',{name:'USE THIS PLAN',exact:true});assert.equal(await apply.isEnabled(),true);
 await page.evaluate(()=>document.activeElement.blur());await touch('touchStart',t.width-3,210);for(let i=1;i<=5;i++)await touch('touchMove',t.width-3-t.width*.6*i/5,211);await touch('touchEnd');await frames();
 assert.equal(await apply.isVisible(),true);assert.equal(await page.evaluate(()=>window.planWrites),writesBefore,'no writes after the returning fixture has hydrated');assert.equal(await page.evaluate(()=>localStorage.getItem('lift-v2-state')),persisted);assert.equal(await page.evaluate(()=>window.history.length),history);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-funnel-events-v1')||'[]').filter(e=>e.name==='plan_generation_started').length),1);
 assert.deepEqual(errors,[]);results.push({...t,result:'PASS',evidence,noResolutionMutation:true,noApply:true,parsedOnce:true});console.log(`PASS import Forward ${index}: ${t.width} ${t.style}/${t.appearance} reduced=${t.reduced} modal=${!!t.modal}`);
 await context.tracing.stop({path:`${out}/${index}.zip`});await context.close();
}}catch(error){await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});console.error(await page?.locator('body').innerText().catch(()=>''));throw error;}finally{await browser.close();await writeFile(`${out}/results${process.env.ROOK_SWIPE_CASE==null?'':`-${process.env.ROOK_SWIPE_CASE}`}.json`,JSON.stringify(results,null,2));}
console.log(`PASS ${results.length} import Forward cases`);
