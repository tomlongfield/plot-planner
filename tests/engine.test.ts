import { describe, expect, it } from 'vitest';
import { capacityFor, gridFit } from '../src/lib/capacity';
import { allPlotWarnings, crossingWarnings, endDateWarnings, type CheckContext } from '../src/lib/checks';
import { anchorOf, dayLengthHours, effectiveClimate, frostFreeDays, reanchorDate, seasonFirstFrost, seasonName } from '../src/lib/climate';
import { addDays, diffDays, parseLooseDate } from '../src/lib/dates';
import { demoDataset, demoYearShift, shiftPlanting } from '../src/lib/demo';
import { buildLibrary, bundledCrops, cropForVariety, matchCrop, varietiesOf } from '../src/lib/library';
import { setAreaProtection, setSiteClimate } from '../src/lib/ops';
import { monthState, planSpan, resolvePlantings } from '../src/lib/plantings';
import { fillWindows, nextSeason, resolveWindows } from '../src/lib/resolve';
import { generatedTasks } from '../src/lib/tasks';
import type { Climate, Dataset, Planting } from '../src/lib/types';

const lib = buildLibrary(bundledCrops(), [], []);
const NOW = '2026-10-17';
const demo = () => demoDataset(lib, NOW);
const cropOf = (p: Planting) => cropForVariety(lib, p.varietyId);
const nameOf = (p: Planting) => lib.varieties.get(p.varietyId)?.name ?? p.varietyId;
const resolveAll = (d: Dataset) => resolvePlantings(d.plantings, cropOf);
const ctxFor = (d: Dataset): CheckContext => ({
  plot: d.plots[0], areas: d.areas, resolved: [...resolveAll(d).values()], climate: d.sites[0].climate, lat: d.sites[0].location.lat,
  cropOf, nameOf, entries: d.entries, rotationYears: 3, today: NOW,
});
const UK: Climate = { hemisphere: 'N', lastFrost: '05-15', firstFrost: '10-20', source: 'user' };
const SOUTH: Climate = { hemisphere: 'S', lastFrost: '10-15', firstFrost: '04-20', source: 'user' };

describe('dates', () => {
  it('parses the mixed formats people put in seed spreadsheets', () => {
    expect(parseLooseDate('11/2025')).toBe('2025-11-01');
    expect(parseLooseDate('2026-02-17')).toBe('2026-02-17');
    expect(parseLooseDate('Dec 2025')).toBe('2025-12-01');
    expect(parseLooseDate('December 2025')).toBe('2025-12-01');
    expect(parseLooseDate('17/02/2026')).toBe('2026-02-17');
    expect(parseLooseDate('02/17/2026')).toBe('2026-02-17');
    expect(parseLooseDate('3 March 2026')).toBe('2026-03-03');
    expect(parseLooseDate('Gift')).toBeUndefined();
    expect(parseLooseDate('')).toBeUndefined();
    expect(parseLooseDate(46000)).toBe('2025-12-09');
  });
});

