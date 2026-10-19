import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {HistoryImportBatch} from '../src/historyImportBatch.js';
import {parseHistoricalWorkoutCsv} from '../src/historicalWorkoutImport.js';
import {readHistoryCsv} from '../src/historyImportTable.js';
import {blankState,serializeState,deserializeState} from '../src/domain.js';
import {hevyCsv,hevyRow} from './history-import-fixtures.mjs';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {openProfileArea} from './qa-current-navigation.mjs';
const out='artifacts/ROOK-HISTORICAL-IMPORT-REAL-HEVY';await mkdir(out,{recursive:true});
const bytes=await readFile('C:/Users/enejk/Downloads/workout_data.csv');
const shape=parseHistoricalWorkoutCsv({text:bytes.toString('utf8'),state:blankState()}).workouts;
const results=[];
function scale(copies){const rows=[];
 for(let copy=0;copy<copies;copy++)for(const [wi,w] of shape.entries())for(const [ei,e] of w.exercises.entries())for(const [si,s] of e.sets.entries()){
   const start=new Date(Date.UTC(2020,0,1+copy*95+wi,12)).toISOString();
   rows.push(hevyRow({title:`Synthetic ${copy}-${wi}`,start_time:start,end_time:new Date(Date.parse(start)+3600000).toISOString(),
    description:w.sessionNote?'Synthetic session note':'',exercise_title:ei%2?'Cable Row':'Bench Press',exercise_notes:e.notes?'Synthetic exercise note':'',
    exercise_entry_id:`block-${ei}`,set_index:si,superset_id:'',set_type:'normal',weight_kg:s.weight==null?'':20,reps:s.reps==null?'':8,
    distance_km:s.distance==null?'':0.2,duration_seconds:s.durationSeconds==null?'':45,rpe:''}));
 }
 return hevyCsv(rows,'kg',[...readHistoryCsv(bytes.toString('utf8')).rows[0],'exercise_entry_id']);
}
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const copies of [1,10]){
 const csv=scale(copies),batch=new HistoryImportBatch(),state=blankState();let t=performance.now();
 const setup=await batch.read([{name:'SYNTHETIC-shape.csv',buffer:new TextEncoder().encode(csv).buffer}],{source:'hevy'}),readMs=performance.now()-t;
 t=performance.now();const p=await batch.parse(setup.files.map(f=>({sheetIndex:f.sheetIndex,options:{source:'hevy'}})),state);const normalizeMatchHashMs=performance.now()-t;
 t=performance.now();const applied=batch.apply(state,{}),serialized=serializeState(applied.state);const prepareApplyMs=performance.now()-t;
 t=performance.now();deserializeState(serialized);const hydrateMs=performance.now()-t;
 const fixture=createReturningUserFixture(1);fixture.workouts=[];fixture.weightCheckins=[];fixture.ai.planUpgradeDismissed=true;
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},fixture);
 const page=await context.newPage();await page.route('**/api/**',r=>r.abort());await page.goto('http://127.0.0.1:4173');
 await page.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(page,'data');await page.getByRole('button',{name:/Import workout history/}).click();await page.getByRole('button',{name:/^Hevy/}).click();
 await page.evaluate(()=>{window.qaFrames=[];window.qaRun=true;const tick=t=>{window.qaFrames.push(t);if(window.qaRun)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
 t=performance.now();await page.locator('input[type=file]').setInputFiles({name:'SYNTHETIC-shape.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await page.getByRole('heading',{name:'Review import',exact:true}).waitFor({timeout:60000});
 const fileToPreviewMs=performance.now()-t,frames=await page.evaluate(()=>{window.qaRun=false;return window.qaFrames;});
 const before=await page.evaluate(()=>localStorage.getItem('lift-v2-state'));t=performance.now();await page.getByRole('button',{name:new RegExp(`^IMPORT ${p.summary.workouts.toLocaleString('en')} WORKOUT`)}).click();
 await page.waitForFunction(()=>!!document.querySelector('[role=alert]')||!!document.querySelector('.history-import-success'),{},{timeout:30000});
 const applyToFeedbackMs=performance.now()-t,failed=await page.getByRole('alert').count()>0;
 const after=await page.evaluate(()=>localStorage.getItem('lift-v2-state'));
 if(failed&&before!==after)throw new Error('Quota failure changed durable state');
 if(!failed&&JSON.parse(after).workouts.length!==copies*95)throw new Error('Scaled workout count changed');
 results.push({copies,sourceRows:copies*1139,workouts:copies*95,inputBytes:Buffer.byteLength(csv),readMs,normalizeMatchHashMs,prepareApplyMs,hydrateMs,serializedBytes:Buffer.byteLength(serialized),fileToPreviewMs,uiAnimationFrames:frames.length,maxFrameGapMs:Math.max(0,...frames.slice(1).map((t,i)=>t-frames[i])),applyToFeedbackMs,storageOutcome:failed?'quota failure; original state unchanged':'saved',platform:'desktop Chrome, 390px, worker parsing'});
 await context.close();console.log(JSON.stringify(results.at(-1)));
} }finally{await browser.close();await writeFile(out+'/performance.json',JSON.stringify(results,null,2));}
