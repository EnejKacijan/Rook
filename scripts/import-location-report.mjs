import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='artifacts/ROOK-IMPORT-CONSISTENCY-AUDIT';
const ledger=JSON.parse(await readFile(`${dir}/LEDGER.json`,'utf8'));
const fixed=JSON.parse(await readFile(`${dir}/12-result.json`,'utf8'));assert.deepEqual(fixed.firstResult.program.days.map(d=>d.location),['Home','Commercial gym']);
const failed=JSON.parse(await readFile(`${dir}/15-result.json`,'utf8'));assert.deepEqual(failed.firstResult.program.days.map(d=>d.weekday),['Thu']);
for(const [id,fields] of Object.entries({
 '12':{status:'NORMALIZED — explicit per-workout location preserved',preserved:['Monday Home; Friday Commercial gym','Bodyweight optional load; open AMRAP; bench 3x8 at 60 kg'],normalized:['Exact location aliases; neutral workout names'],blockerCreated:[]},
 '13':{status:'NORMALIZED — timed prescriptions preserved',preserved:['BOSU 2x45 seconds no load; plank 3x30 seconds; Leg Press 3x9'],normalized:['Timed measure; Gym location'],blockerCreated:[]},
 '14':{status:'BLOCKER — legitimate rounds prescription decision',preserved:['Y Balance Reach 2 rounds source; Monster Walk 3x10; Squat 3x8'],normalized:['No numeric rep target until decision'],blockerCreated:['Y Balance Reach rounds require intended rep target']},
}))Object.assign(ledger.find(c=>c.id===id),fields,{dropped:[],invented:[]});
Object.assign(ledger.find(c=>c.id==='15'),{status:'DROPPED — STOP: whole circuit becomes nonblocking source notes',preserved:['Original source notes','Thursday bench 3x8'],normalized:[],blockerCreated:[],dropped:['Monday circuit workout','3 rounds of Push Up 10 reps and Bodyweight Squat 15 reps as executable work'],invented:[]});
await writeFile(`${dir}/LEDGER.json`,JSON.stringify(ledger,null,2));
