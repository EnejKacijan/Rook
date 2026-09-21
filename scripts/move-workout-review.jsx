// Disposable local QA only. Reload preserves the synthetic app's saved state;
// reseeding requires the explicit fixture button. Owner storage is not used.
import {todayMissedRestFixture} from '/src/todayMissedRest.fixture.js';
import {serializeState, deserializeState, STORAGE_KEY} from '/src/domain.js';
import {flexibleSessions, missedFlexibleSessions, moveWorkoutCandidates} from '/src/flexibleWeek.js';
import {measureContainment} from './containment-contract.js';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:4198') throw Error('Isolated local review only');
const RealDate=Date;
window.Date=class extends RealDate {
  constructor(...args){super(...(args.length?args:['2026-09-19T12:00:00']));}
  static now(){return new RealDate('2026-09-19T12:00:00').getTime();}
};
const storage=window.localStorage, prefix='rook-move-workout-review:';
Object.defineProperty(window,'localStorage',{value:{getItem:k=>storage.getItem(prefix+k),setItem:(k,v)=>storage.setItem(prefix+k,v),removeItem:k=>storage.removeItem(prefix+k)}});
const params=new URLSearchParams(location.search);
if(!params.has('run')) {
  document.querySelector('#root').innerHTML='<main><h1>Move workout review</h1><label>Scenario <select id="scenario"><option value="friday">Only Friday missed</option><option value="both">Missed and upcoming</option><option value="empty">All resolved</option></select></label><button id="seed">Start synthetic review</button></main>';
  document.querySelector('#seed').onclick=()=>{
    const scenario=document.querySelector('#scenario').value;
    const state=todayMissedRestFixture();
    state.program.days.forEach(day=>{day.name='NOGE B (FUNKCIJA)';day.workoutName=day.name;});
    if(scenario!=='both') state.workouts=flexibleSessions(state).filter(item=>scenario==='empty'||item.scheduledDate!=='2026-09-18').map(item=>({
      id:`resolved-${item.logicalSessionId}`,logicalSessionId:item.logicalSessionId,programDayId:item.workoutId,name:item.workout.name,
      canonicalPlanDate:item.scheduledDate,originalScheduledDate:item.originalDate,workoutDateKey:'2026-09-17',completedAt:'2026-09-17T12:00:00',exercises:[],
    }));
    for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key.startsWith(prefix))storage.removeItem(key);}
    localStorage.setItem(STORAGE_KEY,serializeState(state));
    localStorage.setItem('original-program',JSON.stringify(state.program));
    location.search='?run=1';
  };
} else {
  await import('/src/main.jsx');
  const qa=document.createElement('details');
  qa.style.cssText='position:fixed;top:70px;right:0;z-index:99999;background:#eee;color:#111;font:11px system-ui;width:160px';
  qa.innerHTML='<summary>Move QA</summary><label>Theme <select id="move-theme"><option>light</option><option>dark</option><option>premium-light</option><option>premium-dark</option></select></label><button id="move-measure">Measure layout</button><button id="move-snapshot">Inspect saved schedule</button><pre id="move-proof" style="white-space:pre-wrap;max-height:120px;overflow:auto"></pre>';
  document.body.append(qa);
  document.querySelector('#move-theme').onchange=event=>{const value=event.target.value;Object.assign(document.documentElement.dataset,{theme:value.startsWith('premium')?'premium':value,appearance:value.endsWith('dark')?'dark':'light',style:value.startsWith('premium')?'premium':'standard'});};
  const publish=value=>{document.querySelector('#move-proof').textContent=JSON.stringify(value);qa.open=false;};
  document.querySelector('#move-measure').onclick=()=>{qa.hidden=true;const result=measureContainment();qa.hidden=false;publish(result);};
  document.querySelector('#move-snapshot').onclick=()=>{
    const state=deserializeState(localStorage.getItem(STORAGE_KEY));
    publish({unchangedProgram:JSON.stringify(state.program)===localStorage.getItem('original-program'),
      records:state.flexibleWeek?.sessions||{},missed:missedFlexibleSessions(state).map(s=>s.logicalSessionId),
      candidates:moveWorkoutCandidates(state).map(s=>({id:s.logicalSessionId,date:s.scheduledDate,status:s.status}))});
  };
}
