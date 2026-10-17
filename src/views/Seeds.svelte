<script lang="ts">
  import ImportWizard from '../components/ImportWizard.svelte';
  import LotEditor from '../components/LotEditor.svelte';
  import WarningList from '../components/WarningList.svelte';
  import { download } from '../lib/files';
  import { fullDate, t } from '../lib/i18n';
  import { cropName } from '../lib/library';
  import { toCSV } from '../lib/sheets';
  import { app } from '../lib/store.svelte';
  import type { StockLot, StockStatus } from '../lib/types';

  let editing: { lot?: StockLot } | null = $state(null);
  let importing = $state(false);
  let query = $state('');
  let showUsed = $state(false);

  const seedWarnings = $derived(app.warnings.filter((w) => w.kind === 'oldSeed' || w.kind === 'seedUseBy'));
  const lots = $derived(
    app.data.stock
      .filter((s) => showUsed || s.status !== 'used')
      .filter((s) => {
        if (!query) return true;
        const c = app.cropOfVariety(s.varietyId);
        return `${app.varietyName(s.varietyId)} ${c ? cropName(c) : ''} ${s.supplier ?? ''} ${s.storage ?? ''}`.toLowerCase().includes(query.toLowerCase());
      })
      .map((s) => ({ s, crop: app.cropOfVariety(s.varietyId) }))
      .sort((a, b) => (a.crop ? cropName(a.crop) : '').localeCompare(b.crop ? cropName(b.crop) : '') || app.varietyName(a.s.varietyId).localeCompare(app.varietyName(b.s.varietyId))),
  );
  const warnFor = (id: string) => seedWarnings.find((w) => w.params.lot === id);

  function setStatus(id: string, status: StockStatus) {
    app.update(null, (d) => {
      const s = d.stock.find((x) => x.id === id);
      if (s) s.status = status;
    });
  }

  function germ(s: StockLot): string {
    const g = s.germTests[s.germTests.length - 1];
    return g && g.sown ? `${Math.round((g.up / g.sown) * 100)}%` : '';
  }

  function exportCSV() {
    const rows = [['crop', 'variety', 'kind', 'source', 'supplier', 'organic', 'acquired', 'use_by', 'quantity', 'unit', 'status', 'storage', 'germination', 'notes']];
    for (const { s, crop } of lots) rows.push([crop ? cropName(crop) : '', app.varietyName(s.varietyId), s.kind, s.source, s.supplier ?? '', s.organic ? 'yes' : '', s.acquired ?? '', s.useBy ?? '', s.quantity != null ? String(s.quantity) : '', s.unit ?? '', s.status, s.storage ?? '', germ(s), s.notes ?? '']);
    download('seeds.csv', toCSV(rows), 'text/csv');
  }
</script>

<div class="seeds">
  <div class="spread">
    <h1>{t('nav.seeds')}</h1>
    <span class="row">
      <button class="btn" onclick={exportCSV}>{t('seeds.export')}</button>
      <button class="btn" onclick={() => (importing = true)}>{t('seeds.import')}</button>
      <button class="btn primary" onclick={() => (editing = {})}>{t('lot.add')}</button>
    </span>
  </div>

  <WarningList warnings={seedWarnings} />

  <div class="row">
    <input type="search" placeholder={t('seeds.search')} aria-label={t('seeds.search')} bind:value={query} class="search" />
    <label class="check"><input type="checkbox" bind:checked={showUsed} />{t('seeds.showUsed')}</label>
    <span class="small muted">{t('seeds.count', { n: lots.length })}</span>
  </div>

  {#if !app.data.stock.length}
    <div class="empty card">
      <p>{t('seeds.empty')}</p>
      <div class="row" style="justify-content:center">
        <button class="btn" onclick={() => (importing = true)}>{t('seeds.import')}</button>
        <button class="btn primary" onclick={() => (editing = {})}>{t('lot.add')}</button>
      </div>
    </div>
  {:else}
    <div class="ledger">
      {#each lots as { s, crop } (s.id)}
        {@const w = warnFor(s.id)}
        <div class="lot" class:used={s.status === 'used'}>
          <div class="who">
            <button class="linkish" onclick={() => (editing = { lot: s })}>{app.varietyName(s.varietyId)}</button>
            <span class="muted small">{crop ? cropName(crop) : ''}</span>
            {#if s.organic}<span class="chip">{t('lot.organicShort')}</span>{/if}
            {#if w}<span class="chip warn">{w.kind === 'seedUseBy' ? t('seeds.pastUseBy') : t('seeds.old')}</span>{/if}
          </div>
          <div class="facts small muted">
            <span>{t(`stockKind.${s.kind}`)}, {t(`source.${s.source}`).toLowerCase()}{s.supplier ? `: ${s.supplier}` : ''}</span>
            {#if s.acquired}<span class="mono">{fullDate(s.acquired)}</span>{/if}
            {#if s.useBy}<span class="mono">{t('seeds.useBy')} {fullDate(s.useBy)}</span>{/if}
            {#if s.storage}<span>{s.storage}</span>{/if}
            {#if germ(s)}<span class="mono">{t('seeds.germ', { pct: germ(s) })}</span>{/if}
          </div>
          <div class="qty">
            {#if s.quantity != null}<span class="mono small">{s.quantity} {s.unit ?? ''}</span>{/if}
            <div class="seg" role="radiogroup" aria-label={t('lot.status')}>
              {#each ['plenty', 'low', 'used'] as st}
                <button role="radio" aria-checked={s.status === st} class:on={s.status === st} onclick={() => setStatus(s.id, st as StockStatus)}>{t(`stockStatus.${st}`)}</button>
              {/each}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if editing}<LotEditor lot={editing.lot} onclose={() => (editing = null)} />{/if}
{#if importing}<ImportWizard onclose={() => (importing = false)} />{/if}

<style>
  .seeds { display: grid; gap: 14px; }
  .search { width: 16em; }
  .ledger { display: grid; }
  .lot { display: grid; grid-template-columns: minmax(12em, 1.2fr) 2fr auto; gap: 4px 16px; padding: 10px 0; border-top: 1px solid var(--line); align-items: center; }
  .lot.used { opacity: 0.6; }
  .who { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; }
  .facts { display: flex; flex-wrap: wrap; gap: 2px 14px; }
  .qty { display: flex; gap: 10px; align-items: center; justify-content: flex-end; }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; }
  .seg button { border: 0; background: var(--surface); padding: 4px 10px; font-size: 12.5px; cursor: pointer; min-height: 30px; }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button.on { background: var(--ink); color: var(--bg); }
  .linkish { background: none; border: 0; padding: 0; cursor: pointer; font-weight: 500; text-align: left; color: var(--ink); }
  .linkish:hover { text-decoration: underline; }
  @media (max-width: 760px) {
    .lot { grid-template-columns: 1fr; }
    .qty { justify-content: flex-start; }
    .search { width: 100%; }
  }
</style>
