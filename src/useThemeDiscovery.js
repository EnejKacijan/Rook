import { useCallback, useEffect, useRef, useState } from 'react';
import { availableThemeReleases, readSeenThemeReleases, saveSeenThemeReleases, THEME_DISCOVERY_KEY } from './themeDiscovery.js';
import { nextThemeMidnightDelay } from './seasonalThemeLifecycle.js';
import { subscribeNativeForeground } from './nativeLifecycle.js';

export function useThemeDiscovery() {
  const [seen, setSeen] = useState(readSeenThemeReleases);
  const seenRef = useRef(seen); seenRef.current = seen;
  const [releases, setReleases] = useState(availableThemeReleases);
  useEffect(() => {
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      if (document.visibilityState !== 'hidden') {
        setReleases(availableThemeReleases());
        const merged = new Set([...seenRef.current, ...readSeenThemeReleases()]);
        if (merged.size !== seenRef.current.size) { seenRef.current = merged; setSeen(merged); }
      }
      timer = setTimeout(refresh, nextThemeMidnightDelay());
    };
    const storage = event => { if (event.key === null || event.key === THEME_DISCOVERY_KEY) refresh(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', refresh);
    const release = subscribeNativeForeground(refresh);
    timer = setTimeout(refresh, nextThemeMidnightDelay());
    return () => {
      clearTimeout(timer); release();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const markSeen = useCallback(ids => {
    const next = new Set([...seenRef.current, ...readSeenThemeReleases(), ...ids]);
    if (next.size === seenRef.current.size) return;
    seenRef.current = next; setSeen(next); saveSeenThemeReleases(next);
  }, []);
  const acknowledgeInitialThemes = useCallback(() => markSeen(availableThemeReleases().map(item=>item.id)), [markSeen]);
  const openDiscovery = useCallback(() => {
    const current = availableThemeReleases();
    const viewed = new Set([...seenRef.current, ...readSeenThemeReleases()]);
    setReleases(current);
    if (viewed.size !== seenRef.current.size) { seenRef.current = viewed; setSeen(viewed); }
    return current.filter(item=>!viewed.has(item.id));
  }, []);
  const pending = releases.filter(item => !seen.has(item.id));
  return { hasNewThemes:pending.length > 0, releases:pending, markSeen, acknowledgeInitialThemes, openDiscovery };
}

// Only a verified first setup may suppress its initial notices. A restored
// profile has a different identity and must retain its discovery opportunities.
export function useInitialThemeDiscovery({newProfile, profileId, complete, acknowledge}) {
  const initial = useRef(newProfile ? profileId : null);
  useEffect(() => {
    if (complete && initial.current && initial.current === profileId) {
      initial.current = null; acknowledge();
    }
  }, [complete, profileId, acknowledge]);
}
