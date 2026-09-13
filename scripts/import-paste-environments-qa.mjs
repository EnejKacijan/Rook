import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

// Both origins are intercepted and served from the LOCAL production preview.
// Chromium still applies real secure-context rules. No physical clipboard is
// read/overwritten: supported/denied/empty API results are controlled fixtures.
const base=process.env.ROOK_QA_URL||'http://127.0.0.1:4173';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/import-swipe-paste/paste';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark'])for(const mode of ['supported','insecure','denied','empty']){
 const origin=mode==='insecure'?'http://192.0.2.1:5173':'https://rook-clipboard.test';
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await context.route(`${origin}/**`,async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/api/'))return route.fulfill({json:{available:false}});
   const response=await context.request.get(`${base}${url.pathname}${url.search}`);
   await route.fulfill({response});
 });
 await context.addInitScript(({mode})=>{
   Object.defineProperty(navigator,'standalone',{value:true});
   window.clipboardQA={secure:isSecureContext,available:typeof navigator.clipboard?.readText==='function',calls:0};
   if(mode!=='insecure')Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText(){
     window.clipboardQA.calls++;
     if(mode==='denied')return Promise.reject(new DOMException('QA denied','NotAllowedError'));
     if(mode==='empty')return Promise.resolve('');
     return Promise.resolve('Četrtek: Squat 3×8\n');
   }}});
 },{mode});
 const page=await context.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.locator('.existing-plan-action').click();
 await page.evaluate(({style,appearance})=>{document.documentElement.dataset.style=style;document.documentElement.dataset.appearance=appearance;},{style,appearance});
 const input=page.getByPlaceholder(/Paste your workout notes/),paste=page.getByRole('button',{name:'Paste workout notes from clipboard'}),status=page.locator('#import-notes-status'),next=page.getByRole('button',{name:'CREATE PREVIEW',exact:true});
 const before=await page.evaluate(()=>localStorage.getItem('lift-v2-state'));
 assert.equal(await next.isDisabled(),true);
 await input.fill('Keep BEFORE / AFTER');await input.evaluate(e=>e.setSelectionRange(12,14));
 await paste.tap();
 if(mode==='supported'){
   await page.waitForFunction(()=>document.querySelector('.import-plan-text').value==='Keep BEFORE Četrtek: Squat 3×8\nAFTER');
   await page.waitForFunction(()=>document.activeElement===document.querySelector('.import-plan-text'));
   assert.equal(await input.evaluate(e=>e.selectionStart),12+'Četrtek: Squat 3×8\n'.length);
 }else{
   await status.getByText(mode==='empty'?'Clipboard has no text to paste.':'Paste isn’t available here. Tap and hold in the field to paste.',{exact:true}).waitFor();
   assert.equal(await input.inputValue(),'Keep BEFORE / AFTER');assert.equal(await input.evaluate(e=>e===document.activeElement),true);
 }
 assert.equal(await next.isEnabled(),true);assert.equal(await input.getAttribute('aria-describedby'),'import-notes-status');assert.equal(await status.getAttribute('role'),'status');
 const capability=await page.evaluate(()=>window.clipboardQA);
 assert.equal(capability.secure,mode!=='insecure');assert.equal(capability.available,mode!=='insecure');assert.equal(capability.calls,mode==='insecure'?0:1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 if(style==='standard'&&appearance==='dark')await page.screenshot({path:`${out}/${width}-${mode}.png`});
 // Narrow focused viewport + browser text insertion models input ownership,
 // not a claim of an iOS keyboard or iOS native long-press menu test.
 await page.setViewportSize({width,height:450});await input.focus();
 const cdp=await context.newCDPSession(page);await input.evaluate(e=>e.setSelectionRange(e.value.length,e.value.length));await cdp.send('Input.insertText',{text:' + manual input'});
 assert.ok((await input.inputValue()).endsWith(' + manual input'));assert.match(await status.innerText(),/Plain-text workout notes/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(await page.evaluate(()=>localStorage.getItem('lift-v2-state')),before);assert.deepEqual(errors,[]);
 results.push({width,style,appearance,mode,capability,result:'PASS'});console.log(`PASS paste ${width} ${style}/${appearance} ${mode}`);await context.close();
}}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
console.log(`PASS ${results.length} paste environment cases`);
