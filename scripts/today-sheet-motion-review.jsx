import React,{Profiler} from 'react';
import {createRoot} from 'react-dom/client';
import {RookRoot} from '/src/App.jsx';
import {dayOverflowFixture} from '/src/dayOverflow.fixture.js';
import {serializeState,STORAGE_KEY} from '/src/domain.js';
import {flexibleSessions,proposeFlexibleWeek,applyFlexibleWeek} from '/src/flexibleWeek.js';
import {bindNavigationFocus} from '/src/navigationFocus.js';
import {observeVisibleViewport} from '/src/sheetVisibleViewport.js';
import '/src/styles.css';import '/src/overrides.css';import '/src/overlay.css';import '/src/calendar.css';import '/src/workout-controls.css';import '/src/onboarding-controls.css';import '/src/import-plan.css';import '/src/coach.css';import '/src/landing.css';import '/src/theme.css';import '/src/navigationFocus.css';import '/src/activeLoggerTouch.css';
if(!import.meta.env.DEV||location.origin!=='http://127.0.0.1:4198')throw Error('Isolated development review only');
const params=new URLSearchParams(location.search),storage=window.localStorage,prefix='rook-today-sheet-motion-review:';
Object.defineProperty(window,'localStorage',{value:{getItem:k=>storage.getItem(prefix+k),setItem:(k,v)=>storage.setItem(prefix+k,v),removeItem:k=>storage.removeItem(prefix+k)}});
const NativeDate=Date,fixed='2026-09-17T18:00:00';
window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return new NativeDate(fixed).getTime();}};
let state=dayOverflowFixture({count:params.has('completed')?2:0});
state.program.createdAt='2026-09-14T12:00:00';state.program.trainingBlock.startDate='2026-09-14';
if(params.has('moved')){
 const session=flexibleSessions(state).find(s=>s.scheduledDate==='2026-09-17');
 const proposal=proposeFlexibleWeek(state,{mode:'move',sessionId:session.logicalSessionId,toDate:'2026-09-18'});
 if(proposal.status!=='ready')throw Error(JSON.stringify(proposal));const applied=applyFlexibleWeek(state,proposal);if(applied.status!=='applied')throw Error(JSON.stringify(applied));state=applied.state;
}
const theme=params.get('theme')||'premium-dark';
Object.assign(state.profile,{showExerciseImages:false,stylePreference:theme.startsWith('premium')?'premium':'standard',appearancePreference:theme.endsWith('dark')?'dark':'light',themePreference:theme.startsWith('premium')?'premium':theme.endsWith('dark')?'dark':'light'});
for(const key of [STORAGE_KEY,'rook-install-meta-v1','rook-recovery-v1','rook-restore-journal-v1'])localStorage.removeItem(key);
localStorage.setItem(STORAGE_KEY,serializeState(state));
window.sheetCommits=[];
bindNavigationFocus();observeVisibleViewport();
createRoot(document.getElementById('root')).render(<React.StrictMode><Profiler id="app" onRender={(id,phase,duration,base,start,commit)=>window.sheetCommits.push({phase,duration,start,commit})}><RookRoot/></Profiler></React.StrictMode>);
