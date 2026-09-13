import {hybridBlockPrescription,foldImport,sourceLines} from './hybridImport.js';
import {normalizePartialTargets} from './importPartialPrescription.js';

const roles={top:'Top set',working:'Working sets',backoff:'Back-off sets'};
export function compileHybridImport(analysis){
  const representedSpans=[...analysis.blocks.filter(b=>!b.legacy).map(b=>b.sourceSpan),...analysis.blocks.map(b=>b.section).filter(Boolean),...analysis.days.map(d=>d.sourceSpan)];
  const reviewLines=(analysis.legacy?.parseReview?.lines||sourceLines(analysis.source)).map(line=>representedSpans.some(s=>line.start>=s.start&&line.end<=s.end)?{...line,status:'note'}:line);
  const raw={name:analysis.legacy?.name||'Imported plan',days:[],parseReview:{version:1,lines:reviewLines,roundGroups:analysis.legacy?.parseReview?.roundGroups||[]}};
  for(const day of analysis.days){
    const loc=foldImport(day.name).trim().replace(/\s+/g,' '),sourceLocation=/^(?:home|home gym)$/.test(loc)?'Home':/^(?:gym|commercial gym)$/.test(loc)?'Commercial gym':day.location;
    const out={name:sourceLocation&&/^(?:home|home gym|gym|commercial gym)$/.test(loc)?'Workout':day.name,weekday:day.weekday,location:sourceLocation||'Commercial gym',sourceLocation:sourceLocation||undefined,scheduleExplicit:Boolean(day.weekday),sourceLine:sourceLines(analysis.source).find(l=>l.start===day.sourceSpan.start)?.line||1,exercises:[],warmup:day.warmup?structuredClone(day.warmup):{items:[],rampUpSets:[]}};
    for(const block of analysis.blocks.filter(b=>b.day===day.id&&b.kind!=='note')){
      if(block.legacy){out.exercises.push(structuredClone(block.legacy));continue;}
      const {facts,groups}=hybridBlockPrescription(block);
      // A one-fragment AI classification cannot erase a second prescription.
      // Established inline/day/superset grammar is handled before this fallback.
      const multipleTargets=Boolean(block.fragmentId&&groups.length===1&&
        ([...foldImport(block.sourceSpan.text).matchAll(/\b(?:\d+|one|two|three|four|five|six|tri|stiri|pet)\s*(?:sets?|seti|seta|sete|serije)\b/g)].length>1||[...block.sourceSpan.text.matchAll(/\b\d+\s*[x×]\s*\d+/g)].length>1));
      const name=block.family?'Exercise choice':block.name||'Unresolved exercise';
      const sourceLine=sourceLines(analysis.source).find(l=>l.start===block.sourceSpan.start)?.line||1;
      for(const [index,group] of groups.entries()){
        if(group.role==='warmup'){
          out.warmup.items.push({label:name,sets:group.count?.min??null,reps:group.facts.reps?.min??null,seconds:null,prescriptionText:`${group.count?.min??''} warm-up sets`.trim(),sourceText:block.sourceSpan.text,notes:group.evidence});continue;
        }
        const f=group.facts,open=f.failure||f.amrap,range=group.count;
        const count=range&&range.min===range.max?range.min:null;
        const min=open||f.repCeiling!=null?null:f.seconds??f.reps?.min??null;
        const max=open?null:f.repFloor!=null?null:f.secondsMax??f.reps?.max??null;
        const partial={missing:[...(count==null?['sets']:[]),...(!open&&(min==null||max==null)?['reps']:[])],
          ...(range&&range.min!==range.max?{setRange:[range.min,range.max]}:{}),
          ...(f.repFloor!=null?{repFloor:f.repFloor}:{}),...(f.repCeiling!=null?{repCeiling:f.repCeiling}:{})};
        const method=f.method||null;
        const tailDrop=method==='drop'&&/last|final|zadnj/.test(foldImport(group.evidence));
        out.exercises.push({sourceName:name,exerciseId:null,sets:count,repMin:min,repMax:max,
          targetRir:f.rir,restSeconds:f.rest,weightKg:f.load&&f.load.value>=0?Number((f.load.value*(f.load.unit==='lb'?0.45359237:1)).toFixed(2)):null,
          setWeightsKg:null,sourceLoadUnit:f.load?.unit||null,sourceLine,sourceLines:[sourceLine],sourceSpan:block.sourceSpan,
          partialPrescription:partial,measure:f.seconds!=null?'seconds':null,loggingMode:f.perSide?'per_side':'normal',bodyweight:f.bodyweight,
          failureTarget:open,setType:f.amrap?'amrap':method||'standard',
          notes:[roles[group.role],block.section?.text,block.sourceSpan.text,block.optional?.text].filter(Boolean).join('\n'),
          hybrid:{blockId:block.id,group:index,role:group.role,optional:facts.optional,choice:facts.choice||block.family,unresolved:!block.name,
            method,tailDrop,repFloor:f.repFloor,sourceSpan:block.sourceSpan,evidence:group.evidence,aiEvidence:block.aiEvidence||null,
            // Ambiguous ranges/modes remain bounded required decisions.
            unsupported:multipleTargets?'This fragment contains multiple prescriptions. Put each exercise on its own line so all of the work stays explicit.':f.load?.value<0?'Negative/assisted load needs explicit source clarification; no positive load was assumed.':f.distance?'Distance targets need a supported execution prescription. Edit these source details; no reps were assumed.':f.rpe!=null?'RPE is preserved as source guidance; choose an explicit RIR target or leave it unspecified.':null},
        });
      }
    }
    if(out.exercises.length)raw.days.push(out);
  }
  return raw;
}

