import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PersonalThemeStudio } from './PersonalThemeStudio.jsx';
import { DEFAULT_PERSONAL_THEME, normalizePersonalTheme, THEME_PRESETS } from './personalThemes.js';
import { PERSONAL_THEME_PREFERENCE, readPersonalThemePreference, savePersonalThemePreference } from './personalThemePreference.js';
import { nextThemeMidnightDelay, prepareSeasonalThemeSelection, resolveSeasonalTheme } from './seasonalThemeLifecycle.js';
import { subscribeNativeForeground } from './nativeLifecycle.js';
import { useTransientSnackbar } from './TransientSnackbar.jsx';
import { useThemeDiscovery } from './useThemeDiscovery.js';
import './personalThemeApp.css';

// Appearance is available to everyone in this release. It does not create or
// impersonate a subscription entitlement and never contacts a billing service.
const ThemeContext = createContext(null);
const inactive = Object.freeze({ personalTheme: null, renderedPersonalTheme: null,
  hasNewThemes: false,
  themeNoticeReturning: false,
  acknowledgeInitialThemes: () => {},
  openThemes: () => {}, clearTheme: () => {}, setAppearance: () => {}, setSeasonalTransitionBlocked: () => {} });
export const usePersonalThemes = () => useContext(ThemeContext) || inactive;

