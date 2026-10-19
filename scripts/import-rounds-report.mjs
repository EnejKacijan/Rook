import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='artifacts/ROOK-IMPORT-CONSISTENCY-AUDIT';
const ledger=JSON.parse(await readFile(`${dir}/LEDGER.json`,'utf8'));
const fixed=JSON.parse(await readFile(`${dir}/15-result.json`,'utf8'));assert.equal(fixed.firstResult.sourceReview.issues[0].field,'roundGroup');
Object.assign(ledger.find(c=>c.id==='15'),{status:'BLOCKER — whole circuit requires source edit; cannot apply or export incomplete plan',preserved:['Complete scoped 3-round group in mandatory decision','Thursday Bench Press 3x8'],normalized:[],blockerCreated:['One roundGroup decision requiring source edit'],dropped:[],invented:[]});
Object.assign(ledger.find(c=>c.id==='16'),{status:'NORMALIZED — A1/A2 pair preserved',preserved:['Two adjacent paired exercises, three sets of eight each','Thursday Squat 3x8'],normalized:['Existing supersetId pairing'],blockerCreated:[],dropped:[],invented:[]});
Object.assign(ledger.find(c=>c.id==='17'),{status:'DROPPED / BLOCKER — STOP: explicit inline superset misread as alternative',preserved:['Full source','Thursday Leg Press 3x10'],normalized:[],blockerCreated:['Incorrect alternative/source-edit blocker plus unresolved exercise match'],dropped:['Cable Row as second executable member','Superset grouping'],invented:['Draft exercise identity Superset: Cable Fly'],note:'Apply is blocked; no claim of silent successful persistence.'});
await writeFile(`${dir}/LEDGER.json`,JSON.stringify(ledger,null,2));
