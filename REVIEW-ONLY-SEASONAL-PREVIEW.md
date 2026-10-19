# Review only - never merge

`claude/seasonal-preview` combines every seasonal branch and lists all seasons regardless
of date, so they can be reviewed together. It must never be merged into `main` or any
release branch. Release each season from its own `claude/seasonal-<id>` branch; see
`docs/seasonal-themes.md`.

```sh
npm install
npm run build
npm run preview   # Profile -> Display -> Appearance -> Choose a theme -> Seasonal
```
