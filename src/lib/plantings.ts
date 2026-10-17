// Everything hangs off plantings. These pure functions work out each planting's
// effective windows (after successions), when it occupies its area, and what
// changes in each area month by month.

import { addDays, diffDays, monthEnd, monthStart, overlaps, shiftWindow, type MonthKey } from './dates';
import type { Area, Crop, ISODate, Planting, Window, Windows } from './types';

const DAWN = '0001-01-01';
const DUSK = '9999-12-31';

export interface Resolved {
  planting: Planting;
  windows: Windows;
  /** Days the successor was pushed back because its predecessor ran late. */
  delayDays: number;
  /** Days the plugs sit in modules beyond the planned module time. */
  waitingDays: number;
  /** Total days in modules, sow to plant out. */
  moduleDaysTotal?: number;
  /** When the planting takes up space in its area. */
  occupancy: Window;
}

/** Hardening off defaults to the 7 days before planting out, for anything raised under cover. */
export function withDerived(p: Planting, crop?: Crop): Windows {
  const w: Windows = { ...p.windows };
  if (w.plantOut && !w.hardenOff && p.method === 'module')
    w.hardenOff = { from: addDays(w.plantOut.from, -7), to: addDays(w.plantOut.from, -1) };
  if (w.plantOut && !w.sow && p.method === 'module' && crop?.moduleDays)
    w.sow = shiftWindow(w.plantOut, -crop.moduleDays);
  return w;
}

/**
 * Resolve every planting. Successions cascade: when a predecessor's clearing moves
 * later, the successor's plant-out, harvest and clearing move with it. Its sowing
 * date does not, so its plugs wait longer in their modules.
 */
export function resolvePlantings(plantings: Planting[], cropOf: (p: Planting) => Crop | undefined): Map<string, Resolved> {
  const byId = new Map(plantings.map((p) => [p.id, p]));
  const out = new Map<string, Resolved>();
  const visiting = new Set<string>();

  const resolve = (p: Planting): Resolved => {
    const done = out.get(p.id);
    if (done) return done;
    const crop = cropOf(p);
    let windows = withDerived(p, crop);
    let delayDays = 0;

    const pred = p.followsPlantingId ? byId.get(p.followsPlantingId) : undefined;
    if (pred && !visiting.has(p.id)) {
      visiting.add(p.id);
      const pr = resolve(pred);
      visiting.delete(p.id);
      const predClear = pr.windows.clear?.from ?? pr.occupancy.to;
      const start = windows.plantOut?.from ?? windows.sow?.from;
      if (start && predClear !== DUSK) {
        const gap = p.followGapDays ?? 0;
        const delay = diffDays(addDays(predClear, gap), start);
        if (delay > 0) {
          delayDays = delay;
          const moved: Windows = { ...windows };
          for (const k of ['hardenOff', 'plantOut', 'harvest', 'clear'] as const) if (moved[k]) moved[k] = shiftWindow(moved[k]!, delay);
          // A direct sowing can't happen until the bed is free either.
          if (p.method === 'direct' && moved.sow) moved.sow = shiftWindow(moved.sow, delay);
          windows = moved;
        }
      }
    }

    // Plugs wait in their modules for as long as the predecessor holds them up.
    let moduleDaysTotal: number | undefined;
    if (p.method === 'module' && windows.sow && windows.plantOut) moduleDaysTotal = diffDays(windows.plantOut.from, windows.sow.from);
    const waitingDays = p.method === 'module' && windows.sow ? delayDays : 0;

    const r: Resolved = { planting: p, windows, delayDays, waitingDays, moduleDaysTotal, occupancy: occupancyOf(p, windows) };
    out.set(p.id, r);
    return r;
  };

  for (const p of plantings) resolve(p);
  return out;
}

/** When a planting is in the ground in its area. */
export function occupancyOf(p: Planting, w: Windows): Window {
  let from: ISODate | undefined;
  if (p.actual.plantedOut) from = p.actual.plantedOut;
  else if (p.method === 'direct' || (!w.plantOut && w.sow)) from = p.actual.sown ?? w.sow?.from ?? w.plantOut?.from;
  else from = w.plantOut?.from;
  if (!from && (p.status === 'growing' || p.status === 'harvesting')) from = DAWN;
  let to: ISODate | undefined = p.actual.cleared ?? w.clear?.to ?? w.harvest?.to;
  if (!to) to = p.status === 'cleared' || p.status === 'failed' ? from : DUSK;
  return { from: from ?? DUSK, to: to ?? DUSK };
}

