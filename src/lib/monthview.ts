// What each area shows in a month: colour, label, detail lines and outlines.

import { isSlowGrowth, seasonLastFrost, seasonFirstFrost, seasonOf } from './climate';
import { addDays, diffDays, monthEnd, monthStart, type MonthKey } from './dates';
import { range as fmtRange, t, tn } from './i18n';
import { areaExists, inMonth, inSpan, monthSpan, OPEN_END, OPEN_START, type AreaMonthState, type Resolved } from './plantings';
import type { PlanTask } from './tasks';
import type { Area, Category, Climate, Crop, Planting, Window } from './types';

export interface Cell {
  areaId: string;
  fill: string;
  /** From the fullest label to the shortest. */
  labels: string[];
  /** Short labels for small multiples. */
  shortLabels: string[];
  details: string[];
  changes: boolean;
  draft: boolean;
  /** For row areas: the fill of each row (1-based index - 1). */
  rowFills?: (string | null)[];
  empty: boolean;
  exists: boolean;
  /** Accessible description. */
  description: string;
}

export function categoryVar(c: Category | undefined): string {
  return c ? `var(--c-${c})` : 'var(--c-empty)';
}

export interface CellDeps {
  cropOf: (p: Planting) => Crop | undefined;
  nameOf: (p: Planting) => string;
  shortNameOf: (p: Planting) => string;
  lat: number;
}

function qtyText(p: Planting): string | undefined {
  if (p.qty == null) return undefined;
  if (p.qtyUnit === 'clumps' && p.perClump) return t('qty.clumpsOf', { n: p.qty, per: p.perClump });
  return tn(`unit.${p.qtyUnit ?? 'plants'}`, p.qty);
}

function abbreviate(s: string): string {
  const words = s.replace(/\(.*?\)/g, '').trim().split(/\s+/);
  if (words.length > 1) return words.map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 3);
  return s.slice(0, 3);
}

/** The middle day of a span, used for day-length questions. */
function midOf(w: Window): string {
  return addDays(w.from, Math.floor(diffDays(w.to, w.from) / 2));
}

/** A one-line description of what a planting is doing in a month (or any span). */
export function eventText(r: Resolved, k: MonthKey | Window, lat: number): string {
  const span = typeof k === 'string' ? monthSpan(k) : k;
  const w = r.windows;
  const p = r.planting;
  const occ = r.occupancy;
  if (inSpan(occ.from, span) && occ.from !== OPEN_START) {
    const win = p.method === 'direct' || (!w.plantOut && w.sow) ? w.sow : w.plantOut;
    const key = p.method === 'direct' || (!w.plantOut && w.sow) ? 'cell.sow' : p.qtyUnit === 'cloves' || p.qtyUnit === 'sets' || p.qtyUnit === 'tubers' || p.method === 'bought' ? 'cell.plant' : 'cell.plantOut';
    return t(key, { when: win ? fmtRange(win.from, win.to) : '' });
  }
  if (w.clear && inSpan(w.clear.from, span) && occ.to !== OPEN_END) return t('cell.clear', { when: fmtRange(w.clear.from, w.clear.to) });
  if (w.harvest && inSpan(w.harvest.from, span)) return t('cell.harvestFrom', { when: fmtRange(w.harvest.from, w.harvest.from) });
  if (w.harvest && w.harvest.from <= span.to && w.harvest.to >= span.from) return t('cell.harvesting');
  if (isSlowGrowth(lat, midOf(span))) return t('cell.slow');
  return t('cell.growing');
}

