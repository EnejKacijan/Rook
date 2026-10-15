# Free-access release — 2026-10-09

This release includes the current training, logger, exercise-picker, interaction,
navigation, completion, conditioning, scheduling, illustration and theme work.
All application features are available without a subscription. Personal Themes
and Fine-tune open directly; temporary plans and saved workouts do not require
an entitlement. Repeated plan acceptance does not claim a local Free allowance.

The release contains no paywall component, store products, RevenueCat adapter,
trial configuration, subscription rollout, simulated checkout or local Pro tools.
The billing work remains unchanged in the separate local review worktree. The
native review-only Xcode project is also kept there, rather than being released
as a production iOS application.
Icon/splash bitmaps are retained under `assets/native-visual-provenance` so the
existing visual inventory remains complete, without shipping the native project
configuration. Inline SVG evidence was checked for identical geometry after
line-ending normalization; exercise artwork and attribution are unchanged.
SVG verification retains the original evidence digests and also checks an
LF-normalized digest for Git's Windows/Linux checkout translation. No other
text, geometry, color or raster-byte differences are accepted.

`PersonalThemesContext` owns staged appearance previews and persisted theme
preferences only. It does not report a fabricated active subscription. Existing
theme preference storage and migration are retained. Apply writes first; failed
writes keep the draft open. Cancel, dismissal and Back restore the committed
colors, including while a workout or input remains mounted.

The existing server AI authentication, rate limits and budget controls remain
unchanged. Application feature access does not disable those controls or promise
unlimited provider calls. Account sync and training records retain their current
contracts. Existing local import review is an import feature, not a paywall mode.

Previous-production fixtures still compare every prescription, ID and history
field. Only explicit neutral defaults and current derived duration estimates
differ; recorded workout elapsed times and the original archive bytes remain
unchanged. The compressed-plan validator now requires a net increase in the
deficient muscle's credited volume before declaring coverage feasible. An
equal-credit set transfer cannot resolve a deficit.

Release checks include the full unit/component suite, the free-access regression
tests, production build, checkout/preview bundle inspection, mobile theme checks
at 320/390/430, and verification that the source worktree was not changed.

Validation: 5,674 distinct tests passed; eight environment-dependent tests were
skipped. The four-worker matrix had one timeout in the 1,200-workout backup
case; all 31 backup tests then passed in the serial release configuration.
Production build and staged diff checks passed; production dependency audit
reported zero vulnerabilities. All 309 captured original-worktree file hashes
and its HEAD stayed identical.

## Final UX follow-up — 2026-10-15

The current quality worktree is the release source. This follow-up includes the
approved logger/history, photo pager, equipment, completion, Profile, appearance
and schedule-recovery fixes recorded in the quality audit, plus the subsequent
physical-review corrections. Profile has one Settings group with the same four
destinations. Superset rest guidance respects the rest-timer preference. Closed
past schedule changes remain inspectable without blocking the current week.

The final rendered pass also reproduced previous-values Undo expiring while its
button held keyboard focus. Its existing five-second window now pauses while
focus remains in the confirmation/Undo control, then resumes with the remaining
time when focus leaves. Editing or logging the target, changing the exercise or
leaving the session still invalidates Undo through the existing domain guards.
No workout values, history, progression or persistence rules were changed.

The Profile browser-check contract follows the current Settings/Display routes.
The release still contains no paywall, purchase adapter, subscription gate,
trial configuration or simulated checkout. AI authentication, quotas, provider
budget and Account Sync rollout/security controls remain unchanged. Browser
checks use isolated synthetic data; physical iPhone verification is not claimed.

The Linux release check exposed four inline SVG evidence hashes captured with
Windows newlines. Integrity matching now checks the exact LF and CRLF variants
in both checkout directions and consumes one evidence record per renderer.
Geometry, colors, other whitespace, paths and renderer counts remain strict.
The original manifest, artwork and runtime SVG source are unchanged.
