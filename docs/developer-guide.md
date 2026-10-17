# Developer guide

## Architecture

A static, local-first web app. There is no server code.

```
src/
  lib/           Pure logic and state
    types.ts       The data model (see data-schema.md)
    dates.ts       ISO date maths in UTC, loose date parsing for imports
    climate.ts     Frost occurrences, protection shifts, re-anchoring, day length
    resolve.ts     Crop timing rules → real date windows for a place and season
    plantings.ts   Successions, occupancy, per-month state of areas
    capacity.ts    Area maths and how many plants fit
    checks.ts      Conflict, capacity, end-date, climate, rotation, crossing and module checks
    tasks.ts       Tasks generated from plantings, recurring tasks
    monthview.ts   What each area shows in a month
    seedImport.ts  Column guessing, matching and suggestions for spreadsheet import
    sheets.ts      CSV and XLSX reading (no libraries; XLSX via DecompressionStream)
    store.svelte.ts  The app state (Svelte 5 runes), undo, saving
    db.ts          IndexedDB persistence
    backup.ts      Backup format and schema migrations
  components/    Svelte components (PlanSvg draws every plan)
  views/         One per screen
  i18n/          Message files, one per language
  sw.js          Service worker template (precache list filled in at build)
crops/           The crop library, one JSON file per crop (CC0)
schema/          JSON Schema for crop files
tests/           Vitest tests
```

**Principles in the code:**

- Everything hangs off **plantings**. The month view, tasks and checks are all derived from plantings and never stored separately. Only task completion state is stored.
- **Dates are stored as ISO dates** but treated as belonging to their nearest local frost event. Changing frost dates, hemisphere or protection re-anchors every planned date (`climate.ts: reanchorDate`), so plans move with the season.
- Rules are **pure functions** with tests. The UI does no date maths of its own.
- **Measurements are metric** in storage and converted for display.
- All text goes through `t()` (`lib/i18n.ts`).

## Running locally

```sh
npm install
npm run dev        # dev server
npm test           # unit tests (vitest)
npm run check      # svelte-check types
npm run build      # validate crops, then build to dist/
npm run preview    # serve dist/ (service worker active)
```

## Self-hosting

`npm run build` produces `dist/`, a folder of static files. Serve it from anywhere. All paths are relative, so a subfolder works too.

### GitHub Pages (free, no secrets)

1. Fork this repository.
2. In your fork: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions → Enable workflows** if GitHub asks.
4. Push to `main`, or run the **Pages** workflow by hand. Your copy is published at `https://<you>.github.io/plot-planner/`.

The same build works on Codeberg Pages, Netlify and Cloudflare Pages: build command `npm run build`, output folder `dist`.

### Your own server with nginx (how plot.tomlo.ng runs)

The reference setup in [`deploy/`](../deploy/) deploys on every merge to `main` with no CI secrets:

1. A GitHub push webhook calls `https://<your-domain>/hooks/deploy`.
2. nginx passes only that path to the [`webhook`](https://github.com/adnanh/webhook) service on localhost. The service checks the HMAC signature and that the push is to `refs/heads/main`.
3. [`deploy/deploy.sh`](../deploy/deploy.sh) fetches `main`, runs the tests, builds into `releases/<commit>`, and swaps a `current` symlink atomically. A failed test or build leaves the live site untouched. The last five releases are kept for rollback.

Files: `deploy/nginx.conf`, `deploy/hooks.json.example`, `deploy/plot-planner-webhook.service`, `deploy/deploy.sh`, `deploy/trigger.sh`. TLS comes from Let's Encrypt via certbot.

To roll back, point `current` at an older release: `ln -sfn releases/<sha> current.tmp && mv -T current.tmp current`.

### Caching

`index.html`, `sw.js` and `manifest.json` must be revalidated (`Cache-Control: no-cache`). Everything in `assets/` is content-hashed and can be cached forever.

## Content Security Policy

The app needs only `'self'`, plus `'unsafe-inline'` for styles, because Svelte sets some inline styles. Optional online lookups (a later phase) use `api.open-meteo.com` and `geocoding-api.open-meteo.com`, and only when the user asks. See `deploy/nginx.conf`.

## Data and migrations

The backup format is described in [data-schema.md](data-schema.md). When you change stored data, increase `SCHEMA_VERSION` in `types.ts` and add a migration to `MIGRATIONS` in `backup.ts`. Never edit an existing migration.
