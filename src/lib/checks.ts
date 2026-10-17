// Planning checks. Each returns warnings as data (a kind plus parameters), so
// the interface can word them in any language.

import { areaM2, capacityFor, centre, relatedAreas } from './capacity';
import { effectiveClimate, frostFreeDays, seasonLastFrost, seasonOf } from './climate';
import { addDays, diffDays, overlaps, today as todayISO } from './dates';
import { OPEN_END, OPEN_START, type Resolved } from './plantings';
import type { Area, Climate, Crop, Entry, ISODate, Planting, Plot, PropSpace, Reservation, StockLot, Window } from './types';

export type WarningKind =
  | 'conflict' | 'capacity' | 'endDate' | 'frostFree' | 'frost' | 'rotation' | 'problem'
  | 'crossing' | 'outgrow' | 'waiting' | 'oldSeed' | 'seedUseBy' | 'propCapacity' | 'missingArea';

export interface Warning {
  id: string;
  kind: WarningKind;
  level: 'warn' | 'info';
  plantingId?: string;
  otherId?: string;
  areaId?: string;
  params: Record<string, string | number>;
}

export interface CheckContext {
  plot: Plot;
  areas: Area[];
  resolved: Resolved[];
  climate: Climate;
  lat: number;
  cropOf: (p: Planting) => Crop | undefined;
  nameOf: (p: Planting) => string;
  entries?: Entry[];
  stock?: StockLot[];
  propSpaces?: PropSpace[];
  reservations?: Reservation[];
  rotationYears?: number;
  today?: ISODate;
}

/** The span during which a planting blocks its ground. Clearing windows may overlap a successor. */
function blocking(r: Resolved): Window {
  return { from: r.occupancy.from, to: r.windows.clear?.from ?? r.occupancy.to };
}

function sharesRows(a: Planting, b: Planting): boolean {
  if (a.cells?.length && b.cells?.length) return a.cells.some((x) => b.cells!.includes(x));
  if (!a.rows?.length || !b.rows?.length) return true;
  return a.rows.some((x) => b.rows!.includes(x));
}

export function conflictWarnings(ctx: CheckContext): Warning[] {
  const out: Warning[] = [];
  const list = ctx.resolved.filter((r) => r.planting.plotId === ctx.plot.id && r.planting.status !== 'failed');
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const related = relatedAreas(a.planting.areaId, ctx.areas);
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!related.has(b.planting.areaId)) continue;
      // Drafts are compared with the agreed plan, not with each other's alternatives.
      if (a.planting.importId && b.planting.importId && a.planting.importId !== b.planting.importId) continue;
      if (a.planting.followsPlantingId === b.planting.id || b.planting.followsPlantingId === a.planting.id) {
        // A successor may only overlap its predecessor's clearing.
        const [pred, succ] = a.planting.followsPlantingId === b.planting.id ? [b, a] : [a, b];
        if (succ.occupancy.from < blocking(pred).to) out.push(conflict(pred, succ));
        continue;
      }
      if (a.planting.interplanted || b.planting.interplanted) continue;
      if (a.planting.areaId === b.planting.areaId && !sharesRows(a.planting, b.planting)) continue;
      // Strict overlap: one crop may go in on the day another is cleared.
      if (blocking(a).from < blocking(b).to && blocking(b).from < blocking(a).to) out.push(conflict(a, b));
    }
  }
  return out;

  function conflict(a: Resolved, b: Resolved): Warning {
    const from = a.occupancy.from > b.occupancy.from ? a.occupancy.from : b.occupancy.from;
    return {
      id: `conflict:${a.planting.id}:${b.planting.id}`, kind: 'conflict', level: 'warn',
      plantingId: a.planting.id, otherId: b.planting.id, areaId: a.planting.areaId,
      params: { a: ctx.nameOf(a.planting), b: ctx.nameOf(b.planting), from: from === OPEN_START ? '' : from },
    };
  }
}

export function capacityWarnings(ctx: CheckContext): Warning[] {
  const out: Warning[] = [];
  const areas = new Map(ctx.areas.map((a) => [a.id, a]));
  for (const r of ctx.resolved) {
    const p = r.planting;
    const area = areas.get(p.areaId);
    if (!area) {
      if (p.plotId === ctx.plot.id) out.push({ id: `missingArea:${p.id}`, kind: 'missingArea', level: 'warn', plantingId: p.id, params: { name: ctx.nameOf(p) } });
      continue;
    }
    const cap = capacityFor(p, area, ctx.cropOf(p));
    if (cap && !cap.ok)
      out.push({ id: `capacity:${p.id}`, kind: 'capacity', level: 'warn', plantingId: p.id, areaId: area.id,
        params: { name: ctx.nameOf(p), needed: cap.needed, fits: cap.fits, unit: cap.unit, area: area.name, working: cap.working } });
  }
  return out;
}

