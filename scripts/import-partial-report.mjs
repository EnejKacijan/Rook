import {readFile,writeFile} from 'node:fs/promises';
const root='artifacts/ROOK-IMPORT-CONSISTENCY-AUDIT';
const ledger=JSON.parse(await readFile(`${root}/LEDGER.json`,'utf8'));
const blockers=new Set(['01','02','03','05','10','14','15','18','19','23','24','26','27','28','29','30']);
for(const item of ledger){item.classification=blockers.has(item.id)?'BLOCKER':'NORMALIZED';item.auditScope='Source prescription inspection; NOT full end-to-end certification';}
const descriptions={
 '26':['Bench Press: sets/reps decision; Cable Row: reps-only decision','3 known sets; 60 kg known load; unknown reps remain null'],
 '27':['Two explicit source-unit decisions','60 and 100 retained without assigning kg/lb'],
 '28':['RPE-to-RIR effort review','132,5 kg → 132.5 kg; 6–8 range and explicit RIR 2 preserved'],
 '29':['DB Row match/custom decision','Home gym → Home; Commercial gym retained; AMRAP open'],
 '30':['Two weekday decisions and BP match/custom decision','No invented weekdays; AMRAP, range, RIR and /side text preserved'],
};
for(const [id,[blocker,normalization]] of Object.entries(descriptions))Object.assign(ledger.find(x=>x.id===id),{status:'BLOCKER — source semantics acceptable; legitimate decision retained',blockerCreated:[blocker],normalized:[normalization],preserved:true,dropped:[],invented:[]});
await writeFile(`${root}/LEDGER.json`,JSON.stringify(ledger,null,2));
