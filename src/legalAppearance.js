import {ALL_THEME_PRESETS} from './personalThemes.js';
export const LEGAL_THEME_ROLES=['bg','surface','text','secondary','border','accent-text','accent-soft','focus-ring'];

// Only visual hints leave the app. Policy pages never read a training profile,
// account, or browser storage to decide how they look.
export function legalPageHref(documentId, root = globalThis.document?.documentElement) {
  const systemDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const appearance = ['light','dark'].includes(root?.dataset.appearance)
    ? root.dataset.appearance : systemDark ? 'dark' : 'light';
  const personalTheme = root?.dataset.personalTheme || '';
  const preset = ALL_THEME_PRESETS.find(item => personalTheme.startsWith(`${item.id}-`));
  const theme = preset?.id || (root?.dataset.style === 'premium' ? 'champagne' : 'forest');
  const parameters = new URLSearchParams({appearance, theme});
  // Keep fine-tuned and seasonal colours too. Accept only the resolver's hex
  // colours, never arbitrary CSS, and never serialize the rest of app state.
  const style=root&&globalThis.getComputedStyle?.(root);
  const colours=LEGAL_THEME_ROLES.map(role=>style?.getPropertyValue(`--rook-${role}`).trim() || '');
  if(colours.every(colour=>/^#[a-f\d]{6}$/i.test(colour)))parameters.set('colours',colours.map(colour=>colour.slice(1)).join('-'));
  return `/legal/${encodeURIComponent(documentId)}.html?${parameters}`;
}
