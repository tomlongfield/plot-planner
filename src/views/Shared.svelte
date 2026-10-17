<script lang="ts">
  // A plan opened from a shared link: a read-only preview. Nothing is saved
  // unless the viewer chooses to add it.
  import PlanSvg from '../components/PlanSvg.svelte';
  import ShareImport from '../components/ShareImport.svelte';
  import { addMonths, monthKey, today } from '../lib/dates';
  import { download, slug } from '../lib/files';
  import { fullDate, monthName, monthYear, range, t } from '../lib/i18n';
  import { buildLibrary, bundledCrops, cropForVariety } from '../lib/library';
  import { cellFor, type Cell } from '../lib/monthview';
  import { monthState, planSpan, resolvePlantings } from '../lib/plantings';
  import { decodeShare, type SharePayload } from '../lib/share';
  import { app } from '../lib/store.svelte';
  import { generatedTasks, isElsewhere, manualTasks, tasksInMonth } from '../lib/tasks';
  import type { Planting } from '../lib/types';

  let { fragment }: { fragment: string } = $props();
  let payload = $state<SharePayload | null>(null);
  let error = $state('');
  let importing = $state(false);
  let plotId = $state('');
  let month = $state('');

  $effect(() => {
    decodeShare(fragment).then(
      (p) => { payload = p; plotId = p.plots[0]?.id ?? ''; },
      (e) => (error = t(`shared.error.${(e as Error).message === 'newer' ? 'newer' : 'bad'}`)),
    );
  });

  const lib = $derived(payload ? buildLibrary(bundledCrops(), payload.cropOverrides, payload.varieties) : null);
  const cropOf = (p: Pick<Planting, 'varietyId'>) => (lib ? cropForVariety(lib, p.varietyId) : undefined);
  const nameOf = (p: Pick<Planting, 'varietyId'>) => lib?.varieties.get(p.varietyId)?.name ?? p.varietyId;
  const plot = $derived(payload?.plots.find((p) => p.id === plotId));
  const areas = $derived(payload?.areas.filter((a) => a.plotId === plotId) ?? []);
  const resolved = $derived(payload ? [...resolvePlantings(payload.plantings.filter((p) => p.plotId === plotId), cropOf).values()] : []);
  const months = $derived.by(() => {
    const span = planSpan(resolved);
    const from = span ? monthKey(span.from) : monthKey(today());
    let to = span ? monthKey(span.to) : addMonths(from, 11);
    if (to > addMonths(from, 17)) to = addMonths(from, 17);
    const out: string[] = [];
    for (let k = from; k <= to; k = addMonths(k, 1)) out.push(k);
    return out;
  });
  const current = $derived(months.includes(month) ? month : (months.includes(monthKey(today())) ? monthKey(today()) : months[0]));
  const parents = $derived(new Set(areas.map((a) => a.parentId).filter(Boolean) as string[]));

  const cells = $derived.by(() => {
    if (!payload) return new Map<string, Cell>();
    const st = monthState(areas, resolved, current);
    const deps = { cropOf, nameOf, shortNameOf: nameOf, lat: payload.site.location.lat };
    return new Map(areas.map((a) => [a.id, cellFor(a, st.get(a.id), current, deps, parents.has(a.id))]));
  });
  const tasks = $derived.by(() => {
    if (!payload) return [];
    const gen = generatedTasks(resolved, { areas: new Map(areas.map((a) => [a.id, a])), climate: payload.site.climate, cropOf, nameOf, t, lat: payload.site.location.lat }, []);
    const range = { from: `${months[0]}-01`, to: `${months[months.length - 1]}-28` };
    return [...gen, ...manualTasks(payload.tasks.filter((x) => !x.plotId || x.plotId === plotId), range, [])];
  });
  const monthTasks = $derived(tasksInMonth(tasks, current));

  function close() {
    history.replaceState(null, '', location.pathname + '#/month');
    app.route = { view: 'month' };
    app.shareFragment = null;
  }
</script>

<div class="shared">
  {#if error}
    <div class="card empty">
      <h1>{t('shared.title')}</h1>
      <p class="warning">{error}</p>
      <button class="btn" onclick={close}>{t('shared.openPlanner')}</button>
    </div>
  {:else if !payload || !plot}
    <p class="muted">{t('app.loading')}</p>
  {:else}
    <header class="spread">
      <div>
        <p class="eyebrow">{t('shared.eyebrow', { date: fullDate(payload.sharedAt.slice(0, 10)) })}</p>
        <h1>{plot.name}</h1>
        <p class="muted small">{payload.site.location.label || payload.site.name}. {t('shared.readOnly')}</p>
      </div>
      <div class="row">
        <button class="btn primary" onclick={() => (importing = true)}>{t('shared.add')}</button>
        <button class="btn" onclick={() => payload && download(`${slug(plot.name)}.plotplan.json`, JSON.stringify(payload, null, 1))}>{t('share.saveFile')}</button>
        <button class="btn quiet" onclick={close}>{t('shared.close')}</button>
      </div>
    </header>

    {#if payload.plots.length > 1}
      <div class="tabs">{#each payload.plots as p (p.id)}<button class="pill" aria-pressed={p.id === plotId} onclick={() => (plotId = p.id)}>{p.name}</button>{/each}</div>
    {/if}
    <div class="scroller" role="tablist" aria-label={t('month.tabs')}>
      {#each months as k (k)}
        <button class="pill" role="tab" aria-selected={k === current} onclick={() => (month = k)}>{monthName(k, 'short')}</button>
      {/each}
    </div>
    <div class="layout">
      <PlanSvg {plot} {areas} features={payload.features.filter((f) => f.plotId === plotId)} {cells} title={monthYear(current)} />
      <section>
        <h2 class="month-name">{monthYear(current)}</h2>
        <h3>{t('month.onPlot')}</h3>
        <ul class="ruled">{#each monthTasks.filter((x) => !isElsewhere(x)) as x (x.id)}<li><span class="mono muted">{range(x.window.from, x.window.to)}</span> {x.title}</li>{:else}<li class="muted small">{t('month.noPlotJobs')}</li>{/each}</ul>
        <h3>{t('month.elsewhere')}</h3>
        <ul class="ruled">{#each monthTasks.filter((x) => isElsewhere(x)) as x (x.id)}<li><span class="mono muted">{range(x.window.from, x.window.to)}</span> {x.title}</li>{:else}<li class="muted small">{t('month.noElsewhereJobs')}</li>{/each}</ul>
      </section>
    </div>
  {/if}
</div>

{#if importing && payload}
  <ShareImport {payload} source="link" onclose={() => (importing = false)} ondone={close} />
{/if}

<style>
  .shared { max-width: 1200px; margin: 0 auto; padding: max(16px, env(safe-area-inset-top)) var(--gutter) 48px; display: grid; gap: 16px; }
  .layout { display: grid; grid-template-columns: minmax(0, 430px) minmax(0, 1fr); gap: 28px; align-items: start; }
  .month-name { font-size: 28px; font-weight: 700; }
  h3 { margin-top: 12px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 7px 0; display: flex; gap: 10px; }
  @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } }
</style>