/** The colour, labels and outlines for one area in one month. */
export function cellFor(a: Area, s: AreaMonthState | undefined, k: MonthKey | Window, deps: CellDeps, isParent: boolean): Cell {
  const span = typeof k === 'string' ? monthSpan(k) : k;
  const exists = areaExists(a, span);
  const ps = s?.plantings ?? [];
  const cropFill = (r: Resolved) => categoryVar(deps.cropOf(r.planting)?.category);
  const base: Cell = {
    areaId: a.id, fill: a.perennial ? categoryVar(a.fill) : 'var(--c-empty)', labels: [], shortLabels: [], details: [], changes: false, draft: false,
    empty: !ps.length, exists, description: a.name,
  };
  if (!exists) return base;
  if (!ps.length) {
    base.changes = !!s?.changes;
    if (a.perennial && !isParent) {
      base.labels = [t('cell.perennial')];
    } else if (!isParent) {
      base.labels = [t('cell.empty')];
    }
    // A clearing at the very start of the month still counts as a change.
    base.description = `${a.name}: ${base.labels[0] ?? ''}`;
    return base;
  }

  // Agreed plantings lead; drafts follow.
  const ordered = [...ps].sort((x, y) => Number(x.planting.agreement === 'draft') - Number(y.planting.agreement === 'draft') || x.occupancy.from.localeCompare(y.occupancy.from));
  const lead = ordered.find((r) => r.planting.agreement === 'agreed') ?? ordered[0];
  // Successions within the month read as "Fennel → Winter spinach".
  const seq = ordered.filter((r, i, arr) => arr.findIndex((x) => x.planting.varietyId === r.planting.varietyId) === i);
  const together = seq.some((r) => r.planting.interplanted || r.planting.rows?.length);
  const joiner = together ? ' + ' : ' → ';
  const names = seq.map((r) => deps.nameOf(r.planting));
  const shorts = seq.map((r) => deps.shortNameOf(r.planting));
  const labels = [names.join(joiner), shorts.join(joiner), shorts.length > 1 ? shorts.map(abbreviate).join(joiner.trim()) : abbreviate(shorts[0])];
  const uniq = labels.filter((l, i) => labels.indexOf(l) === i);
  const shortLabels = labels.slice(1).filter((l, i, arr) => arr.indexOf(l) === i);

  const details: string[] = [];
  for (const r of seq) {
    const e = eventText(r, span, deps.lat);
    const q = qtyText(r.planting);
    if (seq.length === 1) {
      details.push(e);
      if (q) details.push(q);
    } else details.push(e);
  }

  let rowFills: (string | null)[] | undefined;
  if (a.kind === 'rows' && a.rows) {
    rowFills = Array.from({ length: a.rows }, (_, i) => {
      const r = ordered.find((x) => !x.planting.rows?.length || x.planting.rows.includes(i + 1));
      return r ? cropFill(r) : null;
    });
  }
  const draft = !!s?.hasDraft;
  return {
    ...base, fill: cropFill(lead), labels: uniq, shortLabels, details, changes: !!s?.changes, draft, rowFills, empty: false,
    description: `${a.name}: ${names.join(joiner)}. ${details.join('. ')}${draft ? `. ${t('draft')}` : ''}`,
  };
}

export interface MonthSummary { text: string; slow: boolean; lastFrost?: string; firstFrost?: string }

export function monthSummary(k: MonthKey, cells: Map<string, AreaMonthState>, plotTasks: PlanTask[], elsewhere: PlanTask[], c: Climate, lat: number): MonthSummary {
  let goingIn = 0;
  let harvests = 0;
  let clears = 0;
  const seen = new Set<string>();
  for (const s of cells.values()) {
    for (const e of s.events) {
      const id = `${e.planting.planting.id}:${e.event}`;
      if (seen.has(id) || e.planting.planting.agreement === 'draft') continue;
      seen.add(id);
      if (e.event === 'new') goingIn++;
      if (e.event === 'harvest') harvests++;
      if (e.event === 'clear') clears++;
    }
  }
  const parts: string[] = [];
  if (goingIn) parts.push(tn('summary.goingIn', goingIn));
  if (harvests) parts.push(tn('summary.harvests', harvests));
  if (clears) parts.push(tn('summary.clears', clears));
  const open = (ts: PlanTask[]) => ts.filter((x) => x.status === 'todo').length;
  if (!parts.length && !open(plotTasks)) parts.push(t('summary.quiet'));
  if (open(elsewhere)) parts.push(tn('summary.elsewhere', open(elsewhere)));
  const slow = isSlowGrowth(lat, `${k}-15`);
  const season = seasonOf(c, `${k}-15`);
  const lf = [seasonLastFrost(c, season), seasonLastFrost(c, season + 1)].find((d) => inMonth(d, k));
  const ff = [seasonFirstFrost(c, season - 1), seasonFirstFrost(c, season)].find((d) => inMonth(d, k));
  return { text: sentence(parts), slow, lastFrost: lf, firstFrost: ff };
}

function sentence(parts: string[]): string {
  if (!parts.length) return '';
  const s = parts.join(t('summary.sep'));
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}
