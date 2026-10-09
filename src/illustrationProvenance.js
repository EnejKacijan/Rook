import {illustrationProvenance} from './illustrationProvenance.generated.js';

// Never infer authorship from a wg-/rook- filename, a catalog reference,
// a local account flag, or the visual style of a drawing.
export function illustrationProvenanceForAsset(assetId) {
  return illustrationProvenance[assetId] || {
    assetId: assetId || null,
    provenanceType: 'unknown',
    attributionRequired: null,
    credit: null,
  };
}
