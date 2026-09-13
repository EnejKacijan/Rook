import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';

const nav=postcss.parse(readFileSync('src/bottomNav.css','utf8'));
const coach=postcss.parse(readFileSync('src/coach.css','utf8'));
describe('one persistent main-tab navigation motion contract',()=>{
 it('does not replay a shell entrance on mount or keyboard restoration',()=>{
  const animations=[];nav.walkDecls(/^animation(?:-name)?$/,d=>animations.push(d.value));
  expect(animations.length).toBeGreaterThan(0);
  expect(animations.every(value=>value==='none')).toBe(true);
  const keyframes=[];nav.walkAtRules('keyframes',r=>keyframes.push(r.params));
  expect(keyframes).not.toContain('bottom-nav-enter');
 });
 it('does not let Coach toggle the navigation animation class through sibling CSS',()=>{
  const exceptions=[];coach.walkRules(r=>{if(r.selector.includes('.bottom-nav'))r.walkDecls(/^animation/,d=>exceptions.push(d.value));});
  expect(exceptions).toEqual([]);
 });
 it('keeps active-icon feedback and the existing reduced-motion rule',()=>{
  let feedback=false,reduced=false;
  nav.walkDecls('transition',d=>{if(d.parent.selector===':root[data-appearance] .bottom-nav button'){
   if(d.value==='color 150ms linear')feedback=true;
   if(d.value==='none'&&d.parent.parent.params==='(prefers-reduced-motion: reduce)')reduced=true;
  }});
  expect(feedback).toBe(true);expect(reduced).toBe(true);
 });
 it('retains Coach keyboard nav replacement and transcript-owned scrolling',()=>{
  const declarations=(selector)=>{const result={};coach.walkRules(r=>{if(r.selector===selector)r.walkDecls(d=>result[d.prop]=d.value);});return result;};
  expect(declarations('.coach-screen[data-coach-keyboard-open] + .bottom-nav').display).toBe('none');
  expect(declarations('.coach-screen[data-coach-keyboard-open]')['padding-bottom']).toBe('0');
  expect(declarations('.coach-scroll')['overflow-y']).toBe('auto');
  expect(declarations('.coach-screen .coach-input').position).toBe('static');
 });
});
