import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=process.env.ROOK_CURRENT_REVIEW,group=process.env.ROOK_CURRENT_REVIEW_GROUP;
if(!root||!group)throw new Error('Review output and group required');
const folder=path.join(root,group);await mkdir(folder,{recursive:true});
const launch=chromium.launch.bind(chromium),seen=new WeakSet();let index=0;const images=[];
function patch(page){
 if(seen.has(page))return page;seen.add(page);
 const screenshot=page.screenshot.bind(page);
 page.screenshot=async(options={})=>{
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}).catch(()=>{});
   const bytes=await screenshot({...options,animations:'disabled',caret:'hide'});
   const name=path.basename(String(options.path||'screen.png'));
   if(!/^http:\/\/127\.0\.0\.1:(?:4173|4175|4190)(?:\/|$)/.test(page.url())||/before|guide|comparison|contact|partial|large-text|safe-area|focused-resized/i.test(name))return bytes;
   const data=await page.evaluate(()=>({width:innerWidth,height:innerHeight,appearance:document.documentElement.dataset.appearance,style:document.documentElement.dataset.style}));
   // All main-tab themes, otherwise prioritize detailed 390px views and narrow
   // dark examples. Non-matrix flows keep their native viewport.
   if(data.width===430&&group!=='01-main-navigation')return bytes;
   if(data.width===320&&!(data.appearance==='dark'&&data.style==='standard')&&group!=='01-main-navigation')return bytes;
   if(images.length>=(group==='01-main-navigation'?72:36))return bytes;
   const file=`${String(++index).padStart(3,'0')}-${data.width}-${data.style||'standard'}-${data.appearance||'light'}--${name}`;
   await writeFile(path.join(folder,file),bytes);
   images.push({file:`${group}/${file}`,capturedAt:new Date().toISOString(),...data});
   await writeFile(path.join(folder,'CAPTURES.json'),JSON.stringify(images,null,2));
   return bytes;
 };return page;
}
chromium.launch=async(...args)=>{
 const browser=await launch(...args),newContext=browser.newContext.bind(browser),newPage=browser.newPage.bind(browser);
 browser.newContext=async(...a)=>{
   const c=await newContext(...a),make=c.newPage.bind(c);
   await c.route('**/api/**',r=>r.fulfill(r.request().url().includes('/status')?{json:{available:false}}:{status:503,json:{error:'Screenshot capture: live AI is disabled.'}}));
   c.newPage=async(...b)=>patch(await make(...b));return c;
 };
 browser.newPage=async(...a)=>patch(await newPage(...a));return browser;
};
