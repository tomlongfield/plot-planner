// The demo plot shown on first visit, built from the example in the spec
// (src/demo/example.json). Dates move forward by whole years so the demo
// always starts this autumn.

import example from '../demo/example.json';
import { addDays, diffDays, today as todayISO } from './dates';
import { matchCrop, type Library } from './library';
import { fillWindows } from './resolve';
import { SCHEMA_VERSION, type Area, type Dataset, type Feature, type Method, type Planting, type QtyUnit, type Site, type Task, type Window, type Windows } from './types';

type ExWindow = [string, string];
interface ExPlanting {
  id: string; areaId: string; variety: string; qty?: number; qtyUnit?: string; perClump?: number; spacingCm?: number;
  method?: string; rows?: number[]; interplanted?: boolean; followsPlantingId?: string; status?: string; agreement?: string;
  windows?: Record<string, ExWindow>;
}

const VARIETY_IDS: Record<string, string> = {
  'Garlic (softneck)': 'garlic--softneck',
  'Broad bean': 'broad-bean--broad-bean',
  'Winter salad mix': 'winter-salad--mix',
  Fennel: 'florence-fennel--fennel',
  'Winter spinach': 'spinach--winter',
  'Spring onion (overwintering)': 'spring-onion--overwintering',
  Onion: 'onion--bulb',
  'Salad chicory': 'salad-chicory--radicchio',
};

/** Whole years to move the example so it starts in the current (or coming) autumn. */
export function demoYearShift(now: string): number {
  const y = Number(now.slice(0, 4));
  const m = Number(now.slice(5, 7));
  return y - 2026 - (m < 7 ? 1 : 0);
}

function shiftYears(d: string, years: number): string {
  if (!years) return d;
  const y = Number(d.slice(0, 4)) + years;
  const md = d.slice(5) === '02-29' ? '02-28' : d.slice(5);
  return `${y}-${md}`;
}

