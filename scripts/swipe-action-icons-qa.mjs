import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const before=process.argv.includes('--before'),out='artifacts/swipe-action-icons',results=[];
await mkdir(out,{recursive:true});
const baseline=before?[]:JSON.parse(await readFile(`${out}/before.json`,'utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const rect=n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height};};
const luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
const contrast=(a,b)=>{const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);};
async function measure(row,add){return row.evaluate((n,add)=>{
 const icon=n.querySelector(add?'.queue-swipe-cue svg':'.swipe-remove-background svg'),background=icon.closest(add?'.queue-swipe-cue':'.swipe-remove-background'),s=getComputedStyle(icon),b=getComputedStyle(background),r=icon.getBoundingClientRect(),row=n.getBoundingClientRect(),front=n.querySelector('[data-swipe-content]').getBoundingClientRect();
 return {width:parseFloat(s.width),height:parseFloat(s.height),stroke:s.stroke,strokeWidth:s.strokeWidth,fill:s.fill,linecap:s.strokeLinecap,linejoin:s.strokeLinejoin,transition:s.transitionDuration,center:[r.x+r.width/2,r.y+r.height/2],icon:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},row:{left:row.left,right:row.right,top:row.top,bottom:row.bottom,width:row.width,height:row.height},front:{left:front.left,right:front.right},color:b.color,background:b.backgroundColor,armed:n.hasAttribute('data-swipe-armed'),hidden:background.getAttribute('aria-hidden'),circle:icon.querySelector('circle')?{cx:icon.querySelector('circle').getAttribute('cx'),cy:icon.querySelector('circle').getAttribute('cy'),r:icon.querySelector('circle').getAttribute('r')}:null};
 },add);}
