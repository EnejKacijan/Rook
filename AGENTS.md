# ROOK review branch

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
