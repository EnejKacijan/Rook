import { canonicalBackupCounts, compareBackupCounts } from './backupCounts.js';

it('counts archive records consistently, without deduplicating threads or expanding set sides/segments', () => {
  const state = {
    program:{days:[{},{}]},
    workouts:[{exercises:[{sets:[
      {completed:true,sides:{left:{reps:8},right:{reps:7}}},
      {completed:true,segments:[{completed:true},{completed:true}]},
      {completed:false},
    ]}]}],
    activeWorkout:{exercises:[{sets:[{completed:true}]}]},
    conversations:[{conversationId:'one'},{conversationId:'one'},{conversationId:'two'}],
    weightCheckins:[{},{}], importedMeasurementSources:[{}],
  };
  expect(canonicalBackupCounts(state,[{}])).toEqual({programDays:2,workouts:1,completedSets:2,workoutPhotos:1,coachConversations:3,weightCheckins:2,savedWorkoutTemplates:0,importedMeasurementSources:1});
});

it('reports every counter, including invalid, missing and unsupported fields, without stopping at the first mismatch', () => {
  const rows=compareBackupCounts({workouts:2,completedSets:'0',workoutPhotos:null,coachConversations:-1,weightCheckins:0,unexpected:5},{});
  expect(rows).toEqual([
    {field:'programDays',expected:null,recomputed:0,status:'missing'},
    {field:'workouts',expected:2,recomputed:0,status:'mismatch'},
    {field:'completedSets',expected:'0',recomputed:0,status:'invalid'},
    {field:'workoutPhotos',expected:null,recomputed:0,status:'invalid'},
    {field:'coachConversations',expected:-1,recomputed:0,status:'invalid'},
    {field:'weightCheckins',expected:0,recomputed:0,status:'match'},
    {field:'savedWorkoutTemplates',expected:null,recomputed:0,status:'legacy-zero'},
    {field:'importedMeasurementSources',expected:null,recomputed:0,status:'legacy-zero'},
    {field:'unexpected',expected:5,recomputed:null,status:'unsupported'},
  ]);
});

it.each([[],[{}],null])('does not treat a present imported-measurements collection as an absent legacy field: %j', collection => {
  const state={importedMeasurementSources:collection},expected=canonicalBackupCounts(state);delete expected.importedMeasurementSources;
  expect(compareBackupCounts(expected,state).at(-1).status).toBe('missing');
});

it.each([null,false,'0',-1,0.5,Number.MAX_SAFE_INTEGER+1])('does not coerce malformed zero counters: %j', value => {
  const expected=canonicalBackupCounts({});expected.importedMeasurementSources=value;
  expect(compareBackupCounts(expected,{}).at(-1).status).toBe('invalid');
});
