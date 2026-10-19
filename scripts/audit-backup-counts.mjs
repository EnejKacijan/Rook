// Read-only diagnostics. Reports counters and archive identity, never message
// text, workout contents or photo bytes. Does not restore or rewrite the file.
import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { canonicalBackupCounts, compareBackupCounts } from '../src/backupCounts.js';
import { parseBackupArchive } from '../src/backup.js';
import { deserializeState } from '../src/domain.js';

const file=process.argv[2];
if(!file)throw new Error('Usage: node scripts/audit-backup-counts.mjs <path-to-original-backup.zip>');
const path=resolve(file),bytes=new Uint8Array(await readFile(path));
const hash=value=>createHash('sha256').update(value).digest('hex');
const entries=unzipSync(bytes),manifest=JSON.parse(strFromU8(entries['manifest.json'])),raw=JSON.parse(strFromU8(entries['data/state.json']));
let hydratedCounts=null,hydrationError=null;
try { hydratedCounts=canonicalBackupCounts(deserializeState(raw,{strict:true}),manifest.photos); }
catch(error){hydrationError=error.message;}
const countValidation=compareBackupCounts(manifest.counts,raw,manifest.photos,{schemaVersion:manifest.schemaVersion});
const report={filename:basename(path),sha256:hash(bytes),bytes:bytes.byteLength,manifestVersion:manifest.schemaVersion,dataFormatVersion:manifest.dataFormatVersion,
  counts:countValidation.map(row=>({...row,previousImporterRecomputed:hydratedCounts?.[row.field]??null,
    previousImporterMatches:hydratedCounts!==null && Number(manifest.counts[row.field])===hydratedCounts[row.field]})),hydrationError};
try { const parsed=await parseBackupArchive(bytes);report.validation={status:'accepted',counts:parsed.countValidation,verifiedPhotos:parsed.photos.length}; }
catch(error){report.validation={status:'rejected',code:error.code||error.name,message:error.message,mismatchedFields:error.mismatchedFields};process.exitCode=1;}
report.originalUnchanged=hash(await readFile(path))===report.sha256;
if(!report.originalUnchanged)process.exitCode=1;
console.log(JSON.stringify(report,null,2));
