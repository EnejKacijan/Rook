import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
import {SessionProgress,sessionDurationValueText} from './SessionProgress.jsx';
import {THEME_PRESETS,THEME_BASES,personalThemeShades,personalThemeModel,themeContrast} from './personalThemes.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const render=props=>act(()=>root.render(<SessionProgress {...props}/>));
it('continuous duration reports 600 of 1200 seconds as 50%, with a readable accessible value',()=>{
 render({value:600,max:1200,label:'Session duration progress',valueText:sessionDurationValueText(600,1200)});
 const progress=host.querySelector('[role="progressbar"]');
 expect(progress.getAttribute('aria-valuenow')).toBe('600');expect(progress.getAttribute('aria-valuemax')).toBe('1200');
 expect(progress.getAttribute('aria-valuemin')).toBe('0');expect(progress.getAttribute('aria-label')).toBe('Session duration progress');
 expect(progress.getAttribute('aria-valuetext')).toBe('10 minutes of 20 minutes');
 expect(progress.firstChild.style.width).toBe('50%');
});
it.each([1200,1500])('target/past-target progress %s clamps to 100%, without inventing extra completion',value=>{
 render({value,max:1200,valueText:sessionDurationValueText(value,1200)});
 expect(host.firstChild.getAttribute('aria-valuenow')).toBe('1200');
 expect(host.firstChild.getAttribute('aria-valuetext')).toBe('20 minutes of 20 minutes');
 expect(host.firstChild.firstChild.style.width).toBe('100%');
});
it.each([undefined,null,0,-1,NaN,Infinity])('no measurable maximum %s means no progress indicator',max=>{
 render({value:10,max});expect(host.childElementCount).toBe(0);
});
it('round 4 of 8 distinguishes three completed rounds from the current work round',()=>{
 render({mode:'segmented',value:3,max:8,current:4,label:'Interval session progress',valueText:'Round 4 of 8 · Work'});
 expect(host.querySelectorAll('[data-state="complete"]')).toHaveLength(3);
 expect(host.querySelector('[data-state="current"]')).toBe(host.firstChild.children[3]);
 expect(host.querySelectorAll('[data-state="pending"]')).toHaveLength(4);
 expect(host.firstChild.getAttribute('aria-valuenow')).toBe('3');
 expect(host.firstChild.getAttribute('aria-valuetext')).toBe('Round 4 of 8 · Work');
 render({mode:'segmented',value:4,max:8,current:4});
 expect(host.querySelectorAll('[data-state="complete"]')).toHaveLength(4);
 expect(host.firstChild.children[3].hasAttribute('data-current')).toBe(true);
});
it('the same segmented primitive supports real movement 3 of 5 without using an elapsed-time model',()=>{
 render({mode:'segmented',value:2,max:5,current:3,label:'Movement progress',valueText:'Movement 3 of 5'});
 expect(host.firstChild.children).toHaveLength(5);
 expect(host.querySelectorAll('[data-state="complete"]')).toHaveLength(2);
 expect(host.querySelector('[data-current]')).toBe(host.firstChild.children[2]);
 expect(host.firstChild.getAttribute('aria-valuetext')).toBe('Movement 3 of 5');
});
it('segment completion clamps, removes current at finish and retains the 30-round configuration',()=>{
 render({mode:'segmented',value:32,max:30});
 expect(host.querySelectorAll('[data-state="complete"]')).toHaveLength(30);
 expect(host.querySelector('[data-current]')).toBeNull();expect(host.firstChild.getAttribute('aria-valuenow')).toBe('30');
 render({mode:'segmented',value:-2,max:8,current:1});
 expect(host.querySelectorAll('[data-state="complete"]')).toHaveLength(0);
});
it('fill follows the audited progress token; all curated shade/tone pairs contrast with the track',()=>{
 const css=postcss.parse(readFileSync('src/sessionProgress.css','utf8'));
 let fill;css.walkRules(rule=>{if(rule.selector==='.session-progress > span')rule.walkDecls('background',d=>fill=d.value);});
 expect(fill).toBe('var(--rook-progress)');
 for(const p of THEME_PRESETS)for(const s of personalThemeShades(p.id))for(const base of THEME_BASES)for(const appearance of ['light','dark']){
  const t=personalThemeModel({basePalette:p.id,accent:s.id,base:base.id,appearance}).tokens;
  expect(themeContrast(t['--rook-progress'],t['--rook-surface-raised'])).toBeGreaterThanOrEqual(3);
 }
});
it('ordinary and Reduced Motion updates have no ticking animation or easing',()=>{
 const css=postcss.parse(readFileSync('src/sessionProgress.css','utf8'));
 let normal=false,reduced=false;
 css.walkRules(rule=>{if(rule.selector==='.session-progress > span')rule.walkDecls('transition',d=>{if(d.value==='none')normal=true;});});
 css.walkAtRules('media',rule=>{if(rule.params.includes('prefers-reduced-motion: reduce'))rule.walkDecls('transition',d=>{if(d.value==='none')reduced=true;});});
 expect(normal).toBe(true);expect(reduced).toBe(true);
});
