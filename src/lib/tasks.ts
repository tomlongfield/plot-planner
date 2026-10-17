// Tasks: generated from plantings, plus the grower's own. Generated tasks are
// never stored; only their done/skipped state is, keyed by a stable id.

import { effectiveClimate, isSlowGrowth, seasonLastFrost, seasonOf } from './climate';
import { addDays, diffDays, minDate, overlaps, weekOf, type MonthKey, monthEnd, monthStart } from './dates';
import { OPEN_START, type Resolved } from './plantings';
import type { Agreement, Area, Climate, Crop, ISODate, Planting, Task, TaskPlace, TaskState, TaskStatus, TaskType, Window } from './types';

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export type GenKind =
  | 'sow' | 'sowDirect' | 'potOn' | 'hardenOff' | 'plantOut' | 'fleece' | 'net' | 'mesh' | 'thin'
  | 'support' | 'earthUp' | 'pinchOut' | 'chit' | 'harvest' | 'cure' | 'clear';

export interface PlanTask {
  id: string;
  generated: boolean;
  kind?: GenKind;
  plotId?: string;
  areaId?: string;
  plantingId?: string;
  place: TaskPlace;
  type: TaskType;
  title: string;
  details?: string;
  window: Window;
  qty?: string;
  status: TaskStatus;
  doneOn?: ISODate;
  agreement: Agreement;
  notes?: string;
  source?: Task;
}

interface GenContext {
  areas: Map<string, Area>;
  climate: Climate;
  cropOf: (p: Planting) => Crop | undefined;
  nameOf: (p: Planting) => string;
  t: Translate;
  /** Latitude, so jobs that depend on growth wait out the short days. */
  lat?: number;
  /** Language, for plural forms. */
  locale?: string;
}

/** Move a job that needs active growth past any short-day lull. */
function whenGrowing(w: Window, lat: number | undefined): Window {
  if (lat == null || !isSlowGrowth(lat, w.from)) return w;
  let d = w.from;
  for (let i = 0; i < 240 && isSlowGrowth(lat, d); i++) d = addDays(d, 1);
  return { from: d, to: addDays(d, Math.max(7, diffDays(w.to, w.from))) };
}

const DONE_BY_STATUS: Record<Planting['status'], GenKind[]> = {
  planned: [],
  sown: ['sow', 'sowDirect', 'chit'],
  growing: ['sow', 'sowDirect', 'potOn', 'hardenOff', 'plantOut', 'chit', 'thin'],
  harvesting: ['sow', 'sowDirect', 'potOn', 'hardenOff', 'plantOut', 'chit', 'thin', 'harvest', 'fleece', 'net', 'mesh', 'support', 'earthUp', 'pinchOut'],
  cleared: ['sow', 'sowDirect', 'potOn', 'hardenOff', 'plantOut', 'fleece', 'net', 'mesh', 'thin', 'support', 'earthUp', 'pinchOut', 'chit', 'harvest', 'cure', 'clear'],
  failed: ['sow', 'sowDirect', 'potOn', 'hardenOff', 'plantOut', 'fleece', 'net', 'mesh', 'thin', 'support', 'earthUp', 'pinchOut', 'chit', 'harvest', 'cure', 'clear'],
};


