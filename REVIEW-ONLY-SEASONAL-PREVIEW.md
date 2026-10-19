# Review only - never merge

`claude/seasonal-preview` combines every seasonal branch and lists all seasons regardless
of date, so they can be reviewed together. It must never be merged into `main` or any
release branch. Release each season from its own `claude/seasonal-<id>` branch; see
`docs/seasonal-themes.md`.

```sh
npm install
npm run build
npm run preview -- --port 4398   # Profile -> Display -> Appearance -> Choose a theme -> Seasonal
```

Review on a separate local origin (http://127.0.0.1:4398), never the production origin.
Review builds intentionally bypass seasonal expiry. Production and individual season
builds restore the saved year-round palette at the next safe moment after expiry;
seasonal customizations survive, and last year's selection never reactivates itself.
