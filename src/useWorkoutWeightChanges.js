import {useEffect,useRef,useState} from 'react';
import {useDurableAction} from './useDurableAction.js';
import {useTransientSnackbar} from './TransientSnackbar.jsx';
import {prepareWorkoutWeightChange,canUndoWorkoutWeightChange,undoWorkoutWeightChange} from './workoutWeightChanges.js';

export function useWorkoutWeightChanges(state,update,screenRef){
  const {commit,latest}=useDurableAction(state,update),record=useRef(null),[error,setError]=useState('');
  const pendingDrafts=useRef([]);
  const notice=useTransientSnackbar({className:'workout-weight-undo'});
  const draftSetIds=()=>[...screenRef.current?.querySelectorAll('[data-workout-field="weight"] [data-workout-draft]')||[]].flatMap(input=>{
    const detail={};input.dispatchEvent(new CustomEvent('rook-snapshot-draft',{detail}));
    const snapshot=detail.snapshot;
    return snapshot?.draft!=null&&(snapshot.edited||snapshot.draft!==String(snapshot.value??''))?[input.closest('[data-set-id]').dataset.setId]:[];
  });
  useEffect(()=>{
    const screen=screenRef.current;
    const input=event=>{
      if(event.target.closest?.('[data-workout-field]')?.dataset.workoutField!=='weight')return;
      const setId=event.target.closest('[data-set-id]')?.dataset.setId;
      if(record.current?.patches.some(change=>change.setId===setId)){record.current=null;notice.clear();}
    };
    // Capture intent before the logger's normal click/blur boundary settles an
    // unfinished field. Such a field must still stop this carry operation.
    const capture=()=>{pendingDrafts.current=draftSetIds();};
    screen?.addEventListener('input',input);
    screen?.addEventListener('pointerdown',capture,true);screen?.addEventListener('keydown',capture,true);
    return()=>{screen?.removeEventListener('input',input);screen?.removeEventListener('pointerdown',capture,true);screen?.removeEventListener('keydown',capture,true);};
  },[screenRef,notice.clear]);
  const change=(exerciseId,setId,value)=>{
    const protectedSetIds=[...new Set([...pendingDrafts.current,...draftSetIds()])].filter(id=>id!==setId);
    pendingDrafts.current=[];
    let prepared;
    try{
      const result=commit(current=>{
        prepared=prepareWorkoutWeightChange(current,{sessionId:state.activeWorkout.id,exerciseId,setId,value,protectedSetIds});
        return prepared.state;
      });
      setError('');record.current=prepared.record;
      if(result.changed&&prepared.propagated){
        const operation=prepared.record;
        notice.show({message:`Updated ${prepared.propagated+1} sets`,undoScope:JSON.stringify({sets:operation.patches.map(change=>change.setId),fields:['weight']}),
          valid:()=>record.current===operation&&canUndoWorkoutWeightChange(latest.current,operation),
          undo:()=>{
            try{
              const undone=commit(current=>undoWorkoutWeightChange(current,operation));
              if(undone.changed)for(const input of screenRef.current?.querySelectorAll('[data-workout-field="weight"] [data-workout-draft]')||[]){
                if(operation.patches.some(change=>change.setId===input.closest('[data-set-id]').dataset.setId))input.dispatchEvent(new CustomEvent('rook-restore-draft'));
              }
              record.current=null;return true;
            }catch(e){setError(e.message);return false;}
          }});
      }else notice.clear();
      return true;
    }catch(e){setError(e.message);return false;}
  };
  return {change,error,surface:notice.surface};
}
