import {expect,it} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import postcss from 'postcss';

const styles=readdirSync('src').filter(file=>file.endsWith('.css')).map(file=>({file,root:postcss.parse(readFileSync(`src/${file}`,'utf8'))}));
function declarationFor(file,selector,property){
 let value;
 styles.find(item=>item.file===file).root.walkRules(rule=>{
  if(rule.selectors.includes(selector))rule.walkDecls(property,decl=>{value=decl.value;});
 });
 return value;
}
it('meaningful colored text never borrows a raw accent fill or a fixed Light-only warning',()=>{
 const violations=[];
 for(const {file,root} of styles)root.walkDecls('color',decl=>{
  if(/var\(--rook-accent[,)]/.test(decl.value)||decl.value==='#7a5d18')violations.push(`${file}:${decl.source.start.line} ${decl.parent.selector}`);
 });
 expect(violations).toEqual([]);
});
it.each(['caution','stalled'])('%s progression keeps warning semantics in the shared row',type=>{
 expect(declarationFor('overrides.css',`.progression-row.progression-${type} > span:first-child > small:first-of-type`,'color')).toBe('var(--rook-warning-text)');
 expect(declarationFor('overrides.css',`.progression-row.progression-${type} > span:first-child > small:first-of-type::before`,'background')).toBe('var(--rook-warning-text)');
});
it('the Progress full-list action uses readable text rather than the Gold fill',()=>{
 expect(declarationFor('loggedExercises.css',':root :is(.logged-exercises-all,.progression-view-all) > span:first-child','color')).toBe('var(--rook-accent-text)');
});
it('neutral labels consume the existing readable secondary role',()=>{
 expect(declarationFor('overrides.css','.eyebrow','color')).toBe('var(--rook-secondary)');
 expect(declarationFor('overrides.css','.profile-current-program p','color')).toBe('var(--rook-secondary)');
});
it('inverse timer captions use their paired semantic foreground',()=>{
 expect(declarationFor('theme.css',':root[data-personal-theme] .rest-timer .eyebrow','color')).toBe('var(--rook-timer-secondary)');
});
it('shared navigation chevrons keep readable neutral roles on Light and raised Dark surfaces',()=>{
 expect(declarationFor('styles.css','.list-row>span:last-child','color')).toBe('var(--rook-secondary)');
 expect(declarationFor('overrides.css','.navigation-chevron','color')).toBe('var(--rook-secondary)');
 expect(declarationFor('overrides.css','.profile-screen button.list-row > span:last-child:not(:first-child)','color')).toBe('var(--rook-secondary)');
});