export function demoDataset(lib: Library, now: string = todayISO(), opts: { fill?: boolean } = {}): Dataset {
  const ex = example as unknown as {
    site: Omit<Site, 'id'>; plot: Record<string, unknown>; features: Omit<Feature, 'id' | 'plotId'>[]; areas: Omit<Area, 'plotId'>[];
    plantings: ExPlanting[]; tasks: { title: string; areaId?: string; place?: string; type: string; window: ExWindow }[];
    propagationSpaces: { name: string; capacity: number; unit: 'trays' | 'modules'; lights: boolean; bottomHeat: boolean }[];
  };
  const ys = demoYearShift(now);
  const sy = (d: string) => shiftYears(d, ys);
  const win = (w: ExWindow): Window => ({ from: sy(w[0]), to: sy(w[1]) });

  const site: Site = { id: 'site_demo', ...ex.site, climate: { ...ex.site.climate } };
  const plotId = String(ex.plot.id);
  const plot = {
    ...(ex.plot as object), id: plotId, siteId: site.id, notes: 'A small example plot. Change anything you like, or start your own plot from Settings.',
    endDate: ex.plot.endDate ? sy(String(ex.plot.endDate)) : undefined,
  } as Dataset['plots'][number];

  const features: Feature[] = ex.features.map((f, i) => ({ ...f, id: `feat_${i + 1}`, plotId }) as Feature);
  const areas: Area[] = ex.areas.map((a) => ({ ...a, plotId }) as Area);
  const place = { climate: site.climate, lat: site.location.lat };

  const plantings: Planting[] = ex.plantings.map((e) => {
    const varietyId = VARIETY_IDS[e.variety] ?? matchCrop(lib, e.variety)?.variety?.id ?? e.variety;
    const qtyUnit = e.qtyUnit as QtyUnit | undefined;
    const method: Method = (e.method as Method) ?? (qtyUnit === 'plugs' || qtyUnit === 'plants' ? 'module' : qtyUnit === 'cloves' ? 'bought' : 'module');
    let windows: Windows = {};
    for (const [k, v] of Object.entries(e.windows ?? {})) windows[k as keyof Windows] = win(v);
    const v = lib.varieties.get(varietyId);
    const crop = v ? lib.crops.get(v.cropId) : undefined;
    // Agreed plantings get their missing windows filled in; the draft stays the sketch the example gives.
    if (crop && opts.fill !== false && e.agreement !== 'draft') windows = fillWindows(windows, crop, method, place, undefined, now);
    return {
      id: e.id, plotId, areaId: e.areaId, varietyId, qty: e.qty, qtyUnit, perClump: e.perClump, spacingCm: e.spacingCm,
      method, rows: e.rows, interplanted: e.interplanted, followsPlantingId: e.followsPlantingId,
      windows, purpose: 'eat', status: (e.status as Planting['status']) ?? 'planned', agreement: (e.agreement as Planting['agreement']) ?? 'agreed', actual: {},
    };
  });
  // Successions keep their planned gap after the crop before them.
  for (const p of plantings) {
    const pred = plantings.find((q) => q.id === p.followsPlantingId);
    const predClear = pred?.windows.clear?.from;
    const start = p.windows.plantOut?.from ?? p.windows.sow?.from;
    if (predClear && start) p.followGapDays = diffDays(start, predClear);
  }

  const tasks: Task[] = ex.tasks.map((t, i) => ({
    id: `task_demo_${i + 1}`, plotId: t.areaId ? plotId : undefined, areaId: t.areaId,
    place: (t.place as Task['place']) ?? 'plot', type: t.type as Task['type'], title: t.title, window: win(t.window),
    status: 'todo', agreement: 'agreed',
  }));
  // Yearly jobs in the fruit bed recur.
  for (const t of tasks) if (t.areaId === 'f') t.recurrence = { every: 1, unit: 'year' };

  return {
    sites: [site], plots: [plot], features, areas, plantings, tasks, taskStates: [], stock: demoStock(ys), cropOverrides: [], varieties: [],
    propSpaces: ex.propagationSpaces.map((s, i) => ({ id: `prop_demo_${i + 1}`, siteId: site.id, modulesPerTray: 40, ...s })),
    reservations: [], entries: [], imports: [],
    settings: { id: 'settings', activeSiteId: site.id, activePlotId: plotId, theme: 'system', rotationYears: 3, monthRange: { mode: 'auto' }, dateFormat: 'dmy' },
    meta: { id: 'meta', schemaVersion: SCHEMA_VERSION, appVersion: __APP_VERSION__, createdAt: new Date().toISOString() },
  };
}

function demoStock(ys: number): Dataset['stock'] {
  const d = (s: string) => shiftYears(s, ys);
  return [
    { id: 'lot_demo_1', varietyId: 'broad-bean--broad-bean', kind: 'seed', source: 'saved', acquired: d('2025-08-10'), status: 'plenty', germTests: [{ date: d('2026-09-01'), sown: 10, up: 9 }], notes: 'Saved from last year\'s plants.' },
    { id: 'lot_demo_2', varietyId: 'garlic--softneck', kind: 'clove', source: 'bought', supplier: 'Local garden centre', acquired: d('2026-09-20'), quantity: 6, unit: 'bulbs', status: 'plenty', germTests: [] },
    { id: 'lot_demo_3', varietyId: 'onion--bulb', kind: 'seed', source: 'bought', supplier: 'Seed co-op', organic: true, acquired: d('2025-12-01'), useBy: d('2027-06-30'), status: 'plenty', germTests: [] },
    { id: 'lot_demo_4', varietyId: 'spinach--winter', kind: 'seed', source: 'swap', acquired: d('2023-03-01'), status: 'low', germTests: [], notes: 'From the allotment seed swap.' },
    { id: 'lot_demo_5', varietyId: 'winter-salad--mix', kind: 'seed', source: 'gift', status: 'plenty', germTests: [] },
  ];
}

/** Shift a whole planting's dates, for tests and the "delay" control. */
export function shiftPlanting(p: Planting, days: number, keys: (keyof Windows)[]): Planting {
  const w: Windows = { ...p.windows };
  for (const k of keys) if (w[k]) w[k] = { from: addDays(w[k]!.from, days), to: addDays(w[k]!.to, days) };
  return { ...p, windows: w };
}
