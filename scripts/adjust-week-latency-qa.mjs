import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { adjustWeekState } from '../src/fixtures/adjustWeekState.js';
const out='artifacts/adjust-week-scope';await mkdir(out,{recursive:true});
// Optional isolated baseline server reads the frozen pre-task App only.
// The owner-facing 4275 worktree/server is never rolled back for measurement.
let baselineServer,origin=process.env.ROOK_QA_URL||'http://127.0.0.1:4273';
if(process.env.ROOK_QA_BASELINE_APP){
 const baseline=await readFile(process.env.ROOK_QA_BASELINE_APP,'utf8'),app=resolve('src/App.jsx').replaceAll('\\','/');
 baselineServer=await createServer({server:{host:'127.0.0.1',port:4276,strictPort:true},plugins:[{name:'qa-frozen-today',enforce:'pre',load(id){if(id.split('?')[0].replaceAll('\\','/')===app)return baseline;}}]});
 await baselineServer.listen();origin='http://127.0.0.1:4276';
}
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const shifted of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  try{
   await context.addInitScript(({state,trace})=>{
    const RealDate=Date,fixed=RealDate.parse('2026-09-29T12:00:00');
    window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
    localStorage.setItem('lift-v2-state',JSON.stringify(state));
    window.__tapCosts={clones:[],writes:[],long:[],stacks:{}};
    const clone=structuredClone.bind(window),write=Storage.prototype.setItem;
    window.structuredClone=(...args)=>{const t=performance.now(),r=clone(...args);window.__tapCosts.clones.push(performance.now()-t);if(trace){const stack=new Error().stack.split('\n').slice(2,10).join('\n');window.__tapCosts.stacks[stack]=(window.__tapCosts.stacks[stack]||0)+1;}return r;};
    Storage.prototype.setItem=function(...args){const t=performance.now(),r=write.apply(this,args);window.__tapCosts.writes.push({key:args[0],ms:performance.now()-t});return r;};
    new PerformanceObserver(list=>window.__tapCosts.long.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});
   },{state:adjustWeekState({shifted,history:100}),trace:process.env.ROOK_QA_TRACE==='1'});
   const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
   await page.goto(origin);await page.locator('.week-strip button').first().waitFor();
   if(shifted){assert.match(await page.locator('.today-hero').innerText(),/UPPER A/);assert.doesNotMatch(await page.locator('.today-screen').innerText(),/needs attention|needs review/i);}
   // Let startup complete; samples themselves never wait for persistence before paint.
   await page.waitForTimeout(500);
   const samples=[];
   for(let index=0;index<21;index++){
    const sample=await page.evaluate(index=>new Promise(resolve=>{
     const buttons=[...document.querySelectorAll('[data-week-offset="0"] .week-strip button')];
     const target=buttons[index%7];if(target.getAttribute('aria-pressed')==='true'){resolve(null);return;}
     const initial=document.querySelector('.today-screen')?.textContent;
     const costs=window.__tapCosts,c=costs.clones.length,w=costs.writes.length;costs.stacks={};const start=performance.now();target.click();
     const returned=performance.now()-start;
     requestAnimationFrame(()=>resolve({eventMs:returned,paintMs:performance.now()-start,selected:target.getAttribute('aria-pressed'),
      index,dateLabel:target.getAttribute('aria-label'),initial:initial?.slice(0,250),
      contentChanged:document.querySelector('.today-screen')?.textContent!==initial,
      text:document.querySelector('.today-hero,.rest-day-state')?.textContent?.slice(0,170),
      clones:costs.clones.length-c,cloneMs:costs.clones.slice(c).reduce((a,b)=>a+b,0),writes:costs.writes.slice(w),stacks:costs.stacks}));
    }),index);
    if(sample){
     assert.equal(sample.selected,'true');
     // Adjacent rest dates can truthfully show the same recovery/up-next copy.
     if(!(sample.dateLabel.includes('rest day')&&sample.initial.includes('REST DAY')))assert.equal(sample.contentChanged,true,JSON.stringify(sample));
     assert.equal(sample.writes.length,0,'visible date navigation must precede writes');samples.push(sample);
    }
    await page.waitForTimeout(120);
   }
   const times=samples.map(s=>s.paintMs).sort((a,b)=>a-b);
   const result={shifted,history:100,medianMs:times[Math.floor(times.length/2)],maxMs:times.at(-1),
    medianClones:samples.map(s=>s.clones).sort((a,b)=>a-b)[Math.floor(samples.length/2)],samples};
   results.push(result);console.log(JSON.stringify({...result,samples:undefined}));
  }finally{await context.close();}
 }
}finally{await browser.close();await baselineServer?.close();await writeFile(`${out}/latency-${process.env.ROOK_QA_LABEL||'after'}.json`,JSON.stringify(results,null,2));}
