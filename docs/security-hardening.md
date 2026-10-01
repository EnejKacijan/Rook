# AI and archive security hardening — October 1, 2026

Baseline: `ea9e98719f6810271e5d08418eb31462917daded`. This document describes the
reviewed non-monetization security changes and their operational prerequisites.
Do not infer deployment status from this source document; verify the published
Git commit and runtime response.

## Paid AI boundary

The Node server and Netlify function share the same guarded handler. AI is off
unless `ROOK_AI_ENABLED=true`, the ROOK server project is configured, server
credentials exist, and model price ceilings are supplied. A browser Firebase
API key is not a server credential. Missing/failed authorization or quota storage
never falls back to unrestricted provider access.

Requests carry a Firebase ID token for the active local-profile Auth client.
The Admin SDK verifies the token (including revocation/disabled-user checks) for
`rook-1d2c8`. Anonymous, unverified-email, invalid, expired and wrong-project
identities cannot use paid AI. Allowed sign-in providers are Google, password,
and Apple. The client does not create an identity or change local data merely
to obtain AI access. Profile/account changes during token refresh abort sending.

Shared Firestore transactions in the server-only `rookAiSecurity` collection
reserve **each actual provider call**, including plan review/repair and import
retries, before sending it. Existing Firestore rules have no client grant for this
collection. Two independent function instances cannot race past the limits.
Default limits:

| Limit | Default |
| --- | --- |
| User calls / minute, UTC day | 12, 60 |
| Global calls / minute, UTC day | 40, 500 |
| Concurrent provider calls / user, globally | 2, 8 |
| Global reserved spend / UTC day | USD 5 |
| Request body | 2 MiB |
| Text/schema/instructions sent upstream | 256 KiB |
| Output tokens, including reasoning | 12,000 |
| Provider response body | 1 MiB |

Spend is a conservative reservation, not a bill estimate or a paid product quota.
UTF-8 bytes plus framing bound text input tokens; low-detail images reserve 4096
tokens each. Output reserves the full hard token cap. Reservations are not
refunded after errors, retries, cancellation or successful completion. Leases
expire after 150 seconds and are released after the upstream body is read.

`ROOK_AI_MODEL_PRICES_JSON` is a server JSON map keyed by every configured model
name. Each value has positive numeric `input` and `output` prices in USD per
million tokens. Use verified current maximum/uncached prices for the actual
model, including image input and reasoning output. **There are deliberately no
guessed default prices.** Unlisted models cannot be called. Reverify the ceilings
whenever changing models/pricing, and configure provider-side project limits as
an additional boundary. The daily cutoff's monetary bound relies on correct
server price ceilings; it does not fetch billing totals from the provider.

Internal plan-review/repair operations are not public API operations. Input is
bounded by depth, collection sizes, and string sizes. Remote image URLs and
client-supplied expert policy/admin flags are rejected or removed. The existing
local expert review mode is preserved only for a verified admin while local
Expert Lab is enabled; clients cannot supply the policy itself. Provider,
credential and quota-store diagnostics are not echoed to clients.

App Check verification can be required with `ROOK_AI_REQUIRE_APP_CHECK=true`.
The browser App Check integration is not configured by this pass, so keep that
flag false until a separately verified integration supplies tokens. App Check
would supplement, not replace, identity/quota enforcement.

### Prerequisites for enabling paid AI (not performed by this code release)

1. Provision a dedicated server credential with the necessary Auth-read and
   Firestore-transaction permissions. Use ADC where supported, or Netlify's
   server/runtime secret `ROOK_FIREBASE_SERVICE_ACCOUNT_JSON`. Never place it in
   `VITE_*`, frontend files, Git, or screenshots.
2. Verify the deployed Firestore rules deny client access to `rookAiSecurity`.
3. Fill every model's current price ceiling and choose the permitted daily budget.
4. Verify valid/revoked/anonymous tokens and transactional limits against the real
   project with isolated test identities, including two concurrent instances.
5. Only then enable AI. Missing prerequisites
   deliberately keep AI unavailable while local training continues to work.

Publishing this guarded handler closes the previous unauthenticated provider
path even without credentials/quota configuration. Deployment does not itself
enable AI, configure the Firebase server identity, or change account access.

## Expert Lab and import ownership

Expert Lab is always disabled by the trusted Netlify adapter and when
`NODE_ENV=production` or Netlify is detected, even if the enable flag is
accidentally set or hosting environment labels are absent. In local environments both dataset
status and feedback writes require verified `rookAdmin=true` custom claims.
Feedback always enters as `pending`; only explicit `approved` entries may supply
examples, policy, or candidate signatures. Legacy entries without status are not
implicitly trusted. Expert policy is opt-in. No public approval endpoint exists.

