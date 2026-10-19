// Durable per-ID audit. Loading an SVG is not the same as visual approval.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {keptArtIds,identityQuestions} from './illustration-system-decisions.mjs';
const root='artifacts/ROOK-ILLUSTRATION-SYSTEM-2026-09-12';
const inventory=JSON.parse(await readFile(`${root}/before/inventory.json`));
const sources=JSON.parse(await readFile(`${root}/generated-sources.json`));
const kept=new Set(keptArtIds);
const rows=[];
for(const row of inventory.rows){
 const bytes=await readFile(`src/assets/exercise-art/${row.artId}.svg`);
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const source=sources[row.artId.slice(3)];
 const reviewed=source?.vectorReviewed===true;
 rows.push({...row,beforeSha256:row.sha256,sha256,changed:sha256!==row.sha256,
  status:reviewed?'REPLACED':kept.has(row.artId)?'KEEP':identityQuestions[row.artId]?'BLOCKED_IDENTITY':'REPLACE_PENDING',
  reason:reviewed?source.review:kept.has(row.artId)?'Visually inspected at equal size: clean anatomical line art and apparatus in the canonical family.':identityQuestions[row.artId]||'Legacy faceless/schematic anatomy or coarser line treatment differs visibly from the approved reference.',
  generation:source?.source||null});
}
const counts={catalogRecords:inventory.catalogRecords,audited:rows.length,kept:rows.filter(r=>r.status==='KEEP').length,replaced:rows.filter(r=>r.status==='REPLACED').length,pending:rows.filter(r=>r.status==='REPLACE_PENDING').length,blocked:rows.filter(r=>r.status==='BLOCKED_IDENTITY').length};
await mkdir(root,{recursive:true});
await writeFile(`${root}/status.json`,JSON.stringify({counts,rows},null,2));
await writeFile(`${root}/ASSET-AUDIT.md`,`# Full ROOK illustration audit\n\n${JSON.stringify(counts,null,2)}\n\nAll 331 runtime SVGs were inspected on the 12 fresh contact sheets in before/contacts. The 92 unused non-wg SVGs are not in the runtime manifest. Original live bytes are preserved in original-svg. No pending asset is approved by this report.\n\n| Asset ID | Exercises | Status | Reason |\n| --- | --- | --- | --- |\n${rows.map(r=>`| ${r.artId} | ${r.records.map(e=>e.name).join(' / ')} | ${r.status} | ${r.reason} |`).join('\n')}\n`);
console.log(counts);
// A green loading/build test must never be mistaken for complete visual coverage.
if(process.argv.includes('--require-complete')&&(counts.pending||counts.blocked)){
 console.error(`FULL VISUAL MIGRATION INCOMPLETE: ${counts.pending} replacements pending, ${counts.blocked} identity questions.`);
 process.exitCode=1;
}
