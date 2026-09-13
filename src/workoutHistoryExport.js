import { exerciseName, exerciseMeasure } from './domain.js';
import { loggingModeOf } from './advancedLogging.js';
import { validSessionFeedback } from './sessionFeedback.js';

export const HISTORY_EXPORT_VERSION = 2;
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const text = value => typeof value === 'string' ? value : null;
const timestamp = value => value != null && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;
export const completedExportWorkouts = state => (state.workouts || []).filter(w => timestamp(w.completedAt));
function dateOf(w) {
  if (w.historicalImport?.version === 2 && w.sourceDate?.day) return w.sourceDate.day;
  const date = new Date(timestamp(w.startedAt) || w.completedAt);
  if (Number.isFinite(w.utcOffsetMinutesAtStart)) return new Date(date.getTime() - w.utcOffsetMinutesAtStart * 60000).toISOString().slice(0,10);
  return date.toISOString().slice(0,10);
}
function performance(s, measure) {
  const imported = s.rawImport?.version === 2;
  return { weight: number(s.weight), unit: 'kg', reps: imported ? number(s.reps) : measure === 'seconds' ? null : number(s.reps),
    original_import_weight: number(s.rawImport?.weight), original_import_unit: ['kg','lb'].includes(s.rawImport?.weightUnit) ? s.rawImport.weightUnit : null,
    duration_seconds: imported ? number(s.durationSeconds) : measure === 'seconds' ? number(s.durationSeconds ?? s.reps) : number(s.durationSeconds),
    distance: number(s.distance), distance_unit: text(s.distanceUnit), rpe: number(s.rpe),
    source_set_order: number(s.rawImport?.setOrder), load_kind: text(s.rawImport?.loadKind),
    rir: number(s.rir), left_reps: number(s.sides?.left?.reps), right_reps: number(s.sides?.right?.reps) };
}
function portableWorkout(w, index, includeNotes, names) {
  return {
    workout_id: text(w.id) || `legacy-workout-${index + 1}`, workout_date: dateOf(w),
    started_at: w.historicalImport?.version === 2 ? text(w.startedAt) : timestamp(w.startedAt),
    completed_at: w.historicalImport?.version === 2 ? text(w.sourceEnd?.value) : timestamp(w.completedAt),
    date_basis: w.historicalImport?.version === 2 ? 'source_local_date' : Number.isFinite(w.utcOffsetMinutesAtStart) ? 'recorded_start_offset' : 'UTC',
    workout_duration_seconds: number(w.durationSeconds), source_time_precision: text(w.sourceDate?.precision),
    scheduled_date: text(w.canonicalPlanDate || w.workoutDateKey), original_scheduled_date: text(w.originalScheduledDate),
    workout_name: text(w.name), adjusted: Boolean(w.adjustment), moved: Boolean(w.flexibleWeekMoved),
    source: text(w.historicalImport?.source) || 'rook', has_workout_photo: Boolean(w.photoId),
    session_feedback: validSessionFeedback(w.sessionFeedback) ? w.sessionFeedback || null : null,
    block_name: text(w.trainingBlock?.blockName), block_week: number(w.trainingBlock?.blockWeekNumber), block_phase: text(w.trainingBlock?.label || w.trainingBlock?.phase),
    ...(includeNotes ? { session_note: text(w.sessionNote) } : {}),
    exercises: (w.exercises || []).map((e, ei) => ({
      exercise_id: text(e.exerciseId), exercise_number: ei + 1, exercise_name: names(e),
      logging_mode: loggingModeOf(e),
      superset_id: text(e.supersetId), source_superset_id: text(e.sourceSupersetId), source_exercise_order: number(e.sourceExerciseOrder),
      ...(includeNotes ? { exercise_note: [...new Set([text(e.personalNote), text(e.notes)].filter(Boolean))].join('\n') || null } : {}),
      sets: (e.sets || []).flatMap((s, si) => {
        const segments = (s.segments || []).flatMap((segment, i) => segment.completed ? [{
          segment_number: i + 1, segment_type: text(segment.kind) || text(s.setType), ...performance(segment, exerciseMeasure(e)),
        }] : []);
        if (!s.completed && !segments.length) return [];
        return [{ set_number: si + 1, set_type: s.rawImport?.version === 2 ? text(s.importSetType) : text(s.setType) || text(s.importSetType) || 'standard',
          performed: Boolean(s.completed), ...(s.completed ? performance(s, exerciseMeasure(e)) : {}), segments }];
      }),
    })),
  };
}
export const CSV_COLUMNS = ['workout_id','workout_date','started_at','completed_at','date_basis','scheduled_date','original_scheduled_date','workout_name','block_name','block_week','block_phase','adjusted','moved','source','has_workout_photo','exercise_id','exercise_number','exercise_name','logging_mode','set_number','set_type','row_type','segment_number','segment_type','weight','unit','original_import_weight','original_import_unit','reps','duration_seconds','rir','left_reps','right_reps','workout_duration_seconds','source_time_precision','distance','distance_unit','rpe','source_set_order','load_kind','superset_id','source_superset_id','source_exercise_order'];
// Prevent spreadsheet formula execution in user-authored text; JSON remains verbatim.
export function csvCell(value) {
  if (value == null) return '';
  let valueText = String(value);
  if (typeof value === 'string' && /^[\s]*[=+\-@]/u.test(valueText)) valueText = `'${valueText}`;
  return /[",\r\n]/.test(valueText) ? `"${valueText.replaceAll('"','""')}"` : valueText;
}
export async function createWorkoutHistoryExport(state, { format = 'csv', includeNotes = false, now = new Date(), yieldWork = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
  if (!['csv','json'].includes(format)) throw new Error('Unsupported export format.');
  const workouts = completedExportWorkouts(state), columns = [...CSV_COLUMNS, ...(includeNotes ? ['session_note','exercise_note'] : []), 'session_feedback'];
  // Name normalization can scan the catalog. Resolve repeated historical snapshots once.
  const nameCache = new Map();
  const names = exercise => {
    const key = JSON.stringify([exercise.exerciseId, exercise.originalImportedName, exercise.importedName, exercise.importedExercise?.name]);
    if (!nameCache.has(key)) nameCache.set(key, exerciseName(exercise));
    return nameCache.get(key);
  };
  const metadata = { schema: 'rook.workout-history', version: HISTORY_EXPORT_VERSION, exported_at: new Date(now).toISOString(), notes_included: includeNotes,
    weight_unit: 'kg', weight_semantics: 'Exact canonical stored kilograms. Original entered unit/value is not consistently retained.',
    display_unit_at_export: state.profile?.units === 'lb' ? 'lb' : 'kg', workout_count: workouts.length };
  const parts = format === 'csv' ? ['\uFEFF' + columns.join(',') + '\r\n'] : [`{"metadata":${JSON.stringify(metadata)},"workouts":[`];
  for (let i = 0; i < workouts.length; i++) {
    if (i % 20 === 0) await yieldWork();
    const workout = portableWorkout(workouts[i], i, includeNotes, names);
    if (format === 'json') parts.push((i ? ',' : '') + JSON.stringify(workout));
    else for (const exercise of workout.exercises) for (const set of exercise.sets) {
      const base = {...workout, ...exercise, ...set};
      const rows = [...(set.performed ? [{...base, row_type:'set'}] : []), ...set.segments.map(segment => ({...base, ...segment, row_type:'segment'}))];
      for (const row of rows) parts.push(columns.map(key => csvCell(row[key])).join(',') + '\r\n');
    }
  }
  // CSV remains a one-set-per-row workout export. JSON also carries body
  // check-ins and nullable source-only measurements without flattening them.
  if (format === 'json') parts.push(`],"body_weight_checkins":${JSON.stringify(state.weightCheckins||[])},"imported_measurement_sources":${JSON.stringify(state.importedMeasurementSources||[])}}`);
  return new File(parts, `ROOK-workout-history-${new Date(now).toISOString().slice(0,10)}.${format}`, {type:format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json'});
}

// Same Web Share Files → anchor-download pattern as Backup, without recovery-specific wording.
export async function presentHistoryExport(file, { navigator: nav = globalThis.navigator, document: doc = globalThis.document, URL: urls = globalThis.URL } = {}) {
  try {
    if (nav?.share && nav.canShare?.({files:[file]})) {
      try { await nav.share({files:[file],title:'ROOK workout history'}); return 'shared'; }
      catch(error) { if(error?.name === 'AbortError') return 'cancelled'; }
    }
  } catch { /* Capability checks can fail; download is still available. */ }
  if (!doc || !urls?.createObjectURL) throw new Error('File download is unavailable in this browser.');
  const url = urls.createObjectURL(file), link = doc.createElement('a');
  try { link.href=url;link.download=file.name;link.rel='noopener';doc.body.append(link);link.click(); }
  finally { link.remove();setTimeout(()=>urls.revokeObjectURL(url),1000); }
  return 'downloaded';
}