export function finalizeHybridReview(result,raw,analysis){
  const {program,sourceReview}=result;
  const issues=sourceReview.issues;
  const hybridIds=new Set();
  const add=(field,message,exercise,day,extra={})=>{
    const id=`hybrid-${exercise.id}-${field}`;
    issues.push({id,field,message,source:exercise.hybridSource.sourceSpan.text,dayId:day.id,exerciseId:exercise.id,category:'decision',status:'NEEDS_REVIEW',...extra});
  };
  raw.days.forEach((rawDay,i)=>rawDay.exercises.forEach((rawEx,j)=>{
    if(!rawEx.hybrid)return;
    const ex=program.days[i].exercises[j],day=program.days[i],h=rawEx.hybrid;
    hybridIds.add(ex.id);
    ex.hybridSource=structuredClone(h);ex.importRole=roles[h.role]||null;
    ex.restSeconds=rawEx.restSeconds;ex.targetRir=rawEx.targetRir;
    ex.loggingMode=rawEx.loggingMode;
    if(rawEx.bodyweight)ex.loadRequirement='optional';
    ex.sets.forEach((set,index)=>{set.weight=rawEx.weightKg;set.setType=h.tailDrop?(index===ex.sets.length-1?'drop':'standard'):rawEx.setType;});
    ex.partialPrescription={...rawEx.partialPrescription,weight:rawEx.weightKg,setType:rawEx.setType};
    normalizePartialTargets(ex,ex.measure);
    if(ex.partialPrescription&&!ex.partialPrescription.missing.length)delete ex.partialPrescription;
    ex.importedSourceName=h.sourceSpan.text;
    if(h.choice||h.unresolved){
      ex.matchStatus='needs-name-review';
      if(h.unresolved)ex.importedName='Unresolved exercise';
      ex.originalImportedName=ex.importedName;
      // The matching UI resolves this identity explicitly; no catalog example wins.
    }
  }));
  sourceReview.issues=issues.filter(issue=>!hybridIds.has(issue.exerciseId));
  const append=(...args)=>{const old=issues.length;add(...args);sourceReview.issues.push(issues[old]);};
  for(const day of program.days)for(const ex of day.exercises){
    if(!ex.hybridSource)continue;
    if(ex.hybridSource.optional)append('optional','This work is optional in the source. Include it for this plan, or keep it only in the preserved source notes?',ex,day);
    if(ex.partialPrescription&&(!ex.hybridSource.unsupported||ex.hybridSource.unsupported.startsWith('RPE')))append('prescription',`Enter the missing ${ex.partialPrescription.missing.join(' and ')}. Known source values are preserved.`,ex,day,{requiresReps:true,partialPrescription:ex.partialPrescription});
    if(ex.hybridSource.unsupported)append(ex.hybridSource.unsupported.startsWith('RPE')?'rir':'hybridSource',ex.hybridSource.unsupported,ex,day,{requiresSourceEdit:!ex.hybridSource.unsupported.startsWith('RPE')});
  }
  program.importMetadata.hybrid={version:1,sourceBlocks:analysis.blocks.map((b,index)=>{
    // Retain an already recognized structural relationship for review only.
    // Additional work remains a distinct executable block (and may use another
    // exercise). Never infer this link by exercise name or source proximity alone.
    const previous=analysis.blocks[index-1];
    const parent=b.additional&&previous&&previous.day===b.day&&previous.section?.start===b.section?.start?previous.id:null;
    return {id:b.id,day:b.day,section:b.section,sourceSpan:b.sourceSpan,interpreted:Boolean(b.interpreted),...(parent?{reviewParentBlockId:parent}:{})};
  }),rejectedEvidence:analysis.validation?.rejected||[]};
  // Transaction guard is independent of the resolution UI's enabled state.
  program.importMetadata.pendingHybrid=sourceReview.issues.filter(i=>hybridIds.has(i.exerciseId)).map(i=>i.id);
  const unresolvedCount=analysis.blocks.filter(b=>b.fragmentId&&!b.interpreted).length;
  return {...result,hybrid:{needsAI:unresolvedCount>0,unresolvedCount,knownCount:analysis.knownCount}};
}

