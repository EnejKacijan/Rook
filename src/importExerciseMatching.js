import { normalizeExerciseAlias } from './customExercises.js';

// Shared proof-only lookup for both importers. Fuzzy candidates are opt-in.
// No execution-cue stripping here: source identity is not a training target.
const words = new Map(Object.entries({
  db:'dumbbell',dumbbells:'dumbbell',bb:'barbell',barbells:'barbell',kb:'kettlebell',kettlebells:'kettlebell',
  machines:'machine',cables:'cable',bands:'band',banded:'band',biceps:'bicep',triceps:'tricep',
  raises:'raise',extensions:'extension',curls:'curl',presses:'press',rows:'row',squats:'squat',
  dips:'dip',flys:'fly',flies:'fly',crossovers:'crossover',pullups:'pullup',pushups:'pushup',
  pressdown:'pushdown',seating:'seated',prone:'lying',one:'single',unilateral:'single',
}));
function normalizedWords(value) {
  return normalizeExerciseAlias(value)
    .replace(/\b(push|pull|chin)\s+ups?\b/g,'$1up')
    .replace(/\b(pull|push)\s+down\b/g,'$1down')
    .split(' ').filter(Boolean).map(w=>words.get(w)||w).join(' ')
    .replace(/\bsmith(?: machine)?\b/g,'smith')
    .replace(/\bsingle leg leg\b/g,'single leg')
    .replace(/\blow to high\b/g,'low_to_high').replace(/\bhigh to low\b/g,'high_to_low')
    .replace(/\bbicep (?=curl\b)/g,'')
    .replace(/\bchest (?=fly\b)/g,'')
    .replace(/\bshoulder press\b/g,'overhead press')
    .replace(/\brear delt reverse fly\b/g,'reverse fly')
    .replace(/\bfly crossover\b/g,'fly').replace(/\bcrossover\b/g,'fly');
}
const equipmentTerms = ['smith','dumbbell','barbell','kettlebell','cable','machine','band','suspension','ring','bodyweight'];
const equipmentMetadata = {dumbbells:'dumbbell',barbell:'barbell',cables:'cable',machines:'machine','resistance bands':'band',bodyweight:'bodyweight','pull-up bar':'bodyweight'};
const ordered = values => [...new Set(values)].sort();
const bag = values => ordered(values).join(' ');
export function importNameFeatures(name, definition=null) {
  const normalized=normalizedWords(name);
  let tokens=normalized.split(' ').filter(Boolean);
  const explicitEquipment=tokens.filter(t=>equipmentTerms.includes(t));
  const equipment=explicitEquipment.length ? ordered(explicitEquipment) : ordered((definition?.equipment||[]).map(t=>equipmentMetadata[t]).filter(Boolean));
  const side=/\bsingle (leg|arm)\b/.exec(normalized)?.[1] || (/\bsingle\b/.test(normalized)?'unspecified':null);
  const unilateral=Boolean(side||definition?.unilateral);
  const load=/\bassisted\b/.test(normalized)?'assisted':/\bweighted|loaded\b/.test(normalized)?'weighted':null;
  tokens=tokens.filter(t=>!equipmentTerms.includes(t));
  // The limb qualifier is retained as a feature, not discarded as noise.
  if(side){const index=tokens.indexOf('single');tokens.splice(index,side==='unspecified'?1:2);}
  const positions=tokens.filter(t=>['incline','decline','flat','seated','standing','lying','supported','unsupported','overhead','hanging','wide','close','neutral','underhand','overhand','supinated','pronated','adduction','abduction','adductor','abductor','assisted','weighted'].includes(t));
  return {normalized,tokens:ordered(tokens),key:bag(tokens),equipment,explicitEquipment:ordered(explicitEquipment),unilateral,side,load,positions:ordered(positions),pattern:definition?.pattern||null};
}
function contradictions(source,target) {
  const conflicts=[];
  if(source.explicitEquipment.length&&target.equipment.length&&!source.explicitEquipment.every(e=>target.equipment.includes(e)))conflicts.push('equipment');
  if(source.unilateral&&!target.unilateral||!source.unilateral&&target.side)conflicts.push('unilateral / bilateral');
  if(source.side&&target.side&&source.side!==target.side)conflicts.push('arm / leg');
  if(source.load!==target.load&&(source.load||target.load))conflicts.push('weighted / assisted variant');
  for(const group of [['incline','decline','flat'],['seated','standing','lying'],['supported','unsupported'],['adduction','abduction'],['adductor','abductor'],['underhand','overhand','neutral','supinated','pronated'],['wide','close']]) {
    const a=source.positions.find(p=>group.includes(p)),b=target.positions.find(p=>group.includes(p));
    if(a&&b&&a!==b)conflicts.push(`${a} / ${b}`);
  }
  if(source.tokens.includes('step')&&target.tokens.includes('step')&&source.tokens.includes('up')!==target.tokens.includes('up'))conflicts.push('step direction');
  return ordered(conflicts);
}
const dice=(a,b)=>a.length+b.length?2*a.filter(t=>b.includes(t)).length/(a.length+b.length):0;
const compact=value=>normalizeExerciseAlias(value).replaceAll(' ','');
function pluralLabel(value){
  const words=normalizeExerciseAlias(value).split(' '),last=words.at(-1);
  if(!last)return value;
  words[words.length-1]=/[^aeiou]y$/.test(last)?last.slice(0,-1)+'ies':/(ss|x|z|ch|sh)$/.test(last)?last+'es':/s$/.test(last)?last:last+'s';
  return words.join(' ');
}
function buildIndex(catalog) {
  const entries=Object.values(catalog).map(definition=>{
    const names=[definition.name,...(definition.aliases||[])];
    return {definition,variants:[...new Set([...names,...names.map(pluralLabel)])].map((name,i)=>({name,canonical:i===0,features:importNameFeatures(name,definition)}))};
  });
  const weightedBases=new Set(entries.flatMap(e=>e.variants.filter(v=>v.features.load==='weighted').map(v=>v.features.tokens.filter(t=>t!=='weighted').join(' '))));
  const enriched=entries.map(e=>({...e,hasWeightedCounterpart:e.variants.some(v=>[...weightedBases].some(base=>base&&base.split(' ').every(t=>v.features.tokens.includes(t))))}));
  const keys=new Map(),compactKeys=new Map();
  for(const entry of enriched)for(const variant of entry.variants){
    for(const key of [variant.features.key,variant.features.tokens.filter(t=>t!=='weighted').join(' ')]){
      if(!keys.has(key))keys.set(key,new Set());
      keys.get(key).add(entry);
    }
    const key=compact(variant.name);
    if(!compactKeys.has(key))compactKeys.set(key,new Set());
    compactKeys.get(key).add(entry);
  }
  return {entries:enriched,keys,compactKeys};
}

