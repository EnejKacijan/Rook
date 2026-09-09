// Deliberately bounded language support, not a translation or fuzzy-matching engine.
// A detected but unsafe expression stays blocking; never offer a partial choice list.
export const ALTERNATIVE_WORDS = ['or','ali','ili','oder','oppure','ovvero','ou','o','u','of','eller','tai','vai','lub','albo','nebo','anebo','alebo','sau','vagy','veya','yahut','или','либо','або','чи','ή','أو','או','या'];
const words = ALTERNATIVE_WORDS.join('|');
const separator = new RegExp(`(?<![\\p{L}\\p{N}])(?:${words})(?![\\p{L}\\p{N}])|または|もしくは|或者|或是|또는|혹은|/`, 'giu');
const leading = new RegExp(`^\\s*(?:${words})(?![\\p{L}\\p{N}])`, 'iu');
const rxPattern = /(\d+)\s*(?:(?:sets?|serije?|sätze|satze|series|séries)\s*)?(?:[x×*]|of\b|po\b|de\b|à|mit\b)\s*(\d+)(?:\s*(?:[-–—]|to\b|bis\b)\s*(\d+))?/giu;
const nonExercise = /^(?:kg|kgs|lb|lbs|s|sec|seconds?|reps?|rir|rpe|rest|pause|po[cč]itek|odmor|stop|reduce|increase|fewer|less|more|until|if|when|če|ce|wenn|si|siempre|do not|don't|don’t|avoid|pain|discomfort)\b/iu;
const pairNotation = /^(?:kg\s*\/\s*lbs?|lbs?\s*\/\s*kg|left\s*\/\s*right|right\s*\/\s*left|l\s*\/\s*r|leva\s*\/\s*desna|and\s*\/\s*or|w\s*\/\s*o)$/iu;
function cleanName(text) {
  return text.replace(/^\s*(?:[•*\-]\s*|\d+[.)]\s*)/u,'').replace(/^\s*(?:either|entweder|bodisi|soit)\s+/iu,'')
    .replace(/\((?:compound|isolation)\)/giu,'').replace(/^[\s:–—-]+|[\s:–—-]+$/gu,'').trim();
}
function optionFrom(part) {
  const matches=[...part.matchAll(rxPattern)],rx=matches[0];
  if(matches.length>1)return null;
  if(rx&&part[rx.index-1]==='-')return null;
  let name=cleanName(rx?part.slice(0,rx.index):part),tail=rx?part.slice(rx.index+rx[0].length).trim():'';
  if(rx&& !name){if(/\d/u.test(tail))return null;name=cleanName(tail);tail='';}
  if(!name||!/[\p{L}]/u.test(name)||nonExercise.test(name))return null;
  const weightMatch=tail.match(/(?:^|[\s@·,;(])(-?\d+(?:[.,]\d+)?)\s*(kg|kgs|lb|lbs)\b/iu);
  const weight=weightMatch?Number(weightMatch[1].replace(',','.')):null;
  const unit=weightMatch?/^lb/i.test(weightMatch[2])?'lb':'kg':null;
  const rirMatch=tail.match(/\b(?:RIR\s*[:=]?\s*([0-4])|([0-4])\s*RIR)\b/iu);
  const rest=tail.match(/\b(?:rest|po[cč]itek|odmor|pause)\s*:?\s*(\d+)\s*(s|sec|seconds?|min|minutes?)\b/iu);
  const timed=/^(?:s|sec|secs|seconds?|sek|sekund|sekunde)\b/iu.test(tail);
  const perSide=/(?:\/\s*(?:stran|side)|\b(?:per side|each side|each leg|each arm))\b/iu.test(tail);
  const residue=tail.replace(/^(?:s|sec|secs|seconds?|sek|sekund|sekunde|reps?|ponovitev|ponovitve|wdh|repeticiones?)\b/iu,'')
    .replace(weightMatch?.[0]||/$^/u,'').replace(rirMatch?.[0]||/$^/u,'').replace(rest?.[0]||/$^/u,'')
    .replace(/\/\s*(?:stran|side|operirana noga)|\b(?:per side|each side|each leg|each arm)\b/giu,'')
    .replace(/[\s@·,;()–—-]/gu,'');
  // Unsupported load/effort/advanced or prose scope must be clarified, not inherited.
  if(residue||weight!==null&&(!Number.isFinite(weight)||weight<0))return null;
  const sets=rx?Number(rx[1]):null,repMin=rx?Number(rx[2]):null,repMax=rx?Number(rx[3]||rx[2]):null;
  if(rx&&(!Number.isSafeInteger(sets)||sets<1||sets>20||!Number.isSafeInteger(repMax)||repMin<1||repMax<repMin))return null;
  return {name,source:part,sets,repMin,repMax,weight:weight===null?null:weight*(unit==='lb'?0.45359237:1),sourceWeight:weight,sourceUnit:unit,targetRir:rirMatch?Number(rirMatch[1]??rirMatch[2]):null,restSeconds:rest?Number(rest[1])*(/^min/i.test(rest[2])?60:1):null,measure:timed?'seconds':null,loggingMode:perSide?'per_side':'normal'};
}
export function analyzeImportAlternatives(source) {
  const text=String(source||'').normalize('NFKC');
  const cuts=[];let depth=0,scan=0,nestedAlternative=false;
  for(const match of text.matchAll(separator)){
    if(/^of$/iu.test(match[0])&&/\d+\s*sets?\s*$/iu.test(text.slice(0,match.index))&&/^\s*\d/u.test(text.slice(match.index+match[0].length)))continue;
    if(/^of$/iu.test(match[0])&&/\b(?:front|back|side|top|bottom|range)\s*$/iu.test(text.slice(0,match.index)))continue;
    while(scan<match.index){if('(['.includes(text[scan]))depth++;if(')]'.includes(text[scan]))depth=Math.max(0,depth-1);scan++;}
    if(match[0]==='/'){
      const before=text.slice(0,match.index).match(/[^\s/]+\s*$/u)?.[0]?.trim()||'';
      const after=text.slice(match.index+1).match(/^\s*[^\s/]+/u)?.[0]?.trim()||'';
      if(/^\d/.test(before)&&/^\d/.test(after)||pairNotation.test(`${before}/${after}`.replace(/[(),.;]/gu,''))||/^(?:stran|side|operirana)\b/iu.test(after)||/^\s*(?:leg|arm)\s*[.,;]?\s*$/iu.test(text.slice(match.index+1)))continue;
    }
    if(depth){nestedAlternative=true;continue;}
    cuts.push({index:match.index,length:match[0].length});
  }
  const unsafe=()=>({detected:true,options:[],requiresSourceEdit:true});
  if(nestedAlternative)return unsafe();
  if(!cuts.length){
    // Two targets with an unrecognised separator must not silently pick the first.
    const targets=[...text.matchAll(rxPattern)];
    const between=targets.length>1?text.slice(targets[0].index+targets[0][0].length,targets[1].index).replace(/(?<!\p{L})(?:kgs?|lbs?|rir|rpe|reps?|seconds?|sec)\b/giu,''):'';
    if(targets.length>1&&/[\p{L}]{2,}/u.test(between)&&!/\b(?:warm.?up|working|drop|rest.pause|set\s*\d|serij)\b/iu.test(text))return unsafe();
    return {detected:false,options:[]};
  }
  if(leading.test(text))return unsafe(); // A continuation needs explicit source scope.
  const parts=[];let start=0;
  for(const cut of cuts){parts.push(text.slice(start,cut.index).trim());start=cut.index+cut.length;}
  parts.push(text.slice(start).trim());
  // Plain training instructions / numeric notation are not two exercise identities.
  if(parts.length===2&&nonExercise.test(parts[1]))return {detected:false,options:[]};
  if(parts.length>12||parts.some(part=>!part))return unsafe();
  const options=parts.map(optionFrom);
  if(options.some(option=>!option))return unsafe();
  const specified=options.filter(option=>option.sets!==null);
  if(specified.length===1&&(options.at(-1).sets!==null||[...parts[0].matchAll(rxPattern)][0]?.index===0)){
    // A trailing shared prescription supplies only sets/reps, never another load.
    const shared=specified[0];
    for(const option of options)if(option.sets===null)Object.assign(option,{sets:shared.sets,repMin:shared.repMin,repMax:shared.repMax,measure:shared.measure});
  }
  if(options.some(option=>option.sets===null))return unsafe();
  return {detected:true,options,requiresSourceEdit:false};
}
export const parseImportAlternatives=source=>analyzeImportAlternatives(source).options;
