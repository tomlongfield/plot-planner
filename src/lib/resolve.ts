// Turning a crop's relative timing rules into real date windows for a place.
//
//   rule (e.g. "plant out 0–14 days after last frost")
//   + variety overrides
//   + the site's frost dates
//   + the area's protection shift (tender and half-hardy crops only)
//   = a real date window for that season.

import { addGrowingDays, effectiveClimate, seasonFirstFrost, seasonLastFrost } from './climate';
import { addDays, diffDays, onYear, parseISO, today as todayISO } from './dates';
import type { Climate, Crop, ISODate, Method, Protection, TimingRule, Window, Windows } from './types';

export type Plan = 'main' | 'overwinter';

export interface PlaceContext {
  climate: Climate;
  lat: number;
  protection?: Protection;
}

const HARDEN_OFF_DAYS = 7;

function anchorDate(c: Climate, season: number, anchor: TimingRule['anchor'], rule: TimingRule, end: boolean): ISODate {
  switch (anchor) {
    case 'firstFrost':
      return seasonFirstFrost(c, season);
    case 'soilTemp':
      return soilTempDate(c, season, rule.threshold ?? 10);
    case 'dayLength':
      return dayLengthDate(c, season, rule.threshold ?? 12);
    case 'fixed': {
      const md = (end ? rule.fixedTo : rule.fixedFrom) ?? rule.fixedFrom ?? '01-01';
      // Fixed dates are written for the northern hemisphere and mirrored for the south.
      const base = onYear(md, season);
      const d = c.hemisphere === 'S' ? addDays(base, 182) : base;
      return d < seasonLastFrost(c, season) ? addDays(d, 365) : d;
    }
    default:
      return seasonLastFrost(c, season);
  }
}

/** When the soil reaches a temperature. Uses monthly means if known, otherwise a rule of thumb from the last frost. */
function soilTempDate(c: Climate, season: number, threshold: number): ISODate {
  const lf = seasonLastFrost(c, season);
  if (c.monthlyMeanC?.length === 12) {
    // Walk forward from 120 days before last frost and interpolate monthly means at mid-month.
    for (let i = -120; i < 200; i += 2) {
      const d = addDays(lf, i);
      const m = new Date(parseISO(d)).getUTCMonth();
      const day = new Date(parseISO(d)).getUTCDate();
      const next = (m + (day >= 15 ? 1 : 11)) % 12;
      const frac = day >= 15 ? (day - 15) / 30 : (day + 15) / 30;
      const t = day >= 15 ? c.monthlyMeanC[m] + (c.monthlyMeanC[next] - c.monthlyMeanC[m]) * frac
        : c.monthlyMeanC[next] + (c.monthlyMeanC[m] - c.monthlyMeanC[next]) * frac;
      if (t >= threshold) return d;
    }
  }
  return addDays(lf, Math.max(-21, Math.round((threshold - 8) * 5)));
}

/** When day length first reaches `hours`, approximated as days from midwinter along a sine curve. */
function dayLengthDate(c: Climate, season: number, hours: number): ISODate {
  const lf = seasonLastFrost(c, season);
  // Midwinter before this season's last frost.
  const mid = c.hemisphere === 'N' ? onYear('12-21', season - 1) : onYear('06-21', season);
  const start = mid < lf ? mid : addDays(mid, -365);
  // Assume 8 h at midwinter and 16.5 h at midsummer (about 54°). Good enough as a default.
  const frac = Math.min(1, Math.max(0, (hours - 8) / 8.5));
  const days = Math.round((Math.acos(1 - 2 * frac) / Math.PI) * 182);
  return addDays(start, days);
}

export function ruleWindow(rule: TimingRule, c: Climate, season: number): Window {
  const from = addDays(anchorDate(c, season, rule.anchor, rule, false), rule.fromOffsetDays ?? 0);
  let to = addDays(anchorDate(c, season, rule.toAnchor ?? rule.anchor, rule, true), rule.toOffsetDays ?? rule.fromOffsetDays ?? 0);
  if (to < from) to = from;
  return { from, to };
}

function findRule(crop: Crop, kind: TimingRule['kind']): TimingRule | undefined {
  return crop.timing.find((t) => t.kind === kind);
}

export function availablePlans(crop: Crop): Plan[] {
  const plans: Plan[] = [];
  if (crop.timing.some((t) => t.kind === 'sowIndoor' || t.kind === 'sowOutdoor' || t.kind === 'plantOut')) plans.push('main');
  if (findRule(crop, 'overwinter')) plans.push('overwinter');
  return plans;
}

