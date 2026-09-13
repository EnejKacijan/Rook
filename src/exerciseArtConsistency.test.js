// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {exerciseCatalog} from './domain.js';
import {approvedRedraws as redraws} from '../scripts/illustration-consistency-jobs.mjs';
import {systemApprovedRedraws} from '../scripts/illustration-system-decisions.mjs';
const root=new URL('./assets/exercise-art/',import.meta.url);
const masters=new URL('consistent-masters/',root);
const files=Object.keys(redraws).map(id=>`wg-${id}.svg`).sort();
it('ships every catalog-wide replacement as an identical reviewed/live vector',()=>{
 expect(readdirSync(masters).filter(f=>f.endsWith('.svg')).sort()).toEqual(files);
 for(const file of files){
  const source=readFileSync(new URL(file,masters),'utf8');
  expect(readFileSync(new URL(file,root),'utf8')).toBe(source);
  expect(source).toContain('width="512" height="512"');
  expect(source).toContain('fill="#1f6b4c"');
  expect(source).not.toMatch(/<image|<filter|stroke=|<text|<linearGradient|<radialGradient/);
  expect(source).toMatch(/viewBox="[-\d.]+ [-\d.]+ [\d.]+ [\d.]+"/);
 }
});
it('retains 349 catalog records with three apparatus-specific artwork splits',()=>{
 const catalog=Object.values(exerciseCatalog),ids=new Set(catalog.map(e=>e.artId));
 expect(catalog).toHaveLength(349);expect(ids.size).toBe(331);
 expect(readdirSync(root).filter(f=>/^wg-.*\.svg$/.test(f)).length).toBe(331);
 for(const file of files)expect(ids.has(file.slice(0,-4))).toBe(true);
});
it('only supersedes earlier correction masters after renewed full-system visual approval',()=>{
 const earlier=readdirSync(new URL('corrected-masters/',root)).filter(f=>f.endsWith('.svg'));
 for(const file of files.filter(f=>earlier.includes(f)))expect(systemApprovedRedraws).toHaveProperty(file.slice(3,-4));
});
it('keeps the expanded image inside its padded viewer stage at narrow widths',()=>{
 const css=readFileSync(new URL('./workout-controls.css',import.meta.url),'utf8');
 expect(css).toMatch(/\.exercise-visual-stage img\s*\{[^}]*width:\s*min\(100%,\s*560px\)/);
});
