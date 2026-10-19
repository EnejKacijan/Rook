import {readFile,writeFile} from 'node:fs/promises';
const dir='artifacts/ROOK-IMPORT-CONSISTENCY-AUDIT';
const ledger=JSON.parse(await readFile(`${dir}/LEDGER.json`,'utf8'));
for (const id of ['04','05','06']) {
 const row=ledger.find(item=>item.id===id);
 row.invented=[]; row.dropped=[];
 if(id==='04') Object.assign(row,{status:'NORMALIZED — AMRAP fixed; source prescription preserved',preserved:['Five weekdays and exercise prescriptions','Three open AMRAP sets'],normalized:['AMRAP uses failureTarget and setType amrap; numeric targets are null'],blockerCreated:[]});
 if(id==='05') Object.assign(row,{status:'BLOCKER — source prescriptions preserved; exercise match required',preserved:['Six weekdays and six exercises','All source set/rep quantities; unspecified loads remain absent'],normalized:['Weekday labels and known exercise aliases'],blockerCreated:['Shoulder Press: choose match or Keep as Custom']});
 if(id==='06') Object.assign(row,{status:'DROPPED / INVENTED — STOP: table day column discarded',preserved:['Bench 3x8 at 60 kg','Squat 4x6–8 at 132.5 kg','Original source text retained in notes'],normalized:['Numeric prescription cells'],blockerCreated:['Choose one calendar day for the incorrectly merged workout'],dropped:['Monday/Thursday grouping from executable plan'],invented:['One combined workout containing exercises from two source weekdays']});
}
await writeFile(`${dir}/LEDGER.json`,JSON.stringify(ledger,null,2));
