// Review-only composition and cache checks; no user profile/storage is touched.
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const root='artifacts/ROOK-FULL-CATALOG-ILLUSTRATION-REVIEW';
const manifest=JSON.parse(await readFile(`${root}/generated-sources.json`));
const art='src/assets/exercise-art';
const slugs=['dumbbell-skull-crusher',...Object.keys(manifest)];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1200,height:1260}});
 const cards=await Promise.all(slugs.map(async(s,i)=>`<article><img src="data:image/svg+xml;base64,${(await readFile(`${art}/wg-${s}.svg`)).toString('base64')}"><p>${i?'NEW ·':'HAIR REFERENCE ·'} ${s.replace(/^rook-/,'').replaceAll('-',' ')}</p></article>`));
 await page.setContent(`<style>body{margin:12px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;background:#f6f5f2;font:15px Arial}article{height:400px;background:white;text-align:center}img{width:360px;height:360px;object-fit:contain}p{margin:8px}</style>${cards.join('')}`);
 await page.locator('img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));
 await page.screenshot({path:`${root}/after/hair-comparison.png`});
 await page.close();

 // Fresh, isolated browser profile. Warm only these visited test assets,
 // never clear the owner's storage and never preload the production library.
 const context=await browser.newContext({serviceWorkers:'allow'});
 const p=await context.newPage();
 context.on('serviceworker',worker=>worker.on('console',msg=>console.log('SW:',msg.text())));
 p.on('requestfailed',req=>console.log('FAILED:',req.url(),req.failure()?.errorText));
 const base=process.env.ROOK_QA_URL||'http://127.0.0.1:4177';
 await p.goto(base);
 await p.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
 await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
 // Exercise an actual subsequent controlled navigation, as in a reopened PWA.
 await p.reload();
 await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
 p.on('response',response=>{if(response.url().endsWith('.svg'))console.log('ASSET',response.url(),response.status(),'worker',response.fromServiceWorker());});
 const worker=context.serviceWorkers()[0];
 await worker.evaluate(()=>{
  self.__illustrationQaCloneErrors=[];
  const original=Response.prototype.clone;
  Response.prototype.clone=function(...args){try{return original.apply(this,args);}catch(e){self.__illustrationQaCloneErrors.push({url:this.url,bodyUsed:this.bodyUsed,message:String(e)});throw e;}};
 });
 const distFiles=await readdir('dist/assets'),checks=[];
 for(const slug of Object.keys(manifest)){
  const file=distFiles.find(f=>f.startsWith(`wg-${slug}-`)&&f.endsWith('.svg'));
  assert.ok(file,slug);
  const expected=await readFile(`${art}/wg-${slug}.svg`,'utf8');
  const url=`/assets/${file}`;
  const result=await p.evaluate(async url=>({text:await (await fetch(url)).text(),url}),url);
  assert.equal(result.text,expected,`${slug}: current build bytes`);
  // Playwright's predicate poller does not await async false values. Wait for
  // the actual SW cache write, not the truthiness of a pending Promise.
  const cached=await p.evaluate(async url=>{
   const deadline=performance.now()+8000;
   while(!(await caches.match(url))){
    if(performance.now()>deadline)return false;
    await new Promise(requestAnimationFrame);
   }
   return true;
  },url);
  if(!cached){
   const control=distFiles.find(f=>f.startsWith('wg-ab-wheel-'));
   await p.evaluate(async url=>(await fetch(url)).text(),`/assets/${control}`);
   await p.evaluate(()=>new Promise(requestAnimationFrame));
   const report={updatedAsset:url,cached:false,unchangedControl:`/assets/${control}`,controlCached:await p.evaluate(async url=>!!(await caches.match(url)),`/assets/${control}`),cloneErrors:await worker.evaluate(()=>self.__illustrationQaCloneErrors)};
   await writeFile(`${root}/after/cache-results.json`,JSON.stringify(report,null,2));
   console.log(JSON.stringify(report,null,2));
   throw new Error('Asset cache write failed; recorded exact clone error and unchanged control. No production cache code changed.');
  }
  checks.push({slug,url,online:'PASS'});
 }
 await context.setOffline(true);
 for(const check of checks){
  assert.equal(await p.evaluate(async url=>(await fetch(url)).text(),check.url),await readFile(`${art}/wg-${check.slug}.svg`,'utf8'));
  check.offline='PASS';
 }
 await writeFile(`${root}/after/cache-results.json`,JSON.stringify(checks,null,2));
 await context.close();
 console.log(`PASS: ${checks.length} fingerprinted assets, exact online and offline bytes; isolated context only.`);
}finally{await browser.close();}
