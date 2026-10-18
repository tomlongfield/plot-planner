<script lang="ts">
  // A timeline (Gantt) of every area: when each planting is in modules, in the
  // ground and cropping, with successions joined and frost dates marked.
  import ViewSwitch from '../components/ViewSwitch.svelte';
  import { seasonFirstFrost, seasonLastFrost } from '../lib/climate';
  import { diffDays, monthEnd, monthStart } from '../lib/dates';
  import { dayMonth, monthName, range, t } from '../lib/i18n';
  import { OPEN_END, OPEN_START, type Resolved } from '../lib/plantings';
  import { app } from '../lib/store.svelte';
  import type { Area } from '../lib/types';

  const months = $derived(app.months);
  const start = $derived(monthStart(months[0]));
  const end = $derived(monthEnd(months[months.length - 1]));
  const days = $derived(diffDays(end, start) + 1);
  const pos = (d: string) => Math.max(0, Math.min(100, (diffDays(d, start) / days) * 100));
  const width = (a: string, b: string) => Math.max(0.4, pos(b) - pos(a));

  const parents = $derived(new Set(app.areas.map((a) => a.parentId).filter(Boolean)));
  // Beds in layout order, each followed by its sections.
  const rows = $derived.by(() => {
    const out: { area: Area; depth: number; header: boolean }[] = [];
    const walk = (pid: string | undefined, depth: number) => {
      for (const a of app.areas.filter((x) => x.parentId === pid).sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }))) {
        out.push({ area: a, depth, header: parents.has(a.id) });
        walk(a.id, depth + 1);
      }
    };
    walk(undefined, 0);
    return out;
  });

  interface Bar { r: Resolved; lane: number }
  function lanesFor(areaId: string): { bars: Bar[]; lanes: number } {
    const list = app.plotResolved.filter((r) => r.planting.areaId === areaId && r.occupancy.to >= start && r.occupancy.from <= end)
      .sort((a, b) => a.occupancy.from.localeCompare(b.occupancy.from));
    const laneEnds: string[] = [];
    const bars: Bar[] = [];
    for (const r of list) {
      // A succession stays in its predecessor's lane so the two read as one line.
      const pred = bars.find((b) => b.r.planting.id === r.planting.followsPlantingId);
      let lane = pred ? pred.lane : laneEnds.findIndex((e) => e < r.occupancy.from);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = r.occupancy.to;
      bars.push({ r, lane });
    }
    return { bars, lanes: Math.max(1, laneEnds.length) };
  }

  const frosts = $derived.by(() => {
    if (!app.site) return [];
    const c = app.site.climate;
    const out: { d: string; kind: 'last' | 'first' }[] = [];
    for (let y = Number(start.slice(0, 4)) - 1; y <= Number(end.slice(0, 4)); y++) {
      out.push({ d: seasonLastFrost(c, y), kind: 'last' }, { d: seasonFirstFrost(c, y), kind: 'first' });
    }
    return out.filter((f) => f.d >= start && f.d <= end);
  });

  const d0 = (d: string | undefined, fallback: string) => (!d || d === OPEN_START ? fallback : d === OPEN_END ? end : d);
  function aria(r: Resolved): string {
    const w = r.windows;
    return [app.nameOf(r.planting), app.areaName(r.planting.areaId),
      w.sow ? `${t('window.sow')} ${range(w.sow.from, w.sow.to)}` : '', w.plantOut ? `${t('window.plantOut')} ${range(w.plantOut.from, w.plantOut.to)}` : '',
      w.harvest ? `${t('window.harvest')} ${range(w.harvest.from, w.harvest.to)}` : '', r.planting.agreement === 'draft' ? t('draft') : ''].filter(Boolean).join(', ');
  }
</script>

