export function warmupPrescriptionLabel(item) {
  if (item.prescriptionText) return item.prescriptionText;
  const sets = Number(item.sets) || 1;
  if (Number(item.seconds) > 0) {
    const seconds = Number(item.seconds);
    const time = seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} sec`;
    return sets > 1 ? `${sets} × ${time}` : time;
  }
  if (Number(item.reps) > 0) return `${sets} × ${item.reps}`;
  if (Number(item.minutes) > 0 && !(item.provenance === 'imported' && Number(item.minutes) === 1 && !item.sourceText)) return `${item.minutes} min`;
  return '';
}
