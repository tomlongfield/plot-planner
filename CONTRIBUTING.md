# Contributing

Thanks for helping. There are three easy ways in, and none of them need much code.

## Add or correct a crop

The crop library is one JSON file per crop in [`crops/`](crops/). Every file is checked against [`schema/crop.schema.json`](schema/crop.schema.json) on each pull request.

1. Copy a similar crop's file, for example `crops/lettuce.json`, to `crops/<your-crop-id>.json`. The id is lower case with hyphens and must match the file name.
2. Edit the values. Timings are **offsets in days from local frost dates**, never calendar months, so one file works everywhere:
   - `{ "kind": "sowIndoor", "anchor": "lastFrost", "fromOffsetDays": -56, "toOffsetDays": -42 }` means 8 to 6 weeks before the last frost.
   - `toAnchor` lets a window run between two events, for example from 2 weeks before last frost (`anchor: lastFrost, fromOffsetDays: -14`) until 10 weeks before first frost (`toAnchor: firstFrost, toOffsetDays: -70`).
   - `kind` is one of `sowIndoor`, `sowOutdoor`, `plantOut`, `overwinter` (autumn sowing or planting) and `harvest`.
   - If there's a `sowIndoor` rule, give `moduleDays`, the days from sowing to planting out.
3. Varieties go in `varieties`, with ids of the form `<crop-id>--<variety-id>`. A variety can override any crop value in `overrides`.
4. Say where your values come from in `sources`.
5. Run `npm run validate:crops` if you can, or let the checks on your pull request do it.

Not comfortable with a pull request? [Open a crop issue](https://github.com/tomlongfield/plot-planner/issues/new?template=crop.yml) instead. In the app, Crops → a crop → **Save as file** gives you a file to attach.

## Translate

Each language is one file in [`src/i18n/`](src/i18n/), named by language code (`de.json`, `pt-BR.json`). French (`fr.json`) is a complete example. Copy `en.json`, translate the values (not the keys), and keep `{placeholders}` as they are. Keys ending `.one` and `.other` are plural forms. Missing keys fall back to English, so a partial translation is still useful.

Crop names can be translated in each crop file under `names`, for example `"fr": ["Ail"]`. Descriptive variety names (not cultivar names) can be translated under the variety's `names`, for example `"names": { "fr": "Ail tendre (sans hampe)" }`. A test checks that every translation uses the same `{placeholders}` as English.

## Code

```sh
npm install
npm run dev
npm test
npm run check   # types
```

- The rules (dates, capacity, checks, tasks) are pure functions in `src/lib/` with tests in `tests/`. Please add a test with any change to them.
- All visible text goes through `t()` and lives in `src/i18n/en.json`. A test fails if a key is missing.
- Keep dependencies few. Nothing that needs a server, an account or an API key.
- No analytics, tracking or third-party requests.

Bigger changes: open an issue first so we can agree the approach.

## Conduct

Please follow the [code of conduct](CODE_OF_CONDUCT.md).
