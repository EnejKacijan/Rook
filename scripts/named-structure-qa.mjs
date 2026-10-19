import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { onboardingSplitOptions, TRAINING_STRUCTURES } from '../src/splitPreferences.js';
import { blankState, buildProgram, sessionStructureKey } from '../src/domain.js';

const base = process.env.ROOK_QA_URL || 'http://127.0.0.1:4173';
const dir = 'artifacts/ROOK-STABILITY-PASS/named-structure-consistency';
await mkdir(`${dir}/screenshots`, { recursive:true });
const matrix = [320,390].flatMap(width => ['light','dark'].flatMap(appearance => ['standard','premium']
  .map(style => ({ width, appearance, style, days:5, text:'Arnold Split', blocked:'Push / Pull / Legs + Arnold Split' }))));
const cases = [...matrix,
  ...[[2,'Full Body'],[3,'Arnold Split'],[4,'Torso / Limbs'],[6,'Upper / Lower ×3']]
    .map(([days,text],i) => ({ days,text,width:i%2?390:320 })),
  { days:3,text:'Chest + Back + Upper / Lower',width:320,blocked:'Full Body + Chest + Back + Full Body' },
  { days:6,text:'Push / Pull / Legs + Arnold Split',width:390 },
];
const browser = await chromium.launch({ channel:'chrome', headless:true }), results = [];
const visualOnly = process.env.ROOK_NAMED_VISUAL_ONLY === '1';
try {
  for (const [index, test] of cases.entries()) {
    if (visualOnly && ![0,7].includes(index)) continue;
    const { days, text, width, appearance='dark', style='standard', blocked } = test;
    const context = await browser.newContext({ viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block' });
    const page = await context.newPage(), errors=[];
    const capture = async name => {
      await page.evaluate(() => Promise.all(document.getAnimations()
        .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => {}))));
      await page.screenshot({path:`${dir}/screenshots/${visualOnly?'visual-':''}${index}-${name}.png`});
    };
    page.setDefaultTimeout(15000); page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
    await page.route('**/api/ai',r=>r.fulfill({status:503,json:{error:'Offline QA'}}));
    await page.goto(base,{waitUntil:'networkidle'});
    const button = name => page.getByRole('button',{name,exact:true});
    await button('BUILD MY PLAN').click();
    await page.getByRole('combobox',{name:'Age range'}).click();
    await page.getByRole('option',{name:'18–29'}).click(); await button('CONTINUE').click();
    await button('Build muscle').click(); await page.getByRole('button',{name:/^Beginner/}).click();
    await button(`${days} days`).click(); await page.getByLabel('Any day works').check();
    await button('60 min').click(); await button('CONTINUE').click();
    await button('Commercial gym').click(); await button('CONTINUE').click();
    await button('Balanced').click(); await button('CONTINUE').click();
    await page.getByRole('button',{name:/Balanced starting point/}).click(); await button('CONTINUE').click();
    await page.getByRole('button',{name:/I already have a preferred weekly structure/}).click();
    await button('Other').click();
    await page.evaluate(({appearance,style})=>{
      document.documentElement.dataset.appearance=appearance;document.documentElement.dataset.style=style;
    },{appearance,style});
    const input=page.getByLabel('Other preferred split'), build=button('BUILD MY PLAN');
    const labels=onboardingSplitOptions(days).filter(o=>TRAINING_STRUCTURES[o.id]).map(o=>o.label);
    for (const label of labels) {
      await input.fill(label);
      assert.equal(await build.isEnabled(),true,`preset label rejected by Other: ${label}`);
      assert.equal(await page.locator('#custom-split-error').count(),0);
      assert.equal(await input.inputValue(),label);
    }
    if (blocked) {
      await input.fill(blocked);
      assert.equal(await build.isDisabled(),true); assert.equal(await input.inputValue(),blocked);
      assert.equal(await page.locator('#custom-split-error').getAttribute('role'),'alert');
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')||'null')?.program||null),null);
      await input.scrollIntoViewIfNeeded(); await capture('clarification');
    }
    await input.fill(text); assert.equal(await build.isEnabled(),true);
    await page.getByRole('button',{name:'Back',exact:true}).last().click(); await button('CONTINUE').click();
    assert.equal(await input.inputValue(),text); assert.equal(await build.isEnabled(),true);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await input.scrollIntoViewIfNeeded(); await capture('accepted');
    await build.click(); await page.getByRole('heading',{name:'Your week is ready.',exact:true}).waitFor();
    if (text==='Arnold Split') assert.equal(await page.locator('.personalization-summary').getByText('Arnold Split',{exact:true}).count(),1);
    await capture('preview');
    await button('USE THIS PLAN').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state'))?.profile.onboardingComplete);
    await page.reload({waitUntil:'networkidle'});
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
    assert.equal(stored.profile.trainingPreferences,text); assert.equal(stored.profile.trainingSplitChoice,'other');
    const expected=buildProgram({...blankState().profile,...stored.profile});
    assert.equal(stored.program.templateId,expected.templateId);
    assert.deepEqual(stored.program.days.map(sessionStructureKey),expected.days.map(sessionStructureKey));
    assert.deepEqual(stored.program.days.map(day=>day.name),expected.days.map(day=>day.name));
    if (text==='Arnold Split' && days===5) assert.deepEqual(stored.program.days.map(day=>day.name),
      ['Chest & Back A','Legs','Shoulders & Arms','Chest & Back B','Full Body']);
    assert.deepEqual(errors,[]);
    results.push({...test,appearance,style,presetLabelsChecked:labels,rawRetained:true,reloaded:true,
      template:stored.program.templateId,sequence:stored.program.days.map(sessionStructureKey),passed:true});
    console.log(`PASS ${days} days / ${text} / ${width} ${appearance} ${style}`);
    await context.close();
  }
} finally {
  await browser.close(); await writeFile(`${dir}/${visualOnly?'visual':'browser'}-results.json`,JSON.stringify(results,null,2));
}
