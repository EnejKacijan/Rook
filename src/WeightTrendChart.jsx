import {bodyWeightToKg,weightUnit} from './domain.js';
import './weightTrendChart.css';

const number=new Intl.NumberFormat('en',{maximumFractionDigits:1});
const dateValue=date=>Date.parse(`${date}T12:00:00Z`);
const formatDate=(date,year=false)=>new Intl.DateTimeFormat('en',{
  month:'short',day:'numeric',...(year?{year:'numeric'}:{}),timeZone:'UTC',
}).format(new Date(dateValue(date)));

export function weightTrendChartData(points,units='kg') {
  const unit=weightUnit(units);
  const kilogramsPerUnit=bodyWeightToKg(1,unit);
  const rows=points.filter(point=>Number.isFinite(point.weightKg)&&Number.isFinite(dateValue(point.localDate)))
    .map(point=>({...point,value:point.weightKg/kilogramsPerUnit,dateValue:dateValue(point.localDate)}))
    .sort((a,b)=>a.dateValue-b.dateValue);
  if(rows.length<2)return null;
  const values=rows.map(point=>point.value),min=Math.min(...values),max=Math.max(...values);
  const padding=Math.max(unit==='lb'?1:.5,(max-min)*.15);
  const roughStep=(max-min+padding*2)/3;
  const magnitude=10**Math.floor(Math.log10(roughStep));
  const step=[1,2,2.5,5,10].find(value=>value>=roughStep/magnitude)*magnitude;
  const low=Math.max(0,Math.floor((min-padding)/step)*step),high=Math.ceil((max+padding)/step)*step;
  const count=Math.round((high-low)/step);
  const ticks=Array.from({length:count+1},(_,index)=>({
    value:high-index*step,label:number.format(high-index*step),y:index/count*100,
  }));
  const first=rows[0],last=rows.at(-1),span=last.dateValue-first.dateValue;
  const plotted=rows.map(point=>({...point,
    x:span?(point.dateValue-first.dateValue)/span*100:50,
    y:100-(point.value-low)/(high-low)*100,
  }));
  const showYear=first.localDate.slice(0,4)!==last.localDate.slice(0,4);
  return {unit,low,high,ticks,points:plotted,dates:[first,last].map(point=>({
    date:point.localDate,label:formatDate(point.localDate,showYear),
  }))};
}

export function WeightTrendChart({points,units,summary}) {
  const chart=weightTrendChartData(points,units);
  if(!chart)return null;
  const markers=chart.points.length<=12?chart.points:[chart.points[0],chart.points.at(-1)];
  return <div className="weight-trend-chart" role="img"
    aria-label={`${summary} Weekly averages from ${formatDate(chart.dates[0].date,true)} to ${formatDate(chart.dates[1].date,true)}. Vertical scale: ${number.format(chart.low)} to ${number.format(chart.high)} ${chart.unit}.`}>
    <span className="weight-chart-unit" aria-hidden="true">{chart.unit}</span><span aria-hidden="true"/>
    <div className="weight-chart-y" aria-hidden="true">{chart.ticks.map(tick=><span key={tick.value}>{tick.label}</span>)}</div>
    <div className="weight-chart-plot" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {chart.ticks.map(tick=><line key={tick.value} x1="0" x2="100" y1={tick.y} y2={tick.y} vectorEffect="non-scaling-stroke"/>)}
        <polyline points={chart.points.map(point=>`${point.x},${point.y}`).join(' ')} fill="none" vectorEffect="non-scaling-stroke"/>
      </svg>
      {markers.map(point=><span key={point.localDate} className="weight-chart-point" style={{left:`${point.x}%`,top:`${point.y}%`}}/>)}
    </div>
    <span aria-hidden="true"/><div className="weight-chart-x" aria-hidden="true">{chart.dates.map((date,index)=><time key={index} dateTime={date.date}>{date.label}</time>)}</div>
  </div>;
}
