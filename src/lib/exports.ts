// CSV exports of plantings, tasks and harvests, in plain open formats.

import type { Resolved } from './plantings';
import { OPEN_END, OPEN_START } from './plantings';
import { toCSV } from './sheets';
import type { PlanTask } from './tasks';
import type { Crop, Entry, Planting } from './types';

interface Names {
  nameOf: (p: Pick<Planting, 'varietyId'>) => string;
  cropOf: (p: Pick<Planting, 'varietyId'>) => Crop | undefined;
  areaName: (id: string | undefined) => string;
  plotName: (id: string | undefined) => string;
}

const d = (s: string | undefined) => (!s || s === OPEN_START || s === OPEN_END ? '' : s);

export function plantingsCSV(resolved: Resolved[], n: Names): string {
  const rows: (string | number | undefined)[][] = [[
    'plot', 'area', 'crop', 'variety', 'rows', 'quantity', 'unit', 'method', 'sow_from', 'sow_to', 'plant_out_from', 'plant_out_to',
    'harvest_from', 'harvest_to', 'clear_from', 'clear_to', 'status', 'agreement', 'purpose', 'notes',
  ]];
  for (const { planting: p, windows: w } of resolved) {
    rows.push([
      n.plotName(p.plotId), n.areaName(p.areaId), n.cropOf(p)?.names.en[0], n.nameOf(p), p.rows?.join(' '), p.qty, p.qtyUnit, p.method,
      d(w.sow?.from), d(w.sow?.to), d(w.plantOut?.from), d(w.plantOut?.to), d(w.harvest?.from), d(w.harvest?.to), d(w.clear?.from), d(w.clear?.to),
      p.status, p.agreement, p.purpose, p.notes,
    ]);
  }
  return toCSV(rows);
}

export function tasksCSV(tasks: PlanTask[], n: Names): string {
  const rows: (string | number | undefined)[][] = [['from', 'to', 'title', 'type', 'place', 'plot', 'area', 'quantity', 'status', 'done_on', 'agreement', 'details']];
  for (const t of [...tasks].sort((a, b) => a.window.from.localeCompare(b.window.from)))
    rows.push([t.window.from, t.window.to, t.title, t.type, t.place, n.plotName(t.plotId), n.areaName(t.areaId), t.qty, t.status, t.doneOn, t.agreement, t.details]);
  return toCSV(rows);
}

export function harvestsCSV(entries: Entry[], plantings: Map<string, Planting>, n: Names): string {
  const rows: (string | number | undefined)[][] = [['date', 'plot', 'area', 'crop', 'variety', 'grams', 'count', 'notes']];
  for (const e of [...entries].filter((x) => x.kind === 'harvest').sort((a, b) => a.date.localeCompare(b.date))) {
    const p = e.plantingId ? plantings.get(e.plantingId) : undefined;
    rows.push([e.date, n.plotName(e.plotId ?? p?.plotId), n.areaName(e.areaId ?? p?.areaId), p ? n.cropOf(p)?.names.en[0] : '', p ? n.nameOf(p) : '', e.grams, e.count, e.text]);
  }
  return toCSV(rows);
}
