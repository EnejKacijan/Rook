import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright-core';
const phase=process.env.QA_PHASE||'before',out=`artifacts/search-keyboard/${process.env.QA_RUN||phase}`,reports=[];await mkdir(out,{recursive:true});
const frame=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const geometry=(page,height,offsetTop=0,scale=1,coResize=false)=>page.evaluate(({height,offsetTop,scale,coResize})=>window.qaGeometry({height,offsetTop,scale,coResize}),{height,offsetTop,scale,coResize});
const measure=(page,stage)=>page.evaluate(stage=>{
 const panel=document.querySelector('.modal-layer > .exercise-search-sheet'),layer=panel.parentElement,header=panel.querySelector('.detail-header,.sheet-header-chrome'),search=panel.querySelector('.rook-search-field'),footer=panel.querySelector(':scope > .sheet-action-footer'),list=[...panel.querySelectorAll('[data-exercise-search-scroll]')].find(n=>n.getClientRects().length),rect=n=>{if(!n)return null;const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,client:n.clientHeight,total:n.scrollHeight,scroll:n.scrollTop,paddingTop:s.paddingTop,paddingBottom:s.paddingBottom,marginTop:s.marginTop,marginBottom:s.marginBottom,transform:s.transform,display:s.display,overflow:s.overflow};},bounds=list.getBoundingClientRect();
 return {stage,at:performance.now(),vv:{height:visualViewport.height,offsetTop:visualViewport.offsetTop,scale:visualViewport.scale},innerHeight,rootHeight:document.documentElement.clientHeight,documentScroll:scrollY,layer:rect(layer),panel:rect(panel),header:rect(header),search:rect(search),footer:rect(footer),list:rect(list),chrome:rect(panel.querySelector('.queue-picker-search-chrome')),feedback:rect(panel.querySelector('.queue-picker-feedback')),background:rect(document.querySelector('.workout-screen')),fullyVisibleRows:[...list.querySelectorAll('.queue-search-row,.saved-workout-list > button,.choice-row')].map(rect).filter(r=>r.top>=bounds.top-.5&&r.bottom<=bounds.bottom+.5).length,focused:document.activeElement?.getAttribute('aria-label'),classes:panel.className,keyboard:panel.hasAttribute('data-sheet-keyboard-open'),inline:panel.getAttribute('style'),layerInline:layer.getAttribute('style'),overflow:document.documentElement.scrollWidth>innerWidth};
},stage);
async function boot(browser,width=390,height=844,theme='premium-dark',reduced=false){
 const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'});
 await context.addInitScript(({width,height})=>{
  const ownInner=Object.getOwnPropertyDescriptor(window,'innerHeight'),vv=new EventTarget();Object.assign(vv,{height,width,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:vv});
  window.qaGeometry=({height,offsetTop=0,scale=1,coResize=false})=>{Object.defineProperty(window,'innerHeight',coResize?{configurable:true,value:height}:ownInner);if(coResize)Object.defineProperty(document.documentElement,'clientHeight',{configurable:true,value:height});else delete document.documentElement.clientHeight;Object.assign(vv,{height,offsetTop,scale});window.dispatchEvent(new Event('resize'));vv.dispatchEvent(new Event('resize'));vv.dispatchEvent(new Event('scroll'));};
 },{width,height});
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(`http://127.0.0.1:4198/scripts/search-keyboard-review.html?theme=${theme}`);await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();await page.getByRole('button',{name:'+ ADD EXERCISE',exact:true}).click();await page.locator('.queue-search-row').first().waitFor();await page.waitForTimeout(250);return {context,page};
}
// Native touch dispatch, with the target stable after the existing sheet entry.
const tap=async(page,node)=>node.tap({timeout:5000});
async function drag(page,from,to){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from[0],y:from[1],id:1}]});for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from[0]+(to[0]-from[0])*i/6,y:from[1]+(to[1]-from[1])*i/6,id:1}]});await page.waitForTimeout(15);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();await frame(page);}
async function matrixCase(browser,engine,width,height,theme,largeText=false){
 const reduced=width===430, {page,context}=await boot(browser,width,height,theme,reduced),errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(largeText)await page.addStyleTag({content:'.freestyle-queue-picker :is(button,input,strong,small){font-size:125%!important}'});
 const input=page.getByRole('searchbox'),panel=page.locator('.freestyle-queue-picker'),list=panel.locator(':scope > .exercise-search-body > [data-exercise-search-scroll]'),footer=panel.locator(':scope > .sheet-action-footer'),original=await page.evaluate(()=>window.searchKeyboardReview.state());
 await page.evaluate(()=>{window.originalSearch=document.querySelector('.rook-search-field input');window.originalPanel=document.querySelector('.freestyle-queue-picker');window.originalList=document.querySelector('.freestyle-queue-picker > .exercise-search-body > [data-exercise-search-scroll]');});
 const samples=[await measure(page,'before')];await tap(page,input);await input.fill('squat');const coResize=width!==390;
 for(const h of [height-50,Math.max(500,height-150),400,436,400]){await geometry(page,h,24,1,coResize);await frame(page);samples.push(await measure(page,`height-${h}`));}
 let open=await measure(page,'settled');assert.equal(open.footer.height,0);assert.equal(open.layer.scroll,0);assert.equal(open.panel.scroll,0);assert.equal(open.panel.bottom,424);assert.ok(open.panel.top>=24);assert.equal(open.overflow,false);assert.ok(open.list.height>70);if(!largeText)assert.ok(open.fullyVisibleRows>=2,JSON.stringify(open));
 assert.ok(await footer.evaluate(n=>n.hidden));assert.equal(await panel.evaluate(n=>n.style.getPropertyValue('--sheet-action-height')),'0px');
 for(const query of ['squa','squ','squat','zzzznone','squat']){await input.fill(query);await frame(page);const next=await measure(page,query);assert.equal(next.panel.height,open.panel.height);assert.equal(next.list.height,open.list.height);}
 await list.evaluate(n=>n.scrollTop=110);const position=await list.evaluate(n=>n.scrollTop);
 for(const [h,offset] of [[436,24],[400,72],[400,24]]){await geometry(page,h,offset,1,coResize);await frame(page);assert.equal(await list.evaluate(n=>n.scrollTop),position);}
 await list.evaluate(n=>n.scrollTop=0);await frame(page);
 if(engine==='chromium'){
  const b=await list.boundingBox(),start=[width/2,b.y+Math.min(60,b.height/2)];await drag(page,start,[start[0],start[1]+80]);const after=await measure(page,'top-boundary');assert.equal(after.panel.transform,'none');assert.equal(after.panel.top,open.panel.top);assert.equal(after.documentScroll,open.documentScroll);
  await drag(page,[width/2,b.y+b.height-20],[width/2,b.y+15]);assert.ok(await list.evaluate(n=>n.scrollTop)>0,'native list touch scrolling');const touched=await measure(page,'list-scroll');assert.equal(touched.panel.top,open.panel.top);assert.equal(touched.panel.transform,'none');
  await list.evaluate(n=>n.scrollTop=n.scrollHeight);await drag(page,[width/2,b.y+b.height-20],[width/2,b.y+15]);assert.equal((await measure(page,'bottom-boundary')).panel.transform,'none');
 }
 await page.waitForTimeout(400);await list.evaluate(n=>n.scrollTop=0);await frame(page);await tap(page,list.locator('.queue-add-button').first());await page.waitForFunction(()=>window.searchKeyboardReview.state().activeWorkout.exercises.length===1,{},{timeout:2000});const added=await page.evaluate(()=>window.searchKeyboardReview.state());
 assert.equal(added.activeWorkout.id,original.activeWorkout.id);assert.equal(added.activeWorkout.exercises.length,1);assert.deepEqual(added.workouts,original.workouts);assert.equal(await input.evaluate(n=>n===document.activeElement),true);assert.equal(await footer.isVisible(),false);assert.equal((await measure(page,'added')).list.height,open.list.height);
 // Clearing preserves the same native input; each scope retains its own query.
 await tap(page,page.getByRole('button',{name:'Clear search',exact:true}));assert.equal(await input.inputValue(),'');assert.equal(await input.evaluate(n=>n===document.activeElement),true);
 await input.fill('press');await tap(page,page.getByRole('button',{name:'Saved workouts',exact:true}));assert.equal(await input.inputValue(),'');await input.fill('routine 1');const saved=panel.locator('.saved-workout-list');await saved.evaluate(n=>n.scrollTop=90);const savedPosition=await saved.evaluate(n=>n.scrollTop);await tap(page,page.getByRole('button',{name:'Exercises',exact:true}));assert.equal(await input.inputValue(),'press');await tap(page,page.getByRole('button',{name:'Saved workouts',exact:true}));assert.equal(await input.inputValue(),'routine 1');assert.equal(await saved.evaluate(n=>n.scrollTop),savedPosition);await tap(page,page.getByRole('button',{name:'Exercises',exact:true}));
 await input.fill('squat');await list.evaluate(n=>n.scrollTop=0);await tap(page,list.locator('.queue-search-body').first());await page.locator('.queue-exercise-preview').waitFor();assert.equal(await footer.isVisible(),true,'preview actions remain');assert.equal(await panel.evaluate(n=>n.classList.contains('is-search-browsing')),false);await geometry(page,height);await tap(page,panel.locator('.detail-header-back'));await input.waitFor();assert.equal(await input.inputValue(),'squat');assert.equal(await page.evaluate(()=>window.originalSearch===document.querySelector('.rook-search-field input')&&window.originalPanel===document.querySelector('.freestyle-queue-picker')&&window.originalList===document.querySelector('.freestyle-queue-picker > .exercise-search-body > [data-exercise-search-scroll]')),true);
 await tap(page,input);await geometry(page,400,24,1,coResize);await frame(page);await list.evaluate(n=>n.scrollTop=100);const beforeDone=await list.evaluate(n=>n.scrollTop);await geometry(page,height);await frame(page);assert.equal(await input.evaluate(n=>n===document.activeElement),true,'Done does not force blur/refocus');assert.equal(await panel.evaluate(n=>n.classList.contains('is-search-focused')),false);assert.equal(await footer.isVisible(),true);assert.equal(await list.evaluate(n=>n.scrollTop),beforeDone);samples.push(await measure(page,'restored'));
 // A hardware keyboard focus never gets the software-keyboard policy.
 await geometry(page,height/2,0,2);await frame(page);assert.equal(await panel.evaluate(n=>n.hasAttribute('data-sheet-keyboard-open')),false);assert.equal(await footer.isVisible(),true);await geometry(page,height);await frame(page);
 await tap(page,input);await geometry(page,400,24,1,coResize);await frame(page);await page.screenshot({path:`${out}/${engine}-${width}-${height}-${theme}${largeText?'-large':''}.png`});
 await tap(page,panel.getByRole('button',{name:'Back to workout',exact:true}).first());await panel.waitFor({state:'detached'});await frame(page);assert.equal(await page.locator('.workout-screen').evaluate(n=>n.closest('[inert]')!==null),false);assert.equal((await page.evaluate(()=>window.searchKeyboardReview.state())).activeWorkout.exercises.length,1);assert.deepEqual(errors,[]);
 reports.push({engine,width,height,theme,reduced,largeText,samples});console.log(`PASS ${engine} ${width} ${height} ${theme} large=${largeText}`);await context.close();
}
async function consumersCase(browser,engine,width){
 const {page,context}=await boot(browser,width,844),samples=[];
 await tap(page,page.locator('.queue-add-button').first());await page.waitForFunction(()=>searchKeyboardReview.state().activeWorkout.exercises.length===1);
 await tap(page,page.locator('.detail-header').getByRole('button',{name:'Back to workout',exact:true}));await page.locator('.freestyle-queue-picker').waitFor({state:'detached'});
 const baseline=await page.evaluate(()=>searchKeyboardReview.state());
 await page.getByRole('button',{name:'Replace',exact:true}).click();await page.getByRole('button',{name:'Search all exercises',exact:true}).click();
 const replace=page.locator('.replace-sheet'),search=replace.getByRole('searchbox');await tap(page,search);await search.fill('squat');await geometry(page,400,24);await frame(page);samples.push(await measure(page,'replace-open'));
 assert.ok(samples.at(-1).list.height>=150);assert.equal(samples.at(-1).panel.scroll,0);assert.equal(samples.at(-1).overflow,false);
 await replace.locator('[data-exercise-search-scroll]').evaluate(n=>n.scrollTop=140);await page.screenshot({path:`${out}/${engine}-${width}-replace.png`});
 // Close during keyboard closing, without selecting/replacing anything.
 await geometry(page,500,10);await tap(page,replace.getByRole('button',{name:'Close',exact:true}));await replace.waitFor({state:'detached'});await geometry(page,844);assert.deepEqual((await page.evaluate(()=>searchKeyboardReview.state())).activeWorkout,baseline.activeWorkout);
 await page.getByRole('button',{name:'Back to Today',exact:true}).click();await page.getByRole('button',{name:'PROFILE',exact:true}).click();await page.locator('[data-profile-area="training"]').click();await page.getByRole('button',{name:'Saved workouts Personal reusable workout templates'}).click();
 const saved=page.locator('.modal-layer > .saved-workouts'),savedSearch=saved.getByRole('searchbox');await tap(page,savedSearch);await savedSearch.fill('Squat');await geometry(page,400,24);await frame(page);samples.push(await measure(page,'saved-open'));assert.ok(samples.at(-1).fullyVisibleRows>=2);await page.screenshot({path:`${out}/${engine}-${width}-saved.png`});
 await tap(page,saved.locator('.saved-workout-list button').first());await saved.locator('.saved-workout-preview').waitFor();assert.equal(await saved.evaluate(n=>n.classList.contains('is-search-browsing')),false);
 await tap(page,saved.getByRole('button',{name:'Saved workout options',exact:true}));const nested=page.locator('.saved-template-options');await nested.waitFor();assert.equal(await saved.evaluate(n=>n.inert),true);await geometry(page,436,72);await tap(page,nested.getByRole('button',{name:'Back to saved workout',exact:true}));await nested.waitFor({state:'detached'});assert.equal(await saved.evaluate(n=>n.inert),false);
 await geometry(page,844);await frame(page);await tap(page,saved.locator('.detail-header-back'));await savedSearch.waitFor({timeout:3000}).catch(async e=>{console.log(await saved.innerText());await page.screenshot({path:`${out}/saved-back-failure.png`});throw e;});assert.equal(await savedSearch.inputValue(),'Squat');
 await tap(page,savedSearch);await geometry(page,740,8);await frame(page);await tap(page,saved.locator('.detail-header-close'));await saved.waitFor({state:'detached'});await geometry(page,844);await frame(page);assert.equal(await page.locator('[inert]').count(),0);assert.deepEqual((await page.evaluate(()=>searchKeyboardReview.state())).activeWorkout,baseline.activeWorkout);
 reports.push({engine,width,samples});console.log(`PASS ${engine} ${width} Replace/Saved/nested/transition-close`);await context.close();
}
try{
 if(phase==='gestures'){
  const browser=await chromium.launch({channel:'chrome',headless:true});try{
   const {page,context}=await boot(browser),input=page.getByRole('searchbox'),panel=page.locator('.freestyle-queue-picker');
   await tap(page,input);await input.fill('squat');await geometry(page,400,24);await frame(page);
   const first=await page.locator('.queue-search-body').first().boundingBox();await drag(page,[70,first.y+30],[220,first.y+30]);await page.waitForFunction(()=>searchKeyboardReview.state().activeWorkout.exercises.length===1);
   assert.equal(await input.evaluate(n=>n===document.activeElement),true);assert.equal((await measure(page,'horizontal-add')).panel.transform,'none');
   const handle=await panel.locator('.modal-drag-handle').boundingBox();await drag(page,[195,handle.y+handle.height/2],[195,handle.y+handle.height/2+180]);await panel.waitFor({state:'detached'});await frame(page);
   assert.equal((await page.evaluate(()=>searchKeyboardReview.state())).activeWorkout.exercises.length,1);assert.equal(await page.locator('[inert]').count(),0);
   reports.push({horizontalAdd:'passed',explicitHandleDismissal:'passed',sessionPreserved:true});console.log('PASS native horizontal Add + explicit handle dismissal with keyboard geometry');await context.close();
  }finally{await browser.close();}
 }else if(phase==='consumers'){
  for(const [engine,type] of Object.entries({chromium,webkit})){const browser=await type.launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});try{for(const width of [320,390,430])await consumersCase(browser,engine,width);}finally{await browser.close();}}
 }else
 if(phase==='matrix'){
  for(const [engine,type] of Object.entries({chromium,webkit})){if(process.env.QA_ENGINE&&process.env.QA_ENGINE!==engine)continue;const browser=await type.launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});try{for(const width of [320,390,430].filter(w=>!process.env.QA_WIDTH||w===Number(process.env.QA_WIDTH)))for(const height of [667,844])for(const theme of ['standard-light','standard-dark','premium-light','premium-dark'])await matrixCase(browser,engine,width,height,theme);await matrixCase(browser,engine,320,667,'premium-dark',true);}finally{await browser.close();}}
 }else{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const {context,page}=await boot(browser),samples=[await measure(page,'before-focus')];await page.getByRole('searchbox').click();samples.push(await measure(page,'focus'));
  for(const [height,offsetTop] of [[800,0],[660,0],[480,24],[400,24],[436,24],[400,72]]){await geometry(page,height,offsetTop);await frame(page);samples.push(await measure(page,`keyboard-${height}-${offsetTop}`));}
  await page.getByRole('searchbox').fill('squat');await frame(page);samples.push(await measure(page,'query-squat'));await page.screenshot({path:`${out}/390-keyboard.png`});
  const list=page.locator('[data-exercise-search-scroll]').first();await list.evaluate(n=>n.scrollTop=150);samples.push(await measure(page,'results-scroll'));
  await geometry(page,844);await frame(page);samples.push(await measure(page,'keyboard-closed'));await page.screenshot({path:`${out}/390-restored.png`});
  reports.push({browser:'chromium',width:390,height:844,theme:'premium-dark',samples});await context.close();
 }finally{await browser.close();}
 }
}finally{await writeFile(`${out}/results.json`,JSON.stringify(reports,null,2));}
if(['before','after'].includes(phase))console.log(JSON.stringify(reports.map(r=>r.samples.map(s=>({stage:s.stage,panel:s.panel.height,header:s.header.height,chrome:s.chrome?.height,results:s.list.height,footer:s.footer?.height,completeRows:s.fullyVisibleRows,layerScroll:s.layer.scroll,panelScroll:s.panel.scroll}))),null,2));