const indices=new WeakMap();
export function matchImportCatalogName(name,catalog,{advanced=false,loadRequirement=()=>null}={}){
  const identity=normalizeExerciseAlias(name);
  const base={sourceIdentity:identity,sourceName:name};
  const source=importNameFeatures(name);
  if(!indices.has(catalog))indices.set(catalog,buildIndex(catalog));
  const indexed=indices.get(catalog);
  const index=advanced?indexed.entries:[...new Set([...(indexed.keys.get(source.key)||[]),...(indexed.compactKeys.get(compact(name))||[]),...(source.load==='weighted'?indexed.keys.get(source.tokens.filter(t=>t!=='weighted').join(' '))||[]:[])])];
  const candidates=index.map(({definition,variants,hasWeightedCounterpart})=>{
    const compared=variants.map(({name:label,canonical,features})=>{
      const optionalAddedLoad=!hasWeightedCounterpart&&source.load==='weighted'&&!features.load&&definition.bodyweight&&loadRequirement(definition)==='optional'&&source.tokens.filter(t=>t!=='weighted').join(' ')===features.key;
      const comparison=optionalAddedLoad?{...source,load:null,tokens:source.tokens.filter(t=>t!=='weighted'),key:source.tokens.filter(t=>t!=='weighted').join(' ')}:source;
      const compactEquivalent=compact(label)===compact(identity);
      const conflicts=contradictions(compactEquivalent?features:comparison,features);
      const literal=normalizeExerciseAlias(label)===identity;
      const namedEquivalent=compactEquivalent||bag(source.normalized.split(' '))===bag(features.normalized.split(' '));
      const equivalent=comparison.key===features.key;
      // Omitted equipment is not permission to invent it. A named catalog
      // identity/alias is proof; a stripped generic movement is not.
      const underspecifiedMachine=source.explicitEquipment.includes('machine')&&!features.explicitEquipment.includes('machine')&&loadRequirement(definition)==='optional';
      const proved=compactEquivalent||equivalent&&!underspecifiedMachine&&(source.explicitEquipment.length>0||namedEquivalent||optionalAddedLoad);
      const score=conflicts.length ? Math.min(.49,dice(source.tokens,features.tokens)*.49) : literal?1:namedEquivalent?.99:proved?.98:Math.min(.85,dice(source.tokens,features.tokens)*.85);
      return {score,conflicts,exact:literal,namedEquivalent,equivalent:proved,canonical,matchedLabel:label,features};
    }).sort((a,b)=>b.score-a.score||Number(b.canonical)-Number(a.canonical));
    const best=compared[0];
    return {exerciseId:definition.id,name:definition.name,...best};
  }).sort((a,b)=>b.score-a.score||Number(b.exact&&b.canonical)-Number(a.exact&&a.canonical)||a.exerciseId.localeCompare(b.exerciseId));
  // Preserve ROOK's canonical-over-library-alias identity convention, but only
  // for the same literal/structural name. Other close candidates still block.
  const proved=candidates.filter(c=>!c.conflicts.length&&(c.exact||c.equivalent));
  const exactNames=proved.filter(c=>c.exact&&c.canonical);
  const named=proved.filter(c=>c.exact||c.namedEquivalent);
  let winners=exactNames.length?exactNames:named.length?named:proved;
  // Legacy library duplicates are not interchangeable when their equipment
  // differs. An unqualified name like Preacher Curl must then be reviewed.
  const conflictingNamedEquipment=source.explicitEquipment.length===0&&new Set(winners.map(c=>c.features.equipment.join('|'))).size>1;
  const canonical=winners.filter(c=>!c.exerciseId.startsWith('wg-'));
  if(canonical.length===1&&winners.every(c=>c.exact||c.equivalent))winners=canonical;
  const winner=winners.length===1?winners[0]:null;
  // A is proof-based, not fuzzy-threshold based. B needs lexical evidence and
  // a clear margin; every unresolved tie/conflict stays C. Scores aren't odds.
  const alternatives=candidates.filter(c=>c.exerciseId!==winner?.exerciseId);
  const collidingCanonicalNames=proved.filter(c=>!c.exerciseId.startsWith('wg-')&&c.canonical&&(c.exact||c.namedEquivalent)).length>1;
  const clear=!conflictingNamedEquipment&&!collidingCanonicalNames&&winner&&(!alternatives[0]||alternatives[0].score<=.85||winners===canonical||exactNames.length===1||named.length===1);
  const best=clear?winner:candidates[0],second=candidates.find(c=>c.exerciseId!==best?.exerciseId);
  const tier=clear?'A':advanced&&!proved.length&&best&&!best.conflicts.length&&best.score>=.6&&best.score-(second?.score||0)>=.1?'B':'C';
  return {...base,exerciseId:tier==='A'?best.exerciseId:null,status:tier==='A'?(best.exact&&best.canonical?'matched':'alias'):'unresolved',tier,
    reason:tier==='A'?(best.exact?(best.canonical?'Exact match':'Known alias'):'Equivalent name and equipment'):tier==='B'?'Optional suggested match':'No safe canonical match',
    sourceFeatures:source,suggestedExerciseId:tier==='B'?best.exerciseId:null,
    candidates:[best,...candidates.filter(c=>c!==best)].filter(Boolean).slice(0,3).map(({features,...c})=>c),
  };
}
