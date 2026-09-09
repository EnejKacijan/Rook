import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { displayEstimatedOneRepMax as format, estimatedOneRepMaxChangeLabel as change, displayWeight } from './domain.js';
import { estimatedOneRepMax, analyzeSetPr } from './performanceInsights.js';
import { EstimatedOneRepMaxChart } from './EstimatedOneRepMaxChart.jsx';

it.each([[50.67,'kg',51],[50.49,'kg',50],[50.5,'kg',51],[50.49,'lb',111],[50.67,'lb',112],[0,'kg',0]])('formats %s %s as %s', (value,units,expected)=>expect(format(value,units)).toBe(expected));
it.each([null,undefined,'',NaN,Infinity])('does not turn missing %s into zero', value=>expect(format(value)).toBe(''));
it.each([[.99,'Increase <1 kg'],[-.99,'Decrease <1 kg'],[1,'Change +1 kg'],[-1,'Change −1 kg'],[1.5,'Change +2 kg'],[-1.5,'Change −2 kg'],[0,'Unchanged'],[-0,'Unchanged']])('formats delta %s as %s', (value,expected)=>expect(change(value)).toBe(expected));
it('converts a delta before classifying its size',()=>{expect(change(.6,'kg')).toBe('Increase <1 kg');expect(change(.6,'lb')).toBe('Change +1 lb');});
it('uses raw differences despite identical or crossed rounded endpoints',()=>{
  expect(format(49.6)).toBe(format(50.4));expect(change(50.4-49.6)).toBe('Increase <1 kg');
  expect(change(50.51-50.49)).toBe('Increase <1 kg');
  expect(change(64.10-63.10)).toBe('Change +1 kg');
});
it('preserves calculation, ordinary load precision and small real PRs',()=>{
  expect(estimatedOneRepMax(40,8)).toBe(50.67);expect(displayWeight(50.67)).toBe(50.67);
  const previous={weight:40,reps:8,completed:true},next={...previous,weight:40.1};
  const pr=analyzeSetPr(next,[previous]);expect(pr.e1rmPr).toBe(true);
  expect(format(pr.estimatedOneRepMax)).toBe(format(estimatedOneRepMax(40,8)));
});

let root;
afterEach(()=>{act(()=>root?.unmount());root=null;document.body.innerHTML='';vi.unstubAllGlobals();});
function chart(values,units='kg'){
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  const host=document.createElement('div');document.body.append(host);root=createRoot(host);
  act(()=>root.render(<EstimatedOneRepMaxChart units={units} sessions={values.map((value,i)=>({date:`2026-09-0${i+1}`,estimatedOneRepMax:value}))}/>));
  return host;
}
it('uses integer labels and accessible selected-point text while preserving plotted values',()=>{
  const host=chart([50.67,50.8]);
  expect(host.textContent).not.toMatch(/50\.67|50\.8/);
  expect(host.querySelector('.e1rm-summary').textContent).toContain('Increase <1 kg');
  const points=host.querySelectorAll('g[role="button"]');
  expect(points[0].getAttribute('aria-label')).toContain('Estimated 1RM 51 kg');
  act(()=>points[0].dispatchEvent(new MouseEvent('click',{bubbles:true})));
  expect(host.querySelector('.e1rm-summary').textContent).toContain('Estimated 1RM 51 kg');
  expect(host.querySelectorAll('circle')[0].getAttribute('cy')).not.toBe(host.querySelectorAll('circle')[1].getAttribute('cy'));
});
it('preserves empty history and a one-session baseline',()=>{
  const host=chart([]);expect(host.textContent).toContain('No estimated 1RM history yet.');
  act(()=>root.render(<EstimatedOneRepMaxChart units="lb" sessions={[{date:'2026-09-01',estimatedOneRepMax:50.67}]}/>));
  expect(host.textContent).toContain('Baseline');expect(host.querySelector('g[role="button"]').getAttribute('aria-label')).toContain('112 lb');
});
