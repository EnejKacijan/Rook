import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {blankState, STORAGE_KEY} from '../src/domain.js';
import {openFirstRunLanding} from './qa-current-navigation.mjs';

const baseUrl=process.env.ROOK_QA_URL || 'http://127.0.0.1:4173';
const screenshots=new URL('../artifacts/landing-copy/',import.meta.url);
await mkdir(screenshots,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const themes=[
  {style:'standard',appearance:'light'},
  {style:'standard',appearance:'dark'},
  {style:'premium',appearance:'light'},
  {style:'premium',appearance:'dark'},
];

try {
  for(const {style,appearance} of themes) for(const width of [320,390,430]) {
    const state=blankState();
    state.profile.stylePreference=style;
    state.profile.appearancePreference=appearance;
    state.profile.themePreference=style==='premium'?'premium':appearance;
    const context=await browser.newContext({viewport:{width,height:844},colorScheme:appearance,serviceWorkers:'block'});
    await context.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:STORAGE_KEY,value:state});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/ai/status',route=>route.fulfill({json:{available:false}}));
    await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
    await openFirstRunLanding(page);
    await page.getByRole('heading',{name:'Train your way.'}).waitFor();
    await page.getByText('How do you want to train?',{exact:true}).waitFor();
    const options=page.locator('.entry-training-style button');
    assert.equal(await options.count(),3,'plan, saved workouts and freestyle are all available');
    assert.equal(await page.getByRole('button',{name:'BUILD MY PLAN'}).count(),1);
    assert.equal(await page.getByRole('button',{name:/Use my own workouts/}).count(),1);
    assert.equal(await page.getByRole('button',{name:/Train freestyle/}).count(),1);
    await page.locator('.entry-training-style').evaluate(async node=>{
      await Promise.all(node.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));
    });
    const geometry=await options.evaluateAll(nodes=>nodes.map(node=>{
      const box=node.getBoundingClientRect();
      return {height:box.height,left:box.left,right:box.right};
    }));
    assert.ok(geometry.every(box=>box.height>=44&&box.left>=0&&box.right<=width),`${style} ${appearance} ${width}px choices fit and remain tappable: ${JSON.stringify(geometry)}`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true,`${style} ${appearance} ${width}px has no horizontal overflow`);
    const demo=page.getByRole('region',{name:'SEE HOW ROOK ADAPTS'});
    await demo.waitFor();
    assert.equal(await demo.locator('li').count(),7,'illustrative week remains present');
    await demo.getByRole('radio',{name:'3',exact:true}).check();
    assert.equal(await demo.locator('.training-day').count(),3);
    assert.deepEqual(errors,[],`${style} ${appearance} ${width}px has no runtime errors`);
    await page.screenshot({path:fileURLToPath(new URL(`${style}-${appearance}-${width}.png`,screenshots)),fullPage:false});
    await context.close();
  }

  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage();
  await page.route('**/api/ai/status',route=>route.fulfill({json:{available:false}}));
  await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
  await openFirstRunLanding(page);
  await page.getByRole('button',{name:'BUILD MY PLAN'}).click();
  await page.locator('.onboarding-personal').waitFor();
  await context.close();
  console.log('Landing QA passed: three first-run choices, plan entry, preview, 320/390/430 px and four themes.');
} finally {await browser.close();}
