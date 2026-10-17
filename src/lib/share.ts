// Sharing without a server. A shared plan is a slice of the dataset: one or
// more plots with their layout, plantings and tasks, plus any custom crops and
// varieties they use. It travels as a file or inside a link's #fragment, which
// browsers never send to a server. Imports never overwrite anything: they
// arrive as drafts in one of your plots, or as a separate garden.

import { uid } from './ids';
import { SCHEMA_VERSION, type Area, type Crop, type Dataset, type Feature, type Import, type Planting, type Plot, type Site, type Task, type Variety } from './types';

export const SHARE_FORMAT = 'plot-planner-share';
/** Links longer than this get unreliable in messaging apps and email. */
export const LINK_LIMIT = 12_000;

export interface SharePayload {
  format: typeof SHARE_FORMAT;
  schemaVersion: number;
  sharedAt: string;
  site: Site;
  plots: Plot[];
  areas: Area[];
  features: Feature[];
  plantings: Planting[];
  tasks: Task[];
  cropOverrides: Crop[];
  varieties: Variety[];
}

export function buildShare(d: Dataset, plotIds: string[], includeLocation: boolean, now = new Date()): SharePayload {
  const ids = new Set(plotIds);
  const plots = d.plots.filter((p) => ids.has(p.id));
  const site = d.sites.find((s) => s.id === plots[0]?.siteId) ?? d.sites[0];
  const plantings = d.plantings.filter((p) => ids.has(p.plotId)).map((p) => ({ ...p, stockLotId: undefined, importId: undefined }));
  const varietyIds = new Set(plantings.map((p) => p.varietyId));
  const varieties = d.varieties.filter((v) => varietyIds.has(v.id));
  const cropIds = new Set(varieties.map((v) => v.cropId));
  for (const v of varietyIds) cropIds.add(v.split('--')[0]);
  const cropOverrides = d.cropOverrides.filter((c) => cropIds.has(c.id));
  const areaIds = new Set(d.areas.filter((a) => ids.has(a.plotId)).map((a) => a.id));
  const tasks = d.tasks
    .filter((t) => (t.plotId && ids.has(t.plotId)) || (t.areaId && areaIds.has(t.areaId)) || (!t.plotId && !t.areaId))
    .map((t) => ({ ...t, notes: undefined }));
  return {
    format: SHARE_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    sharedAt: now.toISOString(),
    site: {
      ...site,
      // The location goes only if the grower ticks the box. Day length then
      // uses a typical mid-latitude for the hemisphere.
      location: includeLocation ? site.location : { lat: site.climate.hemisphere === 'S' ? -50 : 50, lon: 0, label: '' },
    },
    plots,
    areas: d.areas.filter((a) => ids.has(a.plotId)),
    features: d.features.filter((f) => ids.has(f.plotId)),
    plantings,
    tasks,
    cropOverrides,
    varieties,
  };
}

// ── Encoding ───────────────────────────────────────────

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(t);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Drop empty and undefined values so links stay short. */
function compact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(compact);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined || x === null || x === '' || (Array.isArray(x) && !x.length && k !== 'germTests')) continue;
      out[k] = compact(x);
    }
    return out;
  }
  return v;
}

/** The part after '#share=': compressed JSON in URL-safe base64. */
export async function encodeShare(p: SharePayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(compact(p)));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeShare(fragment: string): Promise<SharePayload> {
  const data = fragment.replace(/^#?share=/, '');
  let text: string;
  try {
    text = new TextDecoder().decode(await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw')));
  } catch {
    throw new Error('link');
  }
  return parseShare(text);
}

export function parseShare(text: string): SharePayload {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('json');
  }
  if (raw?.format !== SHARE_FORMAT || !Array.isArray(raw.plots) || !raw.site) throw new Error('format');
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > SCHEMA_VERSION) throw new Error('newer');
  const p = raw as unknown as SharePayload;
  for (const k of ['areas', 'features', 'plantings', 'tasks', 'cropOverrides', 'varieties'] as const) p[k] = (p[k] ?? []) as never;
  for (const pl of p.plantings) {
    pl.windows ??= {};
    pl.actual ??= {};
  }
  for (const t of p.tasks) t.window ??= { from: '', to: '' };
  return p;
}

// ── Importing ──────────────────────────────────────────

function newImport(source: Import['source'], from?: string): Import {
  return { id: uid('imp'), createdAt: new Date().toISOString(), source, from, changes: [], status: 'open' };
}

/** Bring in custom crops and varieties the plan uses, without replacing your own. */
function addLibrary(d: Dataset, p: SharePayload, imp: Import): void {
  for (const c of p.cropOverrides) {
    if (d.cropOverrides.some((x) => x.id === c.id)) continue;
    d.cropOverrides.push(c);
    imp.changes.push({ kind: 'add', store: 'cropOverrides', id: c.id });
  }
  for (const v of p.varieties) {
    if (d.varieties.some((x) => x.id === v.id)) continue;
    d.varieties.push(v);
    imp.changes.push({ kind: 'add', store: 'varieties', id: v.id });
  }
}

/**
 * Add a shared plan as a separate garden: a new site with its own plots. Its
 * plantings and tasks arrive as drafts, so nothing joins a plan until accepted.
 */
