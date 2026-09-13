import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';

const css=readFileSync('src/theme.css','utf8');
const rules=postcss.parse(css);
function palette(style,appearance='dark'){
 const values={};
 const selectors=[':root',...(appearance==='dark'?[':root[data-appearance="dark"]']:[]),...(style==='premium'?[':root[data-style="premium"]']:[]),...(style==='premium'&&appearance==='light'?[':root[data-appearance="light"][data-style="premium"]']:[])];
 for(const selector of selectors)rules.walkRules(rule=>{if(rule.selector===selector)rule.walkDecls(d=>{if(d.prop.startsWith('--rook-'))values[d.prop]=d.value;});});
 const resolve=(name,depth=0)=>{if(depth>8)throw Error(`Circular token ${name}`);const value=values[name];if(!value)throw Error(`Missing token ${name}`);return value.replace(/var\((--rook-[\w-]+)\)/g,(_,token)=>resolve(token,depth+1));};
 return resolve;
}
function channels(hex){return hex.slice(1).match(/../g).map(v=>parseInt(v,16));}
function contrast(a,b){const lum=hex=>channels(hex).reduce((s,c,i)=>{const v=c/255;return s+[.2126,.7152,.0722][i]*(v<=.04045?v/12.92:((v+.055)/1.055)**2.4);},0);const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
describe.each(['standard','premium'])('%s dark semantic roles',style=>{
 const token=palette(style);
 for(const [fg,bg,min]of [
  ['text','bg',4.5],['text','surface',4.5],['secondary','bg',4.5],['secondary','surface',4.5],['secondary','surface-muted',4.5],
  ['muted','bg',4.5],['muted','surface',4.5],['disabled-text','disabled-surface',4.5],['on-selected','selected',4.5],
  ['accent-text','accent-soft',4.5],['warning-text','warning-surface',4.5],['error-text','error-surface',4.5],['control-border','surface',3],
 ])it(`${fg} / ${bg} >= ${min}`,()=>expect(contrast(token('--rook-'+fg),token('--rook-'+bg))).toBeGreaterThanOrEqual(min));
});
it('Edit block uses defined surface roles, not white fallbacks to missing tokens',()=>{
 const local=readFileSync('src/overrides.css','utf8');
 expect(local).not.toMatch(/var\(--rook-(?:control|selected-surface)[,)]/);
 expect(local).toContain('.training-block-length button.is-selected { border-color: var(--rook-accent); background: var(--rook-accent-soft); color: var(--rook-accent-text); }');
});
it('Standard dark selected controls use the same accent role model as Premium',()=>{
 const token=palette('standard');
 expect(token('--rook-selected')).toBe(token('--rook-accent-soft'));
 expect(token('--rook-selected-line')).toBe(token('--rook-accent'));
 expect(token('--rook-on-selected')).toBe(token('--rook-accent-text'));
});
it('Light selected palettes remain unchanged',()=>{
 expect(palette('standard','light')('--rook-selected')).toBe('#191918');
 expect(palette('premium','light')('--rook-selected')).toBe('#f1e8cf');
});
it('Reduced-motion Coach status and photo guidance use readable dark roles',()=>{
 for(const selector of ['.thinking-reduced-label','.physique-caution','.photo-guidance']){
  let guarded=false;rules.walkRules(rule=>{if(rule.selector.includes(':root[data-appearance="dark"]')&&rule.selector.includes(selector))rule.walkDecls('color',d=>{if(d.value==='var(--rook-secondary)')guarded=true;});});expect(guarded).toBe(true);
 }
});
it('Destructive import removal has a shared dark rule, independent of Premium',()=>{
 expect(css).toContain(':root[data-appearance="dark"] .import-review-footer-actions button.import-review-remove,');
 expect(css).toContain(':root[data-appearance="dark"] .history-import-success-mark { background: var(--rook-accent-soft); }');
});
