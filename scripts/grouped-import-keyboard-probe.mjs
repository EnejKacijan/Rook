import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {hybridOwnerNotes} from '../src/hybridImportFixture.js';
const out='artifacts/GROUPED-IMPORT-REVIEW';await mkdir(out,{recursive:true});
const phase=process.env.PROBE_PHASE||'before';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
const page=await context.newPage();const records=[];
await page.route('**/api/ai',r=>r.fulfill({json:{data:{fragments:r.request().postDataJSON().payload.fragments.map(f=>({id:f.id,kind:'exercise',nameQuote:'dipsi',facts:[{kind:'optional',value:'true',evidence:'Po želji'},{kind:'failure',value:'true',evidence:'do failure'}]}))}}}));
try{
 await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4177');
 await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(hybridOwnerNotes);
 await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();await page.getByRole('button',{name:'INTERPRET WITH AI',exact:true}).click();
 await page.locator('.import-resolution').waitFor();
 await page.evaluate(()=>{
   window.__trace=[];for(const [proto,key]of [[HTMLElement.prototype,'focus'],[Element.prototype,'scrollIntoView']]){const fn=proto[key];proto[key]=function(...args){window.__trace.push({method:key,node:this.outerHTML.slice(0,150),args});return fn.apply(this,args);};}
   const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'scrollTop');
   if(descriptor?.set)Object.defineProperty(Element.prototype,'scrollTop',{...descriptor,set(value){window.__trace.push({method:'scrollTop=',node:this.className,value});descriptor.set.call(this,value);}});
   window.__vv=(height,offsetTop,scale=1,event='resize')=>{for(const[k,v]of Object.entries({height,offsetTop,scale}))Object.defineProperty(visualViewport,k,{configurable:true,value:v});visualViewport.dispatchEvent(new Event(event));};
 });
 const active=page.locator('.import-decision-content:visible'),first=active.getByLabel('Reviewed Min reps',{exact:true}).first();
 await first.evaluate(e=>window.__missingInput=e);
 async function record(stage){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));records.push(await page.evaluate(stage=>{
   const rect=e=>e?Object.fromEntries(['top','bottom','height','left','right'].map(k=>[k,e.getBoundingClientRect()[k]])):null;
   const styles=e=>{const s=getComputedStyle(e);return Object.fromEntries(['height','minHeight','maxHeight','top','bottom','paddingTop','paddingBottom','transform','overflowY','position'].map(k=>[k,s[k]]));};
   const screen=document.querySelector('.has-import-decisions'),scroll=document.querySelector('.import-decision-scroll'),footer=document.querySelector('.import-resolution .sheet-action-footer'),field=document.activeElement;
   return {stage,viewport:{height:visualViewport.height,offsetTop:visualViewport.offsetTop,scale:visualViewport.scale,innerHeight,scrollY,clientHeight:document.documentElement.clientHeight},screen:{rect:rect(screen),styles:styles(screen)},documentStyles:{body:styles(document.body),html:styles(document.documentElement)},scroll:{rect:rect(scroll),styles:styles(scroll),scrollTop:scroll.scrollTop},field:{rect:rect(field),label:rect(field.closest('label')),html:field.outerHTML.slice(0,250),sameMissingInput:document.querySelector('.import-decision-content[data-active="true"] [aria-label="Reviewed Min reps"]')===window.__missingInput},footer:{rect:rect(footer),styles:styles(footer)},trace:window.__trace.splice(0)};
 },stage));}
 await first.focus();await record('normal focus');
 await page.evaluate(()=>window.__vv(400,0));await record('missing reps keyboard resize');
 await page.evaluate(()=>window.__vv(400,100,1,'scroll'));await record('missing reps Safari pan offset-only');
 await page.screenshot({path:`${out}/keyboard-${phase}-missing.png`});
 await page.evaluate(()=>window.__vv(844,0));await first.blur();
 await active.getByRole('button',{name:'Edit source values',exact:true}).first().click();
 const sets=active.getByLabel('Reviewed Sets',{exact:true}).first();await sets.focus();await page.evaluate(()=>window.__vv(400,100));await record('unlocked Sets resize+offset');
 await first.focus();await record('Sets to Min reps');await active.getByLabel('Reviewed Max reps',{exact:true}).first().focus();await record('Min to Max reps');
 await page.screenshot({path:`${out}/keyboard-${phase}-unlocked.png`});
 await page.evaluate(()=>window.__vv(844,0));await record('keyboard closed');
 await writeFile(`${out}/keyboard-${phase}.json`,JSON.stringify(records,null,2));console.log(JSON.stringify(records.map(r=>({stage:r.stage,vv:r.viewport,screen:r.screen.rect,scroll:r.scroll.rect,field:r.field.rect,label:r.field.label,footer:r.footer.rect})),null,2));
}finally{await browser.close();}
