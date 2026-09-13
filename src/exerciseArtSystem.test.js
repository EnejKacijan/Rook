// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {exerciseCatalog} from './domain.js';
import {keptArtIds,identityQuestions,systemApprovedRedraws} from '../scripts/illustration-system-decisions.mjs';
const audited=JSON.parse(readFileSync(new URL('../scripts/illustration-system-audited-ids.json',import.meta.url)));
it('requires any new runtime art ID to enter the full-library visual audit',()=>{
 expect([...new Set(Object.values(exerciseCatalog).map(e=>e.artId))].sort()).toEqual(audited);
 expect(new Set(audited).size).toBe(audited.length);
});
it('keeps visual acceptance, replacement and identity questions disjoint',()=>{
 const replacements=Object.keys(systemApprovedRedraws).map(id=>`wg-${id}`);
 for(const id of [...keptArtIds,...replacements,...Object.keys(identityQuestions)])expect(audited).toContain(id);
 expect(keptArtIds.filter(id=>replacements.includes(id))).toEqual([]);
 expect(Object.keys(identityQuestions).filter(id=>replacements.includes(id)||keptArtIds.includes(id))).toEqual([]);
});
it('has a completed visual decision for every runtime illustration',()=>{
 expect(Object.keys(identityQuestions)).toEqual([]);
 const approved=[...keptArtIds,...Object.keys(systemApprovedRedraws).map(id=>`wg-${id}`)];
 expect(new Set(approved).size).toBe(approved.length);
 expect(approved.sort()).toEqual(audited);
});
it('a source-library refresh preserves reviewed consistency masters before legacy assets',()=>{
 const importer=readFileSync(new URL('../scripts/import-workout-guide.mjs',import.meta.url),'utf8');
 expect(importer).toContain('["consistent-masters", "corrected-masters"]');
 const generator=readFileSync(new URL('../scripts/generate-rook-derived-art.mjs',import.meta.url),'utf8');
 expect(generator.indexOf("'consistent-masters'")).toBeGreaterThan(generator.indexOf("'corrected-masters'"));
});
