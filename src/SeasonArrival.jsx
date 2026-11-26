import {useEffect, useRef, useState} from 'react';
import {useCalendarDay} from './useCalendarDay.js';
import {observeVisibleMotion} from './visibleMotion.js';

const storageKey = 'rook.winter-arrival-day.v1';
let shownDay;

function claimWinterArrival(day) {
  if (shownDay === day) return false;
  try {
    if (localStorage.getItem(storageKey) === day) return false;
    localStorage.setItem(storageKey, day);
  } catch {
    // When storage is blocked, still avoid restarting within the open app.
  }
  shownDay = day;
  return true;
}

const flakes = [
  [14, 220, 2800], [27, 540, 2570], [40, 100, 3080], [55, 390, 2850],
  [67, 0, 3150], [79, 690, 2600], [91, 310, 3090],
];

export function SeasonArrival() {
  const day = useCalendarDay();
  const band = useRef(null);
  const [playingDay, setPlayingDay] = useState(null);
  useEffect(() => {
    const target = band.current;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const forced = window.matchMedia?.('(forced-colors: active)');
    let disconnect = () => {}, end;
    const sync = () => {
      disconnect();
      if (reduced?.matches || forced?.matches || document.visibilityState === 'hidden' || document.querySelector('.modal-layer')) {
        clearTimeout(end);
        setPlayingDay(null);
        return;
      }
      disconnect = observeVisibleMotion([target], () => {
        if (document.visibilityState === 'hidden' || document.querySelector('.modal-layer') || !claimWinterArrival(day)) return;
        setPlayingDay(day);
        end = setTimeout(() => setPlayingDay(null), 3500);
      });
    };
    sync();
    const modalLock = new MutationObserver(sync);
    modalLock.observe(document.body, { attributes: true, attributeFilter: ['style'] });
    document.addEventListener('visibilitychange', sync);
    reduced?.addEventListener?.('change', sync);
    forced?.addEventListener?.('change', sync);
    return () => {
      disconnect();
      clearTimeout(end);
      modalLock.disconnect();
      document.removeEventListener('visibilitychange', sync);
      reduced?.removeEventListener?.('change', sync);
      forced?.removeEventListener?.('change', sync);
    };
  }, [day]);
  return <div ref={band} className="season-arrival" aria-hidden="true">
    {playingDay === day && flakes.map(([left, delay, duration], index) =>
      <span key={index} style={{left: left + '%', animationDelay: delay + 'ms', animationDuration: duration + 'ms'}} />)}
  </div>;
}
