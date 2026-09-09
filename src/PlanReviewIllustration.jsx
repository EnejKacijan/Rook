import { useAvailableImage } from './useAvailableImage.js';
import './planReviewIllustration.css';

export function canonicalPlanReviewArt(exercise, catalog, resolveArt) {
  if (!exercise || exercise.exerciseSource === 'custom' ||
      ['unresolved', 'needs-name-review'].includes(exercise.matchStatus)) return null;
  const item = catalog[exercise.exerciseId];
  if (!item || item.custom || !item.artId) return null;
  // Pass only the canonical ID: do not infer artwork from an imported label.
  return resolveArt({ exerciseId: exercise.exerciseId });
}

export function PlanReviewIllustration({ exercise, catalog, resolveArt, enabled = false, expanded = false, name }) {
  const image = useAvailableImage(enabled ? canonicalPlanReviewArt(exercise, catalog, resolveArt) : null);
  if (!image.source) return null;
  return <span className={`plan-review-illustration${expanded ? ' is-expanded' : ''}`} aria-hidden={expanded ? undefined : true}>
    <img src={image.source} onError={image.onError} alt={expanded ? `${name} illustration` : ''}
      width={expanded ? 120 : 48} height={expanded ? 120 : 48} loading="lazy" decoding="async" draggable={false} />
  </span>;
}
