import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

// Isolated synthetic state in the existing preview fixture; never production storage.
const base='http://127.0.0.1:4198',out='artifacts/preview-undo',results=[];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const longName='Owner exceptionally long exercise name for controlled unilateral strength and endurance';
const notice='.freestyle-queue-picker > .exercise-remove-undo';
async function session(page){return page.evaluate(async()=>structuredClone((await import('/src/domain.js')).loadState().activeWorkout));}
async function geometry(page){return page.locator(notice).evaluate(n=>{
  const b=n.querySelector('button'),s=n.querySelector('span'),f=n.parentElement.querySelector('.sheet-action-footer'),box=e=>e.getBoundingClientRect().toJSON(),r=box(b);
  return {notice:box(n),button:r,text:box(s),message:s.textContent,footer:box(f),overflow:document.documentElement.scrollWidth>innerWidth,
    hitCorners:[[r.left+2,r.top+2],[r.right-2,r.top+2],[r.left+2,r.bottom-2],[r.right-2,r.bottom-2]].map(([x,y])=>document.elementFromPoint(x,y)?.closest('button')===b),
    background:getComputedStyle(n).backgroundColor,buttonColor:getComputedStyle(b).color,live:n.getAttribute('aria-live')};
});}
function verify(g,preview=true){
  assert.ok(g.button.width>=44&&g.button.height>=44);assert.ok(g.hitCorners.every(Boolean));
  assert.ok(g.text.right+7<=g.button.left);assert.ok(g.text.top>=g.notice.top&&g.text.bottom<=g.notice.bottom);
  assert.equal(g.overflow,false);assert.equal(g.live,'polite');
  if(preview){assert.equal(g.notice.height,50);assert.ok(Math.abs(g.footer.top-g.notice.bottom-8)<1);assert.ok(g.footer.bottom<=844);}
}
async function watchExpiry(page){await page.evaluate(()=>{
  window.__undoProbe={start:null,end:null};
  window.__undoObserver?.disconnect();
  window.__undoObserver=new MutationObserver(()=>{
    const present=Boolean(document.querySelector('.freestyle-queue-picker > .exercise-remove-undo')),p=window.__undoProbe;
    if(present&&p.start===null)p.start=performance.now();
    if(!present&&p.start!==null&&p.end===null){p.end=performance.now();window.__undoObserver.disconnect();}
  });window.__undoObserver.observe(document.body,{childList:true,subtree:true});
});}
async function expiry(page){
  await page.waitForFunction(()=>window.__undoProbe.end!==null,{},{timeout:7000});
  const ms=await page.evaluate(()=>window.__undoProbe.end-window.__undoProbe.start);
  assert.ok(ms>=4900&&ms<5400,`foreground expiry ${ms} ms`);return ms;
}
async function qa(page,id){await page.locator('#preview-qa>summary').click();await page.locator(`#${id}`).click();}
try{
for(const width of [320,390,430])for(const theme of ['light','dark','premium-light','premium-dark']){
  const key=`${width}-${theme}`,reduced=width===430,context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
  await page.goto(`${base}/scripts/exercise-preview-review.html`);
  await page.locator('#preview-qa>summary').click();await page.locator('#theme').selectOption(theme);await page.locator('#preview-qa>summary').click();
  if(reduced)await qa(page,'reduced');
  await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).tap();
  await page.getByRole('button',{name:'+ ADD EXERCISE',exact:true}).tap();
  const input=page.getByRole('searchbox',{name:'Search exercises'});
  await input.fill('hack squat');await watchExpiry(page);
  await page.getByRole('button',{name:'Add Hack Squat to Up Next',exact:true}).tap();
  await page.locator(notice).waitFor();const search=await geometry(page);verify(search,false);
  assert.ok(search.notice.height>=64,'search retains the existing shared notice size');
  const searchMs=await expiry(page);
  assert.equal(await page.getByRole('button',{name:'Hack Squat: In Up Next',exact:true}).isDisabled(),true);

  await input.fill('owner exceptionally');await page.getByRole('button',{name:`Preview ${longName}`,exact:true}).tap();
  // Exercise safe-area propagation through the existing measured footer.
  if(width===390)await page.addStyleTag({content:':root { --sheet-action-safe-bottom:34px; }'});
  await watchExpiry(page);await page.getByRole('button',{name:'Add to Up Next',exact:true}).tap();
  await page.locator(notice).waitFor();const preview=await geometry(page);verify(preview);
  assert.equal(preview.message,`${longName} added`);
  await page.screenshot({path:`${out}/${key}.png`});
  // Unrelated UI state/focus/scroll and the live workout clock must not re-arm expiry.
  await page.getByRole('button',{name:'Add again',exact:true}).tap();
  await page.getByRole('button',{name:'Cancel',exact:true}).tap();
  await page.locator('.queue-exercise-preview').evaluate(n=>{n.scrollTop=100;n.dispatchEvent(new Event('scroll'));});
  await page.locator(`${notice} button`).focus();
  const previewMs=await expiry(page);
  assert.equal(await page.getByRole('button',{name:'In Up Next',exact:true}).isDisabled(),true);
  const after=await session(page);assert.equal(after.exercises.length,3);assert.equal(after.exercises[0].sets[0].weight,52.5);
  let repeated=null;
  if(theme==='premium-dark'){
    await page.getByRole('button',{name:'Add again',exact:true}).tap();await page.getByRole('button',{name:'Add another instance',exact:true}).tap();
    const first=await session(page);await page.waitForTimeout(2000);
    await page.getByRole('button',{name:'Add again',exact:true}).tap();await page.getByRole('button',{name:'Add another instance',exact:true}).tap();
    const secondStart=Date.now(),second=await session(page);
    await page.waitForTimeout(Math.max(0,4750-(Date.now()-secondStart)));
    assert.equal(await page.locator(notice).isVisible(),true);const g=await geometry(page);verify(g);
    // Real touch near an edge, not a programmatic click or perfect centre.
    await page.touchscreen.tap(g.button.right-3,g.button.bottom-3);
    await page.locator(notice).waitFor({state:'detached'});
    const undone=await session(page);assert.deepEqual(undone.exercises,first.exercises);assert.equal(undone.id,first.id);
    assert.equal(undone.startedAt,first.startedAt);assert.equal(undone.exerciseIndex,first.exerciseIndex);
    assert.deepEqual(undone.rest,first.rest);assert.ok(!undone.exercises.some(e=>e.id===second.exercises.at(-1).id));
    repeated={freshLifetime:true,undoAtMs:Date.now()-secondStart,removedId:second.exercises.at(-1).id,preservedIds:undone.exercises.map(e=>e.id)};
    await page.goto(`${base}/scripts/exercise-preview-review.html?resume`);
    assert.deepEqual((await session(page)).exercises,undone.exercises);
  }
  assert.deepEqual(errors,[]);results.push({key,width,theme,reduced,safeAreaSimulation:width===390?34:0,search,preview,searchMs,previewMs,repeated});
  console.log(`${key}: search ${search.notice.height}px / preview ${preview.notice.height}px; expiry ${searchMs.toFixed(1)} / ${previewMs.toFixed(1)}ms; ${repeated?'late edge-tap Undo + reload passed':'passed'}`);
  await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await context.close();
}
}finally{await browser.close();}
