// History-only input grammar. Never shared with plan prescription parsing.
export const cleanHistoryCell = value => String(value ?? '').replace(/^\uFEFF/, '').trim();
export const historyHeader = value => cleanHistoryCell(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '');
export const missingHistoryCell = value => /^(?:null|n\/a|na|none|—)?$/i.test(cleanHistoryCell(value));

function delimiterFor(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') { if (quoted && text[i + 1] === '"') i++; else quoted = !quoted; }
    else if (!quoted && /[\r\n]/.test(text[i])) break;
    else if (!quoted && Object.hasOwn(counts, text[i])) counts[text[i]]++;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!sorted[0][1] || sorted[0][1] === sorted[1][1]) throw new Error('Unsupported CSV structure: the delimiter is unclear.');
  return sorted[0][0];
}

export function readHistoryCsv(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  if (!source.trim()) throw new Error('This CSV is empty.');
  const delimiter = delimiterFor(source), rows = [], lines = [];
  let row = [], field = '', quoted = false, closed = false, line = 1, rowLine = 1;
  const pushField = () => { row.push(field); field = ''; closed = false; };
  const pushRow = () => { pushField(); if (row.some(v => cleanHistoryCell(v))) { rows.push(row); lines.push(rowLine); } row = []; };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else { field += ch; if (ch === '\n') line++; }
    } else if (ch === delimiter) pushField();
    else if (ch === '\r' || ch === '\n') {
      pushRow(); if (ch === '\r' && source[i + 1] === '\n') i++; line++; rowLine = line;
    } else if (ch === '"') {
      if (field.trim() || closed) throw new Error(`Row ${line}: malformed CSV quotes.`);
      field = ''; quoted = true;
    } else if (closed && !/\s/.test(ch)) throw new Error(`Row ${line}: unexpected text after a quoted field.`);
    else if (!closed) field += ch;
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
  pushRow();
  return { rows, lines, delimiter, encoding: String(text).startsWith('\uFEFF') ? 'UTF-8 BOM' : 'UTF-8', format: 'csv' };
}

export const HISTORY_COLUMNS = {
  started: ['Workout date / start', ['workout_date','start_time','started_at','date','start']],
  ended: ['End time', ['end_time','ended_at','end']],
  workoutId: ['Source workout ID', ['workout_id','session_id']],
  workoutName: ['Workout name', ['workout_name','title','workout']],
  workoutNotes: ['Workout notes', ['workout_notes','description','session_note']],
  duration: ['Workout duration', ['workout_duration_seconds','workout_duration']],
  exerciseName: ['Exercise name', ['exercise_name','exercise_title','exercise']],
  exerciseId: ['Source exercise block ID', ['exercise_entry_id','exercise_block_id']],
  exerciseOrder: ['Exercise order', ['exercise_order','exercise_number']],
  notes: ['Exercise notes', ['exercise_notes','notes','exercise_note']],
  setOrder: ['Set order', ['set_order','set_index','set_number']],
  setType: ['Set type', ['set_type']],
  weight: ['Weight', ['weight','weight_kg','weight_lbs','weight_lb']],
  unit: ['Weight unit', ['weight_unit','unit']],
  reps: ['Reps', ['reps','repetitions']],
  distance: ['Distance', ['distance','distance_miles','distance_mi','distance_km','distance_m','distance_meters','distance_ft','distance_feet']],
  distanceUnit: ['Distance unit', ['distance_unit']],
  seconds: ['Set duration (seconds)', ['duration_seconds','seconds','set_duration_seconds']],
  rpe: ['RPE (not RIR)', ['rpe']],
  rir: ['RIR (not RPE)', ['rir']],
  supersetId: ['Superset / group ID', ['superset_id','group_id']],
  loadKind: ['Load meaning', ['load_kind','load_semantics']],
};

export function detectHistoricalImportSource(headers, format = 'csv') {
  const keys = headers.map(historyHeader), has = names => names.every(n => keys.includes(n));
  const possibilities = [];
  if (has(['title','start_time','exercise_title','set_index'])) possibilities.push('hevy');
  if (has(['date','workout_name','exercise_name','set_order']) && keys.some(k => ['duration','workout_duration'].includes(k))) possibilities.push('strong');
  const source = possibilities.length === 1 ? possibilities[0] : 'generic';
  return { source, kind: source === 'generic' ? `generic_${format}` : source, possibilities, confidence: possibilities.length === 1 ? 'header-signature' : 'mapping' };
}

export function historyColumnMapping(headers, source = 'generic') {
  const keys = headers.map(historyHeader), mapping = {};
  for (const [field, [, aliases]] of Object.entries(HISTORY_COLUMNS)) {
    const hits = keys.flatMap((key, i) => aliases.includes(key) ? [i] : []);
    mapping[field] = hits.length === 1 ? hits[0] : null;
  }
  if (source === 'strong' && mapping.duration == null) mapping.duration = keys.indexOf('duration') < 0 ? null : keys.indexOf('duration');
  return mapping;
}

