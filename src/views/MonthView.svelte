<script lang="ts">
  // The month view: the plan for one month beside that month's jobs, or all
  // months as small multiples.
  import AreaPanel from '../components/AreaPanel.svelte';
  import ShareDialog from '../components/ShareDialog.svelte';
  import ViewSwitch from '../components/ViewSwitch.svelte';
  import PlanSvg from '../components/PlanSvg.svelte';
  import TaskRow from '../components/TaskRow.svelte';
  import { addDays, monthEnd, monthKey, monthStart, weekOf } from '../lib/dates';
  import { dayMonth, monthName, monthYear, t } from '../lib/i18n';
  import { cellFor, monthSummary, type Cell } from '../lib/monthview';
  import { monthState, spanState, type Resolved } from '../lib/plantings';
  import type { Window } from '../lib/types';
  import { app } from '../lib/store.svelte';
  import { isElsewhere, tasksInMonth } from '../lib/tasks';

  let all = $state(false);
  let sharing = $state(false);
  let compare = $state(false);
  /** 0 = the whole month; otherwise the nth week that touches it. */
  let week = $state(0);
  let areaId: string | null = $state(null);
  let tabEls: HTMLButtonElement[] = $state([]);

  const months = $derived(app.months);
  const current = $derived.by(() => {
    const arg = app.route.arg;
    if (arg && /^\d{4}-\d\d$/.test(arg)) return arg;
    const now = monthKey(app.today);
    return months.includes(now) ? now : months[0];
  });
  const index = $derived(months.indexOf(current));
  const parents = $derived(new Set(app.areas.map((a) => a.parentId).filter(Boolean) as string[]));
  const deps = $derived({ cropOf: app.cropOf, nameOf: app.nameOf, shortNameOf: app.shortNameOf, lat: app.site?.location.lat ?? 50 });

  function cellsFor(k: string | Window, resolved: Resolved[] = app.plotResolved): Map<string, Cell> {
    const st = typeof k === 'string' ? monthState(app.areas, resolved, k) : spanState(app.areas, resolved, k);
    const out = new Map<string, Cell>();
    for (const a of app.areas) out.set(a.id, cellFor(a, st.get(a.id), k, deps, parents.has(a.id)));
    return out;
  }

  // Weeks that touch the month, for the week slider.
  const weeks = $derived.by(() => {
    const out: Window[] = [];
    const ws = app.site?.weekStart ?? 1;
    for (let w = weekOf(monthStart(current), ws); w.from <= monthEnd(current); w = { from: addDays(w.from, 7), to: addDays(w.to, 7) }) out.push(w);
    return out;
  });
  $effect(() => {
    void current;
    week = 0;
  });
  const span = $derived(week ? weeks[week - 1] : current);
  const cells = $derived(cellsFor(span));
  const agreedOnly = $derived(app.plotResolved.filter((r) => r.planting.agreement === 'agreed'));
  const mstate = $derived(monthState(app.areas, app.plotResolved, current));
  const plotIds = $derived(new Set(app.plots.map((p) => p.id)));
  const monthTasks = $derived(tasksInMonth(app.tasks.filter((x) => !x.plotId || x.plotId === app.plot?.id || !plotIds.has(x.plotId)), current));
  const onPlot = $derived(monthTasks.filter((x) => !isElsewhere(x) && (!x.plotId || x.plotId === app.plot?.id)));
  const elsewhere = $derived(monthTasks.filter((x) => isElsewhere(x)));
  const summary = $derived(app.site ? monthSummary(current, mstate, onPlot, elsewhere, app.site.climate, app.site.location.lat) : null);
  const drafts = $derived(app.plotResolved.filter((r) => r.planting.agreement === 'draft').length);

  function select(k: string) {
    areaId = null;
    app.go('month', k);
  }

  function tabKey(e: KeyboardEvent, i: number) {
    let n = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = Math.min(months.length - 1, i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = Math.max(0, i - 1);
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = months.length - 1;
    else return;
    e.preventDefault();
    select(months[n]);
    tabEls[n]?.focus();
  }

  // Keep the selected tab in view on narrow screens.
  $effect(() => {
    tabEls[index]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  });

  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const yearChange = (i: number) => i > 0 && months[i].slice(0, 4) !== months[i - 1].slice(0, 4);
</script>

{#if app.plot}
  <div class="month-view">
    {#if app.nudges.length}
      <ul class="nudges" aria-label={t('weather.nudges')}>
        {#each app.nudges as n}
          <li class="warning" class:info={n.kind !== 'frost'}>
            <span>{n.kind === 'frost' ? t('weather.frost', { date: dayMonth(n.date), min: n.minC, names: n.tender.slice(0, 3).join(', ') })
              : n.kind === 'dry' ? t('weather.dry', { days: n.days })
              : n.kind === 'wind' ? t('weather.wind', { date: dayMonth(n.date), gust: n.gustKmh })
              : t('weather.heat', { date: dayMonth(n.date), max: n.maxC })}</span>
          </li>
        {/each}
        <li class="small muted attribution">{t('weather.attribution')} <a href="https://open-meteo.com/" rel="noopener">Open-Meteo.com</a></li>
      </ul>
    {/if}
    <div class="spread top">
      <ViewSwitch />
      <span class="row">
        {#if drafts}<button class="pill" aria-pressed={compare} onclick={() => (compare = !compare)}>{t('month.compare')}</button>{/if}
        <button class="pill" onclick={() => (sharing = true)}>{t('share.button')}</button>
      </span>
    </div>
    <div class="bar">
      <div class="scroller" role="tablist" aria-label={t('month.tabs')}>
        {#each months as k, i (k)}
          <button
            bind:this={tabEls[i]}
            class="pill"
            role="tab"
            aria-selected={!all && k === current}
            tabindex={k === current ? 0 : -1}
            onclick={() => { all = false; select(k); }}
            onkeydown={(e) => tabKey(e, i)}
          >
            {monthName(k, 'short')}{#if yearChange(i) || i === 0}<span class="yr">&nbsp;{k.slice(2, 4)}</span>{/if}
          </button>
        {/each}
      </div>
      <button class="pill dashed" aria-pressed={all} onclick={() => (all = !all)}>{t('month.all')}</button>
    </div>

    {#if compare && !all}
      <div class="compare">
        <figure>
          <figcaption class="mono-label">{t('month.agreedPlan')}</figcaption>
          <PlanSvg plot={app.plot} areas={app.areas} features={app.features} cells={cellsFor(span, agreedOnly)} title={t('month.agreedPlan')} />
        </figure>
        <figure>
          <figcaption class="mono-label">{t('month.withDrafts')}</figcaption>
          <PlanSvg plot={app.plot} areas={app.areas} features={app.features} {cells} title={t('month.withDrafts')} />
        </figure>
      </div>
    {/if}
    {#if all}
      <div class="multiples">
        {#each months as k (k)}
          <button class="multiple" onclick={() => { all = false; select(k); }} aria-label={t('month.open', { month: monthYear(k) })}>
            <span class="mono-label">{monthName(k, 'short')} {k.slice(0, 4)}</span>
            <PlanSvg plot={app.plot} areas={app.areas} features={app.features} cells={cellsFor(k)} mode="mini" title={monthYear(k)} />
          </button>
        {/each}
      </div>
    {:else}
      <div class="layout" class:solo={compare}>
        {#if !compare}<div class="plan-col">
          <PlanSvg
            plot={app.plot}
            areas={app.areas}
            features={app.features}
            {cells}
            selected={areaId}
            onselect={(id) => (areaId = areaId === id ? null : id)}
            title={t('month.planTitle', { plot: app.plot.name, month: monthYear(current) })}
          />
          <label class="week">
            <span class="mono-label">{week ? t('month.weekOf', { date: dayMonth(weeks[week - 1].from) }) : t('month.wholeMonth')}</span>
            <input type="range" min="0" max={weeks.length} step="1" bind:value={week} aria-label={t('month.weekSlider')}
              aria-valuetext={week ? t('month.weekOf', { date: dayMonth(weeks[week - 1].from) }) : t('month.wholeMonth')} />
          </label>
          <p class="legend small muted">
            <span class="key changes"></span>{t('month.legend.changes')}
            <span class="key draft"></span>{t('month.legend.draft')}
          </p>
        </div>{/if}
        <div class="panel-col">
          {#if areaId}
            <AreaPanel {areaId} month={current} onclose={() => (areaId = null)} />
          {:else}
            {#key current}
              <section class="jobs" class:animate={!reduced} aria-live="polite">
                <p class="eyebrow">{app.plot.name}</p>
                <h2 class="month-name">{monthYear(current)}</h2>
                {#if summary}
                  <p class="summary">{summary.text}</p>
                  <div class="row chips">
                    {#if summary.lastFrost}<span class="chip frost">{t('month.lastFrost', { date: dayMonth(summary.lastFrost) })}</span>{/if}
                    {#if summary.firstFrost}<span class="chip frost">{t('month.firstFrost', { date: dayMonth(summary.firstFrost) })}</span>{/if}
                    {#if summary.slow}<span class="chip">{t('month.slow')}</span>{/if}
                    {#if drafts}<button class="chip draft" onclick={() => app.go('plantings', 'drafts')}>{t('month.drafts', { n: drafts })}</button>{/if}
                  </div>
                {/if}

                <h3>{t('month.onPlot')}</h3>
                {#if onPlot.length}
                  <div class="ruled">{#each onPlot as task (task.id)}<TaskRow {task} />{/each}</div>
                {:else}
                  <p class="muted small">{t('month.noPlotJobs')}</p>
                {/if}

                <h3>{t('month.elsewhere')}</h3>
                {#if elsewhere.length}
                  <div class="ruled">{#each elsewhere as task (task.id)}<TaskRow {task} />{/each}</div>
                {:else}
                  <p class="muted small">{t('month.noElsewhereJobs')}</p>
                {/if}
                <p class="small muted hint">{t('month.hint')}</p>
              </section>
            {/key}
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}

{#if sharing}<ShareDialog onclose={() => (sharing = false)} />{/if}

<style>
  .month-view { display: grid; gap: 16px; }
  .top { gap: 8px; }
  .nudges { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .compare { display: grid; grid-template-columns: repeat(2, minmax(0, 360px)); gap: 20px; }
  .compare figure { margin: 0; display: grid; gap: 6px; }
  .week { display: grid; gap: 4px; margin-top: 10px; }
  .week input { width: 100%; accent-color: var(--accent); }
  @media (max-width: 560px) { .compare { grid-template-columns: 1fr 1fr; gap: 10px; } }
  .bar { display: flex; gap: 8px; align-items: center; min-width: 0; }
  .bar .scroller { flex: 1; min-width: 0; }
  .yr { font-family: var(--font-mono); font-size: 11px; opacity: 0.7; }
  .layout { display: grid; grid-template-columns: minmax(0, 430px) minmax(0, 1fr); gap: 28px; align-items: start; }
  .plan-col { position: sticky; top: 12px; }
  .layout.solo { grid-template-columns: minmax(0, 1fr); max-width: 760px; }
  .panel-col { min-width: 0; }
  .jobs { display: grid; gap: 8px; align-content: start; }
  .jobs.animate { animation: settle 180ms ease-out; }
  @keyframes settle { from { opacity: 0.4; transform: translateY(3px); } }
  .month-name { font-size: clamp(26px, 3.4vw, 32px); font-weight: 700; }
  .summary { font-size: 16px; }
  .chips { margin-bottom: 6px; }
  .chip.frost { border-style: dashed; }
  button.chip { cursor: pointer; }
  h3 { margin-top: 12px; }
  .hint { margin-top: 16px; }
  .legend { display: flex; gap: 6px 10px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
  .key { display: inline-block; width: 16px; height: 11px; border-radius: 2px; }
  .key.changes { border: 2px solid var(--new); }
  .key.draft { border: 1.4px dashed var(--muted); margin-left: 6px; }
  .multiples { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); }
  .multiple { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); cursor: pointer; text-align: left; }
  .multiple:hover { border-color: var(--muted); }
  @media (max-width: 760px) {
    .layout { grid-template-columns: minmax(0, 1fr); }
    .plan-col { position: static; max-width: 460px; width: 100%; margin-inline: auto; }
  }
</style>
