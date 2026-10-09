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
