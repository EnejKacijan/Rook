import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright-core';

const origin = process.env.ROOK_QA_URL || 'http://127.0.0.1:4273';
for (const [name, engine] of [['Chrome', chromium], ['WebKit', webkit]]) {
  const browser = await engine.launch(name === 'Chrome' ? { channel:'chrome', headless:true } : { headless:true });
  try {
    const context = await browser.newContext({ viewport:{width:390,height:844} });
    const page = await context.newPage(); const errors=[]; page.on('pageerror', error=>errors.push(error.message));
    await page.goto(origin); await page.getByRole('heading', {name:/A plan that fits your week/}).waitFor();
    const result = await page.evaluate(async () => {
      const { buildBackupArchive, parseBackupArchive } = await import('/src/backup.js');
      const { createReturningUserFixture } = await import('/src/demoFixture.js');
      const { zipSync, strToU8 } = await import('/node_modules/fflate/esm/browser.js');
      const before = Object.fromEntries(Object.entries(localStorage));
      const fixture = createReturningUserFixture(2), archive = await buildBackupArchive(fixture, []);
      const prepared = await parseBackupArchive(archive.bytes);
      const payload = zipSync({'bomb.txt': new Uint8Array(65*1024*1024)});
      let rejected;
      try { await parseBackupArchive(payload); } catch(error) { rejected=error.code; }
      // A normal window/main-thread Worker path is exercised above. Historical
      // XLSX imports exercise the same decoder within an already-running worker.
      const { readHistoricalFile } = await import('/src/historyImportFile.js');
      const csv = await readHistoricalFile('small.csv', strToU8('title,start_time,exercise_title,set_index,weight_kg,reps\nQA,2026-10-01,Bench Press,0,20,8').buffer);
      const { xlsxFixture, genericHeaders, genericRow } = await import('/scripts/history-import-fixtures.mjs');
      const { createHistoryImportClient } = await import('/src/historyImportClient.js');
      const xlsx = xlsxFixture([{name:'History',rows:[genericHeaders,genericHeaders.map(key=>genericRow()[key]??'')]}]);
      const historyClient = createHistoryImportClient();
      let xlsxRead;
      try { xlsxRead=await historyClient.request('file',{files:[{name:'synthetic.xlsx',buffer:xlsx.buffer}],options:{}}); }
      finally { historyClient.close(); }
      const response = await fetch('/api/ai', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'coach',payload:{message:'Unauthorized test; must never reach provider'}})});
      return { restoredIds:prepared.state.workouts.map(item=>item.id), expectedIds:fixture.workouts.map(item=>item.id), rejected,
        unauthorizedStatus:response.status, csvRows:csv[0].rows.length, xlsxRows:xlsxRead.files[0].sheets[0].rowCount, unchanged:JSON.stringify(before)===JSON.stringify(Object.fromEntries(Object.entries(localStorage))) };
    });
    assert.deepEqual(result.restoredIds,result.expectedIds); assert.equal(result.rejected,'archive-limit'); assert.equal(result.unchanged,true);
    assert.ok([401,403,503].includes(result.unauthorizedStatus)); assert.equal(result.csvRows,2); assert.equal(result.xlsxRows,1); assert.deepEqual(errors,[]);
    console.log(JSON.stringify({engine:name,...result,status:'passed'})); await context.close();
  } finally { await browser.close(); }
}
