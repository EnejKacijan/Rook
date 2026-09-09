// Export an already loaded local asset; never re-encode or upload it.
export function workoutPhotoFile(blob, date) {
  const extensions = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif','image/heic':'heic'};
  const extension = extensions[blob?.type];
  if (!extension || !blob.size) throw new Error('This photo cannot be exported.');
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : 'saved';
  return new File([blob], `ROOK-workout-${day}.${extension}`, {type:blob.type});
}

export async function exportWorkoutPhoto(file) {
  if (!file) throw new Error('Photo unavailable.');
  const files = [file];
  if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({files})) {
    try { await navigator.share({files}); return 'shared'; }
    catch (error) { if (error?.name === 'AbortError') return 'cancelled'; throw error; }
  }
  const url = URL.createObjectURL(file);
  try {
    const link = document.createElement('a');
    link.href = url; link.download = file.name;
    document.body.append(link);
    try { link.click(); } finally { link.remove(); }
  } finally {
    // Give browser download handling time to consume the URL (not a UI delay).
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return 'downloaded';
}
