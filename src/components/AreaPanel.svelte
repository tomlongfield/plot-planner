<script lang="ts">
  // What's in an area now, what's next, and what was there before.
  import { areaM2, capacityFor } from '../lib/capacity';
  import { monthEnd, monthStart, overlaps } from '../lib/dates';
  import { range, t, tn } from '../lib/i18n';
  import { OPEN_END, OPEN_START, type Resolved } from '../lib/plantings';
  import { app } from '../lib/store.svelte';
  import { area as fmtArea } from '../lib/units';
  import EntryEditor from './EntryEditor.svelte';
  import WarningList from './WarningList.svelte';
  import type { Entry } from '../lib/types';

  let { areaId, month, onclose }: { areaId: string; month: string; onclose: () => void } = $props();

  const area = $derived(app.data.areas.find((a) => a.id === areaId));
  const ids = $derived(new Set([areaId, ...app.data.areas.filter((a) => a.parentId === areaId).map((a) => a.id)]));
  const here = $derived(
    [...app.resolved.values()].filter((r) => ids.has(r.planting.areaId)).sort((a, b) => a.occupancy.from.localeCompare(b.occupancy.from)),
  );
  const m = $derived({ from: monthStart(month), to: monthEnd(month) });
  const now = $derived(here.filter((r) => overlaps(r.occupancy, m)));
  const next = $derived(here.filter((r) => r.occupancy.from > m.to));
  const past = $derived(here.filter((r) => r.occupancy.to < m.from).reverse());
  const warnings = $derived(app.warnings.filter((w) => w.areaId && ids.has(w.areaId)));
  let logging: Partial<Entry> | null = $state(null);
  const recent = $derived(app.data.entries.filter((e) => e.areaId && ids.has(e.areaId)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5));
  const growing = $derived(now.find((r) => r.planting.agreement === 'agreed'));

  function span(r: Resolved): string {
    const from = r.occupancy.from === OPEN_START ? '' : r.occupancy.from;
    const to = r.occupancy.to === OPEN_END ? '' : r.occupancy.to;
    if (from && to) return range(from, to);
    if (from) return t('area.from', { date: range(from, from) });
    if (to) return t('area.until', { date: range(to, to) });
    return '';
  }
</script>

{#snippet list(items: Resolved[], empty: string)}
  {#if items.length}
    <ul class="ruled">
      {#each items as r (r.planting.id)}
        {@const cap = area ? capacityFor(r.planting, app.data.areas.find((a) => a.id === r.planting.areaId) ?? area, app.cropOf(r.planting)) : undefined}
        <li>
          <button class="linkish" onclick={() => app.go('plantings', r.planting.id)}>{app.nameOf(r.planting)}</button>
          {#if r.planting.agreement === 'draft'}<span class="chip draft">{t('draft')}</span>{/if}
          <span class="mono muted">{span(r)}</span>
          {#if r.planting.areaId !== areaId}<span class="muted small">{app.areaName(r.planting.areaId)}</span>{/if}
          {#if r.planting.rows?.length}<span class="muted small">{t('area.rows', { rows: r.planting.rows.join(', ') })}</span>{/if}
          {#if cap}<span class="muted small">{t('area.capacity', { needed: cap.needed, fits: cap.fits, unit: tn(`unit.${cap.unit}`, cap.fits).replace(/^[\d.,\s]+/, ''), working: cap.working })}</span>{/if}
          {#if r.waitingDays}<span class="chip warn">{t('area.waiting', { days: r.waitingDays })}</span>{/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted small">{empty}</p>
  {/if}
{/snippet}

{#if area}
  <section class="panel" aria-labelledby="area-title">
    <div class="spread">
      <button class="btn quiet small" onclick={onclose}>{t('area.back')}</button>
      <button class="btn small" onclick={() => app.go('plantings', `new:${area.id}`)}>{t('area.addPlanting')}</button>
    </div>
    <p class="eyebrow">{t(`kind.${area.kind}`)}{area.perennial ? ` / ${t('area.perennial')}` : ''}</p>
    <h2 id="area-title">{area.name}</h2>
    <p class="muted small">
      {fmtArea(areaM2(area), app.units)}{#if area.protection && area.protection !== 'none'}, {t(`protection.${area.protection}`)}{/if}
    </p>
    <div class="row">
      <button class="btn small" onclick={() => (logging = { kind: 'harvest', areaId, plantingId: growing?.planting.id })}>{t('journal.addHarvest')}</button>
      <button class="btn small quiet" onclick={() => (logging = { kind: 'note', areaId, plantingId: growing?.planting.id })}>{t('journal.addNote')}</button>
      <button class="btn small quiet" onclick={() => (logging = { kind: 'problem', areaId })}>{t('journal.addProblem')}</button>
    </div>
    <WarningList {warnings} />
    <h3>{t('area.now')}</h3>
    {@render list(now, t('area.nothingNow'))}
    <h3>{t('area.next')}</h3>
    {@render list(next, t('area.nothingNext'))}
    <h3>{t('area.history')}</h3>
    {@render list(past, t('area.noHistory'))}
    {#if recent.length}
      <h3>{t('area.journal')}</h3>
      <ul class="ruled">
        {#each recent as e (e.id)}
          <li><span class="mono muted">{e.date}</span> <span>{t(`entryKind.${e.kind}`)}{e.problem ? `: ${e.problem.name}` : ''}{e.text ? `: ${e.text}` : ''}</span></li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}
{#if logging}<EntryEditor preset={{ ...logging, plotId: app.plot?.id }} onclose={() => (logging = null)} />{/if}

<style>
  .panel { display: grid; gap: 10px; align-content: start; }
  h3 { margin-top: 8px; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; flex-wrap: wrap; gap: 2px 10px; align-items: baseline; padding: 7px 0; }
  .linkish { background: none; border: 0; padding: 0; cursor: pointer; font-weight: 500; color: var(--ink); }
  .linkish:hover { text-decoration: underline; }
</style>