describe('climate', () => {
  it('works out frost-free days in both hemispheres', () => {
    expect(frostFreeDays(UK)).toBe(158);
    expect(frostFreeDays(SOUTH)).toBe(187);
  });

  it('finds the first frost that closes a southern season in the next calendar year', () => {
    expect(seasonFirstFrost(SOUTH, 2026)).toBe('2027-04-20');
  });

  it('anchors dates to the nearest frost event', () => {
    expect(anchorOf('2026-10-15', UK)).toEqual({ anchor: 'firstFrost', occurrence: '2026-10-20', offset: -5 });
    expect(anchorOf('2027-06-15', UK)).toEqual({ anchor: 'lastFrost', occurrence: '2027-05-15', offset: 31 });
  });

  it('moves dates forward into the southern season rather than into the past', () => {
    expect(reanchorDate('2026-10-15', UK, SOUTH)).toBe('2027-04-15');
    expect(reanchorDate('2027-06-15', UK, SOUTH)).toBe('2027-11-15');
  });

  it('keeps dates in place when only frost dates move a little', () => {
    const later = { ...UK, lastFrost: '05-22' };
    expect(reanchorDate('2027-05-20', UK, later)).toBe('2027-05-27');
    expect(reanchorDate('2026-10-15', UK, later)).toBe('2026-10-15');
  });

  it('shifts frost dates for tender crops under protection only', () => {
    expect(effectiveClimate(UK, 'polytunnel', 'tender')).toMatchObject({ lastFrost: '04-17', firstFrost: '11-17' });
    expect(effectiveClimate(UK, 'polytunnel', 'hardy')).toEqual(UK);
  });

  it('computes day length', () => {
    expect(dayLengthHours(54.2, '2026-06-21')).toBeCloseTo(16.9, 1);
    expect(dayLengthHours(54.2, '2026-12-21')).toBeLessThan(7.5);
    expect(dayLengthHours(-54.2, '2026-12-21')).toBeCloseTo(16.9, 1);
  });

  it('names seasons by hemisphere', () => {
    expect(seasonName(10, 'N')).toBe('autumn');
    expect(seasonName(10, 'S')).toBe('spring');
  });
});

describe('crop library', () => {
  it('loads every bundled crop with varieties', () => {
    expect(lib.crops.size).toBeGreaterThanOrEqual(45);
    expect(varietiesOf(lib, 'garlic').map((v) => v.name)).toContain('Garlic (softneck)');
  });

  it('applies variety overrides', () => {
    expect(cropForVariety(lib, 'potato--first-early')?.daysToHarvest).toBe(80);
  });

  it('matches free-text crop names, typos and plurals', () => {
    expect(matchCrop(lib, 'Dwarf French beans')?.crop.id).toBe('french-bean');
    expect(matchCrop(lib, 'Courgettes')?.crop.id).toBe('courgette');
    expect(matchCrop(lib, 'Beetrot')?.crop.id).toBe('beetroot');
    expect(matchCrop(lib, 'Zucchini')?.crop.id).toBe('courgette');
    expect(matchCrop(lib, 'Tomato', 'Sungold')?.variety?.id).toBe('tomato--sungold');
    expect(matchCrop(lib, 'Mystery plant xyz')).toBeUndefined();
  });

  it('lets user edits override a bundled crop without losing its varieties', () => {
    const garlic = lib.crops.get('garlic')!;
    const edited = buildLibrary(bundledCrops(), [{ ...garlic, daysToHarvest: 250, varieties: undefined }], []);
    expect(edited.crops.get('garlic')!.daysToHarvest).toBe(250);
    expect(edited.crops.get('garlic')!.varieties?.length).toBe(garlic.varieties!.length);
  });
});