export function importAsGarden(d: Dataset, p: SharePayload, source: Import['source'], from?: string): { data: Dataset; importId: string; siteId: string } {
  const out = structuredClone(d);
  const imp = newImport(source, from);
  const siteId = uid('site');
  out.sites.push({ ...p.site, id: siteId, name: from ? `${p.site.name} (${from})` : p.site.name });
  imp.changes.push({ kind: 'add', store: 'sites', id: siteId });
  const ids = new Map<string, string>();
  const map = (old: string | undefined, prefix: string) => {
    if (!old) return undefined;
    if (!ids.has(old)) ids.set(old, uid(prefix));
    return ids.get(old)!;
  };
  for (const pl of p.plots) {
    const id = map(pl.id, 'plot')!;
    out.plots.push({ ...pl, id, siteId });
    imp.changes.push({ kind: 'add', store: 'plots', id });
  }
  // Areas reference parents, so map every id before copying.
  for (const a of p.areas) map(a.id, 'area');
  for (const a of p.areas) out.areas.push({ ...a, id: map(a.id, 'area')!, plotId: map(a.plotId, 'plot')!, parentId: map(a.parentId, 'area') });
  for (const f of p.features) out.features.push({ ...f, id: uid('feat'), plotId: map(f.plotId, 'plot')! });
  for (const pl of p.plantings) map(pl.id, 'pl');
  for (const pl of p.plantings) {
    const id = map(pl.id, 'pl')!;
    out.plantings.push({ ...pl, id, plotId: map(pl.plotId, 'plot')!, areaId: map(pl.areaId, 'area')!, followsPlantingId: map(pl.followsPlantingId, 'pl'), agreement: 'draft', importId: imp.id });
    imp.changes.push({ kind: 'add', store: 'plantings', id });
  }
  for (const t of p.tasks) {
    const id = uid('task');
    out.tasks.push({ ...t, id, plotId: map(t.plotId, 'plot'), areaId: map(t.areaId, 'area'), plantingId: map(t.plantingId, 'pl'), agreement: 'draft', importId: imp.id });
    imp.changes.push({ kind: 'add', store: 'tasks', id });
  }
  addLibrary(out, p, imp);
  out.imports.push(imp);
  return { data: out, importId: imp.id, siteId };
}

/** Match shared areas to one of your plots by name (case-insensitive). */
export function matchAreas(sharedAreas: Area[], targetAreas: Area[]): Map<string, string> {
  const byName = new Map(targetAreas.map((a) => [a.name.trim().toLowerCase(), a.id]));
  const out = new Map<string, string>();
  for (const a of sharedAreas) {
    const hit = byName.get(a.name.trim().toLowerCase());
    if (hit) out.set(a.id, hit);
  }
  return out;
}

/**
 * Add a shared plan's plantings and tasks to one of your plots as drafts, in
 * the areas with matching names. Plantings in areas you don't have are left out
 * and counted, so you can choose the separate-garden option instead.
 */
export function importIntoPlot(
  d: Dataset, p: SharePayload, sharedPlotId: string, targetPlotId: string, source: Import['source'], from?: string,
): { data: Dataset; importId: string; added: number; skipped: number } {
  const out = structuredClone(d);
  const imp = newImport(source, from);
  const areaMap = matchAreas(p.areas.filter((a) => a.plotId === sharedPlotId), out.areas.filter((a) => a.plotId === targetPlotId));
  const ids = new Map<string, string>();
  const plantings = p.plantings.filter((x) => x.plotId === sharedPlotId);
  for (const pl of plantings) if (areaMap.has(pl.areaId)) ids.set(pl.id, uid('pl'));
  let added = 0;
  for (const pl of plantings) {
    const id = ids.get(pl.id);
    if (!id) continue;
    out.plantings.push({
      ...pl, id, plotId: targetPlotId, areaId: areaMap.get(pl.areaId)!,
      followsPlantingId: pl.followsPlantingId ? ids.get(pl.followsPlantingId) : undefined,
      status: 'planned', actual: {}, agreement: 'draft', importId: imp.id,
    });
    imp.changes.push({ kind: 'add', store: 'plantings', id });
    added++;
  }
  for (const t of p.tasks.filter((x) => !x.plotId || x.plotId === sharedPlotId)) {
    if (t.areaId && !areaMap.has(t.areaId)) continue;
    const id = uid('task');
    out.tasks.push({ ...t, id, plotId: targetPlotId, areaId: t.areaId ? areaMap.get(t.areaId) : undefined, plantingId: t.plantingId ? ids.get(t.plantingId) : undefined, status: 'todo', agreement: 'draft', importId: imp.id });
    imp.changes.push({ kind: 'add', store: 'tasks', id });
  }
  addLibrary(out, p, imp);
  out.imports.push(imp);
  return { data: out, importId: imp.id, added, skipped: plantings.length - added };
}

/** Mark an import done once none of its drafts remain. */
export function settleImports(d: Dataset): Dataset {
  for (const imp of d.imports) {
    if (imp.status !== 'open') continue;
    const open = d.plantings.some((p) => p.importId === imp.id) || d.tasks.some((t) => t.importId === imp.id);
    if (!open) imp.status = 'accepted';
  }
  return d;
}