export function PersonalThemesProvider({ children, Modal, Header }) {
  const discovery = useThemeDiscovery();
  const discoveryRef = useRef(discovery); discoveryRef.current = discovery;
  const [personalTheme, setPersonalTheme] = useState(readPersonalThemePreference);
  const [renderedTheme, setRenderedTheme] = useState(personalTheme);
  const [previewTheme, setPreviewTheme] = useState(null);
  const [surface, setSurface] = useState(null);
  const committed = useRef(personalTheme), session = useRef(null), id = useRef(0);
  committed.current = personalTheme;
  const rendered = useRef(renderedTheme); rendered.current = renderedTheme;
  const surfaceRef = useRef(surface); surfaceRef.current = surface;
  // Hydration must restore paused/active sessions before an automatic change.
  const blocked = useRef(true);
  const [safetyRevision, setSafetyRevision] = useState(0);
  const setSeasonalTransitionBlocked = useCallback(value => {
    if (blocked.current === Boolean(value)) return;
    blocked.current = Boolean(value);
    setSafetyRevision(revision => revision + 1);
  }, []);
  const notice = useTransientSnackbar({className:'seasonal-theme-notice'});
  const announced = useRef(null), refreshRef = useRef(null);
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  refreshRef.current = () => {
    if (blocked.current || surfaceRef.current || document.visibilityState === 'hidden' ||
      document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')) return;
    const saved = committed.current;
    const next = resolveSeasonalTheme(saved);
    if (!equal(rendered.current, next)) {
      rendered.current = next;
      setRenderedTheme(next);
      if (!equal(saved, next)) {
        const key = `${saved.basePalette}:${saved.seasonalValidUntil || 'legacy'}:${next.basePalette}`;
        if (announced.current !== key) {
          announced.current = key;
          notice.show({message:`The season has ended. Back to ${THEME_PRESETS.find(item => item.id === next.basePalette)?.name || 'ROOK Green'}.`});
        }
      }
    }
    if (!equal(saved, next)) {
      // An automatic expiry still renders the fallback when storage is full.
      // Retain the actual committed value and retry only on a later event.
      try { savePersonalThemePreference(next); committed.current = next; setPersonalTheme(next); }
      catch { /* No promise that the automatic change was persisted. */ }
    }
  };
  useLayoutEffect(() => { refreshRef.current(); }, [personalTheme, surface, safetyRevision]);
  useEffect(() => {
    let timer, blurTimer;
    const refresh = () => {
      refreshRef.current();
      clearTimeout(timer);
      timer = setTimeout(refresh, nextThemeMidnightDelay());
    };
    const visible = () => { if (document.visibilityState !== 'hidden') refresh(); };
    const blur = () => { clearTimeout(blurTimer); blurTimer = setTimeout(refresh, 0); };
    const storage = event => {
      if (event.key !== null && event.key !== PERSONAL_THEME_PREFERENCE) return;
      const next = readPersonalThemePreference();
      committed.current = next; setPersonalTheme(next); refresh();
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visible);
    document.addEventListener('focusout', blur);
    const releaseNative = subscribeNativeForeground(refresh);
    return () => {
      clearTimeout(timer); clearTimeout(blurTimer); releaseNative();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visible);
      document.removeEventListener('focusout', blur);
    };
  }, []);
  const background = useRef(null), focus = useRef(null);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const change = event => setSystemDark(event.matches);
    media.addEventListener?.('change', change);
    return () => media.removeEventListener?.('change', change);
  }, []);
  const openThemes = useCallback(initial => {
    if (session.current && !session.current.closed) return;
    background.current = [...document.querySelectorAll('.modal-layer')].at(-1)
      || document.querySelector('.app-shell') || document.querySelector('#root');
    focus.current = document.activeElement;
    const theme = normalizePersonalTheme(rendered.current || initial || DEFAULT_PERSONAL_THEME);
    session.current = { closed: false };
    setPreviewTheme(theme);
    setSurface({ initial: theme, id: ++id.current, newReleases:discoveryRef.current.openDiscovery() });
  }, []);
  const endPreview = () => {
    if (session.current) session.current.closed = true;
    setPreviewTheme(null);
  };
  const preview = useCallback(theme => {
    if (session.current && !session.current.closed) setPreviewTheme(normalizePersonalTheme(theme));
  }, []);
  const apply = theme => {
    if (!session.current || session.current.closed) return;
    const next = prepareSeasonalThemeSelection(theme);
    // Persist before committing. A storage error leaves the draft reviewable.
    savePersonalThemePreference(next);
    committed.current = next;
    setPersonalTheme(next);
    rendered.current = next; setRenderedTheme(next); notice.clear();
  };
  const clearTheme = () => {
    savePersonalThemePreference(null);
    committed.current = null;
    setPersonalTheme(null);
    rendered.current = null; setRenderedTheme(null); notice.clear();
    endPreview();
  };
  const setAppearance = useCallback(appearance => {
    if (!rendered.current || !['system', 'light', 'dark'].includes(appearance)) return;
    if (rendered.current.appearance === appearance) return;
    // Brightness is independent of the palette and all its saved Fine-tune choices.
    const next = normalizePersonalTheme({ ...rendered.current, appearance });
    savePersonalThemePreference(next);
    committed.current = next;
    setPersonalTheme(next);
    rendered.current = next; setRenderedTheme(next);
  }, []);
  const dismiss = () => { endPreview(); setSurface(null); };
  return <ThemeContext.Provider value={{ personalTheme:renderedTheme,
    hasNewThemes:discovery.hasNewThemes,
    themeNoticeReturning:discovery.hasNewThemes && discovery.releases.every(item=>item.returning),
    acknowledgeInitialThemes:discovery.acknowledgeInitialThemes,
    renderedPersonalTheme: previewTheme || renderedTheme, openThemes, clearTheme, setAppearance, setSeasonalTransitionBlocked }}>
    {children}
    {!blocked.current && !surface && notice.surface}
    {surface && createPortal(<Modal key={surface.id} close={dismiss} onCloseStart={endPreview}
      backgroundRef={background} returnFocusRef={focus} lockDocument={!background.current?.matches('.modal-layer')}>
      {close => <PersonalThemeStudio Header={Header} initial={surface.initial} systemDark={systemDark}
        newReleases={surface.newReleases} onDiscoverySeen={discovery.markSeen}
        close={close} preview={preview} apply={apply} />}
    </Modal>, document.body)}
  </ThemeContext.Provider>;
}