describe('resolving timing rules', () => {
  const place = { climate: UK, lat: 54.2 };

  it('works out indoor sowing as plant-out minus days in module', () => {
    const tomato = lib.crops.get('tomato')!;
    const w = resolveWindows(tomato, 'main', 'module', place, 2027);
    expect(w.plantOut).toEqual({ from: '2027-05-22', to: '2027-06-12' });
    expect(diffDays(w.plantOut!.from, w.sow!.from)).toBe(tomato.moduleDays);
    expect(w.hardenOff).toEqual({ from: '2027-05-15', to: '2027-05-21' });
  });

  it('plants tender crops out earlier under a polytunnel, by the protection shift', () => {
    const tomato = lib.crops.get('tomato')!;
    const open = resolveWindows(tomato, 'main', 'module', place, 2027);
    const tunnel = resolveWindows(tomato, 'main', 'module', { ...place, protection: 'polytunnel' }, 2027);
    expect(diffDays(open.plantOut!.from, tunnel.plantOut!.from)).toBe(28);
  });

  it('does not promise midwinter harvests from autumn sowings', () => {
    const spinach = lib.crops.get('spinach')!;
    const w = resolveWindows(spinach, 'overwinter', 'module', place, 2026);
    expect(w.harvest!.from >= '2027-02-01').toBe(true);
  });

  it('ends tender crops at the first frost', () => {
    const w = resolveWindows(lib.crops.get('tomato')!, 'main', 'module', place, 2027);
    expect(w.harvest!.to).toBe('2027-10-20');
    const tunnel = resolveWindows(lib.crops.get('tomato')!, 'main', 'module', { ...place, protection: 'polytunnel' }, 2027);
    expect(tunnel.harvest!.to <= '2027-11-17').toBe(true);
  });

  it('picks the next season whose window is still open', () => {
    const tomato = lib.crops.get('tomato')!;
    expect(nextSeason(tomato, 'main', 'module', place, NOW)).toBe(2027);
  });

  it('fills in the missing windows of a partly-entered planting', () => {
    const garlic = lib.crops.get('garlic')!;
    const w = fillWindows({ plantOut: { from: '2026-12-01', to: '2027-01-15' } }, garlic, 'bought', place, undefined, NOW);
    expect(w.harvest!.from.startsWith('2027-06')).toBe(true);
  });
});

