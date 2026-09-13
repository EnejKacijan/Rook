// Isolated, synthetic product-flow QA. Never reads the owner's browser storage.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { normalizeTrainingBlocksState } from '../src/trainingBlocks.js';
import { openProfileArea } from './qa-current-navigation.mjs';

const root = new URL('../artifacts/ROOK-DARK-THEME-AUDIT/', import.meta.url);
const phase = process.env.AUDIT_PHASE || 'after';
const base = process.env.ROOK_QA_URL || 'http://127.0.0.1:5173';
await mkdir(new URL(`${phase}/`, root), { recursive: true });
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
const browser = isMain ? await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true }) : null;
const results = [];

export function inspectContrast() {
  const rgba = value => {
    const match = value.match(/^rgba?\(([^)]+)\)/);
    if(match)return match[1].split(/[, /]+/).filter(Boolean).map(Number);
    const srgb=value.match(/^color\(srgb ([^)]+)\)/);
    return srgb ? srgb[1].split(/[ /]+/).map(Number).map((v,i)=>i<3?v*255:v) : null;
  };
  const blend = (top, bottom) => {
    const a = top[3] ?? 1;
    return top.slice(0,3).map((v,i) => v*a + bottom[i]*(1-a));
  };
  const luminance = c => c.slice(0,3).reduce((sum, v, i) => {
    v /= 255; return sum + [0.2126,0.7152,0.0722][i] * (v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  }, 0);
  const ratio = (a,b) => { const x=luminance(a),y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
  const bg = el => {
    const chain=[]; for(let n=el;n;n=n.parentElement)chain.unshift(n);
    return chain.reduce((c,n)=>blend(rgba(getComputedStyle(n).backgroundColor)||[0,0,0,0],c),[255,255,255]);
  };
  const rows=[];
  for(const el of document.querySelectorAll('body *')) {
    const box=el.getBoundingClientRect(), s=getComputedStyle(el);
    if(!box.width||!box.height||box.bottom<=0||box.top>=innerHeight||s.visibility!=='visible'||s.display==='none')continue;
    let opacity=1; for(let n=el;n;n=n.parentElement) opacity*=Number(getComputedStyle(n).opacity);
    if(opacity<.01)continue;
    const text = ['INPUT','TEXTAREA'].includes(el.tagName) ? (el.value||el.placeholder) : [...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim();
    if(!text || el.closest('[aria-hidden="true"],[inert]'))continue;
    // During drag the source copy is deliberately faded under the readable
    // floating preview. It is not a second active information surface.
    if(el.closest('.reorder-placeholder')&&document.querySelector('.plan-reorder-preview'))continue;
    const placeholder = ['INPUT','TEXTAREA'].includes(el.tagName) && !el.value && Boolean(el.placeholder);
    const color=rgba(placeholder?getComputedStyle(el,'::placeholder').color:s.color);
    if(!color)continue;
    // The unit selector deliberately paints its selected thumb behind the button.
    const background=el.matches('.unit-segmented .active') ? blend(rgba(getComputedStyle(el.parentElement,'::before').backgroundColor)||[0,0,0,0],bg(el)) : bg(el);
    const fg=blend([...color.slice(0,3),(color[3]??1)*opacity],background);
    const large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&Number(s.fontWeight)>=700);
    rows.push({text:text.slice(0,120),tag:el.tagName,class:el.className,color:fg.map(Math.round),background:background.map(Math.round),ratio:+ratio(fg,background).toFixed(2),required:large?3:4.5,disabled:Boolean(el.closest(':disabled,[aria-disabled="true"]')),placeholder});
  }
  return rows;
}

async function capture(page, name, variant) {
  await page.evaluate(async()=>{ await document.fonts.ready; await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))); });
  const rows=await page.evaluate(inspectContrast);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  await page.screenshot({path:fileURLToPath(new URL(`${phase}/${variant}-${name}.png`,root))});
  results.push({variant,name,overflow,rows});
  console.log(`${variant} ${name}: ${rows.length} text samples; ${rows.filter(r=>r.ratio<r.required).length} candidates`);
}

if (isMain) try {
  for(const appearance of ['dark','light']) for(const style of ['standard','premium']) for(const width of [390,320]) {
    const variant=`${style}-${appearance}-${width}`;
    const state=createReturningUserFixture(2);
    Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
    state.activeWorkout=null; normalizeTrainingBlocksState(state);
    const context=await browser.newContext({viewport:{width,height:844},colorScheme:appearance,serviceWorkers:'block'});
    await context.addInitScript(value=>localStorage.setItem('lift-v2-state',JSON.stringify(value)),state);
    const page=await context.newPage();
    await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
    await page.goto(base,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'PROFILE',exact:true}).click();
    await openProfileArea(page,'program');
    await page.getByRole('button',{name:/Training block/}).click();
    await page.getByRole('button',{name:'EDIT BLOCK',exact:true}).click();
    await page.getByRole('button',{name:'4 weeks',exact:true}).click();
    await capture(page,'edit-block-4-selected',variant);
    await page.getByRole('button',{name:'6 weeks',exact:true}).click();
    await page.getByRole('button',{name:/Planned deload/}).click();
    await capture(page,'edit-block-6-selected-deload-toggle',variant);
    await page.keyboard.press('Tab');
    await capture(page,'edit-block-focus',variant);
    await page.locator('.training-block-name input').fill('');
    assert.equal(await page.getByRole('button',{name:'SAVE BLOCK',exact:true}).isDisabled(),true);
    await capture(page,'edit-block-disabled-save',variant);
    await context.close();
  }
} finally {
  await writeFile(new URL(`${phase}-results.json`,root),JSON.stringify(results,null,2));
  await browser.close();
}
