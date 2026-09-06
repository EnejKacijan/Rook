# Today day-header alignment — 2026-09-06

1. **Change:** Planned, completed and currently active workout content directly below the calendar now uses the same date/REST DAY + ADJUST WEEK vertical position as the existing Rest day state. The workout hero moves up 12 CSS pixels; Rest day does not move.
2. **Cause/architecture:** Both sections already share a 28px section margin. The workout hero additionally had 12px mobile top padding. One scoped adjacency selector removes that duplicate padding only when the calendar immediately precedes the hero. Intervening notices keep their existing spacing. No negative margins, transforms, theme-specific offsets or new DOM are used.
3. **Files:** `src/calendar.css` (one production rule), `scripts/today-day-header-qa.mjs` (new regression/capture script), `scripts/rest-day-qa.mjs` (one stale date selector updated to the existing shared header), this report. Existing unrelated worktree changes are preserved.
4. **Durable state:** None. No product/domain behavior changes.
5. **Backup & Restore:** Unchanged; this is CSS-only production work.
6. **Tests:** Full suite 914 passed / 40 test files. New runtime matrix checks 50 states: 4 main states × 3 widths × 4 themes, plus two intervening active-notice cases. Left-label and Adjust Week Y positions match exactly across equivalent main states. Calendar/navigation rectangles, title height, inner title spacing and original Rest day/notice positions compare unchanged with before captures. Adjust Week still opens its existing sheet with a >=44px target.
7. **Build:** Production build and `git diff --check` passed; existing Vite >500 kB chunk warning and Git LF/CRLF notices remain. No commit or push.
8. **Runtime:** New day-header matrix, Planned Today and Rest-day regressions passed. Rest-day regression's old `.today-hero > .eyebrow` selector was updated to `.today-hero .today-day-header > .eyebrow`; the expected date assertion is unchanged. This corrects tooling for the already-existing header wrapper, not product behavior.
9. **Screenshots:** `artifacts/today-day-header/` contains 50 before and 50 after screenshots plus geometry JSON. All main states were captured at 320/390/430px in Light, Dark, Premium Light and Premium Dark, including a long program title that wraps at 320px.
10. **ChatGPT loop:** Two exchanges in the in-app browser with the visible 5.6 Extra High setting: original screenshot consultation, then 14 updated runtime screenshots after implementing the recommendation.
11. **Advice implemented:** Keep Rest day as the anchor; remove only the extra normal-hero padding; preserve notice-specific spacing and internal hero styling. No subsequent visual changes were requested.
12. **Approval:** ChatGPT returned **APPROVED — no meaningful visual/UX issues remain.** Conversation: https://chatgpt.com/c/6a9ca0a0-dfb8-83eb-a77b-312ffbe41844 . No anti-oscillation stop needed.
13. **Manual limits:** Physical iPhone / installed-PWA verification was not performed. Screenshots and browser geometry are Chromium evidence, not physical-device evidence.
14. **Scope preserved:** No title resizing, calendar changes, theme changes, active logging geometry changes, new controls, data edits, navigation changes or notice-spacing redesign.

Run the regression with `node scripts/today-day-header-qa.mjs`. It runs without a baseline file; when `artifacts/today-day-header/before.json` exists, it additionally compares preserved geometry. To capture a pre-change baseline, run the old production build with `ROOK_QA_PHASE=before` first.