<div class="timeline-view">
  <div class="top"><ViewSwitch /></div>
  <h1 class="sr-only">{t('views.timeline')}</h1>

  <div class="tl" role="table" aria-label={t('tl.aria', { plot: app.plot?.name ?? '' })}>
    <div class="tl-row head" role="row">
      <span class="name" role="columnheader">{t('tl.area')}</span>
      <div class="track" role="columnheader">
        {#each months as k (k)}
          <span class="month" style="left: {pos(monthStart(k))}%; width: {width(monthStart(k), monthEnd(k))}%"><span class="long">{monthName(k, 'short')}</span><span class="initial" aria-hidden="true">{monthName(k, 'short').slice(0, 1)}</span></span>
        {/each}
      </div>
    </div>
    {#each rows as { area, depth, header } (area.id)}
      {@const { bars, lanes } = lanesFor(area.id)}
      <div class="tl-row" class:header role="row" style="--lanes: {header && !bars.length ? 0 : lanes}">
        <span class="name" role="rowheader" style="padding-left: {depth * 12}px">{area.name}</span>
        <div class="track" role="cell">
          {#each months as k (k)}<span class="grid" style="left: {pos(monthStart(k))}%"></span>{/each}
          {#each frosts as f}<span class="frost {f.kind}" style="left: {pos(f.d)}%" title={t(`tl.${f.kind}Frost`, { date: dayMonth(f.d) })}></span>{/each}
          {#if app.today >= start && app.today <= end}<span class="today" style="left: {pos(app.today)}%"></span>{/if}
          {#each bars as { r, lane } (r.planting.id)}
            {@const w = r.windows}
            {@const cat = app.cropOf(r.planting)?.category}
            {@const ground = d0(r.occupancy.from, start)}
            {@const groundEnd = d0(w.harvest?.from ?? w.clear?.from ?? r.occupancy.to, end)}
            {@const top = `calc(${lane} * var(--lane) + 4px)`}
            {#if r.planting.method === 'module' && w.sow && w.plantOut && w.plantOut.from > start}
              <span class="modules" style="left: {pos(w.sow.from)}%; width: {width(w.sow.from, w.plantOut.from)}%; top: {top}" title={t('tl.inModules')}></span>
            {/if}
            {#if r.planting.followsPlantingId && bars.some((b) => b.r.planting.id === r.planting.followsPlantingId)}
              <span class="joint" style="left: calc({pos(ground)}% - 6px); top: {top}" aria-hidden="true"></span>
            {/if}
            <button
              class="bar"
              class:draft={r.planting.agreement === 'draft'}
              style="left: {pos(ground)}%; width: {width(ground, d0(r.occupancy.to, end))}%; top: {top}; --fill: var(--c-{cat ?? 'static'})"
              aria-label={aria(r)}
              title={aria(r)}
              onclick={() => app.go('plantings', r.planting.id)}
            >
              <span class="ground" style="width: {(width(ground, groundEnd) / width(ground, d0(r.occupancy.to, end))) * 100}%"></span>
              <span class="label">{app.shortNameOf(r.planting)}{r.planting.agreement === 'draft' ? ` (${t('draft')})` : ''}</span>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
  <p class="legend small muted">
    <span class="key k-modules"></span>{t('tl.inModules')}
    <span class="key k-ground"></span>{t('tl.inGround')}
    <span class="key k-harvest"></span>{t('tl.cropping')}
    <span class="key k-frost"></span>{t('tl.frost')}
    <span class="key k-today"></span>{t('tl.today')}
  </p>
</div>

<style>
  .timeline-view { display: grid; gap: 16px; }
  .top { min-height: 36px; }
  .tl { display: grid; --lane: 26px; border-top: 1px solid var(--line); }
  .tl-row { display: grid; grid-template-columns: minmax(70px, 140px) 1fr; gap: 8px; border-bottom: 1px solid var(--line); min-height: calc(var(--lanes, 1) * var(--lane) + 8px); }
  .tl-row.header { min-height: 26px; background: color-mix(in srgb, var(--surface) 60%, transparent); }
  .tl-row.head { min-height: 26px; border-bottom-color: var(--ink); }
  .name { font: 500 11px/1.3 var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); padding: 7px 0; overflow: hidden; text-overflow: ellipsis; }
  .header .name { color: var(--ink); }
  .track { position: relative; }
  .month { position: absolute; top: 6px; font: 500 11px var(--font-mono); color: var(--muted); padding-left: 4px; overflow: hidden; white-space: nowrap; }
  .grid { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--line); }
  .frost { position: absolute; top: 0; bottom: 0; border-left: 1.5px dashed var(--t-order); }
  .today { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--accent); }
  .bar {
    position: absolute; height: 20px; padding: 0; border: 1px solid color-mix(in srgb, var(--ink) 30%, transparent); border-radius: 4px;
    background: repeating-linear-gradient(135deg, var(--fill) 0 5px, color-mix(in srgb, var(--fill) 70%, var(--ink)) 5px 7px);
    cursor: pointer; overflow: hidden; display: flex; align-items: center; text-align: left; min-width: 4px;
  }
  .bar .ground { position: absolute; left: 0; top: 0; bottom: 0; background: var(--fill); }
  .bar .label { position: relative; padding: 0 6px; font: 600 11.5px var(--font-body); color: var(--cell-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar.draft { border: 1.5px dashed var(--muted); }
  .bar.draft .label { font-style: italic; font-weight: 500; }
  .bar:hover, .bar:focus-visible { border-color: var(--ink); z-index: 2; }
  .modules { position: absolute; height: 20px; border: 1.5px dashed color-mix(in srgb, var(--ink) 40%, transparent); border-right: 0; border-radius: 4px 0 0 4px; background: color-mix(in srgb, var(--surface) 70%, transparent); }
  .joint { position: absolute; width: 6px; height: 20px; border-top: 2px solid var(--ink); border-bottom: 2px solid var(--ink); opacity: 0.5; }
  .initial { display: none; }
  @media (max-width: 560px) { .long { display: none; } .initial { display: inline; } .month { padding-left: 2px; } }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; }
  .key { display: inline-block; width: 18px; height: 11px; border-radius: 2px; margin-left: 4px; }
  .k-modules { border: 1.5px dashed var(--muted); }
  .k-ground { background: var(--c-leaf); border: 1px solid var(--line); }
  .k-harvest { background: repeating-linear-gradient(135deg, var(--c-leaf) 0 4px, color-mix(in srgb, var(--c-leaf) 70%, var(--ink)) 4px 6px); }
  .k-frost { border-left: 1.5px dashed var(--t-order); width: 2px; }
  .k-today { background: var(--accent); width: 2px; }
</style>
