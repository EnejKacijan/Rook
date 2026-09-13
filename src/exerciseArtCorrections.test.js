// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {exerciseCatalog} from './domain.js';
import {systemApprovedRedraws} from '../scripts/illustration-system-decisions.mjs';
const art=new URL('./assets/exercise-art/',import.meta.url),masters=new URL('./assets/exercise-art/corrected-masters/',import.meta.url);
const files=readdirSync(masters).filter(f=>f.endsWith('.svg'));
it('preserves all 26 correction sources and uses only explicitly reviewed successor masters',()=>{expect(files).toHaveLength(26);for(const file of files){const s=readFileSync(new URL(file,masters),'utf8');const expected=systemApprovedRedraws[file.slice(3,-4)]?readFileSync(new URL(`consistent-masters/${file}`,art),'utf8'):s;expect(readFileSync(new URL(file,art),'utf8')).toBe(expected);expect(s).toMatch(/width="512" height="512"/);expect(s).toContain('fill="#1f6b4c"');expect(s).not.toMatch(/<image|<filter|stroke=|<text/);}});
it('every corrected asset is referenced by the existing catalog',()=>{for(const file of files)expect(Object.values(exerciseCatalog).some(e=>e.artId===file.slice(0,-4))).toBe(true);});
it('no longer copies the wrong movement or apparatus',()=>{for(const [correct,wrong] of [['rook-pendulum-squat','hack-squat'],['rook-standing-single-leg-leg-curl','single-leg-calf-raise'],['rook-incline-machine-press','machine-chest-press'],['rook-single-leg-leg-press','leg-press'],['rook-single-leg-leg-extension','leg-extension']])expect(readFileSync(new URL(`wg-${correct}.svg`,art),'utf8')).not.toBe(readFileSync(new URL(`wg-${wrong}.svg`,art),'utf8'));});
