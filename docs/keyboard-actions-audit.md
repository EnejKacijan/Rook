# Form actions and the software keyboard

Audit: 2026-10-25. Local changes only. ChatGPT consultation used Chat mode and synthetic app descriptions; no account credentials or real workout data were sent.

## Policy

`SheetActionFooter` keeps the established closed-keyboard layout. During an actual software-keyboard viewport reduction, its default `keyboardBehavior="flow"` puts the same action into the existing form scroller. `pin-if-room` is explicit for short commit tasks; the active field, label and associated error take priority. Required space uses measured controls, line height, wrapping and footer height. A cramped viewport falls back to flow. Zoom alone does not activate this behavior.

Only explicitly marked, nonessential secondary footer actions are suppressed while typing; existing header Back/Close remains. Errors, disabled actions and essential choices stay available. Focusing Save retains the editing layout so the action does not expand before its click. Viewport changes, blur and keyboard dismissal do not submit, recreate inputs or change drafts.

## Coverage

| Entry flow | Keyboard behavior |
| --- | --- |
| Custom exercise name/details, exercise reminder | Pin if room; flow when cramped or a larger note/error needs the space. Delete/remove is available again after typing. |
| Body-weight check-in | Pin if room; native form submit and validation retained. |
| Saved workout name, rename, save a copy | Pin if room in the existing preview scroller; optional Edit action returns after keyboard closes. |
| Open-workout duration | Pin if room in its content scroller. Finish and Continue are distinct essential choices, both retained. |
| Plan editor, saved-workout exercise editor, workout preparation, adjustment review | Flow; optional footer Cancel hides while typing, header navigation remains. Pending target commits keep their existing semantics. |
| Import notes, import decisions and optional catalog matches | Flow. Decision actions now share the existing decision scroller instead of taking a permanent flex row from editing space. No change to matching, choices or save boundary. |
| Training restrictions, personal details, gym name/equipment, bar/plate setup, block name, history correction | Flow. Delete/cancel extras are marked only where a header exit exists. |
| Conditioning setup | Flow inside the existing body; one submit remains bound to the same form. |
| Onboarding, follow-up answers, scratch-plan naming, email sign-in/register/reset and add-password forms | Existing native page/form flow; no global keyboard lift and no new submit/blur handlers. |
| Exercise/saved-workout browsing and search | Existing explicit hide-while-searching; result Add/selection stays available. Import decisions with a real local confirmation use flow rather than hiding that choice. |
| Active workout set logging, advanced sets, optional-session values | Inline set/control actions stay inline; no global submit is added. |
| Coach | Existing viewport-aware composer/Send retained. |
| Backup/photo file pickers, theme selection, schedule/radio/checkbox-only reviews | No typing keyboard; existing action layout retained. |

## Layout and verification

Exercise notes, conditioning, workout-time recovery, and both import decision views keep their action in the same existing scroll area, allowing a real flow fallback. No second input tree, footer copy, or scroll wrapper is created. Nested-sheet focus cannot make the parent footer reveal a field.

Tests cover viewport reduction/pan/restore, short-task space fallback, errors and textarea room, stable input/caret/draft, zoom versus software keyboard, first action focus/click and default long-form flow. Existing form/import/logger/sheet regressions cover unchanged save and cancel semantics.

Browser checks use synthetic data at 393 px width and reduced visible heights (420 and 230 px). Custom exercise switches from pinned to flow as space shrinks and saves on the first click. The gym form flows without covering its field; secondary Delete returns on keyboard close. These are reduced desktop viewport checks, not a claim of physical iOS keyboard testing.

Final verification: 251 tests across 19 release test files passed; the mirrored local worktree passed 55 focused tests. Both production builds passed. Browser first-click checks succeeded for custom-exercise creation and saving a plan-workout copy. No runtime console errors were reported.
