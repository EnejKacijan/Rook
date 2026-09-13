import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

// Isolated contexts only. Real questionnaire, real Back buttons, native Chromium
// touch input. No parser/generator calls or owner-storage fixtures are involved.
const base=process.env.ROOK_QA_URL||'http://127.0.0.1:4173';
const dir='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/build-plan-swipe-back';
await mkdir(`${dir}/screenshots`,{recursive:true});await mkdir(`${dir}/traces`,{recursive:true});
// Chromium tabs are not installed PWAs: disabling their native overscroll here
// models standalone ownership. A separate unmodified-browser probe follows.
const results=[],browser=await chromium.launch({channel:'chrome',headless:true,args:['--overscroll-history-navigation=0']});
const cases=[320,390].flatMap(width=>['standard','premium'].flatMap(style=>['light','dark'].map(appearance=>({width,style,appearance,reduced:false,pwa:true}))));
cases.push(...[320,390].map(width=>({width,style:'standard',appearance:'dark',reduced:true,pwa:true})),
 ...[320,390].map(width=>({width,style:'standard',appearance:'light',reduced:false,pwa:false})));
let activePage;
try {for(const [index,test] of cases.entries()) {
 if(process.env.ROOK_SWIPE_CASE!=null&&index!==Number(process.env.ROOK_SWIPE_CASE))continue;
 const context=await browser.newContext({viewport:{width:test.width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:test.reduced?'reduce':'no-preference'});
 await context.addInitScript(({pwa})=>{
  if(pwa)Object.defineProperty(navigator,'standalone',{value:true});
  window.swipeCommits=0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(renderer){this.renderers.set(1,renderer);return 1;},onCommitFiberRoot(){window.swipeCommits++;},onCommitFiberUnmount(){}};
  window.swipeQA={steps:[],scrollCalls:[],backs:[],history:[]};
  const recordStep=()=>{const step=document.querySelector('.step-count')?.textContent;
   if(step&&window.swipeQA.steps.at(-1)?.step!==step)window.swipeQA.steps.push({step,at:performance.now()});};
  new MutationObserver(recordStep).observe(document,{subtree:true,childList:true,characterData:true});
  document.addEventListener('click',e=>{const b=e.target.closest?.('button[aria-label]');if(/^Back/.test(b?.getAttribute('aria-label')||''))window.swipeQA.backs.push({step:document.querySelector('.step-count')?.textContent,at:performance.now()});},true);
  for(const target of [window,Element.prototype]){const original=target.scrollTo;target.scrollTo=function(...args){window.swipeQA.scrollCalls.push({step:document.querySelector('.step-count')?.textContent,args,at:performance.now()});return original.apply(this,args);};}
  for(const method of ['pushState','replaceState']){const original=history[method];history[method]=function(...args){window.swipeQA.history.push({method,at:performance.now()});return original.apply(this,args);};}
 },test);
 const page=await context.newPage();activePage=page;page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/ai/status',route=>route.fulfill({json:{available:false}}));
 await page.route('**/api/ai',route=>route.fulfill({status:503,json:{error:'Offline QA'}}));
 await context.tracing.start({screenshots:false,snapshots:true});
 await page.goto(`${base}/?swipe-qa=parent`,{waitUntil:'networkidle'});
 await page.goto(`${base}/?swipe-qa=questionnaire`,{waitUntil:'networkidle'});
 const b=name=>page.getByRole('button',{name,exact:true});
 const step=async n=>page.waitForFunction(n=>document.querySelector('.step-count')?.textContent===`STEP ${n}/8`,n);
 const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const animations=()=>page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
 const selected=async name=>assert.match(await b(name).getAttribute('class'),/selected-option/);
 const form=()=>page.locator('.onboarding').evaluate(root=>({selected:[...root.querySelectorAll('.selected-option')].map(e=>e.textContent),fields:[...root.querySelectorAll('input,textarea,select')].filter(e=>e.getAttribute('aria-label')!=='Restrictions or clinician limits').map(e=>({name:e.getAttribute('aria-label')||e.type,value:e.value,checked:e.checked})),restriction:root.querySelector('[aria-label="Restrictions or clinician limits"]')?.value||root.querySelector('.restriction-disclosure.has-value strong')?.textContent||null,error:root.querySelector('#custom-split-error')?.textContent||null}));
 const scroll=()=>page.evaluate(()=>({page:scrollY,root:document.querySelector('.onboarding').scrollTop,content:document.querySelector('.onboarding-content').scrollTop}));
 const cdp=await context.newCDPSession(page);
 const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:['touchEnd','touchCancel'].includes(type)?[]:[{x,y}]});
 const gestureEvidence=[];
 async function drag({cancel=false,short=false,start=3,y=215,capture=false}={}){
  await animations();
  const before=await page.locator('.step-count').innerText(),answer=await form();
  const shell=await page.locator('.onboarding').evaluate(e=>({style:e.getAttribute('style'),width:e.getBoundingClientRect().width}));
  const goal=short?38:Math.round(test.width*.56);
  await page.locator('[data-swipe-back-content]').evaluate(e=>{window.swipeContent=e;window.swipeField=e.querySelector('textarea,input');});
  const commits=await page.evaluate(()=>window.swipeCommits),persisted=await page.evaluate(()=>localStorage.getItem('lift-v2-state'));
  if(capture)await page.screenshot({path:`${dir}/screenshots/${index}-before.png`});
  const began=performance.now();await touch('touchStart',start,y);
  for(let i=1;i<=4;i++)await touch('touchMove',start+(goal-start)*i/4,y+1);
  await frames();
  const held=await page.evaluate(()=>({x:new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-swipe-back-content]')).transform).m41,
   root:getComputedStyle(document.querySelector('.onboarding')).transform,overflow:document.documentElement.scrollWidth-innerWidth,
   active:document.documentElement.dataset.edgeBackActive,identity:window.swipeContent===document.querySelector('[data-swipe-back-content]'),history:history.length}));
  assert.equal(held.root,'none');assert.equal(held.overflow,0);assert.equal(held.identity,true);
  assert.equal(await page.evaluate(()=>window.swipeCommits),commits,'finger-follow must not rerender the questionnaire');
  assert.equal(await page.evaluate(()=>localStorage.getItem('lift-v2-state')),persisted,'drag must not persist answers');
  const enabled=test.pwa&&start<24;
  assert.ok(enabled&&!test.reduced?Math.abs(held.x-(goal-start))<1:held.x===0,JSON.stringify(held));
  if(capture)await page.screenshot({path:`${dir}/screenshots/${index}-drag.png`});
  await touch(cancel?'touchCancel':'touchEnd');
  if(enabled&&!cancel&&!short)await step(Number(before.match(/STEP (\d+)/)[1])-1);
  else {await page.waitForFunction(()=>!document.documentElement.dataset.edgeBackActive);assert.equal(await page.locator('.step-count').innerText(),before);assert.deepEqual(await form(),answer);
   assert.ok(await page.evaluate(()=>window.swipeContent===document.querySelector('[data-swipe-back-content]')),'cancel must not remount content');}
  await frames();
  assert.equal(await page.locator('.onboarding').getAttribute('style'),shell.style);
  assert.equal(await page.locator('[data-swipe-back-content]').getAttribute('style'),null);
  const after=await page.locator('.step-count').innerText();
  gestureEvidence.push({before,after,cancel,short,start,held,interactionMs:performance.now()-began});
 }
 async function chooseGoal(){await b('Build muscle').click();await step(3);}
 async function chooseExperience(){
  // Existing cross-choice double-tap guard; wait only for that explicit guard,
  // not for swipe/scroll readiness. Saved-selection stability is checked below.
  await page.waitForFunction(()=>!document.querySelector('.is-acknowledging'));
  const at=await page.evaluate(()=>performance.now());await page.waitForFunction(at=>performance.now()-at>=350,at);
  await page.getByRole('button',{name:/^Beginner/}).click();await step(4);
 }
 const historyLength=await page.evaluate(()=>history.length);
 await b('BUILD MY PLAN').click();await step(1);
 await page.getByRole('combobox',{name:'Age range'}).click();await page.getByRole('option',{name:'18–29'}).click();await b('CONTINUE').click();await step(2);
 await page.evaluate(t=>{document.documentElement.dataset.style=t.style;document.documentElement.dataset.appearance=t.appearance;},test);
 await chooseGoal();
 if(!test.pwa){
  await drag({short:true});await step(3);await b('Back').click();await step(2);
  assert.equal(await page.evaluate(()=>history.length),historyLength);await page.goBack();assert.match(page.url(),/swipe-qa=parent/);
  results.push({...test,passed:true,gestureEvidence,normalBrowserNativeHistory:true});await context.tracing.stop({path:`${dir}/traces/${index}.zip`});await context.close();continue;
 }
 await drag();await step(2);await selected('Build muscle');
 // Hold the restored selection beyond the acknowledgement + double-tap window.
 const restoredAt=await page.evaluate(()=>performance.now());await page.waitForFunction(at=>performance.now()-at>450,restoredAt);await step(2);
 await chooseGoal();await chooseExperience();await drag();await step(3);
 assert.match(await page.getByRole('button',{name:/^Beginner/}).getAttribute('class'),/selected-option/);
 const experienceAt=await page.evaluate(()=>performance.now());await page.waitForFunction(at=>performance.now()-at>450,experienceAt);await step(3);
 await drag();await step(2);await selected('Build muscle');await chooseGoal();await chooseExperience();
 await b('4 days').click();await page.getByLabel('Any day works').check();await b('60 min').click();
 const schedule=await form();await b('CONTINUE').click();await step(5);await b('Commercial gym').click();
 await b('Back').click();await step(4);await frames();const tapBackScroll=await scroll();assert.deepEqual(await form(),schedule);
 await b('CONTINUE').click();await step(5);const scrollStart=await page.evaluate(()=>window.swipeQA.scrollCalls.length);
 await drag({capture:index===0});await step(4);await frames();const swipeBackScroll=await scroll();assert.deepEqual(swipeBackScroll,tapBackScroll);assert.deepEqual(await form(),schedule);
 const returnScrollCalls=await page.evaluate(from=>window.swipeQA.scrollCalls.slice(from),scrollStart);
 assert.ok(returnScrollCalls.every(call=>!call.args.some(arg=>arg?.behavior==='smooth')),'Back must not trigger assisted Continue reveal');
 if(index===0)await page.screenshot({path:`${dir}/screenshots/${index}-after.png`});
 await drag({short:true});await drag({cancel:true});await drag({start:60,short:true});
 // First intentional vertical touch in the same edge zone must retain scrolling.
 const beforeScroll=await scroll();await touch('touchStart',3,650);
 for(let i=1;i<=8;i++)await touch('touchMove',4,650-i*48);
 await touch('touchEnd');await frames();const vertical=await scroll();await step(4);
 assert.ok(vertical.page>beforeScroll.page||vertical.root>beforeScroll.root||vertical.content>beforeScroll.content,'edge vertical swipe must scroll Step 4');
 await b('CONTINUE').click();await step(5);await selected('Commercial gym');const equipment=await form();
 await b('CONTINUE').click();await step(6);await b('Balanced').click();const priorities=await form();
 await b('CONTINUE').click();await step(7);await page.getByRole('button',{name:/Balanced starting point/}).click();const effort=await form();
 await b('CONTINUE').click();await step(8);
 await page.getByRole('button',{name:/I already have a preferred weekly structure/}).click();await b('Other').click();
 const raw='  Upper / Quantum split / Lower  ';await page.getByLabel('Other preferred split').fill(raw);
 await page.getByRole('button',{name:/Add movements or exercises to avoid/}).click();await page.getByLabel('Restrictions or clinician limits').fill('No jumping');
 await b('Machines').click();
 assert.equal(await b('BUILD MY PLAN').isDisabled(),true);const preferences=await form();
 // Focused form controls keep ownership; an edge drag must not navigate.
 await page.getByLabel('Other preferred split').focus();await touch('touchStart',3,215);await touch('touchMove',75,216);await touch('touchEnd');await frames();await step(8);
 assert.equal(await page.getByLabel('Other preferred split').inputValue(),raw);
 await page.locator('.onboarding h1').click();await drag();await step(7);assert.deepEqual(await form(),effort);
 await b('CONTINUE').click();await step(8);assert.deepEqual(await form(),preferences);assert.equal(await b('BUILD MY PLAN').isDisabled(),true);
 await page.getByLabel('Other preferred split').fill('Upper / Lower / Upper / Lower');assert.equal(await b('BUILD MY PLAN').isEnabled(),true);
 const validPreferences=await form();await page.locator('.onboarding h1').click();await drag();await step(7);
 await b('CONTINUE').click();await step(8);assert.deepEqual(await form(),validPreferences);
 // Back through every parent using the same footer action. No answer hydration.
 await drag();await step(7);assert.deepEqual(await form(),effort);
 await drag();await step(6);assert.deepEqual(await form(),priorities);
 await drag();await step(5);assert.deepEqual(await form(),equipment);
 await drag();await step(4);assert.deepEqual(await form(),schedule);
 await drag();await step(3);await drag();await step(2);await selected('Build muscle');
 await drag();await step(1);assert.match(await page.getByRole('combobox',{name:'Age range'}).innerText(),/18–29/);
 assert.equal(await page.evaluate(()=>history.length),historyLength,'internal Back must not push/pop browser history');
 // Step 1 uses its existing semantic boundary (not a fabricated destination).
 await animations();await touch('touchStart',3,215);await touch('touchMove',test.width*.56,216);await touch('touchEnd');await b('BUILD MY PLAN').waitFor();
 assert.equal(await page.locator('.step-count').count(),0);
 const trace=await page.evaluate(()=>window.swipeQA);assert.deepEqual(errors,[]);
 await page.goBack();assert.match(page.url(),/swipe-qa=parent/);
 results.push({...test,passed:true,gestureEvidence,tapBackScroll,swipeBackScroll,returnScrollCalls,vertical,historyLength,trace});
 await context.tracing.stop({path:`${dir}/traces/${index}.zip`});await context.close();console.log(`PASS ${index}: ${test.width} ${test.style}/${test.appearance} reduced=${test.reduced}`);
 }}catch(error){await activePage?.screenshot({path:`${dir}/screenshots/failure.png`}).catch(()=>{});console.error(await activePage?.locator('body').innerText().catch(()=>''));throw error;}
finally {await browser.close();await writeFile(`${dir}/results${process.env.ROOK_SWIPE_CASE==null?'':`-${process.env.ROOK_SWIPE_CASE}`}.json`,JSON.stringify(results,null,2));}
console.log(`PASS ${results.length} focused Build My Plan browser cases`);