describe('the example plot', () => {
  it('keeps the example dates in autumn 2026', () => {
    expect(demoYearShift(NOW)).toBe(0);
    expect(demoYearShift('2028-03-01')).toBe(1);
    expect(demoYearShift('2028-09-01')).toBe(2);
  });

  it('loads with the windows given in the spec', () => {
    const d = demo();
    const pl1 = d.plantings.find((p) => p.id === 'pl1')!;
    expect(pl1.varietyId).toBe('garlic--softneck');
    expect(pl1.windows.plantOut).toEqual({ from: '2026-10-15', to: '2026-10-15' });
    expect(pl1.windows.clear).toEqual({ from: '2027-06-15', to: '2027-07-15' });
    expect(d.plantings.every((p) => lib.varieties.has(p.varietyId))).toBe(true);
  });

  it('shows plantings from October to April, and the chicory draft in July', () => {
    const d = demo();
    const resolved = [...resolveAll(d).values()];
    const span = planSpan(resolved)!;
    expect(span.from.slice(0, 7) <= '2026-10').toBe(true);
    const july = monthState(d.areas, resolved, '2027-07');
    expect(july.get('c')!.hasDraft).toBe(true);
    expect(july.get('c')!.plantings[0].planting.id).toBe('pl9');
  });

  it('marks areas that change in the second month (November)', () => {
    const d = demo();
    const nov = monthState(d.areas, [...resolveAll(d).values()], '2026-11');
    expect(nov.get('a1')!.changes).toBe(true); // broad beans go in
    expect(nov.get('a3')!.changes).toBe(true); // winter salad goes in
    expect(nov.get('d1')!.changes).toBe(true); // fennel cleared, spinach in
    expect(nov.get('b')!.changes).toBe(false); // garlic just growing
    expect(nov.get('b')!.plantings.map((r) => r.planting.id)).toEqual(['pl1']);
  });

  it('has no conflicts, and lets garlic and spring onions share Bed D east by rows', () => {
    const w = allPlotWarnings(ctxFor(demo()));
    expect(w.filter((x) => x.kind === 'conflict')).toEqual([]);
    expect(w.filter((x) => x.kind === 'capacity')).toEqual([]);
  });

  it('flags a conflict when two plantings share rows', () => {
    const d = demo();
    d.plantings.find((p) => p.id === 'pl7')!.rows = [1, 2];
    d.plantings.find((p) => p.id === 'pl7')!.interplanted = false;
    expect(allPlotWarnings(ctxFor(d)).some((x) => x.kind === 'conflict')).toBe(true);
  });

  it('fits 12 clumps 30 cm apart in the 1.0 × 1.1 m section (acceptance 4)', () => {
    expect(gridFit(1.0, 1.1, 30).total).toBe(12);
    const d = demo();
    const pl8 = d.plantings.find((p) => p.id === 'pl8')!;
    const cap = capacityFor(pl8, d.areas.find((a) => a.id === 'a2')!, cropOf(pl8))!;
    expect(cap).toMatchObject({ fits: 12, needed: 12, ok: true });
    expect(capacityFor({ ...pl8, qty: 13 }, d.areas.find((a) => a.id === 'a2')!, cropOf(pl8))!.ok).toBe(false);
  });

  it('delays the succession and leaves plugs waiting in modules (acceptance 5)', () => {
    const d = demo();
    const before = resolveAll(d).get('pl5')!;
    expect(before.waitingDays).toBe(0);
    d.plantings = d.plantings.map((p) => (p.id === 'pl4' ? shiftPlanting(p, 14, ['clear']) : p));
    const after = resolveAll(d).get('pl5')!;
    expect(diffDays(after.windows.plantOut!.from, before.windows.plantOut!.from)).toBe(14);
    expect(after.windows.sow).toEqual(before.windows.sow);
    expect(after.waitingDays).toBe(14);
    expect(allPlotWarnings(ctxFor(d)).some((w) => w.kind === 'waiting' && w.plantingId === 'pl5' && w.params.days === 14)).toBe(true);
  });

  it('recalculates every planting for the southern hemisphere (acceptance 3)', () => {
    const d = demo();
    const s = setSiteClimate(d, d.sites[0].id, SOUTH);
    for (const p of s.plantings) {
      const old = d.plantings.find((q) => q.id === p.id)!;
      for (const k of Object.keys(old.windows) as (keyof Planting['windows'])[]) {
        expect(p.windows[k]).not.toEqual(old.windows[k]);
        // Each window keeps its length and lands about half a year later.
        expect(diffDays(p.windows[k]!.to, p.windows[k]!.from)).toBe(diffDays(old.windows[k]!.to, old.windows[k]!.from));
      }
    }
    const garlic = s.plantings.find((p) => p.id === 'pl1')!;
    expect(garlic.windows.plantOut!.from).toBe('2027-04-15'); // southern autumn
    expect(garlic.windows.clear!.from).toBe('2027-11-15'); // southern early summer
    expect(s.tasks[2].window.from.slice(5, 7)).toBe('05'); // order seed in late autumn, now May
  });

  it('moves tender plantings earlier when a bed becomes a polytunnel (acceptance 6)', () => {
    const d = demo();
    d.plantings.push({
      id: 'tom', plotId: 'p1', areaId: 'c', varietyId: 'tomato--sungold', method: 'module', qty: 6, qtyUnit: 'plants',
      windows: resolveWindows(lib.crops.get('tomato')!, 'main', 'module', { climate: UK, lat: 54.2 }, 2027),
      purpose: 'eat', status: 'planned', agreement: 'agreed', actual: {},
    });
    const after = setAreaProtection(d, lib, 'c', 'polytunnel');
    const t0 = d.plantings.find((p) => p.id === 'tom')!;
    const t1 = after.plantings.find((p) => p.id === 'tom')!;
    expect(diffDays(t0.windows.plantOut!.from, t1.windows.plantOut!.from)).toBe(28);
    // Hardy salad chicory in the same bed stays put.
    expect(after.plantings.find((p) => p.id === 'pl9')!.windows).toEqual(d.plantings.find((p) => p.id === 'pl9')!.windows);
    expect(after.areas.find((a) => a.id === 'c')!.protection).toBe('polytunnel');
  });

  it('warns when a planting runs past the plot end date', () => {
    const d = demo();
    expect(endDateWarnings(ctxFor(d))).toEqual([]);
    d.plantings = d.plantings.map((p) => (p.id === 'pl9' ? { ...p, windows: { ...p.windows, clear: { from: '2027-10-01', to: '2027-10-20' } } } : p));
    const w = endDateWarnings(ctxFor(d));
    expect(w.map((x) => x.plantingId)).toEqual(['pl9']);
  });

  it('warns when two easily-crossing varieties are grown for seed and flower together (acceptance 9)', () => {
    const d = demo();
    const base = { plotId: 'p1', method: 'module' as const, purpose: 'seed' as const, status: 'planned' as const, agreement: 'agreed' as const, actual: {}, qty: 6, qtyUnit: 'plants' as const };
    const w = resolveWindows(lib.crops.get('courgette')!, 'main', 'module', { climate: UK, lat: 54.2 }, 2027);
    d.plantings.push({ ...base, id: 'cg1', areaId: 'd2', varietyId: 'courgette--defender', windows: w });
    d.plantings.push({ ...base, id: 'cg2', areaId: 'a3', varietyId: 'courgette--black-beauty', windows: w });
    const warns = crossingWarnings(ctxFor(d));
    expect(warns).toHaveLength(1);
    expect(warns[0]).toMatchObject({ kind: 'crossing', params: { species: 'Cucurbita pepo', isolation: 800 } });
    // Grown only to eat: no warning.
    d.plantings = d.plantings.map((p) => (p.id === 'cg2' ? { ...p, purpose: 'eat' } : p));
    expect(crossingWarnings(ctxFor(d))).toHaveLength(0);
  });

  it('warns when the same rotation group returns to a bed too soon', () => {
    const d = demo();
    d.plantings.push({ ...d.plantings.find((p) => p.id === 'pl1')!, id: 'garlic2',
      windows: { plantOut: { from: '2027-10-15', to: '2027-10-15' }, clear: { from: '2028-06-15', to: '2028-07-15' } } });
    const w = allPlotWarnings(ctxFor(d)).filter((x) => x.kind === 'rotation');
    expect(w.map((x) => x.plantingId)).toEqual(['garlic2']);
  });

  it('generates the jobs for each month', () => {
    const d = demo();
    const resolved = [...resolveAll(d).values()];
    const tasks = generatedTasks(resolved, { areas: new Map(d.areas.map((a) => [a.id, a])), climate: UK, cropOf, nameOf, t: (k, p) => `${k}:${p?.name ?? ''}` }, []);
    const titles = tasks.map((t) => t.title);
    expect(titles).toContain('task.sow:Broad bean');
    expect(titles).toContain('task.plantOut:Broad bean');
    expect(titles).toContain('task.harvest:Winter salad mix');
    // Garlic is already growing, so planting it is done.
    expect(tasks.find((t) => t.id === 'pl1:plantOut')!.status).toBe('done');
    const sow = tasks.find((t) => t.id === 'pl2:sow')!;
    expect(sow.place).toBe('propagation');
    expect(sow.window).toEqual({ from: '2026-10-19', to: '2026-10-31' });
  });

  it('waits for spring before supporting overwintered broad beans', () => {
    const d = demo();
    const resolved = [...resolveAll(d).values()];
    const tasks = generatedTasks(resolved, { areas: new Map(d.areas.map((a) => [a.id, a])), climate: UK, cropOf, nameOf, t: (k) => k, lat: 54.2 }, []);
    const support = tasks.find((t) => t.id === 'pl2:support')!;
    expect(support.window.from > '2027-02-01').toBe(true);
  });

  it('keeps today', () => expect(addDays(NOW, 0)).toBe(NOW));
});

