// Compare is ephemeral: references into the existing Timeline, never copied media.
export function toggleComparePhoto(selection, entry) {
  if (!entry?.id || !entry.metadataAvailable) return selection;
  if (selection.some(photo => photo.id === entry.id)) return selection.filter(photo => photo.id !== entry.id);
  return selection.length < 2 ? [...selection, entry] : selection;
}

export function chronologicalPhotoPair(selection) {
  return [...selection].sort((a, b) => a.day.localeCompare(b.day) ||
    String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
}

export function canComparePhotos(selection, entries, availability) {
  return selection.length === 2 && new Set(selection.map(photo => photo.id)).size === 2 &&
    selection.every(photo => entries.some(entry => entry.id === photo.id && entry.metadataAvailable) && availability[photo.id] === true);
}