export function isOpenEnded(w: Window): { start: boolean; end: boolean } {
  return { start: w.from === DAWN, end: w.to === DUSK };
}

export type MonthEvent = 'new' | 'harvest' | 'clear' | 'sow' | 'waiting' | 'slow';

export interface AreaMonthState {
  areaId: string;
  /** Plantings occupying the area at some point in the month, earliest first. */
  plantings: Resolved[];
  /** What changes this month in the area. */
  events: { planting: Resolved; event: MonthEvent }[];
  /** True when something in the area starts, starts cropping, or is cleared this month. */
  changes: boolean;
  hasDraft: boolean;
}

export function inMonth(d: ISODate | undefined, k: MonthKey): boolean {
  return !!d && d >= monthStart(k) && d <= monthEnd(k);
}

export function inSpan(d: ISODate | undefined, w: Window): boolean {
  return !!d && d >= w.from && d <= w.to;
}

export function monthSpan(k: MonthKey): Window {
  return { from: monthStart(k), to: monthEnd(k) };
}

/** The state of every area in a month. */
export function monthState(areas: Area[], resolved: Resolved[], k: MonthKey): Map<string, AreaMonthState> {
  return spanState(areas, resolved, monthSpan(k));
}

/** The state of every area over any span of dates, such as a month or a week. */
export function spanState(areas: Area[], resolved: Resolved[], month: Window): Map<string, AreaMonthState> {
  const out = new Map<string, AreaMonthState>();
  for (const a of areas) out.set(a.id, { areaId: a.id, plantings: [], events: [], changes: false, hasDraft: false });
  for (const r of resolved) {
    const s = out.get(r.planting.areaId);
    if (!s) continue;
    const w = r.windows;
    if (overlaps(r.occupancy, month)) s.plantings.push(r);
    const ev: MonthEvent[] = [];
    if (inSpan(r.occupancy.from, month)) ev.push('new');
    if (inSpan(w.harvest?.from, month)) ev.push('harvest');
    if (inSpan(w.clear?.from, month) && r.occupancy.to !== DUSK) ev.push('clear');
    if (r.planting.method === 'module' && inSpan(w.sow?.from, month)) ev.push('sow');
    for (const e of ev) s.events.push({ planting: r, event: e });
    if (ev.some((e) => e === 'new' || e === 'harvest' || e === 'clear')) s.changes = true;
    if (r.planting.agreement === 'draft' && (overlaps(r.occupancy, month) || ev.length)) s.hasDraft = true;
  }
  for (const s of out.values()) s.plantings.sort((a, b) => a.occupancy.from.localeCompare(b.occupancy.from));
  return out;
}

/** Months that a set of plantings spans, for the "auto" month range. */
export function planSpan(resolved: Resolved[]): Window | undefined {
  let from: ISODate | undefined;
  let to: ISODate | undefined;
  for (const r of resolved) {
    const w = r.windows;
    const starts = [w.sow?.from, w.plantOut?.from, r.occupancy.from].filter((d): d is string => !!d && d !== DAWN && d !== DUSK);
    const ends = [w.clear?.from, w.harvest?.from, w.plantOut?.to, w.sow?.to].filter((d): d is string => !!d && d !== DUSK);
    for (const d of starts) if (!from || d < from) from = d;
    for (const d of ends) if (!to || d > to) to = d;
  }
  return from && to ? { from, to } : undefined;
}

/** Area that is itself free to grow in: beds without sections, sections, rows, grids and containers. */
export function leafAreas(areas: Area[]): Area[] {
  const parents = new Set(areas.map((a) => a.parentId).filter(Boolean));
  return areas.filter((a) => !parents.has(a.id));
}

/** Whether an area exists in a given window (layouts change over time). */
export function areaExists(a: { fromDate?: ISODate; toDate?: ISODate }, w: Window): boolean {
  return (!a.fromDate || a.fromDate <= w.to) && (!a.toDate || a.toDate >= w.from);
}

export const OPEN_START = DAWN;
export const OPEN_END = DUSK;
