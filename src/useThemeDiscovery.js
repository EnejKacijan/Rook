import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { availableThemeReleases, initialSeenThemeReleases, readSeenThemeReleases, saveSeenThemeReleases, themeDiscoveryKey, THEME_DISCOVERY_KEY } from './themeDiscovery.js';
import { nextThemeMidnightDelay } from './seasonalThemeLifecycle.js';
import { subscribeNativeForeground } from './nativeLifecycle.js';

export function useThemeDiscovery({eligible = false, profileId, accountCreatedAt} = {}) {
  const key = eligible ? themeDiscoveryKey(profileId) : null;
  const [session, setSession] = useState({key:null, seen:new Set()});
  const sessionRef = useRef(session); sessionRef.current = session;
  const [releases, setReleases] = useState(availableThemeReleases);
  const ready = Boolean(key && session.key === key);
  useEffect(() => {
    if (!key) {
      const empty = {key:null, seen:new Set()}; sessionRef.current = empty; setSession(empty);
      return;
    }
    const initial = {key, seen:initialSeenThemeReleases({profileId, accountCreatedAt})};
    sessionRef.current = initial; setSession(initial); setReleases(availableThemeReleases());
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      if (document.visibilityState !== 'hidden') {
        setReleases(availableThemeReleases());
        const current = sessionRef.current;
        if (current.key === key) {
          const merged = new Set([...current.seen, ...readSeenThemeReleases(undefined, key)]);
          if (merged.size !== current.seen.size) { const next = {key, seen:merged}; sessionRef.current = next; setSession(next); }
        }
      }
      timer = setTimeout(refresh, nextThemeMidnightDelay());
    };
    const storage = event => { if (event.key === null || event.key === key || event.key === THEME_DISCOVERY_KEY) refresh(); };
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
  }, [key, profileId, accountCreatedAt]);
  const markSeen = useCallback(ids => {
    if (!key || sessionRef.current.key !== key) return false;
    const current = sessionRef.current;
    const seen = new Set([...current.seen, ...readSeenThemeReleases(undefined, key), ...ids]);
    if (seen.size !== current.seen.size) {
      const next = {key, seen}; sessionRef.current = next; setSession(next); saveSeenThemeReleases(seen, undefined, key);
    }
    return true;
  }, [key, ready]);
  const acknowledgeInitialThemes = useCallback(() => markSeen(availableThemeReleases().map(item=>item.id)), [markSeen]);
  const openDiscovery = useCallback(() => {
    if (!key || sessionRef.current.key !== key) return [];
    const current = availableThemeReleases();
    const viewed = new Set([...sessionRef.current.seen, ...readSeenThemeReleases(undefined, key)]);
    setReleases(current);
    if (viewed.size !== sessionRef.current.seen.size) { const next = {key, seen:viewed}; sessionRef.current = next; setSession(next); }
    return current.filter(item=>!viewed.has(item.id));
  }, [key]);
  const pending = ready ? releases.filter(item => !session.seen.has(item.id)) : [];
  return { profileId, hasNewThemes:pending.length > 0, releases:pending, markSeen, acknowledgeInitialThemes, openDiscovery };
}

// Wait for the signed-in discovery scope before acknowledging a fresh setup.
// A restored identity is handled by account age rather than first-run state.
export function useInitialThemeDiscovery({newProfile, profileId, complete, acknowledge}) {
  const initial = useRef(newProfile ? profileId : null);
  useLayoutEffect(() => {
    if (complete && initial.current && initial.current === profileId && acknowledge() !== false) initial.current = null;
  }, [complete, profileId, acknowledge]);
}
