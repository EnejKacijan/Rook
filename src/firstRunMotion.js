// Compatibility names for retained first-run route/step lifecycles. Motion is
// owned by the same physical page stack as Profile, not a first-run renderer.
export {
  capturePageSurface as captureFirstRunSurface,
  playPageNavigation as playFirstRunMotion,
  createPageBackMotion as firstRunBackMotion,
  stopPageNavigation as stopFirstRunMotion,
} from './pageStackMotion.js';
