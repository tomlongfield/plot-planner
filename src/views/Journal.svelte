<script lang="ts">
  import EntryEditor from '../components/EntryEditor.svelte';
  import { harvestsCSV } from '../lib/exports';
  import { download } from '../lib/files';
  import { fullDate, monthYear, num, t } from '../lib/i18n';
  import { harvestTotals } from '../lib/journal';
  import { cropName } from '../lib/library';
  import { app } from '../lib/store.svelte';
  import type { Entry, EntryKind } from '../lib/types';
  import { area as fmtArea, weight as fmtWeight } from '../lib/units';

  type Tab = 'all' | EntryKind;
  let tab: Tab = $state('all');
  let editing: { entry?: Entry; preset?: Partial<Entry> } | null = $state(null);
  let year = $state('');

  const plantings = $derived(new Map(app.data.plantings.map((p) => [p.id, p])));
  const areas = $derived(new Map(app.data.areas.map((a) => [a.id, a])));
  const entries = $derived(
    app.data.entries
      .filter((e) => tab === 'all' ? e.kind !== 'review' : e.kind === tab)
      .filter((e) => !e.plotId || app.plots.some((p) => p.id === e.plotId))
      .sort((a, b) => b.date.localeCompare(a.date)),
  );
  const groups = $derived.by(() => {
    const out: { month: string; items: Entry[] }[] = [];
    for (const e of entries) {
      const m = e.date.slice(0, 7);
      if (out[out.length - 1]?.month !== m) out.push({ month: m, items: [] });
      out[out.length - 1].items.push(e);
    }
    return out;
  });
  const years = $derived([...new Set(app.data.entries.filter((e) => e.kind === 'harvest').map((e) => e.date.slice(0, 4)))].sort().reverse());
  const totals = $derived(harvestTotals(app.data.entries, plantings, areas, app.cropOf, { year: year || undefined }));
  const hasHarvests = $derived(app.data.entries.some((e) => e.kind === 'harvest'));

  function label(e: Entry): string {
    const p = e.plantingId ? plantings.get(e.plantingId) : undefined;
    return [p ? app.nameOf(p) : '', app.areaName(e.areaId ?? p?.areaId)].filter(Boolean).join(', ');
  }

  function exportHarvests() {
    download('harvests.csv', harvestsCSV(app.data.entries, plantings, app), 'text/csv');
  }
  const KIND_RULE: Record<EntryKind, string> = { note: 'job', harvest: 'harvest', problem: 'warn', store: 'order', photo: 'job', review: 'sow' };
</script>