Import in-flight deduplication uses a hash of verified UID, attempt ID, and
canonically ordered payload. Different users or payloads never share a result.
This remains an ephemeral optimization, not durable source/result storage.

## Archive handling

Backup ZIP import uses a dedicated Worker; historical XLSX import reuses the
same decoder within its existing worker. Limits are checked before expansion
and against actual streamed output. Claimed ZIP sizes alone are not trusted.

Backup limits: 100 MiB compressed, 256 MiB expanded in aggregate, 64 MiB per
entry, 2048 entries, and a 30-second worker time limit. Backup creation uses the
same limits so it cannot return an archive that the new reader will reject for
size. Valid existing 1200-workout backup fixtures remain supported.

Historical XLSX retains its 25 MiB compressed / 64 MiB expanded limits and gains
an entry-count cap. ZIP64, encrypted archives, unsupported compression methods,
duplicate/unsafe names, overlapping entry ranges, CRC errors, and mismatched
actual sizes are rejected. ZIP64 cannot fit these local limits anyway.
No validation failure writes or clears current ROOK data.

## Dependencies and repository settings

Firebase Admin is an explicit server dependency (`13.10.0`, Node >=18).
The existing vulnerable gRPC and UUID transitive dependencies are pinned to
patched `@grpc/grpc-js@1.14.5` and `uuid@11.1.1` without downgrading Firebase.
`npm audit --omit=dev` reports zero vulnerabilities.

The full audit retains three moderate package alerts, all the same
OpenTelemetry issue inherited through development-only `firebase-tools` ->
`@google-cloud/pubsub` -> `@opentelemetry/core@1.30.1`.
No patched 1.x version exists at review time. The suggested automatic resolution
downgrades Firebase CLI; overriding to the incompatible 2.x major was not done.
Do not run CLI against untrusted remote inputs until an upstream-compatible
update is available. These packages are not part of the production function's
dependency graph.

Read-only GitHub API inspection confirmed `main.protected=false`, zero rulesets,
and main still at the baseline SHA. No GitHub access settings were changed.
A `security-regression` GitHub Actions check accompanies this code:
read-only permissions, pinned action commits, no persisted checkout credentials,
no production secrets, production-dependency audit, full tests, build and diff
check. After publication it can become the required main-branch status check.
Branch protection, required checks, secret push protection, collaborator review,
and owner passkey/2FA remain account/repository configuration work. Making the
repository private is not an API-authentication fix.

References: [Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[Admin SDK credentials](https://firebase.google.com/docs/admin/setup),
[gRPC advisory](https://github.com/advisories/GHSA-m9gg-hp2v-232j),
[UUID advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq),
[OpenTelemetry advisory](https://github.com/advisories/GHSA-8988-4f7v-96qf).

## Verification performed locally

- Complete release gate including the final explicit hosting guard: 291 files
  passed, 1 skipped; 4738 tests passed,
  8 skipped. The skips are explicit existing integration/device criteria, not
  failed tests. All 102 focused security/API tests across 7 files also passed.
- Domain gate: 203 tests passed. Production build and `git diff --check` passed.
- Chrome and WebKit: real backup worker round trip, ZIP-bomb rejection, no
  local-storage changes, CSV read, and real historical-import worker XLSX read.
  Unauthorized AI requests were rejected without paid provider calls.
- Latest bounded UI corrections: 48 Chrome/WebKit flows passed across
  320/390/430, short/tall viewports, all four themes, and reduced motion.
- Built-app rehearsal: 26 Chrome/WebKit first-launch and old-state/reload
  cases passed, including 12 raw prior-production fixtures per engine.
  Synthetic local browser contexts block Firebase writes/identity creation.
- Existing backup/restore browser QA: full data/photo round trip, corruption
  rejection, rollback-safe preview, mobile layouts and all four themes passed.
- Account/profile browser QA: 17 Chrome cases passed, including identity
  isolation and authentication/network failures. Provider identity was mocked.
- Shared quota tests use an atomic transactional double shared by independent
  guards; live Firebase Admin identity/revocation and real Firestore multi-instance
  verification remain deployment prerequisites. No physical iPhone security
  verification or production exploit attempt was performed.
- Firebase CLI still launches with the patched dependencies. Production-only
  dependency audit: zero vulnerabilities; full audit: three moderate tooling
  alerts described above.
- Local HEAD and read-only remote main inspection remain at `ea9e987`.
  The original local review did not stage, commit, push, deploy, or change the
  Pro/Capacitor worktrees. The owner subsequently authorized this code release;
  those feature worktrees remain excluded.