describe('harvest totals', async () => {
  const { harvestTotals } = await import('../src/lib/journal');
  it('adds up by crop, plot and year, and works out yield per square metre', () => {
    const d = demo();
    d.entries = [
      { id: 'e1', date: '2027-06-20', kind: 'harvest', plantingId: 'pl1', grams: 1500 },
      { id: 'e2', date: '2027-07-01', kind: 'harvest', plantingId: 'pl1', grams: 900 },
      { id: 'e3', date: '2027-06-20', kind: 'harvest', plantingId: 'pl7', grams: 600, count: 18 },
      { id: 'e4', date: '2027-03-01', kind: 'harvest', plantingId: 'pl3', grams: 250 },
      { id: 'e5', date: '2027-03-02', kind: 'note', plantingId: 'pl3', text: 'Looking good' },
    ];
    const t = harvestTotals(d.entries, new Map(d.plantings.map((p) => [p.id, p])), new Map(d.areas.map((a) => [a.id, a])), cropOf);
    expect(t.byCrop[0]).toMatchObject({ key: 'garlic', grams: 3000, count: 18, entries: 3 });
    expect(t.byYear).toEqual([{ key: '2027', grams: 3250, count: 18, entries: 4 }]);
    expect(t.byPlot[0]).toMatchObject({ key: 'p1', grams: 3250 });
    const bedB = t.yieldByPlanting.find((y) => y.plantingId === 'pl1')!;
    expect(bedB.m2).toBeCloseTo(2.63 * 2.25, 3);
    expect(bedB.perM2).toBeCloseTo(2400 / (2.63 * 2.25), 3);
    // Garlic in rows 1, 3 and 5 of 5 uses three fifths of Bed D east.
    expect(t.yieldByPlanting.find((y) => y.plantingId === 'pl7')!.m2).toBeCloseTo(1.06 * 1.0 * 0.6, 3);
  });
});