export function endDateWarnings(ctx: CheckContext): Warning[] {
  const end = ctx.plot.endDate;
  if (!end) return [];
  return ctx.resolved
    .filter((r) => r.planting.plotId === ctx.plot.id && r.occupancy.to !== OPEN_END && r.occupancy.to > end)
    .map((r) => ({ id: `endDate:${r.planting.id}`, kind: 'endDate' as const, level: 'warn' as const, plantingId: r.planting.id, areaId: r.planting.areaId,
      params: { name: ctx.nameOf(r.planting), until: r.occupancy.to, end } }));
}

export function climateWarnings(ctx: CheckContext): Warning[] {
  const out: Warning[] = [];
  const areas = new Map(ctx.areas.map((a) => [a.id, a]));
  for (const r of ctx.resolved) {
    const p = r.planting;
    const crop = ctx.cropOf(p);
    if (!crop) continue;
    const area = areas.get(p.areaId);
    const c = effectiveClimate(ctx.climate, area?.protection, crop.hardiness);
    const ffd = frostFreeDays(c);
    if (crop.frostFreeDaysNeeded && crop.frostFreeDaysNeeded > ffd)
      out.push({ id: `frostFree:${p.id}`, kind: 'frostFree', level: 'warn', plantingId: p.id, areaId: p.areaId,
        params: { name: ctx.nameOf(p), needed: crop.frostFreeDaysNeeded, has: ffd } });
    const start = r.occupancy.from;
    if (crop.hardiness === 'tender' && start !== OPEN_START && start !== OPEN_END && p.status === 'planned') {
      const lf = seasonLastFrost(c, seasonOf(c, addDays(start, 60)));
      if (start < lf && diffDays(lf, start) < 200)
        out.push({ id: `frost:${p.id}`, kind: 'frost', level: 'warn', plantingId: p.id, areaId: p.areaId,
          params: { name: ctx.nameOf(p), date: start, lastFrost: lf } });
    }
  }
  return out;
}

/** The same rotation group in the same ground too often, or soon after a disease was logged there. */
export function rotationWarnings(ctx: CheckContext): Warning[] {
  const years = ctx.rotationYears ?? 3;
  const out: Warning[] = [];
  const areas = new Map(ctx.areas.map((a) => [a.id, a]));
  const list = ctx.resolved.filter((r) => r.planting.plotId === ctx.plot.id);
  for (const r of list) {
    const area = areas.get(r.planting.areaId);
    if (!area || area.perennial || r.occupancy.from === OPEN_START) continue;
    if (area.parentId && areas.get(area.parentId)?.perennial) continue;
    const crop = ctx.cropOf(r.planting);
    if (!crop || crop.rotationGroup === 'perennial' || crop.rotationGroup === 'misc') continue;
    const related = relatedAreas(area.id, ctx.areas);
    const since = addDays(r.occupancy.from, -365 * years);
    for (const q of list) {
      if (q === r || !related.has(q.planting.areaId)) continue;
      if (q.planting.followsPlantingId === r.planting.id || r.planting.followsPlantingId === q.planting.id) continue;
      const qc = ctx.cropOf(q.planting);
      if (qc?.rotationGroup !== crop.rotationGroup) continue;
      const qEnd = q.occupancy.to === OPEN_END ? q.occupancy.from : q.occupancy.to;
      // Count only earlier crops that finished at least a season before this one started.
      if (qEnd >= since && qEnd < r.occupancy.from && diffDays(r.occupancy.from, q.occupancy.from) > 200) {
        out.push({ id: `rotation:${r.planting.id}:${q.planting.id}`, kind: 'rotation', level: 'warn', plantingId: r.planting.id, otherId: q.planting.id, areaId: area.id,
          params: { name: ctx.nameOf(r.planting), group: crop.rotationGroup, previous: ctx.nameOf(q.planting), when: q.occupancy.from.slice(0, 4), years } });
        break;
      }
    }
    for (const e of ctx.entries ?? []) {
      if (e.kind !== 'problem' || !e.problem || !e.areaId || !related.has(e.areaId)) continue;
      if (e.date < since || e.date > r.occupancy.from) continue;
      const pn = e.problem.name.toLowerCase();
      if ((crop.pests ?? []).some((x) => pn.includes(x.toLowerCase()) || x.toLowerCase().includes(pn)))
        out.push({ id: `problem:${r.planting.id}:${e.id}`, kind: 'problem', level: 'warn', plantingId: r.planting.id, areaId: area.id,
          params: { name: ctx.nameOf(r.planting), problem: e.problem.name, date: e.date } });
    }
  }
  return out;
}

