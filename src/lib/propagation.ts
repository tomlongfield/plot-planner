// Propagation spaces: how much room module-raised plantings need, week by week,
// from sowing until they're planted out (including any wait while a bed clears).

import { addDays, overlaps, weekOf } from './dates';
import type { Resolved } from './plantings';
import type { Category, Crop, ISODate, Planting, PropSpace, Reservation } from './types';

export interface LoadItem {
  kind: 'planting' | 'reservation';
  id: string;
  label: string;
  amount: number;
  category?: Category;
}

export interface WeekLoad {
  week: ISODate;
  used: number;
  items: LoadItem[];
}

export interface SpaceLoad {
  space: PropSpace;
  weeks: WeekLoad[];
  over: WeekLoad[];
}

const DEFAULT_MODULES_PER_TRAY = 40;

/** Modules a planting fills: one per plant, plug or clump. */
export function modulesFor(p: Planting): number {
  if (p.method !== 'module') return 0;
  if (p.qty == null) return 0;
  if (p.qtyUnit === 'metres' || p.qtyUnit === 'seeds') return 0;
  return p.qty;
}

/** The planting's demand on a space, in that space's unit. Each planting gets whole trays of its own. */
export function demandIn(space: PropSpace, p: Planting): number {
  const m = modulesFor(p);
  if (!m) return 0;
  return space.unit === 'modules' ? m : Math.ceil(m / (space.modulesPerTray ?? DEFAULT_MODULES_PER_TRAY));
}

/** When a planting is in its propagation space: from sowing until planting out. */
export function propWindow(r: Resolved): { from: ISODate; to: ISODate } | undefined {
  const sow = r.planting.actual.sown ?? r.windows.sow?.from;
  const out = r.planting.actual.plantedOut ?? r.windows.plantOut?.from;
  if (!sow || !out || out <= sow) return undefined;
  return { from: sow, to: addDays(out, -1) };
}

/**
 * Week-by-week load for each space. Module plantings with no space chosen use
 * the site's first space, so a single-space grower never has to assign them.
 */
export function propagationLoad(
  resolved: Resolved[],
  spaces: PropSpace[],
  reservations: Reservation[],
  opts: { from: ISODate; weeks: number; weekStart?: 0 | 1; cropOf: (p: Planting) => Crop | undefined; nameOf: (p: Planting) => string },
): SpaceLoad[] {
  if (!spaces.length) return [];
  const first = weekOf(opts.from, opts.weekStart ?? 1).from;
  const weekStarts = Array.from({ length: opts.weeks }, (_, i) => addDays(first, i * 7));
  const ids = new Set(spaces.map((s) => s.id));
  return spaces.map((space) => {
    const weeks: WeekLoad[] = weekStarts.map((week) => ({ week, used: 0, items: [] }));
    for (const r of resolved) {
      const p = r.planting;
      if (p.method !== 'module' || p.status === 'failed' || p.status === 'cleared') continue;
      const sid = p.propagationSpaceId && ids.has(p.propagationSpaceId) ? p.propagationSpaceId : spaces[0].id;
      if (sid !== space.id) continue;
      const w = propWindow(r);
      const amount = demandIn(space, p);
      if (!w || !amount) continue;
      for (const wk of weeks) {
        if (!overlaps(w, { from: wk.week, to: addDays(wk.week, 6) })) continue;
        wk.items.push({ kind: 'planting', id: p.id, label: opts.nameOf(p), amount, category: opts.cropOf(p)?.category });
        wk.used += amount;
      }
    }
    for (const res of reservations.filter((x) => x.propSpaceId === space.id)) {
      for (const wk of weeks) {
        if (!overlaps(res.window, { from: wk.week, to: addDays(wk.week, 6) })) continue;
        wk.items.push({ kind: 'reservation', id: res.id, label: res.label, amount: res.amount });
        wk.used += res.amount;
      }
    }
    return { space, weeks, over: weeks.filter((w) => w.used > space.capacity) };
  });
}
