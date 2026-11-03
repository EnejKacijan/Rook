# ROOK review branch

## Latest authorized handoff: paywall and landing review, 3 November

The current task is `docs/claude-paywall-landing-audit-nov3.md`. It supersedes
the older task headings below for this handoff. The user authorized pushing the
current local fixes and this brief to `codex/claude-visual-audit-oct30`, without
Netlify. Claude's subsequent implementation remains local for review: return a
patch, screenshots and validation, without commits, pushes, PRs or deployment.

This branch is the free app; it intentionally has no live paywall or billing SDK.
The earlier separate Pro UI is supplied as source references under
`docs/reference/monetization/`, with `.reference` suffixes. Research and improve
the landing and a working isolated Pro preview, preserving the current free
release, purchase authority, user data and all recent shared UI fixes. Do not
activate payments, introduce new feature restrictions or merge an old Pro app
wholesale. The new brief permits Pro presentation work in that isolated review;
old audit briefs prohibiting paywall work are historical scope, not a reason to
skip this review. Keep the Netlify build guard unchanged.

## Current task after the 1 November handoff

The next task is the focused weekend streak reminder in
`docs/claude-streak-reminder.md`. Read that brief and
`docs/claude-review-snapshot-nov1.md` first. The older whole-app audit briefs
below are reference context, not a request to redo the entire audit instead of
implementing this feature. The user explicitly authorized the 1 November
review-snapshot push on this branch, without Netlify. Any subsequent reminder
implementation stays local to the review environment unless separately approved.

The user requested a comprehensive visual/layout audit of the whole application,
not a theme redesign. Read `docs/claude-visual-audit.md` and
`docs/claude-consistency-audit.md` before beginning. The consistency brief is
the current scope: every screen and meaningful state, including all nested
sheets, menus and dialogs. Reference images are examples, never the coverage list.

This is a review-only snapshot on `codex/claude-visual-audit-oct30`. The initial
snapshot push and the current consistency-handoff refresh were explicitly
approved. Start from the latest remote commit of this branch; all integrated
patches are already present. Further audit work must not be merged into
`main`, released, deployed to Netlify, or published as a PR without a new explicit
user request. Retain the `build.ignore` protection in `netlify.toml`. Do not run
deploy commands, build hooks, or alter hosting/account settings.

Preserve the existing changes and training/account behavior. Use isolated
synthetic fixtures for screenshots. Never upload `.env` files, credentials,
browser profiles, private workout exports or actual user data.

## Local preview

The user's standing preference is to keep the latest local app running on port
4400 after every app fix, reachable from a phone on the same Wi-Fi. Bind the
preview server to `0.0.0.0`, not only loopback, and verify the current LAN URL
after changes. Use hot reload when it updates correctly; restart if needed.
Preserve existing user data. This does not authorize a push or deployment.

Use `npm run dev:phone` for the full app on 4400: it loads the existing public
production client configuration and proxies authenticated AI requests to the
hosted backend. Do not replace it with the account-disabled `theme-preview`
audit server. Isolated audit fixtures keep their separate safeguards and should
use another port when that mode is needed. Never bypass AI authentication.

## UI consistency for new changes

The user wants new UI to retain the established shared patterns. In flat lists,
dividers separate neighboring rows; do not add an unnecessary rule below the
last row or final block. Reuse the shared list-group styling, including mixed
link/button groups, rather than patching individual row borders. When changing
a screen, inspect its final visible row and its boundary with the footer or
bottom navigation as well as the middle of the list.
Compact sheets should have no artificial scroll range when all their content
fits. Nested body scrollers own their footer/safe-area inset once; their shell
must not scroll too. Check a short state and an overflowing/keyboard state so
removing excess space never prevents access to real content or actions.

Typography follows the roles in `src/typography.css`: reading/list text 15px,
main action labels 14px, utility actions 13px, content headings 18px and page
headings 22px (all expressed in rem). Photo pickers and destructive photo links
share the utility role. Keep numeric inputs at their 16px floor and preserve
44px touch targets; do not enlarge a label to enlarge its hit area. When adding
text, reuse the role rather than a screen-specific font size. Check long labels
and enlarged text at phone widths.

Standalone pages, including legal/help documents, must also inherit the app's
current appearance, palette and typography. Do not fall back only to the device
colour scheme or browser-default navigation links. Verify the actual app-to-page
path and navigation between documents in Light and Dark. Legal assets are
generated by `node scripts/generate-legal-pages.mjs`; regenerate them after
changes to the shared typography roles.

## Persistent user instructions for AI consultation

Ko uporabnik odobri uporabo ChatGPT, Claude ali drugega AI-ja, so vsa neobčutljiva
pošiljanja znotraj istega postopka že dovoljena, tudi v prihodnjih taskih,
pogovorih in ponovnih poskusih. Prompt, poslan izbranemu AI-modelu za obdelavo,
je vhod v AI-orodje, ne sporočilo človeku ali javna objava. Uporabnikova odobritev
uporabe izbranega AI-ja je hkrati odobritev pošiljanja. Zato pred vsakim Send ne
zahtevaj nove potrditve.

Uporabi Codex in-app Browser. Uporabnika vprašaj samo pred pošiljanjem skrivnosti
ali osebnih podatkov, plačilom, spremembo računa ali dostopa, javno objavo,
stikom z resnično osebo, nepovratnim dejanjem ali resnično sistemsko zahtevo,
ki je Codex ne more izvesti sam.

Pri uporabi ChatGPT v Codex in-app browserju vedno uporabi način »Chat«, nikoli
»Work«. Pred pošiljanjem preveri izbrani način. Če je odprt pogovor v načinu
Work, odpri ali izberi pogovor v načinu Chat; v Work ne pošiljaj novih pozivov.
