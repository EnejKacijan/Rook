import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/build-plan-swipe-forward';
await mkdir(`${out}/screenshots`,{recursive:true});
const base=process.env.ROOK_QA_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--overscroll-history-navigation=0']});
const cases=[320,390].flatMap(width=>['standard','premium'].flatMap(style=>['light','dark'].map(appearance=>({width,style,appearance,pwa:true,reduced:false}))));
cases.push(...[320,390].map(width=>({width,style:'standard',appearance:'dark',pwa:true,reduced:true})),
 ...[320,390].map(width=>({width,style:'standard',appearance:'light',pwa:false,reduced:false})));
const results=[];let current;
try{for(const [index,t]of cases.entries()){
 if(process.env.ROOK_SWIPE_CASE!=null&&index!==Number(process.env.ROOK_SWIPE_CASE))continue;
 const context=await browser.newContext({viewport:{width:t.width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:t.reduced?'reduce':'no-preference'});
 await context.addInitScript(t=>{
  if(t.pwa)Object.defineProperty(navigator,'standalone',{value:true});
  window.questionnaireCommits=0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(r){this.renderers.set(1,r);return 1;},onCommitFiberRoot(){window.questionnaireCommits++;},onCommitFiberUnmount(){}};
 },t);
 const page=await context.newPage();current=page;page.setDefaultTimeout(10000);const errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 await page.goto(base);const b=name=>page.getByRole('button',{name,exact:true});
 await b('BUILD MY PLAN').click();
 await page.evaluate(t=>Object.assign(document.documentElement.dataset,{style:t.style,appearance:t.appearance}),t);
 const step=n=>page.waitForFunction(n=>document.querySelector('.step-count')?.textContent===`STEP ${n}/8`,n);
 const stepNumber=()=>page.locator('.step-count').innerText().then(s=>Number(s.match(/STEP (\d+)/)[1]));
 const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const animations=()=>page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
 const cdp=await context.newCDPSession(page),touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:['touchEnd','touchCancel'].includes(type)?[]:[{x,y}]});
 const evidence=[];
 async function drag({back=false,cancel=false,short=false,allowed=true,startInset=3,capture=false}={}){
  await animations();const before=await stepNumber(),rect=await page.locator('.onboarding').boundingBox();
  const x=back?rect.x+startInset:rect.x+rect.width-startInset,y=215,dx=(back?1:-1)*(short?26:rect.width*.56);
  const beforeState=await page.evaluate(()=>{window.dragContent=document.querySelector('[data-swipe-back-content]');return {persisted:localStorage.getItem('lift-v2-state'),commits:window.questionnaireCommits,footer:document.querySelector('.onboarding-footer').getBoundingClientRect().toJSON()};});
  if(capture)await page.screenshot({path:`${out}/screenshots/${index}-before.png`});
  await touch('touchStart',x,y);for(let i=1;i<=5;i++)await touch('touchMove',x+dx*i/5,y+1);await frames();
  const held=await page.evaluate(()=>({x:new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-swipe-back-content]')).transform).m41,
   root:getComputedStyle(document.querySelector('.onboarding')).transform,overflow:document.documentElement.scrollWidth-innerWidth,
   same:window.dragContent===document.querySelector('[data-swipe-back-content]'),commits:window.questionnaireCommits,
   footer:document.querySelector('.onboarding-footer').getBoundingClientRect().toJSON(),persisted:localStorage.getItem('lift-v2-state')}));
  const active=allowed&&t.pwa&&startInset<=24;
  assert.equal(held.root,'none');assert.equal(held.overflow,0);assert.equal(held.same,true);
  if(active)assert.equal(held.commits,beforeState.commits,'owned drag must not rerender; excluded touches may dismiss an open picker');
  if(active)assert.deepEqual(held.footer,beforeState.footer);
  assert.equal(held.footer.x,beforeState.footer.x);assert.equal(held.footer.width,beforeState.footer.width);
  assert.equal(held.persisted,beforeState.persisted);
  assert.ok(Math.abs(held.x-(active&&!t.reduced?dx:0))<1,JSON.stringify({t,before,held,active}));
  if(capture)await page.screenshot({path:`${out}/screenshots/${index}-drag.png`});
  await touch(cancel?'touchCancel':'touchEnd');
  if(active&&!cancel&&!short)await step(before+(back?-1:1));
  else{await page.waitForFunction(()=>!document.querySelector('[data-edge-back-active]'));assert.equal(await stepNumber(),before);assert.ok(await page.evaluate(()=>window.dragContent===document.querySelector('[data-swipe-back-content]')));}
  await frames();assert.equal((await page.locator('[data-swipe-back-content]').getAttribute('style'))||'','');
  evidence.push({before,after:await stepNumber(),back,cancel,short,allowed,startInset,heldX:held.x,sameContentDuringDrag:held.same,reactCommitsDuringDrag:held.commits-beforeState.commits});
 }
 await step(1);await drag({allowed:false}); // Missing required age.
 await page.getByRole('combobox',{name:'Age range'}).click();await page.getByRole('option',{name:'18–29'}).click();
 await drag({short:true});await drag({cancel:true});await drag({startInset:60,short:true});
 await page.getByRole('combobox',{name:'Age range'}).click();await drag({allowed:false});
 await page.getByLabel('First name',{exact:true}).fill('Local draft');await drag({allowed:false});
 assert.equal(await page.getByLabel('First name',{exact:true}).inputValue(),'Local draft');await page.locator('.onboarding h1').click();
 if(!t.pwa){await drag({allowed:false});await b('CONTINUE').click();await step(2);results.push({...t,passed:true,evidence,nativeBrowserNotIntercepted:true});await context.close();continue;}
 await drag({capture:index===0});await step(2);await drag({allowed:false}); // No default goal.
 await b('Build muscle').click();await step(3);await drag({allowed:false}); // No default experience.
 await drag({back:true});await step(2);assert.match(await b('Build muscle').getAttribute('class'),/selected-option/);
 await drag();await step(3); // Restored single-choice answer, no redundant reselect.
 await page.waitForFunction(()=>!document.querySelector('.is-acknowledging'));
 await page.getByRole('button',{name:/^Beginner/}).click();await step(4);
 await drag({back:true});await step(3);await drag();await step(4);
 // A real choice callback wins over an already-in-flight gesture. Experience
 // is already valid, so an accidental second advance would incorrectly hit 4.
 await drag({back:true});await drag({back:true});await step(2);
 await touch('touchStart',t.width-3,215);await touch('touchMove',t.width*.45,216);
 await b('Build muscle').evaluate(button=>button.click());
 await touch('touchEnd');await step(3);await animations();await frames();assert.equal(await stepNumber(),3,'auto-advance + old gesture must not skip the valid next step');
 await drag();await step(4);
 await drag({allowed:false}); // Incomplete schedule cannot advance.
 const startScroll=await page.evaluate(()=>scrollY);
 await touch('touchStart',t.width-3,640);for(let i=1;i<=8;i++)await touch('touchMove',t.width-4,640-i*45);await touch('touchEnd');await frames();
 assert.ok(await page.evaluate(()=>scrollY)>startScroll,'right-edge vertical touch remains scroll');await step(4);
 await b('4 days').click();await page.getByLabel('Any day works').check();await b('60 min').click();
 await drag();await step(5);await drag({back:true});await step(4);
 await page.getByLabel('Any day works').uncheck();await page.locator('.onboarding h1').click();assert.equal(await b('CONTINUE').isDisabled(),true);await drag({allowed:false});
 await page.getByLabel('Any day works').check();await page.locator('.onboarding h1').click();await drag();await step(5);
 await drag({allowed:false});await b('Commercial gym').click();
 await drag();await step(6);await b('Balanced').click();await drag();await step(7);
 await drag();await step(8); // Existing optional-volume skip, no invented choice.
 assert.equal(await b('BUILD MY PLAN').isEnabled(),true);await drag({allowed:false});await step(8);
 assert.equal(await page.locator('.building-overlay,.generated-plan-preview').count(),0,'Forward must not build/apply');
 // Revisit all answered steps in both directions; answers remain intact.
 for(let n=8;n>1;n--)await drag({back:true});
 assert.match(await page.getByRole('combobox',{name:'Age range'}).innerText(),/18–29/);
 assert.equal(await page.getByLabel('First name',{exact:true}).inputValue(),'Local draft');
 for(let n=1;n<8;n++)await drag();await step(8);
 await page.getByRole('button',{name:/I already have a preferred weekly structure/}).click();await b('Other').click();
 const raw='  Upper / Quantum / Lower  ';await page.getByLabel('Other preferred split').fill(raw);
 await drag({allowed:false});assert.equal(await page.getByLabel('Other preferred split').inputValue(),raw);
 assert.equal(await b('BUILD MY PLAN').isDisabled(),true);await page.locator('.onboarding h1').click();await drag({allowed:false});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')||'null')?.program||null),null);
 assert.deepEqual(errors,[]);results.push({...t,passed:true,evidence,verticalScroll:true,answersRetained:true,buildRequiresTap:true});
 await context.close();console.log(`PASS ${index}: ${t.width} ${t.style}/${t.appearance} reduced=${t.reduced}`);
 }}catch(error){await current?.screenshot({path:`${out}/screenshots/failure.png`}).catch(()=>{});console.error(await current?.locator('body').innerText().catch(()=>''));throw error;}
finally{await browser.close();await writeFile(`${out}/results${process.env.ROOK_SWIPE_CASE==null?'':`-${process.env.ROOK_SWIPE_CASE}`}.json`,JSON.stringify(results,null,2));}
console.log(`PASS ${results.length} questionnaire swipe-forward cases`);
