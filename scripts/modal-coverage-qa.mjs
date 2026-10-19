import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const out='artifacts/modal-keyboard-coverage',results=[];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.ROOK_QA_URL||'http://127.0.0.1:4198';
async function qa(page,id){await page.locator('#keyboard-qa>summary').click();await page.locator(`#${id}`).click();}
async function geometry(page){return page.locator('.modal-layer').last().evaluate(layer=>{
  const p=layer.firstElementChild,box=n=>n?.getBoundingClientRect().toJSON(),style=getComputedStyle(layer),paint=getComputedStyle(layer,'::after');
  const visible=selector=>[...p.querySelectorAll(selector)].find(n=>n.getClientRects().length),input=visible('input[type=search],textarea,input:not([type=hidden])'),footer=p.querySelector('.sheet-action-footer'),scroll=visible('[data-exercise-search-scroll],.sheet-scroll,.profile-setting-scroll,.import-decision-scroll')||p;
  return {layer:box(layer),panel:box(p),input:box(input),header:box(p.querySelector('header')),footer:box(footer),scroll:box(scroll),scrollTop:scroll.scrollTop,layerScroll:layer.scrollTop,panelScroll:p.scrollTop,bodyFixed:document.body.style.position==='fixed',pageScroll:scrollY,inert:!!document.querySelector('.app-content[inert]'),overflow:document.documentElement.scrollWidth-innerWidth,paddingTop:parseFloat(style.paddingTop),paddingBottom:parseFloat(style.paddingBottom),paint:paint.backgroundColor,paintHeight:parseFloat(paint.height)||0,paintContent:paint.content,surface:getComputedStyle(p).backgroundColor,safe:getComputedStyle(p).getPropertyValue('--sheet-action-safe-bottom').trim(),keyboard:p.hasAttribute('data-sheet-keyboard-open'),footerCount:p.querySelectorAll('.sheet-action-footer').length,viewport:{height:visualViewport.height,top:visualViewport.offsetTop},scrollOwners:[p,...p.querySelectorAll('[data-exercise-search-scroll],.sheet-scroll,.profile-setting-scroll,.import-decision-scroll')].filter(n=>/auto|scroll/.test(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+2).length};
});}
function verify(g,key){
  const bottom=g.viewport.top+g.viewport.height;
  assert.ok(Math.abs(g.layer.top)<1&&Math.abs(g.layer.bottom-844)<1,`${key}: full coverage ${JSON.stringify(g)}`);
  assert.ok(Math.abs(g.panel.bottom-bottom)<1,`${key}: panel bottom ${JSON.stringify(g)}`);
  assert.ok(g.panel.top>=g.viewport.top-1&&g.panel.height<=g.viewport.height,`${key}: bounded panel`);
  assert.ok(g.overflow<=1&&g.layerScroll===0&&g.pageScroll===0&&g.bodyFixed&&g.inert,`${key}: scroll/lock invariant ${JSON.stringify(g)}`);
  assert.ok(g.scrollOwners<=1,`${key}: one scroll owner`);
  if(g.footer){assert.ok(g.footer.bottom<=bottom+1,`${key}: footer above keyboard`);assert.equal(g.footerCount,1);}
  assert.equal(g.paint,g.surface);assert.ok(!/rgba\(.*, 0\)/.test(g.paint));assert.ok(Math.abs(g.paintHeight-(844-bottom))<1);assert.notEqual(g.paintContent,'none');
  assert.equal(g.safe,g.keyboard?'0px':'34px');
}
async function stable(page){await page.waitForFunction(()=>[...document.querySelectorAll('.modal-layer>*')].every(n=>n.getAnimations().every(a=>a.playState==='finished')));}
async function gesture(page,from,to){
  const session=await page.context().newCDPSession(page),point=(x,y)=>({x,y,id:1});
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(...from)]});
  for(let i=1;i<=10;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(from[0]+(to[0]-from[0])*i/10,from[1]+(to[1]-from[1])*i/10)]});await page.evaluate(()=>new Promise(requestAnimationFrame));}
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
}
try{
for(const width of process.env.QA_WIDTH?[Number(process.env.QA_WIDTH)]:[320,390,430])for(const theme of ['light','dark','premium-light','premium-dark']){
  const key=`${width}-${theme}`;
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:width===430?'reduce':'no-preference'});
  const checkGestures=width===390&&theme==='premium-dark';
  if(checkGestures)await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
  await page.goto(`${base}/scripts/modal-coverage-review.html`);
  await page.getByLabel('Scenario').selectOption('freestyle');await page.getByLabel('Theme').selectOption(theme);await page.getByRole('button',{name:'Load synthetic review'}).click();
  await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();
  const active=await page.locator('[data-active-workout]').elementHandle();
  await page.getByRole('button',{name:'+ ADD EXERCISE',exact:true}).click();await stable(page);
  const input=page.getByRole('searchbox',{name:'Search exercises',exact:true}),panel=page.locator('.freestyle-queue-picker'),list=panel.locator('[data-exercise-search-scroll]:visible');
  const oldInput=await input.elementHandle(),oldPanel=await panel.elementHandle(),oldList=await list.elementHandle();
  const before=await geometry(page);verify(before,key);
  await input.tap();await input.fill('press');await input.evaluate(n=>n.setSelectionRange(2,4));
  await page.waitForFunction(()=>document.querySelectorAll('.queue-search-row').length>2);
  await list.evaluate(n=>n.scrollTop=100);const scrollBefore=await list.evaluate(n=>n.scrollTop);
  const samples=[];
  for(const mode of ['overlay','both-follow']){
    await page.locator('#keyboard-qa>summary').click();await page.locator('#geometry').selectOption(mode);await page.locator('#keyboard-qa>summary').click();
    for(const id of ['early','partial','open','toolbar','pan','open','close']){
      await qa(page,id);const g=await geometry(page);verify(g,`${key}/${mode}/${id}`);
      assert.equal(await input.evaluate((n,old)=>n===old,oldInput),true);assert.equal(await panel.evaluate((n,old)=>n===old,oldPanel),true);assert.equal(await list.evaluate((n,old)=>n===old,oldList),true);
      assert.deepEqual(await input.evaluate(n=>[document.activeElement===n,n.value,n.selectionStart,n.selectionEnd]),[true,'press',2,4]);assert.equal(g.scrollTop,scrollBefore);
      samples.push({mode,id,...g});
      if(mode==='both-follow'&&id==='toolbar')await page.screenshot({path:`${out}/${key}-keyboard.png`});
    }
  }
  await qa(page,'open');await page.getByRole('button',{name:'Saved workouts',exact:true}).tap();
  await page.getByRole('searchbox',{name:'Search saved workouts',exact:true}).fill('upper');verify(await geometry(page),key+'/saved');
  await page.getByRole('button',{name:'Exercises',exact:true}).tap();await input.fill('zzzznomatch');await page.getByRole('button',{name:'Clear search',exact:true}).tap();assert.equal(await input.inputValue(),'');
  // Native touch motion scrolls results; it must not move the inert workout.
  const b=await list.boundingBox(),session=await context.newCDPSession(page);
  const point=(x,y)=>({x,y,id:1});await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(width/2,b.y+b.height-12)]});
  for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(width/2,b.y+b.height-12-i*8)]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
  await list.evaluate(n=>new Promise(resolve=>{let previous=n.scrollTop,still=0;const frame=()=>{still=Math.abs(n.scrollTop-previous)<.1?still+1:0;previous=n.scrollTop;if(still>=8)resolve();else requestAnimationFrame(frame);};requestAnimationFrame(frame);}));
  assert.ok(await list.evaluate(n=>n.scrollTop)>0);verify(await geometry(page),key+'/touch-scroll');
  await qa(page,'close');await qa(page,'open');verify(await geometry(page),key+'/reopen');await qa(page,'close');
  await panel.locator('.sheet-action-footer').getByRole('button',{name:'Back to workout',exact:true}).tap();await panel.waitFor({state:'detached'});
  assert.equal(await page.locator('[data-active-workout]').evaluate((n,old)=>n===old,active),true);assert.equal(await page.locator('.app-content').evaluate(n=>n.inert),false);
  if(checkGestures)for(const action of ['drag','edge']){
    await page.getByRole('button',{name:'+ ADD EXERCISE',exact:true}).tap();await stable(page);await input.fill('press');await qa(page,'open');
    const p=await panel.boundingBox();
    if(action==='drag')await gesture(page,[width/2,p.y+15],[width/2,p.y+215]);
    else{await qa(page,'blur');await gesture(page,[4,p.y+100],[width*.75,p.y+100]);}
    await panel.waitFor({state:'detached'});assert.equal(await page.locator('.app-content').evaluate(n=>n.inert),false);await qa(page,'close');
  }
  assert.deepEqual(errors,[]);results.push({key,before,samples});await context.close();console.log(`PASS ${key}: modal coverage, focus/caret, touch scroll, Saved/Exercises, restore`);
}
}finally{await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
console.log(`PASS ${results.length} mobile/theme flows; native iPhone keyboard appearance remains device QA.`);
