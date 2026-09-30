import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright-core';
import { keepTrainingState } from '../src/fixtures/keepTrainingState.js';
import { addWorkoutExercise } from '../src/freestyleWorkout.js';

const engine=process.env.ROOK_QA_BROWSER||'chrome', origin=process.env.ROOK_QA_URL||'http://127.0.0.1:4273';
const out='artifacts/keep-training'; await mkdir(out,{recursive:true});
const results=[];
const cases=[];
for(const width of [320,390,430])for(const style of ['standard','premium'])for(const appearance of ['light','dark'])
  cases.push({width,style,appearance,scenario:'14-of-15'});
for(const scenario of ['bodyweight','per_side','timed','added-exercise','added-set','current-long','superset','repeated'])
  cases.push({width:390,style:'premium',appearance:'dark',scenario});
const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
try {
  for(const test of cases) {
    const {width,style,appearance,scenario}=test;
    if(process.env.ROOK_QA_CASE && `${width}-${style}-${appearance}-${scenario}`!==process.env.ROOK_QA_CASE)continue;
    let state=keepTrainingState(scenario==='repeated'?[[1,2],[3,0]]:undefined), ei=1,si=2;
    const exercise=state.activeWorkout.exercises[1];
    if(scenario==='bodyweight')Object.assign(exercise,{exerciseId:'push-up',loadRequirement:'none'});
    if(scenario==='per_side'){
      Object.assign(exercise,{exerciseId:'bodyweight-split-squat',loggingMode:'per_side',loadRequirement:'optional'});
      exercise.sets.forEach(set=>set.sides={left:{reps:8},right:{reps:set.completed?8:null}});
    }
    if(scenario==='timed'){exercise.exerciseId='plank';exercise.sets.forEach(set=>set.reps=30);}
    if(scenario==='added-exercise'){
      state=keepTrainingState([]);state=addWorkoutExercise(state,'lateral-raise',{requestId:'qa-add',sessionId:state.activeWorkout.id});ei=5;si=0;
    }
    if(scenario==='added-set')Object.assign(exercise.sets[2],{added:true,planned:false});
    if(scenario==='current-long'){
      state.activeWorkout.exerciseIndex=1;
      exercise.sets[2].completed=true;
      for(let i=3;i<6;i++)exercise.sets.push({...exercise.sets[0],id:`long-set-${i}`,completed:i!==5});
      si=5;
    }
    if(scenario==='superset'){
      state.activeWorkout.exercises[1].supersetId='qa-pair';state.activeWorkout.exercises[2].supersetId='qa-pair';
      state.activeWorkout.exercises[2].sets[0].completed=false;
    }
    Object.assign(state.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
    const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:width===320?'reduce':'no-preference',serviceWorkers:'block'});
    let page;
    try {
      await context.addInitScript(state=>{
        if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(state));
        const original=HTMLElement.prototype.scrollIntoView;
        HTMLElement.prototype.scrollIntoView=function(options){
          original.call(this,options);
          if(this.matches('.set-row'))window.__revealedSet={id:this.dataset.setId,locked:document.body.style.position};
        };
      },state);
      page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/api/**',route=>route.fulfill({json:{available:false}}));
      await page.goto(origin);await page.getByRole('button',{name:/resume workout/i}).first().click();
      await page.locator('[data-active-workout] .set-row').first().waitFor();
      assert.equal(await page.locator('html').getAttribute('data-style'),style);
      assert.equal(await page.locator('html').getAttribute('data-appearance'),appearance);
      const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
      const resume=async(targetEi,targetSi)=>{
        const before=await read(),target=before.activeWorkout.exercises[targetEi].sets[targetSi].id;
        await page.getByRole('button',{name:'Finish',exact:true}).click();
        await page.getByRole('button',{name:'KEEP TRAINING',exact:true}).click();
        await page.locator('.workout-confirm').waitFor({state:'detached'});
        await page.waitForFunction(id=>window.__revealedSet?.id===id,target);
        await page.waitForFunction(index=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exerciseIndex===index,targetEi);
        const geometry=await page.evaluate(id=>{
          const screen=document.querySelector('[data-active-workout]'),row=[...screen.querySelectorAll('.set-row')].find(row=>row.dataset.setId===id);
          const box=row.getBoundingClientRect(),header=screen.querySelector('.workout-header').getBoundingClientRect();
          const rest=screen.querySelector('.rest-timer')?.getBoundingClientRect();
          return {top:box.top,bottom:box.bottom,header:header.bottom,rest:rest?.top??innerHeight,
            locked:document.body.style.position,focus:document.activeElement.tagName,reveal:window.__revealedSet};
        },target);
        assert(geometry.top>=geometry.header-1,JSON.stringify(geometry));
        assert(geometry.bottom<=geometry.rest-8,JSON.stringify(geometry));
        assert.equal(geometry.locked,'');assert.equal(geometry.reveal.locked,'');
        assert(!['INPUT','TEXTAREA','SELECT'].includes(geometry.focus));
        const after=await read();before.activeWorkout.exerciseIndex=targetEi;
        assert.deepEqual(after.activeWorkout,before.activeWorkout,'navigation only, including rest/timestamps/values/IDs');
        for(const key of ['program','workouts','savedWorkoutTemplates'])assert.deepEqual(after[key],before[key]);
        return geometry;
      };
      const geometry=await resume(ei,si);
      if(scenario==='repeated'){
        await page.getByRole('button',{name:'Log set 3',exact:true}).click();
        await resume(3,0);
      }
      if(width===390&&scenario==='14-of-15'){
        await page.locator('.workout-motion-paint').waitFor({state:'detached'});
        await page.screenshot({path:`${out}/${engine}-${style}-${appearance}.png`});
      }
      await page.reload();await page.getByRole('button',{name:/resume workout/i}).first().click();
      await page.locator('[data-active-workout] .set-row').first().waitFor();
      assert.equal((await read()).activeWorkout.exerciseIndex,scenario==='repeated'?3:ei);
      assert.deepEqual(errors,[]);results.push({...test,pass:true,geometry});console.log('PASS',engine,width,style,appearance,scenario);
    }catch(error){
      await page?.screenshot({path:`${out}/failure.png`});
      await writeFile(`${out}/failure.json`,JSON.stringify({test,error:String(error),body:await page?.locator('body').innerText(),
        storage:await page?.evaluate(()=>Object.fromEntries(Object.entries(localStorage)))},null,2));
      throw error;
    }finally{await context.close();}
  }
}finally{await browser.close();await writeFile(`${out}/${engine}.json`,JSON.stringify(results,null,2));}
