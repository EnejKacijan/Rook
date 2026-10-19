import {mkdir,writeFile} from 'node:fs/promises';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {startWorkout} from '../src/domain.js';
import {addWorkoutExercise} from '../src/freestyleWorkout.js';

const out='artifacts/previous-values-compact';
await mkdir(out,{recursive:true});
let state=createReturningUserFixture(0);
Object.assign(state.profile,{rirEnabled:true,restTimerEnabled:false,recommendedWarmupsEnabled:false,rampUpSetsEnabled:false,showExerciseImages:true});
state.program.includeRecommendedWarmups=false;
const base={...state.program.days[0].exercises[0],exerciseId:'pull-up',repMin:7,repMax:11,targetRir:1,loggingMode:'normal'};
delete base.supersetId;
base.sets=Array.from({length:3},(_,i)=>({id:`template-${i}`,weight:null,reps:7,rir:null,completed:false}));
state.workouts=[{id:'qa-history',completedAt:new Date(Date.now()-86400000).toISOString(),exercises:[{...structuredClone(base),sets:[9,7].map((reps,i)=>({id:`old-${i}`,weight:null,reps,rir:2,completed:true}))}]}];
state.activeWorkout=startWorkout(state,{...state.program.days[0],exercises:[base],warmupPlan:{mode:'none'}});
state.activeWorkout.exerciseIndex=0;
await writeFile(`${out}/scheduled.json`,JSON.stringify(state));
const replacement=structuredClone(state);
replacement.activeWorkout.exercises[0].exerciseId='assisted-pull-up';
replacement.activeWorkout.exercises[0].sets.forEach(s=>{s.weight=25;s.reps=4;});
await writeFile(`${out}/replace.json`,JSON.stringify(replacement));
state.activeWorkout.exercises=[];
state=addWorkoutExercise(state,'pull-up',{requestId:'qa-add',sessionId:state.activeWorkout.id});
await writeFile(`${out}/added.json`,JSON.stringify(state));
await writeFile(`${out}/fixture.html`,`<!doctype html><meta charset="utf-8"><title>ROOK synthetic QA fixture</title><p>Opening synthetic ROOK workout…</p><script type="module">
const p=new URLSearchParams(location.search),state=await(await fetch('./'+(p.get('state')||'scheduled')+'.json')).json();
const [style,appearance]=(p.get('theme')||'standard-light').split('-');
Object.assign(state.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
localStorage.setItem('lift-v2-state',JSON.stringify(state));
// This dedicated QA origin contains only synthetic fixtures.
location.replace('/');
</script>`);
console.log(`Synthetic fixtures written to ${out}`);
