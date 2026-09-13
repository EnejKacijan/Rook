# Managed navigation focus — iOS/PWA ring review

## Observed state before changes

Instrumented actual ROOK Program and Training block flows in Chromium and WebKit
26.5, with touch viewport input and both browser/standalone configuration.
Logged `activeElement`, `:focus`, `:focus-visible`, computed outline, focus calls
and their stacks/options, scroll, visibility and page lifecycle events.

Program's Back is focused by Profile's area `useLayoutEffect`. Training block's
X is focused by ModalLayer's initial-focus animation frame. Both were genuinely
focused (`:focus=true`) after touch, but `:focus-visible=false`, with no outline.
Real Tab navigation produced `:focus-visible=true` and a themed solid outline.
The local page-switch/lifecycle probes did not reproduce the owner's intermittent
physical-iPhone foreground reclassification. Standalone configuration here is
not an installed iOS PWA. This distinction must remain explicit in the report.

The rectangular ink is an existing native-pseudo-class style, not a custom focused
class: the general `styles.css` control `:focus-visible` rule, shared modal close
rule in `overrides.css`, and dark-theme rule in `theme.css`. There is no generic
button `:focus` green-outline rule to migrate. No app resume handler was found
that intentionally adds a focused class or focuses these two controls.

## Bounded protection

`navigationFocus.js` records input origin and exposes `focusNavigationTarget`.
Only a managed focus call following explicit pointer/touch activation marks an
action element with `data-rook-pointer-focus`. Native DOM focus, tab order,
handlers, aria labels and inert/focus traps are retained. Calls use
`preventScroll:true`; no arbitrary blur or delayed focus reset is introduced.

The marker applies only to that action, not a global pointer-mode class. A real
keyboard key clears it before keyboard navigation proceeds. Modifier-only
app-switch keys do not invent in-app keyboard navigation. A zero-detail virtual
activation or independent external focus does not inherit stale pointer intent.
These are conservative event rules, not VoiceOver detection. Form fields are not
marked, and forced-color accessibility is not suppressed.

There is no visibility/pageshow timeout. The managed-focus origin survives app
suspension without changing page/draft state or refocusing. A CSS rule suppresses
only the marked action's `:focus-visible` outline, so a subsequently stale UA
focus-visible flag cannot turn that known touch-origin restoration into a ring.
Unknown/keyboard/native unmarked focus still uses the original theme rules.

## Shared owners audited

| Owner / control | Handling |
| --- | --- |
| Profile Program / Preferences / Training / Data Back and return entry | Shared managed helper |
| ModalLayer initial button / close and restored trigger | Shared managed helper; same element selection and trap |
| Fullscreen Edit Plan Back | Shared managed helper; draft/discard guards unchanged |
| Nested workout-copy Back / return trigger | Shared managed helper |
| Expanded exercise viewer return target | Shared managed helper; original return ID retained |
| Private workout-photo viewer close | Shared managed helper; existing Escape behavior retained |
| Coach history Back / initial menu control | Shared managed helper; no composer changes |
| Overflow and primary buttons inside sheets | Covered when chosen by shared initial/return focus; otherwise native |
| Search clear button | Native focus-visible retained; its existing input-focus behavior unchanged |
| Textareas, search, number inputs, selects | No marker or CSS changes |
| Calendar roving focus / keyboard focus traps / heading announcements | Existing native behavior; not converted to quiet touch focus |

## Browser semantics references

The [Selectors focus-visible guidance](https://www.w3.org/TR/selectors-4/#the-focus-visible-pseudo)
describes input-dependent indication and inherited indication when script moves
focus. [WebKit's focus-visible explanation](https://webkit.org/blog/12179/the-focus-indicated-pseudo-class-focus-visible/)
confirms the distinction from simply being focused. A
[historical WebKit double-script-focus defect](https://bugs.webkit.org/show_bug.cgi?id=239472)
shows this class of heuristic issue, but was fixed in 2022: it is **not evidence**
that the owner's current iOS installation has that exact old bug.

## Evidence and limitation

Before instrumentation and final QA artifacts live in
`artifacts/ROOK-BASELINE-CORRECTION-REVIEW/pwa-focus-ring/`.
Chromium controlled fault injection forces `focus-visible` on the actual
touch-focused Back: removing the guard exposes the original green/gold rectangle,
and restoring it keeps focus without the ring. This is a fallback-mechanism test,
not a claim of native iPhone reproduction. Physical iPhone background/foreground,
hardware keyboard, VoiceOver and owner Safari/PWA versions still need owner QA.