<div class="journal">
  <div class="spread">
    <h1>{t('nav.journal')}</h1>
    <span class="row">
      <button class="btn" onclick={() => (editing = { preset: { kind: 'problem' } })}>{t('journal.addProblem')}</button>
      <button class="btn" onclick={() => (editing = { preset: { kind: 'harvest' } })}>{t('journal.addHarvest')}</button>
      <button class="btn primary" onclick={() => (editing = { preset: { kind: 'note' } })}>{t('journal.addNote')}</button>
    </span>
  </div>

  <div class="tabs" role="tablist" aria-label={t('journal.show')}>
    {#each ['all', 'note', 'harvest', 'problem', 'store'] as k (k)}
      <button class="pill" role="tab" aria-selected={tab === k} onclick={() => (tab = k as Tab)}>{t(`journal.tab.${k}`)}</button>
    {/each}
  </div>

  {#if tab === 'harvest' && hasHarvests}
    <section class="card stack totals" aria-labelledby="totals">
      <div class="spread">
        <h2 id="totals">{t('journal.totals')}</h2>
        <span class="row">
          <select bind:value={year} aria-label={t('journal.year')} style="width:auto">
            <option value="">{t('journal.allYears')}</option>
            {#each years as y}<option value={y}>{y}</option>{/each}
          </select>
          <button class="btn small" onclick={exportHarvests}>{t('journal.exportHarvests')}</button>
        </span>
      </div>
      <div class="cols">
        <div>
          <h3>{t('journal.byCrop')}</h3>
          <dl class="ledger">
            {#each totals.byCrop as c (c.key)}
              {@const crop = app.lib.crops.get(c.key)}
              <dt>{crop ? cropName(crop) : t('journal.other')}</dt>
              <dd class="mono">{c.grams ? fmtWeight(c.grams, app.units) : ''}{c.count ? `${c.grams ? ', ' : ''}${num(c.count)}` : ''}</dd>
            {/each}
          </dl>
        </div>
        <div>
          <h3>{t('journal.byYear')}</h3>
          <dl class="ledger">
            {#each totals.byYear as y (y.key)}<dt>{y.key}</dt><dd class="mono">{fmtWeight(y.grams, app.units)}</dd>{/each}
          </dl>
          {#if app.data.plots.length > 1}
            <h3>{t('journal.byPlot')}</h3>
            <dl class="ledger">{#each totals.byPlot as p (p.key)}<dt>{app.plotName(p.key)}</dt><dd class="mono">{fmtWeight(p.grams, app.units)}</dd>{/each}</dl>
          {/if}
        </div>
        {#if totals.yieldByPlanting.length}
          <div>
            <h3>{t('journal.yield')}</h3>
            <dl class="ledger">
              {#each totals.yieldByPlanting.sort((a, b) => b.perM2 - a.perM2) as y (y.plantingId)}
                {@const p = plantings.get(y.plantingId)!}
                <dt>{app.nameOf(p)} <span class="muted small">{fmtArea(y.m2, app.units)}</span></dt>
                <dd class="mono">{t('journal.perM2', { w: fmtWeight(y.perM2, app.units) })}</dd>
              {/each}
            </dl>
          </div>
        {/if}
      </div>
    </section>
  {/if}

  {#if !entries.length}
    <div class="empty card"><p>{t(`journal.empty.${tab}`)}</p></div>
  {/if}

  {#each groups as g (g.month)}
    <section>
      <h2 class="mh">{monthYear(g.month)}</h2>
      <div class="ruled">
        {#each g.items as e (e.id)}
          <button class="entry" onclick={() => (editing = { entry: e })}>
            <span class="when mono">{fullDate(e.date)}</span>
            <span class="what">
              <span class="head">
                {#if e.kind === 'harvest'}<strong>{[e.grams ? fmtWeight(e.grams, app.units) : '', e.count ? num(e.count) : ''].filter(Boolean).join(', ')}</strong>{/if}
                {#if e.kind === 'problem' && e.problem}<strong>{e.problem.name}</strong> <span class="chip warn">{t(`severity.${e.problem.severity}`)}</span>{/if}
                {#if e.kind === 'store'}<strong>{[e.grams ? fmtWeight(e.grams, app.units) : '', e.count ? num(e.count) : ''].filter(Boolean).join(', ')}</strong>{/if}
                <span class="muted">{label(e)}</span>
              </span>
              {#if e.text}<span class="text">{e.text}</span>{/if}
              {#if e.media?.length}<span class="thumbs">{#each e.media.slice(0, 4) as src}<img {src} alt="" />{/each}</span>{/if}
            </span>
            <span class="ttype {KIND_RULE[e.kind]}">{t(`entryKind.${e.kind}`)}</span>
          </button>
        {/each}
      </div>
    </section>
  {/each}
</div>

{#if editing}<EntryEditor entry={editing.entry} preset={editing.preset} onclose={() => (editing = null)} />{/if}

<style>
  .journal { display: grid; gap: 14px; max-width: 980px; }
  .totals .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; }
  .ledger { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; margin: 6px 0 0; }
  .ledger dt, .ledger dd { margin: 0; padding: 3px 0; border-top: 1px solid var(--line); }
  .mh { font-size: 18px; margin: 10px 0 2px; }
  .entry { display: grid; grid-template-columns: 7.5em 1fr auto; gap: 10px; width: 100%; padding: 10px 0; border: 0; background: none; text-align: left; cursor: pointer; color: var(--ink); }
  .entry:hover .head { text-decoration: underline; text-decoration-color: var(--line); }
  .when { color: var(--muted); font-size: 12.5px; padding-top: 2px; }
  .what { display: grid; gap: 4px; min-width: 0; }
  .head { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
  .text { white-space: pre-wrap; }
  .thumbs { display: flex; gap: 6px; }
  .thumbs img { width: 64px; height: 48px; object-fit: cover; border-radius: 6px; border: 1px solid var(--line); }
  :global(.ttype.warn) { --tc: var(--warn); }
  @media (max-width: 560px) {
    .entry { grid-template-columns: 1fr auto; }
    .when { grid-column: 1; grid-row: 2; }
  }
</style>
