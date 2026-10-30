import {AnimatedDetails} from './AnimatedDetails.jsx';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ThemeNewBadge } from './ThemeNewBadge.jsx';
import { SheetActionFooter } from './SheetActionFooter.jsx';
import { seasonalWindowLabel } from './seasonalThemes.js';
import {seasonalAccessPolicy,seasonalThemeAvailability,seasonalThemeCanApply,seasonalThemeChoices} from './seasonalThemeAccess.js';
import { SEASONAL_PRESETS, THEME_BASES, THEME_PRESETS, normalizePersonalTheme, personalThemeModel, personalThemeSummary, personalThemeShades, personalThemeSurfaces, selectPersonalThemePalette, updatePersonalTheme, resetPersonalThemePalette } from './personalThemes.js';
import './personalThemeStudio.css';
import {SegmentedControl} from './SegmentedControl.jsx';
import {NavigationChevron} from './NavigationChevron.jsx';

const themeNow=()=>new Date();
export function PersonalThemeStudio({ initial, systemDark = false, Header, close, apply, preview, newReleases = [], onDiscoverySeen, seasonalAccess, onExploreSeasonalPro, now=themeNow }) {
  const access=seasonalAccessPolicy(seasonalAccess);
  const badgeId = useId();
  const [discoveries] = useState(newReleases);
  const onSeen = useRef(onDiscoverySeen); onSeen.current = onDiscoverySeen;
  useEffect(() => {
    const acknowledge = () => {
      if (document.visibilityState !== 'hidden') onSeen.current?.(discoveries.map(item => item.id));
    };
    acknowledge();
    document.addEventListener('visibilitychange', acknowledge);
    return () => document.removeEventListener('visibilitychange', acknowledge);
  }, [discoveries]);
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
  // Keep this open draft stable across midnight. Apply rechecks availability.
  const [pickerDate] = useState(() => now());
  const seasons=seasonalThemeChoices(baseline.basePalette,pickerDate,SEASONAL_PRESETS,access);
  const selectedAccess=selectedPreset.seasonal?seasonalThemeAvailability(selectedPreset,{date:now(),access}):'free';
  const canApply=seasonalThemeCanApply(selectedAccess);
  const heldCurrent=selectedPreset.seasonal&&selectedAccess==='unknown';
  const savedPalette=THEME_PRESETS.find(item=>item.id===draft.fallbackPalette)?.name || 'ROOK Green';
  const seasonEnd=selectedPreset.seasonal?seasonalWindowLabel(selectedPreset).split(' – ')[1]:null;
  const tile = (item, when, archived=false) => {
    const locked=archived&&!seasonalThemeCanApply(seasonalThemeAvailability(item,{date:now(),access}));
    const checking=archived&&access.status==='unknown';
    const selected=selectedPreset.id===item.id;
    const release = discoveries.find(release => release.paletteIds.includes(item.id));
    const isNew = Boolean(release);
    const choice = personalThemeModel(selectPersonalThemePalette(draft, item.id), systemDark);
    return <button type="button" key={item.id} disabled={locked} className={locked?'seasonal-theme-locked':undefined} aria-label={checking?`${item.name}, ${selected?'current theme, ':''}Pro access is being checked`:locked?`${item.name}, year-round access requires ROOK Pro`:item.name} aria-describedby={isNew ? `${badgeId}-${item.id}` : undefined} aria-pressed={selected} onClick={() => stage(selectPersonalThemePalette(draftRef.current, item.id))}>
      <span className="pro-theme-preview" data-season={item.seasonal ? item.id : undefined} style={choice.tokens} aria-hidden="true"><i className="pro-theme-preview-card"><b /><b /></i><i className="pro-theme-preview-cta" /></span>
      <span className="pro-theme-preset-name">{item.name}{isNew && <ThemeNewBadge id={`${badgeId}-${item.id}`} returning={release.returning}/>}</span>{locked&&!checking?<span className="seasonal-theme-lock" aria-hidden="true"/>:<span className="pro-theme-choice-check" aria-hidden="true">{selected?'✓':''}</span>}
      {item.description && <small className="pro-theme-preset-note" aria-hidden="true">{item.description}</small>}
      {when && <small className="pro-theme-preset-note pro-theme-season-window">{checking?'Checking Pro access…':when}</small>}
    </button>;
  };
  return <main className="screen detail-screen pro-theme-studio" role="dialog" aria-modal="true" aria-label="Personal themes">
    <Header title="Personal themes" onClose={close} closeLabel="Close personal themes" />
    <fieldset className="pro-theme-appearance"><legend>Appearance</legend><SegmentedControl label="Appearance" options={[{value:'system',label:'System'},{value:'light',label:'Light'},{value:'dark',label:'Dark'}]} value={draft.appearance} onChange={value=>update('appearance',value)}/></fieldset>
    <fieldset className="pro-theme-presets"><legend>Curated palettes</legend>{THEME_PRESETS.map(item => tile(item))}</fieldset>
    {seasons.current.length > 0 && <fieldset className="pro-theme-seasonal" aria-describedby={`${badgeId}-seasonal`}><legend>Seasonal</legend><p className="pro-theme-group-note" id={`${badgeId}-seasonal`}>{access.enabled?'Free in season · Returns every year':'Returns every year'}</p>{seasons.current.map(item => tile(item, seasonalWindowLabel(item)))}</fieldset>}
    {seasons.yearRound.length>0&&<fieldset className="pro-theme-seasonal seasonal-theme-archive" aria-describedby={`${badgeId}-archive`}><legend>Seasonal archive</legend>
      <p className="pro-theme-group-note" id={`${badgeId}-archive`}>{access.status==='active'?'Available year-round with ROOK Pro.':'Returns every year.'}</p>
      {seasons.yearRound.map(item=>tile(item,access.status==='active'?<><span>Season:</span>{' '}<span className="seasonal-window-dates">{seasonalWindowLabel(item)}</span></>:`Returns ${seasonalWindowLabel(item).split(' – ')[0]}`,true))}
    </fieldset>}
    {access.enabled&&access.status==='unknown'&&seasons.yearRound.length>0&&<p className="seasonal-theme-access-note" role="status">{heldCurrent?`${selectedPreset.name} stays active while we check your Pro access.`:'Checking Pro access…'}</p>}
    {access.enabled&&access.status==='free'&&(seasons.current.length>0||seasons.yearRound.length>0)&&typeof onExploreSeasonalPro==='function'&&<div className="seasonal-theme-access-note"><p>ROOK Pro lets you use released seasonal themes year-round.</p><button type="button" className="text-button" onClick={onExploreSeasonalPro}><span>See ROOK Pro</span><NavigationChevron/></button></div>}
    {selectedPreset.seasonal&&(!access.enabled||access.status==='free'||access.status==='active'&&selectedAccess==='free')&&<p className="pro-theme-season-return">{!access.enabled?`After this season, your saved ${savedPalette} palette returns.`:access.status==='active'?'Available year-round with ROOK Pro.':selectedAccess==='pro-required'?'This theme is out of season. Choose another palette or see ROOK Pro.':`After ${seasonEnd}, your saved ${savedPalette} palette returns.`}</p>}
    <AnimatedDetails className="pro-theme-custom"><summary>{`Fine-tune ${selectedPreset.name}`}</summary>
      <fieldset className="pro-theme-accents"><legend>Accent shade <span>{model.accentName}</span></legend>{personalThemeShades(selectedPreset.id).map(item => <button type="button" key={item.id} aria-label={item.name} title={item.name} aria-pressed={draft.accent === item.id} onClick={() => update('accent', item.id)}><i aria-hidden="true" style={{ background: item[model.appearance], color: personalThemeModel(updatePersonalTheme(draft, { accent: item.id }), systemDark).tokens['--rook-on-accent-fill'] }}>{draft.accent === item.id ? '✓' : ''}</i></button>)}</fieldset>
      <fieldset className="pro-theme-bases"><legend>Background tone</legend>{THEME_BASES.map(item => <button type="button" key={item.id} aria-pressed={draft.base === item.id} onClick={() => update('base', item.id)}><span className="pro-theme-base-swatches" aria-hidden="true">{personalThemeSurfaces(selectedPreset.id, item.id, model.appearance).map((color, i) => <i key={i} style={{ background: color }} />)}</span><span>{item.name}</span><span className="pro-theme-base-check" aria-hidden="true">{draft.base === item.id ? '✓' : ''}</span></button>)}</fieldset>
      <div className="pro-theme-reset-row"><p role="status" aria-live="polite">{personalThemeSummary(draft)}{draft.appearance === 'system' ? ` · ${model.appearance === 'dark' ? 'Dark' : 'Light'} now` : ''}</p><button type="button" disabled={!colorsChanged} onClick={() => stage(resetPersonalThemePalette(draftRef.current))}>{`Reset ${selectedPreset.name}`}</button></div>
    </AnimatedDetails>
    {error && <p role="alert">{error}</p>}
    <SheetActionFooter className="pro-theme-actions"><div className="pro-theme-action-row"><button type="button" className="button quiet" onClick={close}>Cancel</button><button type="button" className="button primary" disabled={!changed||!canApply} onClick={() => { if (!changed || !canApply || submitted.current) return; submitted.current = true; try { apply(normalizePersonalTheme(draftRef.current)); close(); } catch (failure) { submitted.current = false; setError(['season-ended','seasonal-pro-required','pro-unconfirmed','season-unavailable'].includes(failure?.code)?failure.message:'Couldn’t save this theme. Please try again.'); } }}>Apply theme</button></div></SheetActionFooter>
  </main>;
}