async function begin(page,row,add){
 await row.evaluate(n=>n.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(100);
 const target=row.locator(add?'[data-swipe-body]':'[data-reorder-kind]').first(),r=await row.boundingBox(),t=await target.boundingBox(),cdp=await page.context().newCDPSession(page);
 const x=add?r.x+60:t.x+t.width/2,y=Math.max(r.y+12,Math.min(r.y+r.height-12,t.y+t.height/2));
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
 return {width:r.width,async move(distance){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(add?distance:-distance),y,id:1}]});await page.waitForTimeout(110);},async end(cancel=false){await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();await page.waitForTimeout(250);}};
}
try{
for(const width of [320,390,430])for(const theme of ['standard-light','standard-dark','premium-light','premium-dark'])for(const mode of ['add','active','editor'])for(const reduced of before||width!==390?[false]:[false,true]){
 if(process.env.QA_CASE&&`${width}-${theme}-${mode}`!==process.env.QA_CASE)continue;
 const add=mode==='add',key=`${width}-${theme}-${mode}-${reduced?'reduced':'motion'}`,context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:3,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 const actualTheme=theme.startsWith('standard')?theme.split('-')[1]:theme;
 await page.goto(add?`http://127.0.0.1:4198/scripts/picker-scope-motion-review.html?theme=${theme}`:`http://127.0.0.1:4198/scripts/direct-swipe-review.html?case=${mode}&theme=${actualTheme}&review=swipe-icon-qa`);
 if(add){await page.getByRole('searchbox',{name:'Search exercises'}).fill('bench');await page.locator('[data-catalog-id="barbell-bench-press"]').waitFor();}
 const row=add?page.locator('[data-catalog-id="barbell-bench-press"]'):page.locator('[data-swipe-enabled="true"]').first();await row.waitFor();await row.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>!document.getAnimations().some(a=>a.playState==='running'&&a.effect.getTiming().iterations!==Infinity));
 const geometry=await row.evaluate(n=>{const box=n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height};};return {row:box(n),front:box(n.querySelector('[data-swipe-content]')),text:n.querySelector('[data-swipe-content]').innerText,buttons:[...n.querySelectorAll('button')].map(b=>({label:b.getAttribute('aria-label'),text:b.textContent,box:box(b)}))};});
 if(before){results.push({key,geometry});await context.close();continue;}
 assert.deepEqual(geometry,baseline.find(r=>r.key===key.replace('-reduced','-motion')).geometry,`${key}: identical closed row`);
 const proof=()=>page.locator(add?'#scope-proof':'#domain-proof').textContent(),initial=await proof();
 if(add){assert.equal(await row.locator('.queue-add-button').textContent(),'+');assert.equal(await row.locator('.queue-add-button').getAttribute('aria-label'),'Add Bench Press to Up Next');}
 else assert.match(await row.locator('[data-swipe-fallback]').getAttribute('aria-label'),mode==='editor'?/^Remove exercise:/ : /^Remove from this workout:/);
 let gesture=await begin(page,row,add);await gesture.move(add?50:gesture.width*.2);const partial=await measure(row,add);
 assert.equal(partial.armed,false);assert.equal(partial.hidden,'true');assert.equal(partial.width,20);assert.equal(partial.height,20);assert.equal(partial.strokeWidth,'1.7px');assert.equal(partial.fill,'none');assert.equal(partial.linecap,'round');assert.equal(partial.linejoin,'round');assert.deepEqual(partial.circle,{cx:'12',cy:'12',r:'9'});
 assert.ok(partial.icon.top>=partial.row.top&&partial.icon.bottom<=partial.row.bottom,'icon fits row vertically');
 await page.screenshot({path:`${out}/${key}-partial.png`});
 assert.ok(add?partial.icon.left>=partial.row.left&&partial.icon.right<=partial.front.left:partial.icon.left>=partial.front.right&&partial.icon.right<=partial.row.right,`icon fully exposed in partial swipe: ${JSON.stringify(partial)}`);
 assert.ok(Math.abs(partial.center[1]-(partial.row.top+partial.row.height/2))<.1,'vertical centering');
 assert.ok(contrast(partial.color,partial.background)>=3,'unarmed contrast');
 await gesture.end();assert.equal(await proof(),initial,'below threshold preserves domain');
 assert.deepEqual(await row.evaluate(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height};}),geometry.row);
 gesture=await begin(page,row,add);const threshold=gesture.width*(add ? .24 : .5);await gesture.move(threshold-2);const near=await measure(row,add);await gesture.move(threshold+2);const armed=await measure(row,add);
 assert.equal(armed.armed,true);assert.deepEqual(armed.row,near.row,'no row shift at arm');assert.ok(Math.abs(armed.center[1]-near.center[1])<.1);assert.ok(Math.abs(armed.center[0]-near.center[0]+(add?0:2))<.15,'no threshold icon jump beyond continuous reveal tracking');assert.ok(contrast(armed.color,armed.background)>=3,'armed contrast');
 if(add){assert.equal(armed.background,'rgb(31, 107, 76)');assert.equal(armed.color,'rgb(255, 255, 255)');}
 else assert.equal(armed.background,partial.background);
 if(reduced)assert.equal(armed.transition,'0s');
 await page.screenshot({path:`${out}/${key}-armed.png`});await gesture.end();
 const changed=JSON.parse(await proof()),original=JSON.parse(initial);
 if(add){assert.equal(changed.activeWorkout.exercises.length,original.activeWorkout.exercises.length+1);assert.equal(changed.activeWorkout.id,original.activeWorkout.id);}
 else if(mode==='active'){assert.equal(changed.session.exercises.length,original.session.exercises.length-1);assert.deepEqual(changed.session.exercises[0],original.session.exercises[0]);assert.deepEqual(changed.plan,original.plan);}
 else assert.equal(await proof(),initial,'editor only changes the draft');
 await page.getByRole('button',{name:'Undo',exact:true}).tap();
 const restored=JSON.parse(await proof());
 if(add){assert.deepEqual(restored.activeWorkout.exercises,original.activeWorkout.exercises);assert.deepEqual(restored.program,original.program);}
  else{for(const field of ['id','startedAt','exerciseIndex','exercises','rest'])assert.deepEqual(restored.session?.[field],original.session?.[field]);assert.deepEqual(restored.plan,original.plan);}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 results.push({key,geometry,partial,armed,contrast:{partial:contrast(partial.color,partial.background),armed:contrast(armed.color,armed.background)}});await context.close();console.log(`PASS ${key}`);
}
}finally{await writeFile(`${out}/${before?'before':'results'}.json`,JSON.stringify(results,null,2));await browser.close();}
console.log(`PASS ${results.length} icon/layout/gesture cases.`);
