import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it} from 'vitest';
import {WeightTrendChart,weightTrendChartData} from './WeightTrendChart.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const point=(localDate,weightKg)=>({localDate,weightKg,samples:2});
let root,host;
afterEach(()=>{if(root)act(()=>root.unmount());host?.remove();root=null;});

it('spaces weekly averages by real time, including weeks without check-ins',()=>{
 const source=[point('2026-08-03',80),point('2026-08-10',79.8),point('2026-08-31',79.4)];
 const chart=weightTrendChartData(source);
 expect(chart.points.map(point=>point.x)).toEqual([0,25,100]);
 expect(chart.low).toBeLessThan(79.4);expect(chart.high).toBeGreaterThan(80);
 expect(source[0]).not.toHaveProperty('x');
});
it('gives an unchanged weight a centred line and distinct usable axis numbers',()=>{
 const chart=weightTrendChartData([point('2026-08-03',80),point('2026-08-10',80)]);
 expect(chart.points.map(point=>point.y)).toEqual([50,50]);
 expect(chart.high-chart.low).toBeGreaterThanOrEqual(1);
 expect(new Set(chart.ticks.map(tick=>tick.label)).size).toBe(chart.ticks.length);
 expect(chart.points.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y))).toBe(true);
});
it('converts the plot and scale together for pounds without rounding away the averages',()=>{
 const chart=weightTrendChartData([point('2026-08-03',80.013),point('2026-08-10',80.019)],'lb');
 expect(chart.unit).toBe('lb');expect(chart.points[0].value).toBeCloseTo(176.3984698,5);
 expect(chart.points[0].y).not.toBe(chart.points[1].y);
 expect(chart.low).toBeLessThan(176.4);expect(chart.high).toBeGreaterThan(176.4);
 expect(chart.ticks.every(tick=>tick.value>150)).toBe(true);
});
it('labels both years when the time range crosses New Year',()=>{
 const chart=weightTrendChartData([point('2026-12-28',80),point('2027-01-11',79.8)]);
 expect(chart.dates.map(date=>date.label)).toEqual(['Dec 28, 2026','Jan 11, 2027']);
});
it('does not create a chart or invent a zero from missing data',()=>{
 expect(weightTrendChartData([])).toBeNull();
 expect(weightTrendChartData([point('2026-08-03',80)])).toBeNull();
 expect(weightTrendChartData([point('2026-08-03',80),point('not-a-date',80),point('2026-08-10',null)])).toBeNull();
});
it('renders date and weight axes with a readable chart description',()=>{
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 act(()=>root.render(<WeightTrendChart points={[point('2026-08-03',80),point('2026-08-10',79.8)]} units="kg" summary="Weight trend: down 0.2 kg."/>));
 const chart=host.querySelector('[role="img"]');expect(chart.getAttribute('aria-label')).toContain('Vertical scale:');
 expect(chart.getAttribute('aria-label')).toContain('Aug 3, 2026 to Aug 10, 2026');
 expect(host.querySelector('.weight-chart-unit').textContent).toBe('kg');
 expect([...host.querySelectorAll('time')].map(time=>time.textContent)).toEqual(['Aug 3','Aug 10']);
 expect(host.querySelectorAll('.weight-chart-y span').length).toBeGreaterThanOrEqual(3);
 expect(chart.querySelector('polyline').getAttribute('points')).not.toMatch(/NaN|Infinity/);
});
it('retains all weekly data while keeping a long history visually quiet',()=>{
 const points=Array.from({length:52},(_,i)=>point(new Date(Date.UTC(2025,10,3+i*7)).toISOString().slice(0,10),80-i*.02));
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 act(()=>root.render(<WeightTrendChart points={points} units="kg" summary="Weight trend"/>));
 expect(host.querySelector('polyline').getAttribute('points').split(' ')).toHaveLength(52);
 expect(host.querySelectorAll('.weight-chart-point')).toHaveLength(2);
});
