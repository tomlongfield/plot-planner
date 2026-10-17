<script lang="ts">
  // The rotation grid: each area by year, coloured by the crop families grown.
  import ViewSwitch from '../components/ViewSwitch.svelte';
  import { t } from '../lib/i18n';
  import { OPEN_START } from '../lib/plantings';
  import { app } from '../lib/store.svelte';
  import type { Area, Category } from '../lib/types';

  // Rotation groups borrow the crop-family colours they correspond to.
  const GROUP_FILL: Record<string, Category | 'static'> = {
    alliums: 'allium', legumes: 'legume', brassicas: 'brassica', roots: 'root', potatoes: 'fruiting',
    cucurbits: 'cucurbit', salads: 'leaf', misc: 'static', perennial: 'fruit',
  };

  const parents = $derived(new Set(app.areas.map((a) => a.parentId).filter(Boolean)));
  const rows = $derived(app.areas.filter((a) => !parents.has(a.id) && !a.perennial && !(a.parentId && app.areas.find((p) => p.id === a.parentId)?.perennial)));
  const startYear = (d: string) => Number(d.slice(0, 4));

  const years = $derived.by(() => {
    const ys = app.plotResolved.filter((r) => r.occupancy.from !== OPEN_START).map((r) => startYear(r.occupancy.from));
    const now = Number(app.today.slice(0, 4));
    const lo = Math.min(now - 2, ...ys);
    const hi = Math.max(now + 1, ...ys);
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  });

  /** Groups grown in an area in a year, including plantings across a whole parent bed. */
  function groups(a: Area, year: number): { group: string; ids: string[] }[] {
    const ids = new Set([a.id, a.parentId].filter(Boolean));
    const out = new Map<string, string[]>();
    for (const r of app.plotResolved) {
      if (!ids.has(r.planting.areaId) || r.occupancy.from === OPEN_START || startYear(r.occupancy.from) !== year) continue;
      const g = app.cropOf(r.planting)?.rotationGroup ?? 'misc';
      out.set(g, [...(out.get(g) ?? []), r.planting.id]);
    }
    return [...out.entries()].map(([group, ids]) => ({ group, ids }));
  }

  const flagged = $derived(new Set(app.warnings.filter((w) => w.kind === 'rotation' && w.plantingId).map((w) => w.plantingId!)));
  const thisYear = $derived(Number(app.today.slice(0, 4)));
</script>

<div class="rotation-view">
  <div class="spread">
    <h1>{t('views.rotation')}</h1>
    <ViewSwitch />
  </div>
  <p class="muted small intro">{t('rot.intro', { years: app.data.settings.rotationYears })}</p>

  <div class="wrap">
    <table>
      <thead>
        <tr><th scope="col">{t('tl.area')}</th>{#each years as y}<th scope="col" class:now={y === thisYear}>{y}</th>{/each}</tr>
      </thead>
      <tbody>
        {#each rows as a (a.id)}
          <tr>
            <th scope="row">{a.name}</th>
            {#each years as y}
              {@const gs = groups(a, y)}
              <td class:now={y === thisYear}>
                {#each gs as g (g.group)}
                  {@const warn = g.ids.some((id) => flagged.has(id))}
                  <span class="grp" class:warn style="--fill: var(--c-{GROUP_FILL[g.group] ?? 'static'})" title={g.ids.map((id) => app.nameOf(app.data.plantings.find((p) => p.id === id)!)).join(', ')}>
                    {t(`rotation.${g.group}`)}{#if warn}<span class="sr-only">: {t('rot.tooSoon')}</span> !{/if}
                  </span>
                {/each}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if flagged.size}<p class="small"><span class="grp warn demo">!</span> {t('rot.legendWarn')}</p>{/if}
</div>

<style>
  .rotation-view { display: grid; gap: 12px; }
  .intro { max-width: 70ch; }
  .wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; min-width: 420px; table-layout: fixed; }
  thead th:first-child { width: 110px; }
  th, td { border-top: 1px solid var(--line); padding: 6px 6px 6px 0; text-align: left; vertical-align: top; }
  thead th { font: 500 11px var(--font-mono); letter-spacing: 0.08em; color: var(--muted); border-top: 0; }
  th[scope='row'] { font: 500 11px var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); white-space: nowrap; }
  .now { background: color-mix(in srgb, var(--surface) 70%, transparent); }
  thead th.now { color: var(--ink); }
  td { display: table-cell; }
  .grp { display: inline-block; margin: 0 4px 4px 0; padding: 2px 7px; border-radius: 5px; background: var(--fill); color: var(--cell-ink); font-size: 12px; border: 1px solid color-mix(in srgb, var(--ink) 15%, transparent); }
  .grp.warn { border: 2px solid var(--warn); font-weight: 600; }
  .grp.demo { --fill: var(--surface); }
</style>
