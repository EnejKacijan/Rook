import { readFile, writeFile } from 'node:fs/promises';
const dir = 'artifacts/ROOK-DURATION-FIDELITY';
const before = JSON.parse(await readFile(`${dir}/before.json`, 'utf8'));
const after = JSON.parse(await readFile(`${dir}/after.json`, 'utf8'));
const sum = values => values.reduce((a, b) => a + b, 0);
const mean = values => +(sum(values) / values.length).toFixed(1);
const stats = rows => {
  const days = rows.filter(row => row.valid).flatMap(row => row.days);
  return { plans: rows.filter(row => row.valid).length, meanMinutes: mean(days.map(day => day.minutes)),
    range: [Math.min(...days.map(day => day.minutes)), Math.max(...days.map(day => day.minutes))],
    meanExercises: mean(days.map(day => day.exercises)), meanSets: mean(days.map(day => day.workingSets)),
    meanWarmup: mean(days.map(day => day.warmupMinutes)),
    statuses: Object.fromEntries(['within-target', 'short-justified', 'too-short', 'too-long'].map(status => [status, days.filter(day => day.durationFidelity?.status === status).length])) };
};
const durationRows = [30,45,60,75,90,120].map(minutes => ({ selected: minutes,
  before: stats(before.filter(row => row.profile.sessionMinutes === minutes)),
  after: stats(after.filter(row => row.profile.sessionMinutes === minutes)) }));
const regressions = after.filter(row => !row.valid && before.find(old => old.key === row.key && old.profile.sessionMinutes === row.profile.sessionMinutes)?.valid);
const monotonic = [];
for (const key of new Set(after.map(row => row.key))) {
  const rows = after.filter(row => row.key === key && row.valid).sort((a,b) => a.profile.sessionMinutes-b.profile.sessionMinutes);
  for (let i=1;i<rows.length;i++) {
    const previous = mean(rows[i-1].days.map(day=>day.minutes)), current = mean(rows[i].days.map(day=>day.minutes));
    if (current < previous) monotonic.push({ key, from: rows[i-1].profile.sessionMinutes, to: rows[i].profile.sessionMinutes, previous, current });
  }
}
const failures = after.filter(row => !row.valid).map(row => ({ key: row.key, time: row.profile.sessionMinutes, errors: row.errors || [row.blocked] }));
const owner = after.filter(row => row.profile.goal === 'Athletic performance' && row.profile.sessionMinutes === 120 && row.key.includes('auto-gym-true'))
  .map(row => ({ days: row.profile.daysPerWeek, experience: row.profile.experience, template: row.template,
    minutes: row.days.map(day=>day.minutes), sets: row.days.map(day=>day.workingSets),
    constraints: row.days.map(day=>day.durationFidelity.reasons) }));
const summary = { profiles: after.length, valid: after.filter(row=>row.valid).length, blockedByExistingValidation: failures.length,
  validationRegressions: regressions, durationRows, monotonic, owner, failures };
await writeFile(`${dir}/summary.json`, JSON.stringify(summary,null,2));
const csv = [['phase','selected','goal','experience','frequency','mode','warmups','valid','workout','weekday','estimated','exercises','workingSets','warmupMinutes','rampSets','restSeconds','status','reasons']];
for (const [phase, data] of [['before',before],['after',after]]) for (const row of data) for (const day of row.days || [])
  csv.push([phase,row.profile.sessionMinutes,row.profile.goal,row.profile.experience,row.profile.daysPerWeek,row.key,row.profile.recommendedWarmupsEnabled,row.valid,
    day.name,day.weekday,day.minutes,day.exercises,day.workingSets,day.warmupMinutes,day.warmupSets,day.restSeconds.join('/'),day.durationFidelity?.status || 'legacy-cap-only',
    day.durationFidelity?.reasons?.join('/') || row.errors?.join('/') || '']);
await writeFile(`${dir}/matrix.csv`,csv.map(row=>row.map(cell=>`"${String(cell ?? '').replaceAll('"','""')}"`).join(',')).join('\n'));
console.log(JSON.stringify({ ...summary, failures: failures.slice(0,3), owner: owner.slice(0,3) },null,2));
