# Full-width swipe Back

Back is a drag that can start anywhere on a screen, not only within 24 px of the left edge. The page follows the finger, and release decides by distance or speed. This matches current iOS navigation and apps such as Spotify.

## Where it works

Every surface that `useSemanticSwipeBack` already serves: any page or sheet step with a visible, enabled button whose label starts with "Back". The swipe still clicks that same button, so unsaved-change guards, focus and state handling stay in one place.

| Start point | Installed PWA / iOS app | Browser tab |
| --- | --- | --- |
| Left 24 px | Back | Left to the browser's own history gesture |
| Anywhere else | Back | Back |

The iOS app (Capacitor) now counts as installed. WKWebView sets neither `navigator.standalone` nor `display-mode: standalone`, so swipe Back was off in the app before.

## Where it stays edge-only

A mid-screen start yields when the finger lands on something that owns a horizontal drag:

- the active workout logger (`data-active-workout`): dense set controls, keep edge-only;
- pagers and viewers marked `data-horizontal-gesture` (week strip, month calendar, photo pager, photo comparison, year in review);
- Add rows in a `data-swipe-mode="add"` list (they swipe right). Remove rows swipe left and do not conflict;
- reorder handles, steppers, sliders, switches, tab lists, inputs, `draggable` nodes;
- any element that scrolls sideways;
- `data-no-edge-back` or `data-swipe-back-edge-only` opt-outs.

Buttons and links are fine starting points mid-screen: a recognized drag suppresses the click.

## Thresholds

Intent is unchanged: more than 10 px right and 1.4× more horizontal than vertical. A start mid-screen has less room, so the distance needed is `min(33% of width, max(56 px, 45% of the run left to the right edge))`. A fast flick (≥ 56 px at ≥ 0.65 px/ms) always commits.

## What the finger reveals

- Profile, Coach, plan editor, workout and questionnaire keep their existing previews.
- Other pages and sheet steps show the view a tap left, from `swipeHistory.js`. On touch devices, a tap on a non-Back control inside a Back surface keeps an inert DOM copy of that surface (memory only, max 12 per stack, max 1,600 nodes). Back pops the stack. Sheets keep their own stack, so an in-sheet step reveals the previous step clipped to the sheet.
- A sheet with no earlier step (its Back closes it) slides sideways over the page and the scrim fades. After commit it stays hidden while the sheet's own close runs, so it never jumps back first.
- The moving page casts a soft edge shadow. Reduced motion skips all motion; the gesture still works.

## Haptics

`triggerHaptic` used only the Vibration API, which iOS lacks, so the iOS app was silent. It now uses Capacitor Haptics there: a light impact for taps and the system success pattern for saves and finished sets or workouts. The web keeps the same vibration patterns.

## Tests

- `src/edgeBack.test.js`, `src/useSemanticSwipeBack.test.js`, `src/swipeHistory.test.js`, `src/swipePageMotion.test.js`, `src/interactionFeedback.test.js`, `src/FirstRunNavigation.test.jsx`.
- `npm run qa:full-width-swipe-back`: Chromium CDP touch at 320 and 393 px, light and dark. Set `ROOK_CHROME` to a Chromium path where Chrome is not installed.

Not checked on a physical iPhone. Chromium touch emulation is not Safari or WKWebView.