export function defaultMethod(crop: Crop, plan: Plan): Method {
  if (plan === 'overwinter') return crop.moduleDays ? 'module' : 'direct';
  if (findRule(crop, 'sowIndoor') && crop.moduleDays) return 'module';
  if (findRule(crop, 'sowOutdoor')) return 'direct';
  return 'bought';
}

/**
 * Work out a full set of windows for a crop in a season.
 * `season` is the year whose last spring frost opens the growing season;
 * an overwinter plan is sown towards the end of that season and harvested in the next.
 */
export function resolveWindows(crop: Crop, plan: Plan, method: Method, place: PlaceContext, season: number): Windows {
  const rule0 = crop.timing.find((t) => t.protectionShiftDays != null);
  const c = effectiveClimate(place.climate, place.protection, crop.hardiness, place.protection && place.protection !== 'none' ? rule0?.protectionShiftDays : undefined);
  const moduleDays = method === 'module' ? crop.moduleDays ?? 28 : 0;
  const w: Windows = {};

  if (plan === 'overwinter') {
    const ow = ruleWindow(findRule(crop, 'overwinter')!, c, season);
    if (method === 'direct' || method === 'bought') {
      // Cloves, sets and direct sowings: the overwinter window is the planting window.
      if (method === 'direct') w.sow = ow;
      w.plantOut = ow;
    } else {
      w.sow = ow;
      w.plantOut = { from: addDays(ow.from, moduleDays), to: addDays(ow.to, moduleDays) };
    }
  } else {
    const indoor = findRule(crop, 'sowIndoor');
    const outdoor = findRule(crop, 'sowOutdoor');
    const plant = findRule(crop, 'plantOut');
    if (method === 'module') {
      if (plant) {
        w.plantOut = ruleWindow(plant, c, season);
        w.sow = { from: addDays(w.plantOut.from, -moduleDays), to: addDays(w.plantOut.to, -moduleDays) };
      } else if (indoor) {
        w.sow = ruleWindow(indoor, c, season);
        w.plantOut = { from: addDays(w.sow.from, moduleDays), to: addDays(w.sow.to, moduleDays) };
      }
    } else if (method === 'direct' && outdoor) {
      w.sow = ruleWindow(outdoor, c, season);
    } else if (plant) {
      w.plantOut = ruleWindow(plant, c, season);
    } else if (outdoor) {
      w.sow = ruleWindow(outdoor, c, season);
    }
  }

  if (w.plantOut && method === 'module') {
    w.hardenOff = { from: addDays(w.plantOut.from, -HARDEN_OFF_DAYS), to: addDays(w.plantOut.from, -1) };
    if ((crop.moduleDays ?? 0) >= 42) {
      // Long-raised plants usually need potting on about halfway.
      const mid = Math.round(moduleDays / 2);
      w.potOn = { from: addDays(w.sow!.from, mid), to: addDays(w.sow!.to, mid) };
    }
  }

  Object.assign(w, harvestWindows(crop, plan, c, place.lat, season, w));
  return w;
}

/** Harvest and clearing windows that follow from a planting's start. */
export function harvestWindows(crop: Crop, plan: Plan, c: Climate, lat: number, season: number, w: Windows): Pick<Windows, 'harvest' | 'clear'> {
  const out: Pick<Windows, 'harvest' | 'clear'> = {};
  const start = w.sow ?? w.plantOut;
  const harvestRule = findRule(crop, 'harvest');
  if (start) {
    if (harvestRule && (plan === 'overwinter' || crop.lifecycle !== 'annual' || !crop.daysToHarvest)) {
      // Explicit harvest timing, in the first season it comes after the start.
      let hs = season;
      let hw = ruleWindow(harvestRule, c, hs);
      while (hw.from <= (w.plantOut ?? start).from && hs < season + 3) hw = ruleWindow(harvestRule, c, ++hs);
      out.harvest = hw;
    } else if (crop.daysToHarvest) {
      // Growth stalls in short days, so count only growing days.
      const first = addGrowingDays(lat, start.from, crop.daysToHarvest);
      const spread = diffDays(start.to, start.from);
      out.harvest = { from: first, to: addDays(first, spread + (crop.harvestWindowDays ?? 21)) };
    }
  }
  const end = out.harvest?.to ?? w.harvest?.to ?? w.plantOut?.to ?? w.sow?.to;
  if (end) out.clear = { from: end, to: addDays(end, 14) };
  return out;
}

/** Key date used to decide whether a plan is still possible this season. */
function startOf(w: Windows): ISODate | undefined {
  return (w.sow ?? w.plantOut)?.to;
}

/** The first season, from today, in which the plan's sowing or planting window hasn't yet closed. */
export function nextSeason(crop: Crop, plan: Plan, method: Method, place: PlaceContext, from: ISODate = todayISO()): number {
  const y = Number(from.slice(0, 4));
  for (let s = y - 1; s <= y + 2; s++) {
    const st = startOf(resolveWindows(crop, plan, method, place, s));
    if (st && st >= from) return s;
  }
  return y;
}

