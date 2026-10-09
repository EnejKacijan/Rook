import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SheetActionFooter } from './SheetActionFooter.jsx';
import { THEME_BASES, THEME_PRESETS, normalizePersonalTheme, personalThemeModel, personalThemeSummary, personalThemeShades, personalThemeSurfaces, selectPersonalThemePalette, updatePersonalTheme, resetPersonalThemePalette } from './personalThemes.js';
import './personalThemeStudio.css';
import {SegmentedControl} from './SegmentedControl.jsx';

export function PersonalThemeStudio({ initial, systemDark = false, Header, close, apply, preview }) {
  const [baseline] = useState(() => normalizePersonalTheme(initial));
  const [draft, setDraft] = useState(baseline);
  const [error, setError] = useState('');
  const draftRef = useRef(draft), closeRef = useRef(close);
  closeRef.current = close;
  // Browser Back cancels this overlay through the canonical sheet close path.
  useEffect(() => {
    const back = () => closeRef.current();
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const model = useMemo(() => personalThemeModel(draft, systemDark), [draft, systemDark]);
  const selectedPreset = model.basePalette;
  const changed = JSON.stringify(baseline) !== JSON.stringify(draft);
  const colorsChanged = model.customized;
  const submitted = useRef(false);
  const stage = value => {
    const next = normalizePersonalTheme(value);
    draftRef.current = next;
    setDraft(next); setError(''); preview?.(next);
  };
  const update = (key, value) => stage(updatePersonalTheme(draftRef.current, { [key]: value }));
  return <main className="screen detail-screen pro-theme-studio" role="dialog" aria-modal="true" aria-label="Personal themes">
    <Header title="Personal themes" onClose={close} closeLabel="Close personal themes" />
    <p className="pro-theme-intro">Choose a palette. Make it yours.</p>
    <fieldset className="pro-theme-appearance"><legend>Appearance</legend><SegmentedControl label="Appearance" options={[{value:'system',label:'System'},{value:'light',label:'Light'},{value:'dark',label:'Dark'}]} value={draft.appearance} onChange={value=>update('appearance',value)}/></fieldset>
    <fieldset className="pro-theme-presets"><legend>Curated palettes</legend>{THEME_PRESETS.map(item => {
      const choice = personalThemeModel(selectPersonalThemePalette(draft, item.id), systemDark);
      return <button type="button" key={item.id} aria-label={item.name} aria-pressed={selectedPreset.id === item.id} onClick={() => stage(selectPersonalThemePalette(draftRef.current, item.id))}>
        <span className="pro-theme-swatches pro-theme-sample-colors" style={choice.tokens} aria-hidden="true"><i /><i /><i /></span>
        <span>{item.name}</span><span className="pro-theme-choice-check" aria-hidden="true">{selectedPreset?.id === item.id ? '✓' : ''}</span>
      </button>;
    })}</fieldset>
    <details className="pro-theme-custom"><summary>{`Fine-tune ${selectedPreset.name}`}</summary>
      <fieldset className="pro-theme-accents"><legend>Accent shade <span>{model.accentName}</span></legend>{personalThemeShades(selectedPreset.id).map(item => <button type="button" key={item.id} aria-label={item.name} title={item.name} aria-pressed={draft.accent === item.id} onClick={() => update('accent', item.id)}><i aria-hidden="true" style={{ background: item[model.appearance], color: personalThemeModel(updatePersonalTheme(draft, { accent: item.id }), systemDark).tokens['--rook-on-accent-fill'] }}>{draft.accent === item.id ? '✓' : ''}</i></button>)}</fieldset>
      <fieldset className="pro-theme-bases"><legend>Background tone</legend>{THEME_BASES.map(item => <button type="button" key={item.id} aria-pressed={draft.base === item.id} onClick={() => update('base', item.id)}><span className="pro-theme-base-swatches" aria-hidden="true">{personalThemeSurfaces(selectedPreset.id, item.id, model.appearance).slice(0, 2).map((color, i) => <i key={i} style={{ background: color }} />)}</span><span>{item.name}</span><span className="pro-theme-base-check" aria-hidden="true">{draft.base === item.id ? '✓' : ''}</span></button>)}</fieldset>
      <div className="pro-theme-reset-row"><p role="status" aria-live="polite">{personalThemeSummary(draft)}{draft.appearance === 'system' ? ` · ${model.appearance === 'dark' ? 'Dark' : 'Light'} now` : ''}</p><button type="button" disabled={!colorsChanged} onClick={() => stage(resetPersonalThemePalette(draftRef.current))}>{`Reset ${selectedPreset.name}`}</button></div>
    </details>
    {error && <p role="alert">{error}</p>}
    <SheetActionFooter className="pro-theme-actions"><div className="pro-theme-action-row"><button type="button" className="button quiet" onClick={close}>Cancel</button><button type="button" className="button primary" disabled={!changed} onClick={() => { if (!changed || submitted.current) return; submitted.current = true; try { apply(normalizePersonalTheme(draftRef.current)); close(); } catch { submitted.current = false; setError('Couldn’t save this theme. Please try again.'); } }}>Apply theme</button></div></SheetActionFooter>
  </main>;
}
