import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { importAdversarialFixtures } from '../src/importAdversarialFixtures.js';
import { importHardeningFixtures } from '../src/importHardeningFixtures.js';
const directory=new URL('../artifacts/import-hardening/',import.meta.url);
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
try{
  const fixtures=[...importHardeningFixtures,...importAdversarialFixtures];
  for(const [index,fixture] of fixtures.entries()){
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    const page=await context.newPage();const errors=[];let requests=0;
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(/\/api\/ai/.test(r.url())&&r.method()!=='GET')requests++;});
    await page.goto('http://127.0.0.1:4173');
    await page.getByRole('button',{name:/Already have a plan/i}).click();
    if(index===0)await page.screenshot({path:fileURLToPath(new URL('00-empty.png',directory))});
    await page.getByPlaceholder(/Paste your workout notes/).fill(fixture.text);
    if(index===0){assert.equal(await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).isEnabled(),true);await page.screenshot({path:fileURLToPath(new URL('01-pasted.png',directory)),animations:'disabled'});}
    await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
    if(index===0)await page.screenshot({path:fileURLToPath(new URL('02-loading.png',directory))});
    const unsupported=fixture.unsupported||fixture.days===0;
    if(unsupported)await page.locator('.import-plan-compose .offline-banner').waitFor();
    else await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    assert.equal(requests,0,'Notes must remain local');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(!unsupported){
      const review=page.locator('.plan-import-issues > button');
      if(await review.count())await review.click();
    }
    await page.screenshot({path:fileURLToPath(new URL(`${String(index+3).padStart(2,'0')}-${fixture.name.replace(/[^a-z0-9]+/gi,'-')}.png`,directory)),fullPage:true});
    const classification=unsupported?'unsupported':await page.locator('.plan-import-issue').count()||await page.locator('.plan-editor-exercise.needs-review').count()?'review':'confident';
    results.push({name:fixture.name,classification,errors:0});
    await context.close();console.log(`${index+1}/${fixtures.length} ${fixture.name}: ${classification}`);
  }
  await writeFile(new URL('runtime-results.json',directory),JSON.stringify(results,null,2));
}finally{await browser.close();}
