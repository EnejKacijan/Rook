# Review only - never merge

`claude/seasonal-preview` combines every seasonal branch. The local integration branch
`codex/visual-v2-local-preview-2026-10-20` also retains the latest local workout and Coach
fixes. Set `VITE_ROOK_ALL_SEASONS=true` explicitly to review all seasons together.
These combined preview branches must never be merged into `main` or any
release branch. Release each season from its own `claude/seasonal-<id>` branch; see
`docs/seasonal-themes.md`.

```powershell
$env:VITE_ROOK_ALL_SEASONS="true"
npm run dev -- --host 0.0.0.0 --port 4400
# Profile -> Display -> Appearance -> Choose a theme -> Seasonal
```

Review on a local origin (http://127.0.0.1:4400), never the production origin.
Review builds intentionally bypass seasonal expiry. Production and individual season
builds restore the saved year-round palette at the next safe moment after expiry;
seasonal customizations survive, and last year's selection never reactivates itself.
