// Materialize explicit visual decisions using stable BEFORE inventory indices.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {visuallyKeptPositions,mappingConcerns,contentConcerns,fullCatalogApproved} from './full-catalog-illustration-decisions.mjs';
const root='artifacts/ROOK-FULL-CATALOG-ILLUSTRATION-REVIEW';
const before=JSON.parse(await readFile(`${root}/before/inventory.json`));
const after=JSON.parse(await readFile(`${root}/after/inventory.json`));
const kept=new Set(visuallyKeptPositions.map(i=>before.rows[i-1].artId));
const replaced=new Set(Object.keys(fullCatalogApproved).map(s=>`wg-${s}`));
const old=new Map(before.rows.map(r=>[r.artId,r]));
const decisions=after.rows.map(row=>{
 const previous=old.get(row.artId),installed=replaced.has(row.artId);
 const classification=installed||kept.has(row.artId)?'KEEP':(row.sha256?'REPLACE':'MISSING');
 return {...row,classification,reason:installed?fullCatalogApproved[row.artId.slice(3)]:kept.has(row.artId)?'Visually reviewed against approved Leg Press; clean anatomy, controlled contours and appropriate apparatus detail.':contentConcerns[row.artId]||'Older simplified anatomy/facial detail and coarser/schematic contours remain visibly different from the approved reference at equal size.',
  action:installed?(previous?'REPLACED':'NEW DEDICATED VARIANT'):'UNCHANGED',
  mappingReview:mappingConcerns[row.artId]||null,
  mappingResolved:row.artId in mappingConcerns,
  previousSha256:previous?.sha256||null};
});
const counts={catalogRecords:after.catalogRecords,beforeUniqueArt:before.uniqueArtIds,afterUniqueArt:after.uniqueArtIds,
 replacedExisting:decisions.filter(r=>r.action==='REPLACED').length,newVariants:decisions.filter(r=>r.action==='NEW DEDICATED VARIANT').length,
 unchangedExisting:decisions.filter(r=>r.action==='UNCHANGED').length,currentlyKept:decisions.filter(r=>r.classification==='KEEP').length,
 remainingReplace:decisions.filter(r=>r.classification==='REPLACE').length,missing:after.missingAssets.length,unused:after.unusedSvgFiles.length,shared:after.sharedArtIds.length};
await mkdir(root,{recursive:true});
await writeFile(`${root}/decisions.json`,JSON.stringify({counts,decisions},null,2));
const rows=decisions.map(r=>`| ${r.artId} | ${r.records.map(e=>e.name).join(' / ')} | ${r.classification} | ${r.action} | ${r.reason} |`).join('\n');
await writeFile(`${root}/CATALOG-DECISIONS.md`,`# Full catalog visual audit — checkpoint\n\n${JSON.stringify(counts,null,2)}\n\nAll 11 BEFORE contact sheets were visually reviewed against the approved new Leg Press, not classified from file/source heuristics. AFTER contacts represent the current installed checkpoint.\n\nThree apparatus-sharing issues were split: high-to-low vs mid cable fly; machine vs EZ-bar preacher; unweighted vs dumbbell split squat. The library-only preacher record retains its existing machine equipment and uses the machine image. No training taxonomy was changed.\n\nStep-down / Adductor: actual older drawing style, not wrong resolver, cache, special opacity or thumbnail scale. Both were redrawn and then hair-only edited at owner request.\n\nRemaining replacements are **not** approved and are not hidden by rendering adjustments. Existing Hiking/Swimming catalog equipment and drawings indicate stationary apparatus; identity ambiguity remains documented for separate owner review, not silently changed in this asset pass.\n\n| Art ID | Consumers | Current decision | This checkpoint | Visual reason |\n| --- | --- | --- | --- | --- |\n${rows}\n`);
console.log(counts);
