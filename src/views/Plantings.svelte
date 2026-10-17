<script lang="ts">
  import PlantingEditor from '../components/PlantingEditor.svelte';
  import WarningList from '../components/WarningList.svelte';
  import { acceptDraft, rejectDraft } from '../lib/actions';
  import { plantingsCSV } from '../lib/exports';
  import { download, slug } from '../lib/files';
  import { range, t } from '../lib/i18n';
  import { OPEN_END, OPEN_START, type Resolved } from '../lib/plantings';
  import { app } from '../lib/store.svelte';
  import type { Planting } from '../lib/types';

  type Filter = 'active' | 'all' | 'drafts' | 'done';
  let filter: Filter = $state(app.route.arg === 'drafts' ? 'drafts' : 'active');
  let group: 'area' | 'date' = $state('area');
  let query = $state('');

  // The route can open a planting (#/plantings/<id>) or a new one (#/plantings/new:<areaId>).
  const editing = $derived.by(() => {
    const a = app.route.arg;
    if (!a || a === 'drafts') return null;
    if (a === 'new' || a.startsWith('new:')) return { isNew: true, areaId: a.slice(4) || undefined };
    const p = app.data.plantings.find((x) => x.id === a);
    return p ? { isNew: false, planting: p } : null;
  });

  const list = $derived(
    app.plotResolved
      .filter((r) => {
        const p = r.planting;
        if (filter === 'drafts' && p.agreement !== 'draft') return false;
        if (filter === 'active' && (p.status === 'cleared' || p.status === 'failed')) return false;
        if (filter === 'done' && p.status !== 'cleared' && p.status !== 'failed') return false;
        if (query && !`${app.nameOf(p)} ${app.shortNameOf(p)} ${app.areaName(p.areaId)}`.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => a.occupancy.from.localeCompare(b.occupancy.from)),
  );
  const drafts = $derived(app.plotResolved.filter((r) => r.planting.agreement === 'draft'));

  const groups = $derived.by(() => {
    if (group === 'date') return [{ key: 'all', name: '', items: list }];
    const out: { key: string; name: string; items: Resolved[] }[] = [];
    for (const a of app.areas) {
      const items = list.filter((r) => r.planting.areaId === a.id);
      if (items.length) out.push({ key: a.id, name: a.name, items });
    }
    const orphan = list.filter((r) => !app.areas.some((a) => a.id === r.planting.areaId));
    if (orphan.length) out.push({ key: 'none', name: t('pl.noArea'), items: orphan });
    return out;
  });

  const warningsFor = (id: string) => app.warnings.filter((w) => w.plantingId === id || w.otherId === id);
  const plotWarnings = $derived(app.warnings.filter((w) => w.plantingId || w.kind === 'propCapacity'));

  function dateCell(r: Resolved, k: 'sow' | 'plantOut' | 'harvest' | 'clear'): string {
    const w = r.windows[k];
    if (!w || w.from === OPEN_START || w.to === OPEN_END) return '';
    return range(w.from, w.to);
  }

  function open(p: Planting) {
    app.go('plantings', p.id);
  }
  function close() {
    app.go('plantings', filter === 'drafts' ? 'drafts' : undefined);
  }
</script>

<div class="plantings">
  <div class="spread">
    <h1>{t('nav.plantings')}</h1>
    <span class="row">
      <button class="btn" onclick={() => download(`${slug(app.plot?.name ?? 'plot')}-plantings.csv`, plantingsCSV(list, app), 'text/csv')}>{t('seeds.export')}</button>
      <button class="btn primary" onclick={() => app.go('plantings', 'new')}>{t('pe.add')}</button>
    </span>
  </div>

  {#if drafts.length}
    <section class="drafts card" aria-labelledby="drafts-title">
      <div class="spread">
        <h2 id="drafts-title">{t('pl.drafts', { n: drafts.length })}</h2>
        <span class="row">
          <button class="btn small accent" onclick={() => acceptDraft({ plantings: drafts.map((r) => r.planting.id) })}>{t('pl.acceptAll')}</button>
        </span>
      </div>
      <p class="small muted">{t('pl.draftsHelp')}</p>
      <ul class="ruled plain">
        {#each drafts as r (r.planting.id)}
          <li class="spread">
            <span><button class="linkish" onclick={() => open(r.planting)}>{app.nameOf(r.planting)}</button>
              <span class="muted small">{app.areaName(r.planting.areaId)}{dateCell(r, 'plantOut') ? `, ${t('window.plantOut').toLowerCase()} ${dateCell(r, 'plantOut')}` : ''}</span></span>
            <span class="row">
              <button class="btn small" onclick={() => acceptDraft({ plantings: [r.planting.id] })}>{t('pl.accept')}</button>
              <button class="btn small quiet" onclick={() => rejectDraft({ plantings: [r.planting.id] })}>{t('pl.discard')}</button>
            </span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if plotWarnings.length}
    <details class="card" open={plotWarnings.length <= 3}>
      <summary><strong>{t('pl.warnings', { n: plotWarnings.length })}</strong></summary>
      <div style="margin-top:10px"><WarningList warnings={plotWarnings} /></div>
    </details>
  {/if}

  <div class="row toolbar">
    <div class="tabs" role="tablist" aria-label={t('pl.filter')}>
      {#each ['active', 'drafts', 'done', 'all'] as f (f)}
        <button class="pill" role="tab" aria-selected={filter === f} onclick={() => (filter = f as Filter)}>{t(`pl.filter.${f}`)}</button>
      {/each}
    </div>
    <span class="grow"></span>
    <input type="search" placeholder={t('pl.search')} aria-label={t('pl.search')} bind:value={query} class="search" />
    <select bind:value={group} aria-label={t('pl.group')} class="group">
      <option value="area">{t('pl.byArea')}</option><option value="date">{t('pl.byDate')}</option>
    </select>
  </div>

  {#if !list.length}
    <div class="empty card">
      <p>{filter === 'drafts' ? t('pl.noDrafts') : t('pl.none')}</p>
      <button class="btn primary" onclick={() => app.go('plantings', 'new')}>{t('pe.add')}</button>
    </div>
  {/if}

  {#each groups as g (g.key)}
    <section class="group-block">
      {#if g.name}<h2 class="group-name">{g.name}</h2>{/if}
      <div class="table" role="table" aria-label={g.name || t('nav.plantings')}>
        <div class="tr head" role="row">
          <span role="columnheader">{t('pl.col.planting')}</span>
          <span role="columnheader">{t('window.sow')}</span>
          <span role="columnheader">{t('window.plantOut')}</span>
          <span role="columnheader">{t('window.harvest')}</span>
          <span role="columnheader">{t('window.clear')}</span>
          <span role="columnheader">{t('pl.col.status')}</span>
        </div>
        {#each g.items as r (r.planting.id)}
          {@const ws = warningsFor(r.planting.id)}
          <div class="tr" role="row" class:draft={r.planting.agreement === 'draft'}>
            <span role="cell" class="name">
              <button class="linkish" onclick={() => open(r.planting)}>{app.nameOf(r.planting)}</button>
              {#if group === 'date'}<span class="muted small">{app.areaName(r.planting.areaId)}</span>{/if}
              {#if r.planting.qty}<span class="muted small mono">{r.planting.qty} {t(`unitName.${r.planting.qtyUnit ?? 'plants'}`).toLowerCase()}</span>{/if}
              {#if r.planting.rows?.length}<span class="muted small">{t('area.rows', { rows: r.planting.rows.join(', ') })}</span>{/if}
              {#if r.planting.agreement === 'draft'}<span class="chip draft">{t('draft')}</span>{/if}
              {#if ws.length}<span class="chip warn" title={ws.length + ''}>{t('pl.warningCount', { n: ws.length })}</span>{/if}
              {#if r.delayDays}<span class="chip warn">{t('pl.delayed', { days: r.delayDays })}</span>{/if}
            </span>
            <span role="cell" class="mono d" data-label={t('window.sow')}>{dateCell(r, 'sow')}</span>
            <span role="cell" class="mono d" data-label={t('window.plantOut')}>{dateCell(r, 'plantOut')}</span>
            <span role="cell" class="mono d" data-label={t('window.harvest')}>{dateCell(r, 'harvest')}</span>
            <span role="cell" class="mono d" data-label={t('window.clear')}>{dateCell(r, 'clear')}</span>
            <span role="cell"><span class="chip">{t(`status.${r.planting.status}`)}</span></span>
          </div>
        {/each}
      </div>
    </section>
  {/each}
</div>

{#if editing}
  {#key app.route.arg}
    <PlantingEditor planting={editing.isNew ? undefined : editing.planting} areaId={editing.isNew ? editing.areaId : undefined} onclose={close} />
  {/key}
{/if}

<style>
  .plantings { display: grid; gap: 16px; }
  .drafts { border-style: dashed; display: grid; gap: 8px; }
  .plain { list-style: none; margin: 0; padding: 0; }
  .plain li { padding: 8px 0; }
  .toolbar { gap: 10px; }
  .grow { flex: 1; }
  .search { width: 14em; }
  .group { width: auto; }
  .group-name { font-size: 18px; margin: 6px 0 2px; }
  .table { display: grid; }
  .tr { display: grid; grid-template-columns: minmax(12em, 2fr) repeat(4, minmax(7em, 1fr)) 7em; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line); align-items: baseline; }
  .tr.head { font: 500 11px var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); border-top: 0; padding-bottom: 4px; }
  .tr.draft .linkish { font-style: italic; }
  .name { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; }
  .d { font-size: 12.5px; }
  .linkish { background: none; border: 0; padding: 0; cursor: pointer; font-weight: 500; text-align: left; color: var(--ink); }
  .linkish:hover { text-decoration: underline; }
  @media (max-width: 760px) {
    .tr.head { display: none; }
    .tr { grid-template-columns: 1fr 1fr; gap: 2px 12px; }
    .name { grid-column: 1 / -1; }
    .d:empty { display: none; }
    .d::before { content: attr(data-label) ' '; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); display: block; }
    .search { width: 100%; }
  }
</style>
