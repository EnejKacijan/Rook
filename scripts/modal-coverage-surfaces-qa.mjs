import {openProfileArea} from './qa-current-navigation.mjs';
import {qaClockOffset,installQaCalendarClock} from './qa-clock.mjs';
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
const surfaces=['notes','saved-rename','saved-edit','profile','custom','plan-picker','expanded-plan','import','history'];
try{
for(const name of process.env.QA_SURFACE?process.env.QA_SURFACE.split(','):surfaces){
  const width=name==='notes'||name==='plan-picker'||name==='saved-edit'?320:390;
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await context.addInitScript(installQaCalendarClock,qaClockOffset);
  const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
  await page.goto(`${base}/scripts/modal-coverage-review.html`);
  await page.getByLabel('Scenario').selectOption(name==='notes'||name.startsWith('saved-')?'freestyle':'home');
  await page.getByLabel('Theme').selectOption(width===320?'light':'premium-dark');await page.getByRole('button',{name:'Load synthetic review'}).click();
  let input;
  try{
    if(name==='notes'||name.startsWith('saved-')){
      await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();
      if(name==='notes'){
        await page.getByRole('button',{name:'Exercise options',exact:true}).click();await page.getByRole('button',{name:'Add note',exact:true}).click();input=page.getByRole('textbox',{name:'Exercise note',exact:true});
      }else{
        await page.getByRole('button',{name:'+ ADD EXERCISE',exact:true}).click();await page.getByRole('button',{name:'Saved workouts',exact:true}).click();await page.locator('.saved-workout-list .list-row').click();await page.getByRole('button',{name:'Saved workout options',exact:true}).click();
        await page.getByRole('dialog',{name:'Saved workout options',exact:true}).getByRole('button',{name:name==='saved-rename'?'Rename':'Edit exercises',exact:true}).click();await page.locator('.saved-template-options').waitFor({state:'detached'});
        if(name==='saved-rename')input=page.getByLabel('Template name',{exact:true});
        else{await page.locator('.plan-editor-summary').first().click();input=page.locator('.modal-layer input:visible').first();}
      }
    }else if(name==='history'){
      await page.getByRole('button',{name:'Previous week',exact:true}).click();await page.getByRole('button',{name:/^Thu \d+,.*completed/}).click();await page.getByRole('button',{name:'WORKOUT COMPLETE · VIEW HISTORY',exact:true}).click();await page.getByRole('button',{name:'Workout options',exact:true}).click();await page.getByRole('dialog',{name:'Workout options',exact:true}).getByRole('button',{name:'Edit history',exact:true}).click();input=page.getByRole('textbox',{name:'Session note',exact:true});
    }else{
      await page.getByRole('button',{name:'PROFILE',exact:true}).click();
      if(name==='profile'){await openProfileArea(page,'training');await page.getByRole('button',{name:/Personal details/}).click();input=page.getByLabel(/First name/);}
      if(name==='custom'){await openProfileArea(page,'training');await page.getByRole('button',{name:/Custom exercises/}).click();await page.getByRole('button',{name:'ADD CUSTOM EXERCISE',exact:true}).click();input=page.locator('.custom-exercise-editor input').first();}
      if(name==='plan-picker'||name==='expanded-plan'){
        await openProfileArea(page,'program');await page.getByRole('button',{name:/Edit plan/}).click();
        if(name==='expanded-plan'){await page.locator('.edit-plan-expand').click();input=page.locator('.edit-plan-screen input:visible').first();}
        else{await page.locator('.plan-workout-add:not([disabled])').first().click();input=page.getByRole('searchbox').first();}
      }
      if(name==='import'){
        await openProfileArea(page,'program');await page.getByRole('button',{name:/Replace plan/}).click();await page.getByRole('button',{name:/Import from Notes|Import a different plan/}).click();
        await page.getByPlaceholder(/Paste your workout notes/).fill('Monday: Upper\nPlank 3 sets\nBench Press 3x8 RIR 7');await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();input=page.getByLabel('Reviewed Min reps',{exact:true}).first();
      }
    }
    await stable(page);await input.focus();
    if(!['saved-edit','expanded-plan','import'].includes(name))await input.fill(name==='plan-picker'?'press':'Keep my draft');
    const oldInput=await input.elementHandle(),value=await input.inputValue(),panel=page.locator('.modal-layer').last().locator(':scope>*').first(),oldPanel=await panel.elementHandle();
    const samples=[];
    await page.locator('#keyboard-qa>summary').click();await page.locator('#geometry').selectOption('both-follow');await page.locator('#keyboard-qa>summary').click();
    for(const id of ['open','toolbar','pan','close','open']){
      await qa(page,id);const g=await geometry(page);verify(g,name+'/'+id);samples.push({id,...g});
      assert.equal(await input.evaluate((n,old)=>n===old,oldInput),true);assert.equal(await panel.evaluate((n,old)=>n===old,oldPanel),true);assert.equal(await input.inputValue(),value);assert.equal(await input.evaluate(n=>document.activeElement===n),true);
      if(id==='toolbar')await page.screenshot({path:`${out}/${width}-${name}-keyboard.png`});
    }
    assert.deepEqual(errors,[]);results.push({name,width,samples});console.log(`PASS ${name}: shared coverage, focus/draft, footer, restore`);
  }catch(error){await page.screenshot({path:`${out}/${name}-failure.png`});await writeFile(`${out}/${name}-failure.txt`,await page.locator('body').innerText());throw error;}
  finally{await context.close();}
}
}finally{await writeFile(`${out}/surface-results.json`,JSON.stringify(results,null,2));await browser.close();}
