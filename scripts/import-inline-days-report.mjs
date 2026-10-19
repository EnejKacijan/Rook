import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='artifacts/ROOK-IMPORT-CONSISTENCY-AUDIT';
const ledger=JSON.parse(await readFile(`${dir}/LEDGER.json`,'utf8'));
const dispositions={
 '07':{preserved:['Two weekdays; four exercise prescriptions; bench 60 kg'],normalized:['Inline headers and prescription clauses; bounded source spans'],blockerCreated:[]},
 '08':{preserved:['Two weekdays and names; 3x8 at 60 kg; 3x9 at 130 kg'],normalized:['Whitespace/case and weekday aliases'],blockerCreated:[]},
 '09':{preserved:['135 lb and 90 lb source values; 3x8 and 3x10'],normalized:['Canonical loads 61.23 kg and 40.82 kg; source lb retained'],blockerCreated:[]},
 '10':{preserved:['3x8 per side; 2x6 operated leg; 3x10 left leg; no invented loads'],normalized:['Supported per-side mode; single-leg instructions retained as notes'],blockerCreated:['Single Leg Curl match/custom decision']},
 '11':{preserved:['Separate left 2x8 and right 3x10 entries; Thursday bench 3x8'],normalized:['Catalog matching; side instructions remain notes'],blockerCreated:[]},
};
for(const [id,fields] of Object.entries(dispositions))Object.assign(ledger.find(c=>c.id===id),fields,{status:fields.blockerCreated.length?'BLOCKER — legitimate match decision; prescriptions preserved':'NORMALIZED — inspected source semantics preserved',dropped:[],invented:[]});
const result=JSON.parse(await readFile(`${dir}/12-result.json`,'utf8'));
assert.equal(result.firstResult.program.days[0].location,'Commercial gym');
Object.assign(ledger.find(c=>c.id==='12'),{status:'INVENTED — STOP: Home source context overwritten by Commercial gym',preserved:['Bodyweight optional load and absent weight','Open AMRAP target; no fabricated reps','Bench 3x8 at 60 kg','Source Home/Gym labels retained as names/notes'],normalized:['Catalog identities'],blockerCreated:[],dropped:['Home as structured location'],invented:['Monday location Commercial gym despite Home source']});
await writeFile(`${dir}/LEDGER.json`,JSON.stringify(ledger,null,2));