/**
 * Fill in windows a planting doesn't have yet, lined up with the ones it does.
 * Used for imported or quickly-entered plantings that give only one or two dates.
 */
export function fillWindows(existing: Windows, crop: Crop, method: Method, place: PlaceContext, plan?: Plan, todayDate: ISODate = todayISO()): Windows {
  const plans = availablePlans(crop);
  if (!plans.length) return existing;
  const p: Plan = plan ?? (plans.includes('overwinter') && guessOverwinter(existing, place.climate, todayDate) ? 'overwinter' : plans[0]);
  const c = effectiveClimate(place.climate, place.protection, crop.hardiness);
  const moduleDays = method === 'module' ? crop.moduleDays ?? 28 : 0;
  const out: Windows = { ...existing };

  // Sowing and planting move together by the module time.
  if (method === 'module' && out.plantOut && !out.sow) out.sow = shiftW(out.plantOut, -moduleDays);
  if (method === 'module' && out.sow && !out.plantOut) out.plantOut = shiftW(out.sow, moduleDays);

  const startKey = (['plantOut', 'sow'] as const).find((k) => out[k]);
  let season: number;
  if (startKey) {
    // The season whose template start is nearest the known start.
    const ref = out[startKey]!.from;
    const y = Number(ref.slice(0, 4));
    let best: { s: number; d: number; w: Windows } | undefined;
    for (let s = y - 2; s <= y + 1; s++) {
      const w = resolveWindows(crop, p, method, place, s);
      const k = w[startKey] ? startKey : w.plantOut ? 'plantOut' : 'sow';
      if (!w[k]) continue;
      const d = diffDays(ref, w[k]!.from);
      if (!best || Math.abs(d) < Math.abs(best.d)) best = { s, d, w };
    }
    if (!best) return out;
    season = best.s;
    for (const k of ['sow', 'potOn', 'hardenOff', 'plantOut'] as const) if (!out[k] && best.w[k]) out[k] = shiftW(best.w[k]!, best.d);
  } else {
    const known = (['harvest', 'clear'] as const).find((k) => out[k]);
    let pick: { s: number; w: Windows } | undefined;
    const y = Number((known ? out[known]!.from : todayDate).slice(0, 4));
    for (let s = y - 2; s <= y + 1; s++) {
      const w = resolveWindows(crop, p, method, place, s);
      if (known) {
        // Line up on the given harvest or clearing date.
        if (!w[known]) continue;
        const d = diffDays(out[known]!.from, w[known]!.from);
        if (!pick || Math.abs(d) < Math.abs(diffDays(out[known]!.from, pick.w[known]!.from))) pick = { s, w };
      } else if (!pick && w.clear && w.clear.to >= todayDate) {
        pick = { s, w };
      }
    }
    if (!pick) return out;
    season = pick.s;
    const d = known && pick.w[known] ? diffDays(out[known]!.from, pick.w[known]!.from) : 0;
    for (const k of ['sow', 'potOn', 'hardenOff', 'plantOut'] as const) if (!out[k] && pick.w[k]) out[k] = shiftW(pick.w[k]!, d);
  }

  if (out.plantOut && method === 'module' && !out.hardenOff)
    out.hardenOff = { from: addDays(out.plantOut.from, -HARDEN_OFF_DAYS), to: addDays(out.plantOut.from, -1) };
  if (!out.harvest || !out.clear) {
    const hw = harvestWindows(crop, p, c, place.lat, season, out);
    if (!out.harvest && hw.harvest && (!out.clear || hw.harvest.from < out.clear.from))
      out.harvest = out.clear && hw.harvest.to > out.clear.to ? { from: hw.harvest.from, to: out.clear.to } : hw.harvest;
    if (!out.clear) {
      const end = out.harvest?.to ?? hw.clear?.from;
      if (end) out.clear = { from: end, to: addDays(end, 14) };
    }
  }
  return out;
}

function shiftW(w: Window, n: number): Window {
  return { from: addDays(w.from, n), to: addDays(w.to, n) };
}

function guessOverwinter(w: Windows, c: Climate, todayDate: ISODate): boolean {
  const d = (w.sow ?? w.plantOut)?.from ?? todayDate;
  const y = Number(d.slice(0, 4));
  // Overwinter if the start is nearer to a first frost than to a last frost.
  const nearest = (md: string) => Math.min(...[y - 1, y, y + 1].map((yy) => Math.abs(diffDays(d, onYear(md, yy)))));
  return nearest(c.firstFrost) < nearest(c.lastFrost);
}
