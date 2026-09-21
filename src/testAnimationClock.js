import {vi} from 'vitest';

// Sheet transitions schedule focus on the presentation frame after unmount.
// Vitest's default timer list does not fake RAF; keep frames and timers on one
// clock so these tests never depend on jsdom's real-time frame interval.
export function useAnimationClock() {
  vi.useFakeTimers({toFake:['Date','performance','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame']});
}
