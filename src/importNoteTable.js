// One physical row at a time. Quoted separators and escaped quotes belong to
// the cell; an unfinished quote is left for source review rather than guessed.
export function splitNoteTableRow(value, delimiter) {
  const cells=[];let cell='',quoted=false;
  for(let index=0;index<value.length;index++){
    const char=value[index];
    if(char==='"'){
      if(quoted && value[index+1]==='"'){cell+='"';index++;}
      else if(quoted || !cell.trim())quoted=!quoted;
      else cell+=char;
    }else if(char===delimiter && !quoted){cells.push(cell.trim());cell='';}
    else cell+=char;
  }
  if(quoted)return null;
  cells.push(cell.trim());
  if(cells.length<2)return null;
  if(delimiter==='|'){
    if(!cells[0])cells.shift();
    if(!cells.at(-1))cells.pop();
  }
  Object.defineProperty(cells,'delimiter',{value:delimiter});
  return cells;
}
export function noteTableCells(value, delimiter=null) {
  const line=String(value||'').replace(/\r$/u,'');
  if(delimiter)return splitNoteTableRow(line,delimiter);
  if(line.includes('\t'))return splitNoteTableRow(line,'\t');
  if((line.match(/\|/g)||[]).length>=2)return splitNoteTableRow(line,'|');
  if(/^\s*(?:day|weekday|dan|exercise|vaja|ubung|übung|ejercicio)\s*[,;]/iu.test(line))
    return splitNoteTableRow(line,line.match(/[,;]/)[0]);
  return null;
}
const unitIn=cell=>cell?.match(/[([]\s*(kg|kgs|lb|lbs)\s*[)\]]/i)?.[1]?.toLowerCase().replace(/s$/,'')||null;
const timeUnitIn=cell=>cell?.match(/[([]\s*(s|sec(?:ond)?s?|sek(?:und[ei]?)?|min(?:ute)?s?)\s*[)\]]/i)?.[1]||null;
export function noteTableHeader(cells) {
  if(!cells)return null;
  const unitSuffix='(?:\\s*[([][^)\\]]*[)\\]])?';
  const aliases={
    day:/^(?:day|weekday|dan)$/i,
    name:/^(?:exercise|movement|vaja|ubung|übung|ejercicio|name)$/i,
    sets:/^(?:sets?|serije?|satze|sätze|series?)$/i,
    reps:new RegExp(`^(?:reps?|ponovitve?|wdh|repeticiones?)${unitSuffix}$`,'i'),
    weight:new RegExp(`^(?:weight|load|teza|teža|gewicht|peso)${unitSuffix}$`,'i'),
    rir:/^(?:rir|rpe|effort)$/i,
    rest:new RegExp(`^(?:rest|pocitek|počitek|odmor|pause|descanso)${unitSuffix}$`,'i'),
    notes:/^(?:notes?|opombe?|notizen|notas?)$/i,
  };
  const header={delimiter:cells.delimiter};
  cells.forEach((cell,index)=>{
    const key=Object.entries(aliases).find(([,pattern])=>pattern.test(cell))?.[0];
    if(key && header[key]===undefined)header[key]=index;
    if(key==='weight')header.weightUnit=unitIn(cell);
    if(key==='rest')header.restUnit=timeUnitIn(cell);
    if(key==='reps')header.repUnit=timeUnitIn(cell);
    if(key==='rir' && /^rpe$/i.test(cell))header.effortMode='RPE';
  });
  return header.name!==undefined && (header.sets!==undefined||header.reps!==undefined)?header:null;
}
export function tableExerciseLine(cells,header) {
  if(!cells||!header)return null;
  const at=key=>header[key]===undefined?'':String(cells[header[key]]||'').trim();
  const name=at('name'),sets=Number(at('sets'));
  let reps=at('reps').replace(/^x\s*/i,'');
  if(!name||!Number.isInteger(sets)||sets<1||sets>20 || reps &&
    !/^(?:\d+(?:\s*[–—-]\s*\d+)?(?:\s*(?:s|sec(?:ond)?s?|sek(?:und[ei]?)?|min(?:ute)?s?))?|\d{1,2}:\d{2}|AMRAP|max reps|failure|to failure|do odpovedi)$/iu.test(reps))return null;
  if(header.repUnit && /^\d+(?:\s*[–—-]\s*\d+)?$/.test(reps))reps+=` ${header.repUnit}`;
  let rest=at('rest');
  if(header.restUnit && /^\d+(?:[.,]\d+)?(?:\s*[–—-]\s*\d+(?:[.,]\d+)?)?$/.test(rest))rest+=` ${header.restUnit}`;
  return [name,reps?`${sets}x${reps}`:`${sets} sets`,at('weight'),
    at('rir')?(/r(?:ir|pe)/i.test(at('rir'))?at('rir'):`${header.effortMode||'RIR'} ${at('rir')}`):'',
    rest?`rest: ${rest}`:'',at('notes')].filter(Boolean).join(' | ');
}
