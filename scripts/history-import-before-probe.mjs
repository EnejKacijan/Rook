import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { openProfileArea } from './qa-current-navigation.mjs';
const root='artifacts/ROOK-HISTORY-IMPORT-AUDIT';
await mkdir(`${root}/screenshots`,{recursive:true});
await mkdir(`${root}/fixtures`,{recursive:true});
const csv='title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe\r\nUpper,"28 Mar 2025, 17:29","28 Mar 2025, 18:00",,Bench Press,,,0,normal,60,8,,,8\r\n';
await writeFile(`${root}/fixtures/SYNTHETIC-hevy-kg.csv`,csv);
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
try {
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.addInitScript(state=>localStorage.setItem('lift-v2-state',JSON.stringify(state)),createReturningUserFixture(1));
 const page=await context.newPage();await page.goto('http://127.0.0.1:4173');
 await page.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(page,'data');
 await page.getByRole('button',{name:/Import workout history/}).click();await page.getByRole('button',{name:/^Hevy/}).click();
 await page.locator('input[type=file]').setInputFiles({name:'SYNTHETIC-hevy-kg.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 const failure=await page.getByRole('alert').innerText();
 await page.screenshot({path:`${root}/screenshots/before-synthetic-hevy-kg.png`});
 await writeFile(`${root}/before.json`,JSON.stringify({synthetic:true,realUserFile:false,filename:'SYNTHETIC-hevy-kg.csv',delimiter:',',encoding:'UTF-8, no BOM; CRLF',headers:csv.split('\r\n')[0],dataRows:1,selectedSource:'Hevy',unitMode:'explicit kg/km',failure},null,2));
 console.log(failure);
} finally {await browser.close();}
