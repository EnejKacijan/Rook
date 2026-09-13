import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {normalizeTrainingBlocksState} from '../src/trainingBlocks.js';
import {openProfileArea} from './qa-current-navigation.mjs';
import {inspectContrast} from './dark-theme-audit.mjs';

const out='artifacts/ROOK-DARK-THEME-AUDIT/interaction-final';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{for(const width of [390,320])for(const style of ['standard','premium']){
 const state=createReturningUserFixture(2);state.activeWorkout=null;normalizeTrainingBlocksState(state);
 Object.assign(state.profile,{appearancePreference:'dark',stylePreference:style,themePreference:style==='premium'?'premium':'dark'});
 const context=await browser.newContext({viewport:{width,height:844},colorScheme:'dark',reducedMotion:width===320?'reduce':'no-preference',serviceWorkers:'block'});
 await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
 const p=await context.newPage();await p.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));await p.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 await p.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(p,'program');await p.getByRole('button',{name:/Training block/}).click();await p.getByRole('button',{name:'EDIT BLOCK',exact:true}).click();
 const four=p.getByRole('button',{name:'4 weeks',exact:true}),six=p.getByRole('button',{name:'6 weeks',exact:true});
 const snap=async name=>{await p.evaluate(async()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));const rows=await p.evaluate(inspectContrast);assert.deepEqual(rows.filter(r=>r.ratio<r.required&&!r.disabled),[]);const controls=await p.locator('.training-block-length button').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return {text:e.textContent,selected:e.classList.contains('is-selected'),focusVisible:e.matches(':focus-visible'),borderWidth:s.borderWidth,borderStyle:s.borderStyle,radius:s.borderRadius,minHeight:s.minHeight,outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,outlineColor:s.outlineColor,color:s.color,background:s.backgroundColor};}));const variant=`${style}-dark-${width}`;await p.screenshot({path:`${out}/${variant}-${name}.png`});results.push({variant,name,rows,controls,overflow:await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});};
 await four.click();await six.hover();await snap('block-hover');
 await p.mouse.down();await snap('block-pressed');await p.mouse.up();
 await p.locator('.training-block-name input').click();await p.keyboard.press('Tab');assert.equal(await four.evaluate(e=>e.matches(':focus-visible')),true);await snap('block-focus-visible');
 await p.keyboard.press('Enter');assert.equal(await four.evaluate(e=>e.classList.contains('is-selected')),true);
 await p.locator('.training-block-name input').fill('');assert.equal(await p.getByRole('button',{name:'SAVE BLOCK',exact:true}).isDisabled(),true);await snap('block-disabled');await context.close();
}
 for(const width of [390,320])for(const name of ['block-hover','block-pressed','block-focus-visible','block-disabled']){
  const shape=style=>results.find(r=>r.variant===`${style}-dark-${width}`&&r.name===name).controls.map(({text,selected,focusVisible,borderWidth,borderStyle,radius,minHeight,outlineStyle,outlineWidth})=>({text,selected,focusVisible,borderWidth,borderStyle,radius,minHeight,outlineStyle,outlineWidth}));assert.deepEqual(shape('standard'),shape('premium'),'Dark styles share structural state rules');
 }
 assert.ok(results.every(r=>!r.overflow));console.log(`PASS ${results.length} dark hover/pressed/keyboard-focus/disabled captures; theme structural parity; reduced motion at 320.`);
}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
