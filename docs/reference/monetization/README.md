# Earlier ROOK Pro presentation: reference snapshot

These 16 files were copied on 3 November 2026 from the separate local Pro
review checkout. They were uncommitted there: checking out its branch alone
will not retrieve them. See `manifest.json` for their source paths, byte counts
and SHA-256 hashes for both the original and LF/whitespace-normalized reference.
Source checkout HEAD identifies context, not ownership of
these uncommitted blobs.

They are an earlier UI prototype, not the current free app, an approved price
list, verified current entitlements or a live checkout. Historical copy about
four free saved workouts, Coach quotas and paid features must not be imposed
on the current unrestricted app. Synthetic example prices are not approval to
launch those prices. Verify every feature and claim against the current code.

The `.reference` suffix prevents accidental inclusion in the Vite app or test
collection. No reference is imported by production code. This snapshot adds no
SDK, billing provider, account state, credentials, real user data or access gate.
The rest of the earlier App.jsx and its shared styles were deliberately omitted
because the current app has newer shared UI and functional fixes.

The supplied presentation closure contains the paywall, feature explorer,
current offers, campaign banner, training preview, associated pure pricing and
policy helpers, and their styles. Relative imports within the reference set are
preserved verbatim. Two shared dependencies are intentionally not duplicated:
`SheetActionFooter.jsx` should use the current shared component; `analytics.js`
should be replaced with a no-op in the isolated research preview. The paywall
also receives a Header and purchase/refresh callbacks from its caller.

To review the actual earlier UI, reconstruct a small isolated DEV harness from
these sources using current shared UI. Supply synthetic products, eligibility,
Header and explicit mock callbacks. Neither a sandbox claim nor a visible fake
purchase button authorizes contacting a real billing/restore endpoint. Label
synthetic product and outcome scenarios in the review controls. Do not insert
these modules into the free app's production import graph.

Use `docs/claude-paywall-landing-audit-nov3.md` for the current task, research,
implementation, screenshot coverage and handoff requirements. Keep this
snapshot immutable so before/after captures remain reproducible; put improved
working components and fixtures in a separate isolated review implementation.