export function applyHybridDecision(program,issue,value,{excluded,resolved={},issues=[]}={}){
  const day=program.days.find(d=>d.id===issue.dayId);let ex=day?.exercises.find(e=>e.id===issue.exerciseId);
  const previous=excluded?.get(issue.exerciseId);
  if(issue.field==='optional'&&value?.value==='include'&&!ex&&day&&previous){
    ex=structuredClone(previous.exercise);
    // The next source item may be a legacy-parser exercise without hybridSource.
    // Keep the existing exclusion cache's exact ordering anchors, not name-based
    // or hybrid-only ordering, when an optional group is revisited and restored.
    const anchored=day.exercises.findIndex(e=>previous.followingIds?.includes(e.id));
    const index=anchored>=0?anchored:day.exercises.findIndex(e=>e.hybridSource?.sourceSpan.start>ex.hybridSource.sourceSpan.start);
    day.exercises.splice(index<0?day.exercises.length:index,0,ex);
    program.importMetadata.pendingHybrid=[...new Set([...program.importMetadata.pendingHybrid,...previous.pending])];
  }
  if(issue.field==='optional'&&(!ex||!['include','exclude'].includes(value?.value)))return false;
  if(issue.field==='optional'&&ex){
    ex.hybridSource.optionalDecision=value.value;
    if(value.value==='exclude'){
      excluded?.set(ex.id,{exercise:structuredClone(ex),followingIds:day.exercises.slice(day.exercises.indexOf(ex)+1).map(e=>e.id),pending:program.importMetadata.pendingHybrid.filter(id=>id.startsWith(`hybrid-${ex.id}-`)),resolved:Object.fromEntries(issues.filter(i=>i.exerciseId===ex.id).map(i=>[i.id,resolved[i.id]||false]))});
      // Explicitly excluded work remains in durable source notes, not in the
      // mandatory execution list. Other answers for it are no longer required.
      day.exercises=day.exercises.filter(e=>e.id!==ex.id);
      program.importMetadata.pendingHybrid=program.importMetadata.pendingHybrid.filter(id=>!id.startsWith(`hybrid-${ex.id}-`));
    }
  }
  if(ex?.hybridSource&&issue.field==='prescription'){
    ex.sets.forEach((set,index)=>{if(ex.hybridSource.method)set.setType=ex.hybridSource.tailDrop?(index===ex.sets.length-1?'drop':'standard'):ex.hybridSource.method;});
  }
  if(program.importMetadata?.pendingHybrid&&value)program.importMetadata.pendingHybrid=program.importMetadata.pendingHybrid.filter(id=>id!==issue.id);
}
