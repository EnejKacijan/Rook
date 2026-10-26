import {useMemo,useState} from 'react';
import {createCustomExerciseRecognizer,emptyCustomExerciseForm,createCustomExerciseDraft,changeCustomExerciseDraft} from './customExerciseRecognition.js';

export function useCustomExerciseRecognition(initialName,catalog) {
  const recognize=useMemo(()=>createCustomExerciseRecognizer(catalog),[catalog]);
  const [draft,setDraft]=useState(()=>createCustomExerciseDraft(emptyCustomExerciseForm(initialName),recognize));
  return {form:draft.form,source:draft.source,automatic:draft.automatic,
    edit:(field,value)=>setDraft(previous=>changeCustomExerciseDraft(previous,field,typeof value==='function'?value(previous.form[field]):value,recognize)),
    reset:(form=emptyCustomExerciseForm(initialName),enabled=true)=>setDraft(createCustomExerciseDraft(form,recognize,enabled))};
}
