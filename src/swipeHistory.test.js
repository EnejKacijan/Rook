import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bindSwipeHistory, previousSurfaceSnapshot, surfaceSignature } from './swipeHistory.js';

let dispose;
beforeEach(() => {
  vi.stubGlobal('matchMedia', query => ({ matches: query.includes('coarse') }));
  document.body.innerHTML = '<div class="modal-layer"><main class="screen"><h1>Mode</h1><button>Less time</button></main></div>';
  for (const node of document.querySelectorAll('*')) { node.getAnimations = () => []; node.getBoundingClientRect = () => ({ left: 0, top: 300, width: 390, height: 400 }); }
  dispose = bindSwipeHistory(document, 'main.screen');
});
afterEach(() => { dispose(); document.body.innerHTML = ''; vi.unstubAllGlobals(); });
const main = () => document.querySelector('main');
// Stand-in for React: the click handler swaps the step after capture ran.
function step(title, back = 'Back') {
  main().innerHTML = `<h1>${title}</h1>${back ? `<button aria-label="${back}">‹</button>` : ''}<button>Next</button>`;
}

it('reveals the view a tap left, and nothing for a view reached without one', () => {
  expect(previousSurfaceSnapshot(main())).toBeNull();
  main().querySelector('button').click(); step('Time available');
  expect(surfaceSignature(main())).toBe('Time available|Back');
  expect(previousSurfaceSnapshot(main()).copy.querySelector('h1').textContent).toBe('Mode');
});
it('follows Back down a multi-level stack and forgets levels it left', () => {
  main().querySelector('button').click(); step('Time');
  main().querySelector('button:last-child').click(); step('Review');
  expect(previousSurfaceSnapshot(main()).copy.querySelector('h1').textContent).toBe('Time');
  main().querySelector('[aria-label="Back"]').click(); step('Time');
  expect(previousSurfaceSnapshot(main()).copy.querySelector('h1').textContent).toBe('Mode');
  main().querySelector('[aria-label="Back"]').click(); main().innerHTML = '<h1>Mode</h1><button>Less time</button>';
  expect(previousSurfaceSnapshot(main())).toBeNull();
});
it('taps that do not navigate keep one fresh copy of the view', () => {
  const button = main().querySelector('button');
  button.setAttribute('data-row-pressed', ''); button.click(); button.click(); step('Time');
  const copy = previousSurfaceSnapshot(main()).copy;
  expect(copy.querySelector('[data-row-pressed]')).toBeNull();
  main().querySelector('[aria-label="Back"]').click(); main().innerHTML = '<h1>Mode</h1>';
  expect(previousSurfaceSnapshot(main())).toBeNull();
});
it('records nothing on devices without touch', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  main().querySelector('button').click(); step('Time');
  expect(previousSurfaceSnapshot(main())).toBeNull();
});