/** Tasks a planting implies, given its resolved windows. */
export function tasksForPlanting(r: Resolved, ctx: GenContext): PlanTask[] {
  const p = r.planting;
  const w = r.windows;
  const crop = ctx.cropOf(p);
  const name = ctx.nameOf(p);
  const care = new Set(crop?.care ?? []);
  const area = ctx.areas.get(p.areaId);
  const out: PlanTask[] = [];
  const stock = p.qtyUnit === 'cloves' || p.qtyUnit === 'sets' || p.qtyUnit === 'tubers';
  const qtyText = p.qty != null ? ctx.t(`unit.${p.qtyUnit ?? 'plants'}.${new Intl.PluralRules(ctx.locale ?? 'en').select(p.qty) === 'one' ? 'one' : 'other'}`, { n: p.qty }) : undefined;
  const add = (kind: GenKind, place: TaskPlace, type: TaskType, window: Window | undefined, qty?: string, details?: string) => {
    if (!window || window.from === OPEN_START) return;
    const key = kind === 'plantOut' && (stock || p.method === 'bought') ? 'task.plant' : `task.${kind}`;
    out.push({
      id: `${p.id}:${kind}`, generated: true, kind, plotId: p.plotId, areaId: place === 'plot' ? p.areaId : undefined, plantingId: p.id,
      place, type, title: ctx.t(key, { name, area: area?.name ?? '' }), details, window, qty,
      status: 'todo', agreement: p.agreement,
    });
  };

  if (p.method === 'module') {
    const cells = p.qty != null ? (p.qtyUnit === 'clumps' || p.qtyUnit === 'plugs' || p.qtyUnit === 'plants' ? p.qty : undefined) : undefined;
    const seeds = p.seedsPerCell ?? crop?.propagation?.seedsPerModule;
    const qty = cells ? ctx.t('task.qty.modules', { n: cells, seeds: seeds ?? 1 }) : undefined;
    const heat = p.bottomHeat ?? crop?.propagation?.bottomHeat;
    add('sow', 'propagation', 'sow', w.sow, qty, heat ? ctx.t('task.detail.bottomHeat', { temp: crop?.propagation?.germTempC ?? 20 }) : undefined);
    add('potOn', 'propagation', 'job', w.potOn);
    add('hardenOff', 'home', 'job', w.hardenOff);
  } else if (p.method === 'direct' || (!w.plantOut && w.sow)) {
    add('sowDirect', 'plot', 'sow', w.sow, qtyText);
    if (care.has('thin') && w.sow) add('thin', 'plot', 'job', { from: addDays(w.sow.from, 21), to: addDays(w.sow.to, 35) });
    if (care.has('mesh') && w.sow) add('mesh', 'plot', 'job', { from: w.sow.from, to: w.sow.from });
  }
  if (care.has('chit') && w.plantOut) add('chit', 'home', 'job', { from: addDays(w.plantOut.from, -42), to: addDays(w.plantOut.from, -28) });
  if (w.plantOut && (p.method !== 'direct' || !w.sow)) {
    if (care.has('support')) add('support', 'plot', 'job', whenGrowing({ from: addDays(w.plantOut.from, -7), to: w.plantOut.from }, ctx.lat));
    add('plantOut', 'plot', 'plant', w.plantOut, qtyText);
    if (care.has('net')) add('net', 'plot', 'job', { from: w.plantOut.from, to: addDays(w.plantOut.to, 1) });
    if (care.has('mesh')) add('mesh', 'plot', 'job', { from: w.plantOut.from, to: addDays(w.plantOut.to, 1) });
    if (care.has('earth-up')) add('earthUp', 'plot', 'job', whenGrowing({ from: addDays(w.plantOut.from, 28), to: addDays(w.plantOut.to, 56) }, ctx.lat));
    if (care.has('pinch-out')) add('pinchOut', 'plot', 'job', whenGrowing({ from: addDays(w.plantOut.from, 42), to: addDays(w.plantOut.to, 70) }, ctx.lat));
    // Fleece for anything frost-tender going out within two weeks of the last frost.
    if (crop && crop.hardiness !== 'hardy') {
      const c = effectiveClimate(ctx.climate, area?.protection, crop.hardiness);
      const lf = seasonLastFrost(c, seasonOf(c, addDays(w.plantOut.from, 60)));
      const d = diffDays(w.plantOut.from, lf);
      if (d > -60 && d < 14) add('fleece', 'plot', 'job', { from: w.plantOut.from, to: addDays(lf, 14) });
    }
  }
  if (care.has('fleece') && crop?.hardiness === 'hardy' && w.plantOut) {
    // Hardy winter crops: fleece ready for the hardest frosts.
    add('fleece', 'plot', 'job', { from: addDays(w.plantOut.from, 21), to: addDays(w.plantOut.from, 120) });
  }
  if (w.harvest) add('harvest', 'plot', 'harvest', { from: w.harvest.from, to: minDate(w.harvest.to, addDays(w.harvest.from, 14))! });
  if (care.has('cure') && w.harvest) add('cure', 'home', 'job', { from: w.harvest.from, to: addDays(w.harvest.to, 14) });
  if (w.clear && p.status !== 'failed') add('clear', 'plot', 'job', w.clear);

  const done = new Set(DONE_BY_STATUS[p.status]);
  for (const t of out) if (t.kind && done.has(t.kind)) t.status = 'done';
  return out;
}

