// Audit-only preload: capture the settled CSS state, never a half-open sheet.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { blankState } from '../src/domain.js';
const theme=process.env.ROOK_QA_THEME?.split(':');
if(theme && (!['light','dark'].includes(theme[0]) || !['standard','premium'].includes(theme[1]))) throw new Error('Invalid ROOK_QA_THEME');
const launch=chromium.launch.bind(chromium);
const patched=new WeakSet();
function stablePage(page){
 if(patched.has(page))return page;patched.add(page);
 const screenshot=page.screenshot.bind(page);
 page.screenshot=async(options={})=>{
  await page.waitForFunction(() => [...document.querySelectorAll('.rest-timer')].every(timer => getComputedStyle(timer).opacity === '1'));
  // Let visible lazy thumbnails settle, without loading the offscreen library.
  await page.waitForFunction(() => [...document.querySelectorAll('.workout-photo-timeline-item')].every(item => {
   const r=(item.querySelector('.workout-photo-timeline-image')||item).getBoundingClientRect();
   let top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
   for(let parent=item.parentElement;parent;parent=parent.parentElement){
    if(/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY)){
     const bounds=parent.getBoundingClientRect();
     top=Math.max(top,bounds.top+parent.clientTop);
     bottom=Math.min(bottom,bounds.top+parent.clientTop+parent.clientHeight);
    }
   }
   const hit=bottom>top ? document.elementFromPoint(Math.max(0,Math.min(innerWidth-1,(r.left+r.right)/2)),(top+bottom)/2) : null;
   return bottom<=top || !hit || !item.contains(hit) || ![...item.querySelectorAll('small')].some(n=>n.textContent==='Loading');
  }));
  const modal=await page.evaluate(()=>[...document.querySelectorAll('[role="dialog"], .detail-screen, .modal-layer')].some(n=>n.getBoundingClientRect().height>0));
  const target=theme&&options.path?path.join(path.dirname(options.path),`matrix-${theme[1]}-${theme[0]}--${path.basename(options.path)}`):options.path;
  return screenshot({...options,path:target,animations:'disabled',caret:'hide',...(modal?{fullPage:false}:{})});
 };
 return page;
}
chromium.launch=async(...args)=>{
 const browser=await launch(...args),newContext=browser.newContext.bind(browser),newPage=browser.newPage.bind(browser);
 browser.newContext=async(...args)=>{
  if(theme)args[0]={...args[0],colorScheme:theme[0]};
  const context=await newContext(...args),createPage=context.newPage.bind(context);
  context.setDefaultTimeout(30000);
  if(theme){
   const init=context.addInitScript.bind(context);
   if(process.env.ROOK_QA_EMPTY_THEME==='1'){
    const state=blankState();Object.assign(state.profile,{appearancePreference:theme[0],stylePreference:theme[1],themePreference:theme[1]==='premium'?'premium':theme[0]});
    await init(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
   }
   context.addInitScript=async(script,arg)=>{
    const value=arg&&typeof arg==='object'?structuredClone(arg):arg;
    const state=value?.profile?value:value?.value?.profile?value.value:null;
    if(state)Object.assign(state.profile,{appearancePreference:theme[0],stylePreference:theme[1],themePreference:theme[1]==='premium'?'premium':theme[0]});
    return init(script,value);
   };
  }
  context.newPage=async(...args)=>stablePage(await createPage(...args));
  return context;
 };
 browser.newPage=async(...args)=>stablePage(await newPage(...args));
 return browser;
};
