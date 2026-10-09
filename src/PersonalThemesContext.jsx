import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PersonalThemeStudio } from './PersonalThemeStudio.jsx';
import { DEFAULT_PERSONAL_THEME, normalizePersonalTheme } from './personalThemes.js';
import { readPersonalThemePreference, savePersonalThemePreference } from './personalThemePreference.js';
import './personalThemeApp.css';

// Appearance is available to everyone in this release. It does not create or
// impersonate a subscription entitlement and never contacts a billing service.
const ThemeContext = createContext(null);
const inactive = Object.freeze({ personalTheme: null, renderedPersonalTheme: null,
  openThemes: () => {}, clearTheme: () => {} });
export const usePersonalThemes = () => useContext(ThemeContext) || inactive;

export function PersonalThemesProvider({ children, Modal, Header }) {
  const [personalTheme, setPersonalTheme] = useState(readPersonalThemePreference);
  const [previewTheme, setPreviewTheme] = useState(null);
  const [surface, setSurface] = useState(null);
  const committed = useRef(personalTheme), session = useRef(null), id = useRef(0);
  committed.current = personalTheme;
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
    const theme = normalizePersonalTheme(committed.current || initial || DEFAULT_PERSONAL_THEME);
    session.current = { closed: false };
    setPreviewTheme(theme);
    setSurface({ initial: theme, id: ++id.current });
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
    const next = normalizePersonalTheme(theme);
    // Persist before committing. A storage error leaves the draft reviewable.
    savePersonalThemePreference(next);
    committed.current = next;
    setPersonalTheme(next);
  };
  const clearTheme = () => {
    savePersonalThemePreference(null);
    committed.current = null;
    setPersonalTheme(null);
    endPreview();
  };
  const dismiss = () => { endPreview(); setSurface(null); };
  return <ThemeContext.Provider value={{ personalTheme,
    renderedPersonalTheme: previewTheme || personalTheme, openThemes, clearTheme }}>
    {children}
    {surface && createPortal(<Modal key={surface.id} close={dismiss} onCloseStart={endPreview}
      backgroundRef={background} returnFocusRef={focus} lockDocument={!background.current?.matches('.modal-layer')}>
      {close => <PersonalThemeStudio Header={Header} initial={surface.initial} systemDark={systemDark}
        close={close} preview={preview} apply={apply} />}
    </Modal>, document.body)}
  </ThemeContext.Provider>;
}