export function historicalUnit(value, distance = false) {
  const unit = cleanHistoryCell(value).toLowerCase();
  const aliases = distance ? { m:['m','meter','meters','metre','metres'], km:['km','kilometer','kilometers'], mi:['mi','mile','miles'], ft:['ft','feet','foot'] }
    : { kg:['kg','kgs','kilogram','kilograms'], lb:['lb','lbs','pound','pounds'] };
  return Object.entries(aliases).find(([, values]) => values.includes(unit))?.[0] || null;
}
export function headerUnit(header, distance = false) {
  const key = historyHeader(header);
  return historicalUnit(key.split('_').at(-1), distance);
}

export function historyNumber(value, label, { integer = false, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (missingHistoryCell(value)) return null;
  let input = cleanHistoryCell(value);
  // A comma reaches this point only as one parsed cell. Three trailing digits
  // can also be a thousands separator: require the source to disambiguate it.
  if (/^\d+,\d{1,2}$/.test(input)) input = input.replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(input)) throw new Error(`${label} is not an unambiguous non-negative number.`);
  const number = Number(input);
  if (!Number.isFinite(number) || number > max || (integer && !Number.isInteger(number))) throw new Error(`${label} is invalid.`);
  return number;
}

export function historyDuration(value) {
  if (missingHistoryCell(value)) return null;
  const input = cleanHistoryCell(value).toLowerCase();
  if (/^\d+(?:[.,]\d+)?$/.test(input)) return historyNumber(input, 'Duration');
  if (/^\d+:\d{2}(?::\d{2})?$/.test(input)) {
    const parts = input.split(':').map(Number);
    if (parts.slice(1).some(p => p > 59)) throw new Error('Duration is invalid.');
    return parts.reduce((seconds, part) => seconds * 60 + part, 0);
  }
  const parts = [...input.matchAll(/(\d+(?:\.\d+)?)\s*(h(?:ours?)?|m(?:in(?:utes?)?)?|s(?:ec(?:onds?)?)?)/g)];
  if (!parts.length || input.replace(/(\d+(?:\.\d+)?)\s*(h(?:ours?)?|m(?:in(?:utes?)?)?|s(?:ec(?:onds?)?)?)/g, '').trim()) throw new Error('Duration is invalid.');
  return parts.reduce((sum, p) => sum + Number(p[1]) * (p[2]?.startsWith('h') ? 3600 : p[2]?.startsWith('m') ? 60 : 1), 0);
}

// Local source timestamps stay unzoned strings. Never add Z to a wall-clock
// value whose timezone is unknown, and never create a time for a date-only row.
export function historyDate(value, format = 'iso') {
  if (missingHistoryCell(value)) return null;
  let input = value instanceof Date ? value.toISOString().replace(/Z$/, '') : cleanHistoryCell(value);
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const named = input.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})(?:,\s*|\s+)(\d{1,2}:\d{2}(?::\d{2})?)$/);
  if (named && months.includes(named[2].toLowerCase())) input = `${named[3]}-${String(months.indexOf(named[2].toLowerCase())+1).padStart(2,'0')}-${named[1].padStart(2,'0')}T${named[4].replace(/^(\d):/,'0$1:')}`;
  const local = input.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(.*)$/);
  if (local && ['dmy','mdy'].includes(format)) input = `${local[3]}-${local[format==='dmy'?2:1].padStart(2,'0')}-${local[format==='dmy'?1:2].padStart(2,'0')}${local[4]}`;
  input = input.replace(' ', 'T');
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!match) throw new Error('Could not read workout dates. Use a supported date format or map the date format.');
  const [,yr,mo,dy,hr,mi,se] = match, check = new Date(Date.UTC(+yr,+mo-1,+dy));
  if (+yr<1900 || check.getUTCFullYear()!==+yr || check.getUTCMonth()!==+mo-1 || check.getUTCDate()!==+dy || +(hr||0)>23 || +(mi||0)>59 || +(se||0)>59) throw new Error('Invalid workout date.');
  const zone=match[8] || null;
  if(zone && zone!=='Z' && (+zone.slice(1,3)>14 || +zone.replace(':','').slice(3)>59 || +zone.slice(1,3)===14&&+zone.replace(':','').slice(3)!==0))throw new Error('Invalid workout timezone offset.');
  if (hr && !se) input = input.replace(/T(\d{2}:\d{2})/, 'T$1:00');
  const sortable = Date.parse(input + (hr && !zone ? 'Z' : ''));
  if(!Number.isFinite(sortable))throw new Error('Invalid workout date.');
  return { value: input, day: input.slice(0,10), precision: hr ? 'datetime' : 'date', zone, sortable };
}
