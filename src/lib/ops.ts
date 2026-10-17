// Pure operations on a dataset that touch many records at once.

import { effectiveClimate, reanchorWindow } from './climate';
import { cropForVariety, type Library } from './library';
import type { Climate, Dataset, Planting, Protection, Task, Windows } from './types';

function reanchorWindows(w: Windows, from: Climate, to: Climate): Windows {
  const out: Windows = {};
  for (const [k, v] of Object.entries(w)) out[k as keyof Windows] = reanchorWindow(v, from, to);
  return out;
}

/**
 * Change a site's climate. Every planned window, in every plot on the site, keeps
 * its place relative to the local frost dates, so a plan written for one place
 * (or hemisphere) recalculates for another.
 */
export function setSiteClimate(d: Dataset, siteId: string, climate: Climate): Dataset {
  const site = d.sites.find((s) => s.id === siteId);
  if (!site) return d;
  const old = site.climate;
  const plotIds = new Set(d.plots.filter((p) => p.siteId === siteId).map((p) => p.id));
  const movePlanting = (p: Planting): Planting =>
    plotIds.has(p.plotId) && p.status !== 'cleared' && p.status !== 'failed' ? { ...p, windows: reanchorWindows(p.windows, old, climate) } : p;
  const moveTask = (t: Task): Task =>
    t.plotId && !plotIds.has(t.plotId) ? t : t.status === 'todo' ? { ...t, window: reanchorWindow(t.window, old, climate) } : t;
  return {
    ...d,
    sites: d.sites.map((s) => (s.id === siteId ? { ...s, climate } : s)),
    plantings: d.plantings.map(movePlanting),
    tasks: d.tasks.map(moveTask),
  };
}

/**
 * Change an area's protection. Tender and half-hardy plantings in it (and in its
 * sections) shift by the change in protection, so a bed under a new polytunnel
 * can be planted out earlier.
 */
export function setAreaProtection(d: Dataset, lib: Library, areaId: string, protection: Protection): Dataset {
  const area = d.areas.find((a) => a.id === areaId);
  if (!area) return d;
  const plot = d.plots.find((p) => p.id === area.plotId);
  const site = d.sites.find((s) => s.id === plot?.siteId);
  if (!site) return d;
  const inside = new Set([areaId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const a of d.areas) if (a.parentId && inside.has(a.parentId) && !inside.has(a.id)) { inside.add(a.id); grew = true; }
  }
  const before = new Map(d.areas.map((a) => [a.id, a.protection ?? 'none']));
  const areas = d.areas.map((a) => (inside.has(a.id) && (a.id === areaId || !a.protection || a.protection === area.protection) ? { ...a, protection } : a));
  const after = new Map(areas.map((a) => [a.id, a.protection ?? 'none']));
  const plantings = d.plantings.map((p) => {
    if (!inside.has(p.areaId) || p.status !== 'planned') return p;
    const crop = cropForVariety(lib, p.varietyId);
    if (!crop || crop.hardiness === 'hardy') return p;
    const from = effectiveClimate(site.climate, before.get(p.areaId), crop.hardiness);
    const to = effectiveClimate(site.climate, after.get(p.areaId), crop.hardiness);
    return { ...p, windows: reanchorWindows(p.windows, from, to) };
  });
  return { ...d, areas, plantings };
}

/** Accept drafts: they join the agreed plan. */
export function acceptDrafts(d: Dataset, ids: { plantings?: string[]; tasks?: string[] }): Dataset {
  const ps = new Set(ids.plantings ?? []);
  const ts = new Set(ids.tasks ?? []);
  return {
    ...d,
    plantings: d.plantings.map((p) => (ps.has(p.id) ? { ...p, agreement: 'agreed', importId: undefined } : p)),
    tasks: d.tasks.map((t) => (ts.has(t.id) ? { ...t, agreement: 'agreed', importId: undefined } : t)),
  };
}

/** Throw drafts away. */
export function rejectDrafts(d: Dataset, ids: { plantings?: string[]; tasks?: string[] }): Dataset {
  const ps = new Set(ids.plantings ?? []);
  const ts = new Set(ids.tasks ?? []);
  return {
    ...d,
    plantings: d.plantings.filter((p) => !(ps.has(p.id) && p.agreement === 'draft')),
    tasks: d.tasks.filter((t) => !(ts.has(t.id) && t.agreement === 'draft')),
  };
}
