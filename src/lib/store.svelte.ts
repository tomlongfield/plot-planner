// The app's single source of truth. Views read derived values from here and
// change data only through `update`, which records undo history and saves.

import { emptyDataset, migrate } from './backup';
import { allPlotWarnings, seedWarnings, type Warning } from './checks';
import { addMonths, monthKey, today } from './dates';
import { loadDataset, requestPersistence, saveDataset } from './db';
import { demoDataset } from './demo';
import { setLocale, t } from './i18n';
import { buildLibrary, bundledCrops, cropForVariety, cropName, type Library } from './library';
import { planSpan, resolvePlantings, type Resolved } from './plantings';
import { propagationLoad } from './propagation';
import { generatedTasks, manualTasks, type PlanTask } from './tasks';
import type { Area, Crop, Dataset, Feature, Planting, Plot, Site } from './types';

export type View = 'month' | 'timeline' | 'rotation' | 'plan' | 'plantings' | 'tasks' | 'journal' | 'propagation' | 'seeds' | 'crops' | 'settings' | 'help';
export interface Route { view: View; arg?: string }

const BUNDLED = bundledCrops();
const APP_VERSION = __APP_VERSION__;
const UNDO_LIMIT = 40;

function parseHash(h: string): Route {
  const [view, arg] = h.replace(/^#\/?/, '').split('/');
  const views: View[] = ['month', 'timeline', 'rotation', 'plan', 'plantings', 'tasks', 'journal', 'propagation', 'seeds', 'crops', 'settings', 'help'];
  return views.includes(view as View) ? { view: view as View, arg: arg ? decodeURIComponent(arg) : undefined } : { view: 'month' };
}

class App {
  data: Dataset = $state(emptyDataset(APP_VERSION));
  ready = $state(false);
  route: Route = $state(parseHash(typeof location !== 'undefined' ? location.hash : ''));
  /** Set when the page was opened from a shared link (#share=…). */
  shareFragment: string | null = $state(typeof location !== 'undefined' && location.hash.startsWith('#share=') ? location.hash : null);
  toast: { message: string; undo?: boolean; id: number } | null = $state(null);
  undoStack: { label: string; data: Dataset }[] = [];
  /** How many steps can be undone (the stack itself isn't reactive, to keep snapshots cheap). */
  undoCount = $state(0);
  today = $state(today());
  /** Set when the stored data fails to load, so we never overwrite it. */
  loadError = $state<string | null>(null);

  lib: Library = $derived(buildLibrary(BUNDLED, this.data.cropOverrides, this.data.varieties));
  site: Site | undefined = $derived(this.data.sites.find((s) => s.id === this.data.settings.activeSiteId) ?? this.data.sites[0]);
  plot: Plot | undefined = $derived(
    this.data.plots.find((p) => p.id === this.data.settings.activePlotId) ?? this.data.plots.find((p) => p.siteId === this.site?.id),
  );
  plots: Plot[] = $derived(this.data.plots.filter((p) => p.siteId === this.site?.id));
  areas: Area[] = $derived(this.data.areas.filter((a) => a.plotId === this.plot?.id));
  features: Feature[] = $derived(this.data.features.filter((f) => f.plotId === this.plot?.id));
  units = $derived(this.site?.units ?? 'metric');

  /** Every planting on the site, resolved (successions applied). */
  resolved: Map<string, Resolved> = $derived(
    resolvePlantings(
      this.data.plantings.filter((p) => this.plots.some((pl) => pl.id === p.plotId)),
      (p) => this.cropOf(p),
    ),
  );
  plotResolved: Resolved[] = $derived([...this.resolved.values()].filter((r) => r.planting.plotId === this.plot?.id));

  warnings: Warning[] = $derived(this.computeWarnings());
  tasks: PlanTask[] = $derived(this.computeTasks());

  /** Months shown in the month view. */
  months: string[] = $derived(this.computeMonths());

  // ── Lookups ────────────────────────────────────────────

  cropOf = (p: Pick<Planting, 'varietyId'>): Crop | undefined => cropForVariety(this.lib, p.varietyId);
  cropOfVariety = (varietyId: string): Crop | undefined => cropForVariety(this.lib, varietyId);
  varietyName = (varietyId: string): string => this.lib.varieties.get(varietyId)?.name ?? varietyId;
  nameOf = (p: Pick<Planting, 'varietyId'>): string => this.varietyName(p.varietyId);
  /** A short name for tight spaces: the crop name. */
  shortNameOf = (p: Pick<Planting, 'varietyId'>): string => {
    const c = this.cropOf(p);
    return c ? cropName(c, this.site?.locale) : this.nameOf(p);
  };
  areaName = (id: string | undefined): string => (id ? (this.data.areas.find((a) => a.id === id)?.name ?? '') : '');
  plotName = (id: string | undefined): string => (id ? (this.data.plots.find((p) => p.id === id)?.name ?? '') : '');

  // ── Loading and saving ─────────────────────────────────

  async init(): Promise<void> {
    window.addEventListener('hashchange', () => {
      if (location.hash.startsWith('#share=')) this.shareFragment = location.hash;
      else this.route = parseHash(location.hash);
    });
    try {
      const stored = await loadDataset();
      if (stored && (stored.plots?.length || stored.sites?.length)) {
        this.data = migrate(stored as Record<string, unknown>, APP_VERSION);
      } else {
        this.data = demoDataset(buildLibrary(BUNDLED, [], []));
        await saveDataset($state.snapshot(this.data) as Dataset);
      }
    } catch (e) {
      // IndexedDB can be unavailable (private windows in some browsers). Run on the demo in memory.
      this.loadError = String(e);
      this.data = demoDataset(buildLibrary(BUNDLED, [], []));
    }
    setLocale(this.site?.locale ?? navigator.language ?? 'en-GB');
    this.ready = true;
    requestPersistence();
    // Keep "today" right if the app is left open past midnight.
    setInterval(() => {
      const d = today();
      if (d !== this.today) this.today = d;
    }, 60_000);
  }

  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private save(): void {
    if (this.loadError) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      saveDataset($state.snapshot(this.data) as Dataset).catch((e) => this.notify(t('error.save', { error: String(e) })));
    }, 200);
  }

  /** Change data. `label` names the change for the undo toast. */
  update(label: string | null, fn: (d: Dataset) => Dataset | void): void {
    const before = $state.snapshot(this.data) as Dataset;
    const result = fn(this.data);
    if (result) this.data = result;
    this.undoStack.push({ label: label ?? '', data: before });
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.undoCount = this.undoStack.length;
    this.save();
    if (label) this.notify(label, true);
  }

  /** Record a change already made live (e.g. a drag), so it can be undone as one step. */
  commit(label: string | null, before: Dataset): void {
    this.undoStack.push({ label: label ?? '', data: before });
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.undoCount = this.undoStack.length;
    this.save();
  }

  /** Change data live without an undo step; pair with `commit`. */
  live(fn: (d: Dataset) => void): void {
    fn(this.data);
  }

  snapshot(): Dataset {
    return $state.snapshot(this.data) as Dataset;
  }

  /** Replace everything, e.g. on restore. */
  replace(d: Dataset, label: string): void {
    this.update(label, () => d);
    setLocale(this.site?.locale ?? 'en-GB');
  }

  undo(): void {
    const last = this.undoStack.pop();
    this.undoCount = this.undoStack.length;
    if (!last) return;
    this.data = last.data;
    this.save();
    this.notify(t('toast.undone', { label: last.label }));
  }

  notify(message: string, undo = false): void {
    const id = Date.now();
    this.toast = { message, undo, id };
    setTimeout(() => {
      if (this.toast?.id === id) this.toast = null;
    }, undo ? 6000 : 4000);
  }

  go(view: View, arg?: string): void {
    const h = `#/${view}${arg ? `/${encodeURIComponent(arg)}` : ''}`;
    if (location.hash !== h) location.hash = h;
    else this.route = { view, arg };
  }

  // ── Derived calculations ───────────────────────────────

  private computeWarnings(): Warning[] {
    if (!this.plot || !this.site) return [];
    const plantingWarnings = allPlotWarnings({
      plot: this.plot, areas: this.areas, resolved: this.plotResolved, climate: this.site.climate, lat: this.site.location.lat,
      cropOf: this.cropOf, nameOf: this.nameOf, entries: this.data.entries, rotationYears: this.data.settings.rotationYears, today: this.today,
    });
    const seed = seedWarnings(this.data.stock, this.cropOfVariety, this.varietyName, this.today);
    // Propagation spaces over capacity in the coming months.
    const spaces = this.data.propSpaces.filter((s) => s.siteId === this.site!.id);
    const prop: Warning[] = propagationLoad([...this.resolved.values()], spaces, this.data.reservations, {
      from: this.today, weeks: 26, weekStart: this.site.weekStart ?? 1, cropOf: this.cropOf, nameOf: this.nameOf,
    }).flatMap((l) => l.over.length ? [{
      id: `propCapacity:${l.space.id}`, kind: 'propCapacity' as const, level: 'warn' as const,
      params: { space: l.space.name, needed: Math.max(...l.over.map((w) => w.used)), unit: t(`prop.unit.${l.space.unit}`), week: l.over[0].week, capacity: l.space.capacity },
    }] : []);
    return [...plantingWarnings, ...seed, ...prop];
  }

  private computeTasks(): PlanTask[] {
    if (!this.site) return [];
    const plotIds = new Set(this.plots.map((p) => p.id));
    const gen = generatedTasks(
      [...this.resolved.values()],
      { areas: new Map(this.data.areas.map((a) => [a.id, a])), climate: this.site.climate, cropOf: this.cropOf, nameOf: this.nameOf, t, lat: this.site.location.lat },
      this.data.taskStates,
    );
    const range = { from: `${addMonths(monthKey(this.today), -12)}-01`, to: `${addMonths(monthKey(this.today), 24)}-01` };
    const manual = manualTasks(this.data.tasks.filter((x) => !x.plotId || plotIds.has(x.plotId)), range, this.data.taskStates);
    return [...gen, ...manual];
  }

  private computeMonths(): string[] {
    const r = this.data.settings.monthRange;
    if (r.mode === 'fixed') return Array.from({ length: Math.max(1, Math.min(36, r.months)) }, (_, i) => addMonths(r.from, i));
    // Auto: from this month (or the plan's start, if later) to the end of the plan, at least 6 and at most 18 months.
    const span = planSpan(this.plotResolved.filter((x) => x.occupancy.to >= this.today || x.windows.clear?.to == null));
    const now = monthKey(this.today);
    let from = now;
    if (span && monthKey(span.from) > now) from = monthKey(span.from);
    let to = span ? monthKey(span.to) : addMonths(from, 11);
    if (to < addMonths(from, 5)) to = addMonths(from, 5);
    if (to > addMonths(from, 17)) to = addMonths(from, 17);
    const out: string[] = [];
    for (let k = from; k <= to; k = addMonths(k, 1)) out.push(k);
    return out;
  }
}

export const app = new App();
