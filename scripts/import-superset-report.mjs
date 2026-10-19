import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pendingImportIssues} from '../src/planImportReview.js';
const dir='artifacts/ROOK-IMPORT-CONSISTENCY-AUDIT';
const ledger=JSON.parse(await readFile(`${dir}/LEDGER.json`,'utf8'));
const notes={
 '17':['Existing A1/A2 pair, Cable Fly/Cable Row 3x12; Thursday Leg Press 3x10',[]],
 '18':['Unequal 3/4 set counts unchanged',['One grouping choice']],
 '19':['Two alternative prescriptions 3x9 at155 and 3x8 at173 preserved',['One alternative choice']],
 '20':['Seven warm-up items: 300sec,3–5min,5x5,2x1,intensity,5m,text-only; working prescriptions intact',[]],
 '21':['30/60/90/180 seconds explicitly preserved',[]],
 '22':['Untimed items remain untimed; Monster Walk2x10; BOSU45sec',[]],
 '23':['Unknown source name and3x12 retained; Home/Gym retained',['One match/custom choice']],
 '24':['Press3x8 and Ravnotežje2x30sec retained',['Two match/custom choices']],
 '25':['Training prescriptions intact; technique/progression/rest-day prose preserved as source notes',[]],
};
for(const [id,[preserved,blockerCreated]]of Object.entries(notes))Object.assign(ledger.find(c=>c.id===id),{status:blockerCreated.length?'BLOCKER — legitimate decision; source prescription preserved':'NORMALIZED — inspected source semantics preserved',preserved:[preserved],normalized:['Existing notation/catalog/unit conventions; source text retained'],blockerCreated,dropped:[],invented:[]});
const bad=JSON.parse(await readFile(`${dir}/26-result.json`,'utf8')).firstResult;
assert.equal(bad.program.days[0].exercises.length,1);
const bench=bad.sourceReview.issues.find(i=>i.field==='prescription');assert.equal(pendingImportIssues(bad.sourceReview,{[bench.id]:true}).length,0);
Object.assign(ledger.find(c=>c.id==='26'),{status:'DROPPED — STOP: sets-only Cable Row is nonblocking note',preserved:['Bench load60kg with mandatory prescription decision','Thursday Squat3x8','Full source text'],normalized:[],blockerCreated:['Bench Press only; no Cable Row blocker'],dropped:['Cable Row3sets as executable exercise'],invented:[]});
await writeFile(`${dir}/LEDGER.json`,JSON.stringify(ledger,null,2));
