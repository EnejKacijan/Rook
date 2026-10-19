import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const out='artifacts/picker-scope-motion',results=[];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const base='http://127.0.0.1:4198/scripts/picker-scope-motion-review.html';
const list='.exercise-search-body > [data-exercise-search-scroll]',saved='.saved-workout-list';
const settled=page=>page.waitForFunction(()=>!document.querySelector('.freestyle-queue-picker')?.getAnimations({subtree:true}).some(a=>a.playState==='running'));
const state=page=>page.locator('#scope-proof').textContent();
async function change(page,label,reduced){
  await page.evaluate(()=>{
    window.scopeProbe={done:false,frames:[],animationStart:window.scopeAnimations.length};
    const root=document.querySelector('.freestyle-queue-picker'),nav=root.querySelector('.queue-search-scopes');
    const rect=n=>{const r=n.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
    nav.addEventListener('click',()=>{
      const start=performance.now();
      const sample=()=>{
        const visible=[...root.querySelectorAll('[data-exercise-search-scroll]')].filter(n=>n.checkVisibility());
        const style=visible[0]&&getComputedStyle(visible[0]),indicator=getComputedStyle(nav,'::after');
        window.scopeProbe.frames.push({time:performance.now()-start,visible:visible.length,overflow:document.documentElement.scrollWidth>innerWidth,
          chrome:[root,root.querySelector('.detail-header'),nav,root.querySelector('.rook-search-field'),root.querySelector('.sheet-action-footer')].map(rect),
          opacity:style?.opacity,x:style?.transform,indicatorX:indicator.transform});
        if(performance.now()-start<210)requestAnimationFrame(sample);else window.scopeProbe.done=true;
      };requestAnimationFrame(sample);
    },{once:true});
  });
  await page.getByRole('button',{name:label,exact:true}).tap();
  await page.waitForFunction(()=>window.scopeProbe.done);
  const probe=await page.evaluate(()=>({frames:window.scopeProbe.frames,animations:window.scopeAnimations.slice(window.scopeProbe.animationStart).map(({animation,target})=>({frames:animation.effect.getKeyframes(),timing:animation.effect.getTiming(),target:target.className,scroll:target.hasAttribute('data-exercise-search-scroll')}))}));
  for(const f of probe.frames){assert.equal(f.visible,1,'exactly one visible result pane');assert.equal(f.overflow,false);assert.deepEqual(f.chrome,probe.frames[0].chrome,'sheet/header/tabs/search/footer stationary');}
  const x=value=>value==='none'?0:Number(value.split(',')[4]);
  assert.ok(probe.frames.every(f=>Math.abs(x(f.x))<=7.01),'bounded content travel');
  assert.equal(Number(probe.frames.at(-1).opacity),1);assert.equal(x(probe.frames.at(-1).x),0);
  if(reduced){assert.ok(probe.frames.every(f=>Number(f.opacity)===1&&x(f.x)===0));assert.equal(new Set(probe.frames.map(f=>f.indicatorX)).size,1);}
  else{assert.ok(probe.frames.some(f=>Number(f.opacity)>0&&Number(f.opacity)<1));assert.ok(new Set(probe.frames.map(f=>f.indicatorX)).size>2,'underline travels through intermediate positions');}
  assert.equal(probe.animations.length,reduced?0:1);
  if(!reduced){const a=probe.animations[0];assert.equal(a.scroll,true);assert.equal(a.timing.duration,150);assert.equal(a.timing.easing,'cubic-bezier(0.2, 0, 0, 1)');assert.equal(a.frames[0].transform,`translateX(${label==='Saved workouts'?7:-7}px)`);assert.equal(a.frames.at(-1).opacity,'1');}
  return probe;
}
async function scroll(page,selector){
  const target=page.locator(selector),box=await target.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,240);
  await page.waitForFunction(s=>document.querySelector(s).scrollTop>100,selector);
  await page.waitForTimeout(180);return target.evaluate(n=>n.scrollTop);
}
try{
for(const width of [320,390,430])for(const theme of ['standard-light','standard-dark','premium-light','premium-dark'])for(const reduced of [false,true]){
  const key=`${width}-${theme}-${reduced?'reduced':'motion'}`,context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
  await page.addInitScript(()=>{
    window.scopeAnimations=[];const animate=Element.prototype.animate;
    Element.prototype.animate=function(...args){const animation=animate.apply(this,args);if(this.hasAttribute('data-exercise-search-scroll'))window.scopeAnimations.push({target:this,animation});return animation;};
  });
  await page.goto(`${base}?theme=${theme}&keyboard=simulated`);await page.locator('.queue-search-row').first().waitFor();await settled(page);
  const initial=await state(page),input=page.getByRole('searchbox'),identity=await input.elementHandle(),exerciseIdentity=await page.locator(list).elementHandle();
  assert.equal(await page.locator('.saved-workouts').count(),0,'saved tree initially lazy');
  const tabs=await page.locator('.queue-search-scopes').evaluate(n=>{const s=getComputedStyle(n,'::after'),token=document.createElement('span');token.style.color='var(--rook-accent)';n.append(token);const accent=getComputedStyle(token).color;token.remove();return {duration:s.transitionDuration,easing:s.transitionTimingFunction,height:s.height,color:s.backgroundColor,accent,width:parseFloat(s.width),targets:[...n.children].map(b=>{const r=b.getBoundingClientRect();return {width:r.width,height:r.height,border:getComputedStyle(b).borderBottomColor};})};});
  assert.equal(tabs.height,'2px');assert.equal(tabs.color,tabs.accent);assert.equal(tabs.duration,reduced?'0s':'0.16s');assert.ok(tabs.targets.every(t=>t.height>=44&&t.border==='rgba(0, 0, 0, 0)'&&Math.abs(t.width-tabs.width)<1));
  const first=await change(page,'Saved workouts',reduced),savedIdentity=await page.locator(saved).elementHandle();assert.equal(await page.locator(`${saved} .list-row`).count(),18);
  const savedScroll=await scroll(page,saved);await change(page,'Exercises',reduced);const exerciseScroll=await scroll(page,list);
  await change(page,'Saved workouts',reduced);assert.equal(await page.locator(saved).evaluate(n=>n.scrollTop),savedScroll);
  await change(page,'Exercises',reduced);assert.equal(await page.locator(list).evaluate(n=>n.scrollTop),exerciseScroll);
  assert.equal(await page.locator(list).evaluate((n,old)=>n===old,exerciseIdentity),true);assert.equal(await page.locator(saved).evaluate((n,old)=>n===old,savedIdentity),true);
  // Real touch events on observed targets, faster than the 150/160 ms transition.
  const boxes=await page.locator('.queue-search-scopes button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};}));
  for(let i=0;i<8;i++)await page.touchscreen.tap(boxes[(i+1)%2].x,boxes[(i+1)%2].y);
  await settled(page);assert.equal(await page.getByRole('button',{name:'Exercises',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator(list).evaluate(n=>n.scrollTop),exerciseScroll);
  await input.fill('bench');await page.locator('[data-catalog-id="barbell-bench-press"]').waitFor();
  await page.locator('#qa-keyboard-open').tap();await page.waitForFunction(()=>document.querySelector('.freestyle-queue-picker').getBoundingClientRect().bottom<510);await settled(page);
  const open=await page.locator('.freestyle-queue-picker').boundingBox();
  await change(page,'Saved workouts',reduced);assert.equal(await input.inputValue(),'');assert.equal(await input.evaluate(n=>document.activeElement===n),true);
  await input.fill('upper');await change(page,'Exercises',reduced);assert.equal(await input.inputValue(),'bench');assert.equal(await input.evaluate(n=>document.activeElement===n),true);
  await input.press('ArrowLeft');const caret=await input.evaluate(n=>n.selectionStart),count=await page.evaluate(()=>window.scopeAnimations.length);await input.press('ArrowRight');assert.equal(await page.evaluate(()=>window.scopeAnimations.length),count);assert.equal(await input.evaluate(n=>n.selectionStart),caret+1);
  await page.getByRole('button',{name:'Clear search',exact:true}).tap();assert.equal(await input.inputValue(),'');
  await change(page,'Saved workouts',reduced);assert.equal(await input.inputValue(),'upper');await page.getByRole('button',{name:'Clear search',exact:true}).tap();assert.equal(await input.inputValue(),'');
  assert.equal(await input.evaluate((n,old)=>n===old,identity),true);assert.equal(await input.evaluate(n=>document.activeElement===n),true);assert.deepEqual(await page.locator('.freestyle-queue-picker').boundingBox(),open);
  await page.screenshot({path:`${out}/${key}-keyboard.png`});
  await page.locator('#qa-keyboard-close').tap();await page.waitForFunction(()=>document.querySelector('.freestyle-queue-picker').getBoundingClientRect().bottom>800);await settled(page);
  assert.equal(await state(page),initial,'no change to active session or saved/plan/workout data');
  await page.locator(`${saved} .list-row`).first().tap();await page.locator('.saved-workout-preview').waitFor();
  assert.equal(await page.locator('.queue-picker-search-chrome').isVisible(),false);await page.locator('.freestyle-queue-picker > .detail-header .detail-header-back').tap();
  assert.equal(await input.evaluate((n,old)=>n===old,identity),true);assert.equal(await state(page),initial);
  await page.goto(`${base}?theme=${theme}&saved=empty`);await page.locator('.queue-search-row').first().waitFor();await settled(page);
  await change(page,'Saved workouts',reduced);await page.getByText('No saved workouts yet',{exact:true}).waitFor();
  await page.screenshot({path:`${out}/${key}-empty.png`});await change(page,'Exercises',reduced);
  assert.deepEqual(errors,[]);results.push({key,tabs,exerciseScroll,savedScroll,firstVisit:first,checks:['first/subsequent/empty/populated','rapid touch alternation','both queries and clear','both scroll positions and DOM identity','search focus and caret','simulated keyboard open/closed','unchanged session/data','saved preview/back']});
  await context.close();console.log(`PASS ${key}`);
}
}finally{await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
console.log(`PASS ${results.length} mobile/theme/motion combinations, each with populated + empty and keyboard closed + simulated open.`);
