import {useEffect,useMemo,useState} from 'react';
import {freestyleCatalog} from './freestyleWorkout.js';
import {exerciseMatchesQuery,rankExerciseSearch} from './domain.js';

// One small cache, invalidated by every input used by equipment/safety filtering.
// Prepared only on demand; a new session or changed inputs replace this entry.
let warm;
export function usePickerResults(state,query,enabled=true,screen) {
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    if(!enabled||ready)return;
    let second,task,cancelled=false;
    const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{task=setTimeout(()=>{if(!cancelled)setReady(true);},0);});});
    const cancel=()=>{cancelled=true;cancelAnimationFrame(first);cancelAnimationFrame(second);clearTimeout(task);};
    const beforeClose=event=>queueMicrotask(()=>{if(!event.defaultPrevented)cancel();});
    const panel=screen?.current;
    panel?.addEventListener('rook:before-sheet-close',beforeClose);
    return()=>{cancel();panel?.removeEventListener('rook:before-sheet-close',beforeClose);};
  },[enabled,ready,screen]);
  const catalog=useMemo(()=>{
    if(!ready)return [];
    const key=[state.profile,state.gymProfiles,state.customExercises,state.activeWorkout?.id,state.activeWorkout?.adjustment,state.defaultGymProfileId];
    if(!warm||key.some((value,i)=>value!==warm.key[i]))warm={key,items:freestyleCatalog(state).sort((a,b)=>a.name.localeCompare(b.name))};
    return warm.items;
  },[ready,state.profile,state.gymProfiles,state.customExercises,state.activeWorkout?.id,state.activeWorkout?.adjustment,state.defaultGymProfileId]);
  const results=useMemo(()=>{
    if(!catalog.length)return [];
    if(query)return rankExerciseSearch(catalog.filter(item=>exerciseMatchesQuery(item,query)),query);
    const available=new Map(catalog.map(item=>[item.id,item])),recent=new Set();
    for(let i=state.workouts.length-1;i>=0&&recent.size<6;i--){
      const workout=state.workouts[i];
      if(workout.completedAt)for(const e of workout.exercises||[]){
        if(available.has(e.exerciseId)&&e.sets.some(s=>s.completed))recent.add(e.exerciseId);
        if(recent.size===6)break;
      }
    }
    return [...recent].map(id=>available.get(id)).concat(catalog.filter(item=>!recent.has(item.id)));
  },[catalog,query,state.workouts]);
  return {ready,catalog,results};
}