/** All generated tasks, with stored done/skipped state applied. */
export function generatedTasks(resolved: Resolved[], ctx: GenContext, states: TaskState[]): PlanTask[] {
  const byId = new Map(states.map((s) => [s.id, s]));
  const out: PlanTask[] = [];
  for (const r of resolved) {
    for (const t of tasksForPlanting(r, ctx)) {
      const s = byId.get(t.id);
      if (s) Object.assign(t, { status: s.status, doneOn: s.doneOn, notes: s.notes });
      out.push(t);
    }
  }
  return out;
}

/** Manual tasks, with recurring ones expanded into occurrences inside `range`. */
export function manualTasks(tasks: Task[], range: Window, states: TaskState[]): PlanTask[] {
  const byId = new Map(states.map((s) => [s.id, s]));
  const out: PlanTask[] = [];
  for (const t of tasks) {
    const base: Omit<PlanTask, 'id' | 'window' | 'status'> = {
      generated: false, plotId: t.plotId, areaId: t.areaId, plantingId: t.plantingId, place: t.place, type: t.type,
      title: t.title, details: t.details, qty: t.qty, agreement: t.agreement, notes: t.notes, source: t,
    };
    if (!t.recurrence) {
      out.push({ ...base, id: t.id, window: t.window, status: t.status, doneOn: t.doneOn });
      continue;
    }
    const len = diffDays(t.window.to, t.window.from);
    let start = t.window.from;
    for (let i = 0; i < 400 && start <= range.to; i++) {
      if (t.recurrence.until && start > t.recurrence.until) break;
      const w = { from: start, to: addDays(start, len) };
      if (overlaps(w, range)) {
        const id = `${t.id}@${start}`;
        const s = byId.get(id);
        out.push({ ...base, id, window: w, status: s?.status ?? 'todo', doneOn: s?.doneOn });
      }
      start = stepDate(start, t.recurrence.every, t.recurrence.unit);
    }
  }
  return out;
}

function stepDate(d: ISODate, n: number, unit: 'day' | 'week' | 'month' | 'year'): ISODate {
  if (unit === 'day') return addDays(d, n);
  if (unit === 'week') return addDays(d, 7 * n);
  const [y, m, day] = d.split('-').map(Number);
  const months = unit === 'month' ? n : 12 * n;
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.toISOString().slice(0, 10);
}

export function tasksInMonth(tasks: PlanTask[], k: MonthKey): PlanTask[] {
  const m = { from: monthStart(k), to: monthEnd(k) };
  return sortTasks(tasks.filter((t) => overlaps(t.window, m)));
}

export function sortTasks(tasks: PlanTask[]): PlanTask[] {
  return [...tasks].sort((a, b) => a.window.from.localeCompare(b.window.from) || a.title.localeCompare(b.title));
}

export function isElsewhere(t: PlanTask): boolean {
  return t.place !== 'plot';
}

/** Open tasks whose window has started or starts within `days`, overdue first. */
export function nextUp(tasks: PlanTask[], now: ISODate, days = 14): PlanTask[] {
  const horizon = addDays(now, days);
  return sortTasks(tasks.filter((t) => t.status === 'todo' && t.agreement === 'agreed' && t.window.from <= horizon && t.window.to >= addDays(now, -30)));
}

export function thisWeek(tasks: PlanTask[], now: ISODate, weekStart: 0 | 1 = 1): PlanTask[] {
  const w = weekOf(now, weekStart);
  return sortTasks(tasks.filter((t) => overlaps(t.window, w)));
}

export function isOverdue(t: PlanTask, now: ISODate): boolean {
  return t.status === 'todo' && t.window.to < now;
}
