// @vitest-environment node
import {describe, it, expect} from 'vitest';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {exerciseCatalog} from './domain.js';
import {workoutGuideExercises} from './workoutGuideCatalog.js';
import {illustrationProvenanceForAsset} from './illustrationProvenance.js';
import {illustrationProvenance,requiredIllustrationCredits,illustrationDisclosure} from './illustrationProvenance.generated.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(fs.readFileSync(new URL('../docs/visual-provenance.json',import.meta.url)));
describe('evidence-backed illustration provenance',()=>{
  it('covers every maintained visual and detects changed bytes or inline geometry',()=>{
    expect(execFileSync(process.execPath,['scripts/audit-visual-provenance.mjs'],{cwd:root,encoding:'utf8'})).toContain('784 records');
    expect(execFileSync(process.execPath,['scripts/compile-visual-provenance.mjs','--check'],{cwd:root,encoding:'utf8'})).toContain('331 runtime records');
  });
  it('does not confuse a generation master or unused legacy drawing with shipped art',()=>{
    expect(manifest.assets.filter(asset=>asset.usage==='runtime_exercise')).toHaveLength(331);
    expect(manifest.assets.filter(asset=>asset.usage==='regeneration_master')).toHaveLength(332);
    expect(manifest.assets.filter(asset=>asset.usage==='unused_legacy')).toHaveLength(92);
    expect(Object.keys(illustrationProvenance)).toHaveLength(331);
  });
  it('requires positive generation evidence and identical live/master hashes for AI images',()=>{
    const ai=manifest.assets.filter(asset=>asset.usage==='runtime_exercise'&&asset.provenanceType==='rook_ai_generated');
    expect(ai).toHaveLength(330);
    for(const asset of ai){
      expect(asset.evidence.some(e=>e.type==='generation_record'&&e.sourceSha256)).toBe(true);
      expect(asset.evidence.some(e=>e.type==='identical_reviewed_master'&&e.sha256===asset.sha256)).toBe(true);
      expect(asset.license).toBeNull();
      expect(asset.attributionRequired).toBe(false);
    }
  });
  it('preserves the real third-party exception and its attribution/change/license links',()=>{
    expect(requiredIllustrationCredits).toHaveLength(1);
    expect(illustrationProvenanceForAsset('wg-cable-crunch')).toMatchObject({provenanceType:'licensed_third_party',attributionRequired:true});
    expect(requiredIllustrationCredits[0]).toMatchObject({label:'Cable Crunch',creator:'Bryl Lim',sourceName:'Workout Guide',license:'CC BY-SA 4.0',changes:'Recolored and reframed for ROOK.'});
    expect(manifest.assets.filter(asset=>asset.provenanceType==='licensed_third_party').every(asset=>asset.evidence.some(e=>e.type==='upstream_geometry_match'&&e.frame===2))).toBe(true);
    expect(illustrationDisclosure).toMatch(/^Most exercise illustrations/);
  });
  it('keeps catalog references separate even when their illustration is now AI-generated',()=>{
    expect(workoutGuideExercises).toHaveLength(302);
    for(const exercise of workoutGuideExercises){
      expect(exercise.exerciseReferenceSources).toEqual([{sourceId:'workout-guide',catalogRecordId:exercise.sourceSlug}]);
      expect(exercise).not.toHaveProperty('visualSource');
      expect(exercise).not.toHaveProperty('visualLicense');
    }
    const bench=exerciseCatalog['barbell-bench-press'];
    expect(bench.exerciseReferenceSources).toContainEqual({sourceId:'workout-guide',catalogRecordId:'bench-press'});
    expect(bench.illustrationProvenance).toMatchObject({provenanceType:'rook_ai_generated',credit:null});
  });
  it('never assigns unknown new art to ROOK or to AI based on its filename',()=>{
    for(const id of ['wg-new-exercise','rook-new-exercise','',null])expect(illustrationProvenanceForAsset(id)).toMatchObject({provenanceType:'unknown',attributionRequired:null,credit:null});
    const unknown=manifest.assets.filter(asset=>asset.provenanceType==='unknown');
    expect(unknown).toHaveLength(11);
    expect(unknown.every(asset=>asset.attributionRequired===null&&asset.creator===null&&asset.reviewAction)).toBe(true);
    expect(unknown.map(asset=>asset.path)).toContain('public/icon.svg');
  });
  it('keeps every canonical image path, ID and exercise mapping intact',()=>{
    for(const exercise of Object.values(exerciseCatalog)){
      expect(fs.existsSync(new URL(`./assets/exercise-art/${exercise.artId}.svg`,import.meta.url))).toBe(true);
      expect(exercise.illustrationProvenance).toBe(illustrationProvenance[exercise.artId]);
      expect(exercise.illustrationProvenance.provenanceType).not.toBe('unknown');
      expect(exercise).not.toHaveProperty('visualSource');
      expect(exercise).not.toHaveProperty('visualLicense');
    }
  });
  it('exports public facts only, without internal evidence, prompts, model guesses or local paths',()=>{
    const projection=fs.readFileSync(new URL('./illustrationProvenance.generated.js',import.meta.url),'utf8');
    expect(projection).not.toMatch(/generated_images|sourceSha256|generationOrigin|C:[/\\]|stylePrompt|Proprietary|©/);
  });
});