/** Roughly when a planting grown for seed will be in flower. */
export function floweringWindow(r: Resolved, crop: Crop): Window | undefined {
  const h = r.windows.harvest;
  if (!h) return undefined;
  if (crop.lifecycle === 'biennial') {
    // Biennials flower the year after they crop.
    const from = addDays(h.from, 300);
    return { from, to: addDays(from, 45) };
  }
  return { from: addDays(h.from, -14), to: h.to };
}

export function crossingWarnings(ctx: CheckContext): Warning[] {
  const out: Warning[] = [];
  const areas = new Map(ctx.areas.map((a) => [a.id, a]));
  const seed = ctx.resolved.filter((r) => r.planting.purpose !== 'eat' && r.planting.status !== 'failed');
  for (let i = 0; i < seed.length; i++) {
    for (let j = i + 1; j < seed.length; j++) {
      const a = seed[i];
      const b = seed[j];
      if (a.planting.varietyId === b.planting.varietyId) continue;
      const ca = ctx.cropOf(a.planting);
      const cb = ctx.cropOf(b.planting);
      if (!ca || !cb || ca.species !== cb.species || ca.species === 'mixed') continue;
      const crosses = ca.seedSaving?.crosses ?? 'sometimes';
      if (crosses === 'rarely') continue;
      const fa = floweringWindow(a, ca);
      const fb = floweringWindow(b, cb);
      if (!fa || !fb || !overlaps(fa, fb)) continue;
      const iso = ca.seedSaving?.isolationM ?? 0;
      const aa = areas.get(a.planting.areaId);
      const ab = areas.get(b.planting.areaId);
      let distance: number | undefined;
      if (aa && ab && aa.plotId === ab.plotId) {
        const [x1, y1] = centre(aa);
        const [x2, y2] = centre(ab);
        distance = Math.round(Math.hypot(x2 - x1, y2 - y1) * 10) / 10;
      }
      if (distance != null && iso && distance >= iso) continue;
      out.push({ id: `crossing:${a.planting.id}:${b.planting.id}`, kind: 'crossing', level: 'warn', plantingId: a.planting.id, otherId: b.planting.id,
        params: { a: ctx.nameOf(a.planting), b: ctx.nameOf(b.planting), species: ca.species, isolation: iso, distance: distance ?? '', from: fa.from > fb.from ? fa.from : fb.from } });
    }
  }
  return out;
}

export function moduleWarnings(ctx: CheckContext): Warning[] {
  const out: Warning[] = [];
  for (const r of ctx.resolved) {
    const crop = ctx.cropOf(r.planting);
    if (r.waitingDays > 0)
      out.push({ id: `waiting:${r.planting.id}`, kind: 'waiting', level: 'info', plantingId: r.planting.id, params: { name: ctx.nameOf(r.planting), days: r.waitingDays } });
    if (crop?.maxModuleDays && r.moduleDaysTotal && r.moduleDaysTotal > crop.maxModuleDays)
      out.push({ id: `outgrow:${r.planting.id}`, kind: 'outgrow', level: 'warn', plantingId: r.planting.id,
        params: { name: ctx.nameOf(r.planting), days: r.moduleDaysTotal, max: crop.maxModuleDays } });
  }
  return out;
}

export function seedWarnings(stock: StockLot[], cropOfVariety: (varietyId: string) => Crop | undefined, nameOfVariety: (id: string) => string, now: ISODate = todayISO()): Warning[] {
  const out: Warning[] = [];
  for (const s of stock) {
    if (s.status === 'used' || s.kind !== 'seed') continue;
    if (s.useBy && s.useBy < now) {
      out.push({ id: `seedUseBy:${s.id}`, kind: 'seedUseBy', level: 'warn', params: { name: nameOfVariety(s.varietyId), useBy: s.useBy, lot: s.id } });
      continue;
    }
    const life = cropOfVariety(s.varietyId)?.seedLifeYears;
    if (life && s.acquired && diffDays(now, s.acquired) > life * 365)
      out.push({ id: `oldSeed:${s.id}`, kind: 'oldSeed', level: 'info', params: { name: nameOfVariety(s.varietyId), acquired: s.acquired, years: life, lot: s.id } });
  }
  return out;
}

export function allPlotWarnings(ctx: CheckContext): Warning[] {
  return [
    ...conflictWarnings(ctx),
    ...capacityWarnings(ctx),
    ...endDateWarnings(ctx),
    ...climateWarnings(ctx),
    ...rotationWarnings(ctx),
    ...crossingWarnings(ctx),
    ...moduleWarnings(ctx),
  ];
}

export { areaM2 };
