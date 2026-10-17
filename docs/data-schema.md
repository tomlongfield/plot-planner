# Data schema

The plot planner stores everything in the browser and saves backups as a single JSON file. This page documents that file so other tools can read and write it. The TypeScript source of truth is [`src/lib/types.ts`](../src/lib/types.ts).

## Conventions

- **Dates** are ISO `YYYY-MM-DD` strings. Frost dates are `MM-DD`.
- **Measurements** are metric: metres for layout, centimetres for spacing, grams for weights, litres for volumes.
- **Ids** are strings, unique within their collection. Library variety ids are `<crop-id>--<variety-id>`.
- **Coordinates** are metres from the plot's top-left corner as drawn. `x` runs left to right across `widthM`, and `y` runs top to bottom along `lengthM`. `topDirection` says which compass direction is at the top. Coordinates never need rotating.
- A **window** is `{ "from": date, "to": date }`, inclusive.

## Backup file

```json
{
  "format": "plot-planner-backup",
  "schemaVersion": 1,
  "exportedAt": "2026-10-17T20:00:00.000Z",
  "sites": [], "plots": [], "features": [], "areas": [],
  "plantings": [], "tasks": [], "taskStates": [],
  "stock": [], "cropOverrides": [], "varieties": [],
  "propSpaces": [], "reservations": [], "entries": [], "imports": [],
  "settings": {}, "meta": {}
}
```

Readers should ignore unknown fields. Writers should keep fields they don't understand.

### sites

| Field | Type | Notes |
|---|---|---|
| `id`, `name` | string | |
| `location` | `{ lat, lon, label }` | Latitude is used for day length. |
| `climate` | object | `hemisphere` (`N`/`S`), `lastFrost`, `firstFrost` (`MM-DD`), `source`, optional `monthlyMeanC[12]`, `zone` |
| `units` | `metric` \| `imperial` | Display only; storage is always metric. |
| `locale` | string | For example `en-GB` |
| `weekStart` | `0` \| `1` | Sunday or Monday |

### plots

`id`, `siteId`, `name`, `type` (`allotment`, `garden`, `raised-beds`, `greenhouse`, `containers`, `field`), `widthM`, `lengthM`, `topDirection` (`N`/`E`/`S`/`W`), optional `startDate`, `endDate`, `notes`.

### areas

Growing areas. `id`, `plotId`, optional `parentId` (a section's bed), `kind` (`bed`, `section`, `rows`, `grid`, `container`), `name`, `shape` (`{ "rect": [x, y, w, h] }` or `{ "polygon": [[x, y], …] }`).

Optional: `rows` (count) and `rowsAxis` (`x`: rows run top to bottom; `y`: side to side), `gridCm`, `volumeL`, `protection` (`none`, `cloche`, `coldframe`, `greenhouse`, `polytunnel`, `heated`), `perennial`, `fill` (a crop category, for colouring perennial areas), `fromDate`, `toDate`.

### features

`id`, `plotId`, `type` (`fence`, `wall`, `hedge`, `path`, `shed`, `greenhouse`, `polytunnel`, `coldframe`, `water`, `tap`, `compost`, `tree`, `seating`, `tools`, `other`), `label`, `shape` (`rect`, `polygon` or `line: [[x, y], …]`), optional `side`, `fromDate`, `toDate`, `props` (for example `capacityL`).

### plantings

| Field | Notes |
|---|---|
| `id`, `plotId`, `areaId`, `varietyId` | |
| `rows`, `cells` | Row numbers (1-based) or grid cells used, within a rows or grid area |
| `qty`, `qtyUnit` | Unit: `plants`, `plugs`, `clumps`, `cloves`, `sets`, `tubers`, `metres`, `seeds` |
| `perClump`, `spacingCm` | Spacing overrides the library |
| `method` | `module`, `direct` or `bought` |
| `seedsPerCell`, `bottomHeat`, `moduleType`, `propagationSpaceId`, `stockLotId` | |
| `windows` | Any of `sow`, `potOn`, `hardenOff`, `plantOut`, `harvest`, `clear`, each a window |
| `followsPlantingId`, `followGapDays` | A succession: this planting's plant-out starts `followGapDays` after the predecessor's `clear.from`, and moves back if that runs late |
| `interplanted` | Shares its area deliberately |
| `purpose` | `eat`, `seed` or `both` |
| `status` | `planned`, `sown`, `growing`, `harvesting`, `cleared`, `failed` |
| `agreement` | `agreed` or `draft` |
| `actual` | `{ sown?, plantedOut?, firstHarvest?, cleared? }` dates |
| `importId` | Set on drafts that came from a shared plan |

Hardening off (the 7 days before plant-out) and module sowing (plant-out minus the crop's `moduleDays`) are worked out when missing.

### tasks and taskStates

`tasks` are the grower's own: `id`, `place` (`plot`, `home`, `propagation`, `admin`), `type` (`sow`, `plant`, `harvest`, `order`, `job`), `title`, `window`, `status` (`todo`, `done`, `skipped`), `agreement`, optional `plotId`, `areaId`, `plantingId`, `details`, `qty`, `doneOn`, `notes`, and `recurrence: { every, unit: day|week|month|year, until? }`.

Tasks generated from plantings aren't stored. `taskStates` records their completion: `{ id, status, doneOn?, notes? }`. The id is `<plantingId>:<kind>` for generated tasks, and `<taskId>@<date>` for occurrences of recurring tasks.

### stock

Seed and other planting stock: `id`, `varietyId`, `kind` (`seed`, `bulb`, `clove`, `set`, `tuber`, `crown`, `plant`, `cutting`), `source` (`bought`, `saved`, `gift`, `swap`, `unknown`), `status` (`plenty`, `low`, `used`), `germTests: [{ date, sown, up }]`, and optional `supplier`, `organic`, `acquired`, `useBy`, `storage`, `quantity`, `unit`, `link`, `parentPlantingId` (the planting saved seed came from), `notes`.

### cropOverrides and varieties

`cropOverrides` holds the grower's own crops and their edits to library crops, in the [crop file format](../schema/crop.schema.json). An override replaces the library crop field by field. `varieties` holds varieties the grower added: `{ id, cropId, name, seedType: OP|F1|unknown, overrides?, notes? }`.

### Later phases

`propSpaces`, `reservations`, `entries` (journal, harvests, problems) and `imports` are present but may be empty. They are described in `types.ts`.

## Versions

`schemaVersion` increases when the format changes. The app migrates older files forward on restore and refuses newer ones with a message to update.