describe('propagation spaces', async () => {
  const { propagationLoad, demandIn } = await import('../src/lib/propagation');
  const shelves = { id: 's1', siteId: 'site_demo', name: 'Shelves', capacity: 12, unit: 'trays' as const, lights: true, bottomHeat: true, modulesPerTray: 40 };

  it('counts each module planting in trays from sowing to planting out', () => {
    const d = demo();
    const loads = propagationLoad([...resolveAll(d).values()], [shelves], [], { from: '2026-10-12', weeks: 8, cropOf, nameOf });
    const byWeek = Object.fromEntries(loads[0].weeks.map((w) => [w.week, w.items.map((i) => i.id).sort()]));
    // Week of 19 Oct: winter salad (sown 17 Oct) and broad beans (sown 19 Oct).
    expect(byWeek['2026-10-19']).toEqual(['pl2', 'pl3']);
    // Week of 2 Nov: spinach joins (sown 26 Oct).
    expect(byWeek['2026-11-02']).toEqual(['pl2', 'pl3', 'pl5']);
    expect(demandIn(shelves, d.plantings.find((p) => p.id === 'pl3')!)).toBe(1); // 40 plugs = 1 tray
    expect(loads[0].over).toEqual([]);
  });

  it('flags weeks over capacity, including reservations', () => {
    const d = demo();
    const small = { ...shelves, capacity: 2 };
    const res = [{ id: 'r1', propSpaceId: 's1', label: 'Curing squash', window: { from: '2026-10-26', to: '2026-11-08' }, amount: 2 }];
    const loads = propagationLoad([...resolveAll(d).values()], [small], res, { from: '2026-10-12', weeks: 8, cropOf, nameOf });
    expect(loads[0].over.map((w) => w.week)).toEqual(['2026-10-26', '2026-11-02']);
  });

  it('keeps plugs in their space while a late bed is cleared', () => {
    const d = demo();
    d.plantings = d.plantings.map((p) => (p.id === 'pl4' ? shiftPlanting(p, 14, ['clear']) : p));
    const loads = propagationLoad([...resolveAll(d).values()], [shelves], [], { from: '2026-11-16', weeks: 4, cropOf, nameOf });
    const spinachWeeks = loads[0].weeks.filter((w) => w.items.some((i) => i.id === 'pl5')).map((w) => w.week);
    expect(spinachWeeks).toEqual(['2026-11-16', '2026-11-23', '2026-11-30']);
  });
});
