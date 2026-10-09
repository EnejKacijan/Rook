import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
import {THEME_PRESETS,THEME_BASES,personalThemeShades,personalThemeModel,themeContrast} from './personalThemes.js';
const files=['styles.css','overrides.css','calendar.css','coach.css','workout-controls.css','onboarding-controls.css','import-plan.css','overlay.css','freestyleQueuePicker.css','theme.css'];
const rules=files.flatMap(file=>{const list=[];postcss.parse(readFileSync('src/'+file,'utf8')).walkRules(rule=>list.push({file,rule}));return list;});
const declarations=(selector,prop)=>rules.filter(({rule})=>rule.selector.includes(selector)).flatMap(({rule})=>rule.nodes.filter(d=>d.type==='decl'&&d.prop===prop));
it('Weekly Review, charts and progression markers always consume the progress role, never success',()=>{
 for(const selector of ['.consistency-bars .filled','.chart i','.progression-row.progression-progress > span:first-child > small:first-of-type::before']){
  const fills=declarations(selector,'background');expect(fills.length).toBeGreaterThan(0);
  for(const d of fills)expect(d.value).toBe('var(--rook-progress)');
 }
});
it('audited interactive accent primitives have no standalone brand-green declarations',()=>{
 const selectors=['.primary','.text-button','.consistency-bars .filled','.chart i','.setting-switch input:checked','.toggle-row input','.disclosure-chevron','.building-spinner','.restriction-spinner','.progression-next','.week-navigation','.coach-send.is-sending','.adapt-review-list > button.selected','.exercise-note-button:focus-visible','.set-row.set-ready'];
 for(const selector of selectors)for(const {rule}of rules.filter(x=>x.rule.selector.includes(selector)))for(const d of rule.nodes.filter(n=>n.type==='decl'&&!n.prop.startsWith('--'))){
  const value=d.value.replace(/var\([^)]*\)/g,'');
  expect(value,`${rule.selector} ${d.prop}`).not.toMatch(/#(?:1f6b4c|206b4c|4fbf87)|rgba?\(\s*31\s*,\s*107\s*,\s*76/i);
 }
});
it('intentional semantic success remains distinct from theme progress, and locked selection is not success',()=>{
 expect(declarations('.queue-add-swipe[data-swipe-armed]','background').map(d=>d.value)).toContain('var(--rook-success)');
 expect(declarations('.set-row.set-done .check','background').some(d=>d.value==='var(--rook-success)')).toBe(true);
 expect(declarations('.backup-status','color').map(d=>d.value)).toContain('var(--rook-success, #1f6b4c)');
 for(const d of declarations('.adapt-review-list > button.selected .adapt-check','background'))expect(d.value).not.toContain('success');
 expect(readFileSync('docs/theme-token-audit.md','utf8')).toContain('BRAND IDENTITY');
});
describe.each(THEME_PRESETS)('$name progress and semantic roles',preset=>{
 it('uses the family shade for all 5 shades × 3 background tones × Light/Dark, with sufficient contrast',()=>{
  for(const base of THEME_BASES)for(const appearance of ['light','dark'])for(const shade of personalThemeShades(preset.id)){
   const t=personalThemeModel({basePalette:preset.id,accent:shade.id,base:base.id,appearance}).tokens;
   expect(t['--rook-progress']).toBe(t['--rook-accent-text']);
   expect(themeContrast(t['--rook-progress'],t['--rook-surface'])).toBeGreaterThanOrEqual(3);
   expect(themeContrast(t['--rook-accent-text'],t['--rook-accent-soft'])).toBeGreaterThanOrEqual(4.5);
   expect(themeContrast(t['--rook-on-accent-fill'],t['--rook-accent-fill'])).toBeGreaterThanOrEqual(4.5);
   expect(themeContrast(t['--rook-inverse-accent'],'#1b1a19')).toBeGreaterThanOrEqual(4.5);
   if(appearance==='dark')expect(themeContrast(t['--rook-inverse-accent'],t['--rook-surface-raised'])).toBeGreaterThanOrEqual(4.5);
   expect(themeContrast(t['--rook-focus-ring'],t['--rook-surface'])).toBeGreaterThanOrEqual(3);
   const success=t['--rook-success'].slice(1).match(/../g).map(x=>parseInt(x,16)),error=t['--rook-error-text'].slice(1).match(/../g).map(x=>parseInt(x,16));
   expect(success[1]).toBeGreaterThan(success[0]);expect(success[1]).toBeGreaterThan(success[2]);
   expect(error[0]).toBeGreaterThan(error[1]);expect(error[0]).toBeGreaterThan(error[2]);
   if(preset.id!=='forest')expect(t['--rook-progress']).not.toBe(t['--rook-success']);
  }
 });
});
