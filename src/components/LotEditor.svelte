<script lang="ts">
  // Add or edit a seed lot or other planting stock.
  import { t } from '../lib/i18n';
  import { uid } from '../lib/ids';
  import { cropName, varietiesOf } from '../lib/library';
  import { app } from '../lib/store.svelte';
  import type { StockKind, StockLot, StockSource, StockStatus } from '../lib/types';
  import { untrack } from 'svelte';
  import Dialog from './Dialog.svelte';

  let props: { lot?: StockLot; onclose: () => void } = $props();
  const onclose = () => props.onclose();
  const lot = untrack(() => props.lot);
  const isNew = !lot;
  let x: StockLot = $state(lot ? (structuredClone($state.snapshot(lot)) as StockLot) : { id: uid('lot'), varietyId: '', kind: 'seed', source: 'bought', status: 'plenty', germTests: [], acquired: app.today });
  let cropId = $state(lot ? (app.lib.varieties.get(lot.varietyId)?.cropId ?? '') : '');
  let newVariety = $state('');
  let confirmDelete = $state(false);
  let test = $state({ date: app.today, sown: 10, up: 0 });

  const crops = $derived([...app.lib.crops.values()].sort((a, b) => cropName(a).localeCompare(cropName(b))));
  const varieties = $derived(cropId ? varietiesOf(app.lib, cropId) : []);

  function save() {
    const out = $state.snapshot(x) as StockLot;
    app.update(isNew ? t('lot.added') : t('lot.saved'), (d) => {
      if (out.varietyId === '__new' && newVariety.trim()) {
        const id = `${cropId}--user-${uid()}`;
        d.varieties.push({ id, cropId, name: newVariety.trim(), seedType: 'unknown' });
        out.varietyId = id;
      }
      const i = d.stock.findIndex((s) => s.id === out.id);
      if (i >= 0) d.stock[i] = out;
      else d.stock.push(out);
    });
    onclose();
  }

  function remove() {
    app.update(t('lot.deleted'), (d) => { d.stock = d.stock.filter((s) => s.id !== x.id); });
    onclose();
  }

  const KINDS: StockKind[] = ['seed', 'bulb', 'clove', 'set', 'tuber', 'crown', 'plant', 'cutting'];
  const SOURCES: StockSource[] = ['bought', 'saved', 'gift', 'swap', 'unknown'];
  const STATUSES: StockStatus[] = ['plenty', 'low', 'used'];
  const valid = $derived(!!x.varietyId && (x.varietyId !== '__new' || !!newVariety.trim()));
  const savedFrom = $derived(app.data.plantings.filter((p) => p.varietyId === x.varietyId && p.purpose !== 'eat'));
</script>

<Dialog open title={isNew ? t('lot.add') : app.varietyName(x.varietyId)} {onclose}>
  <div class="grid2">
    <label class="field"><span>{t('pe.crop')}</span>
      <select bind:value={cropId} onchange={() => (x.varietyId = varieties[0]?.id ?? '__new')}>
        <option value="" disabled>{t('pe.chooseCrop')}</option>
        {#each crops as c (c.id)}<option value={c.id}>{cropName(c)}</option>{/each}
      </select></label>
    <label class="field"><span>{t('pe.variety')}</span>
      <select bind:value={x.varietyId} disabled={!cropId}>
        {#each varieties as v (v.id)}<option value={v.id}>{v.name}</option>{/each}
        <option value="__new">{t('lot.newVariety')}</option>
      </select></label>
  </div>
  {#if x.varietyId === '__new'}
    <label class="field"><span>{t('lot.varietyName')}</span><input bind:value={newVariety} /></label>
  {/if}
  <div class="grid2">
    <label class="field"><span>{t('lot.kind')}</span><select bind:value={x.kind}>{#each KINDS as k}<option value={k}>{t(`stockKind.${k}`)}</option>{/each}</select></label>
    <label class="field"><span>{t('lot.source')}</span><select bind:value={x.source}>{#each SOURCES as s}<option value={s}>{t(`source.${s}`)}</option>{/each}</select></label>
    <label class="field"><span>{t('lot.supplier')}</span><input bind:value={x.supplier} /></label>
  </div>
  <div class="grid2">
    <label class="field"><span>{x.source === 'saved' ? t('lot.harvested') : t('lot.acquired')}</span><input type="date" bind:value={x.acquired} /></label>
    <label class="field"><span>{t('seeds.useBy')}</span><input type="date" bind:value={x.useBy} /></label>
    <label class="field"><span>{t('lot.storage')}</span><input bind:value={x.storage} /></label>
  </div>
  <div class="grid2">
    <label class="field"><span>{t('lot.quantity')}</span><input type="number" min="0" step="any" bind:value={x.quantity} /></label>
    <label class="field"><span>{t('lot.unit')}</span><input bind:value={x.unit} placeholder={t('lot.unitHint')} /></label>
    <label class="field"><span>{t('lot.status')}</span><select bind:value={x.status}>{#each STATUSES as s}<option value={s}>{t(`stockStatus.${s}`)}</option>{/each}</select></label>
  </div>
  <div class="row">
    <label class="check"><input type="checkbox" bind:checked={x.organic} />{t('lot.organic')}</label>
  </div>
  <label class="field"><span>{t('lot.link')}</span><input type="url" bind:value={x.link} /></label>
  {#if x.source === 'saved'}
    <label class="field"><span>{t('lot.parent')}</span>
      <select value={x.parentPlantingId ?? ''} onchange={(e) => (x.parentPlantingId = e.currentTarget.value || undefined)}>
        <option value="">{t('lot.parentNone')}</option>
        {#each savedFrom as p (p.id)}<option value={p.id}>{app.nameOf(p)}, {app.areaName(p.areaId)} {p.windows.harvest?.from.slice(0, 4) ?? ''}</option>{/each}
      </select>
      <span class="help">{t('lot.parentHelp')}</span></label>
  {/if}
  <fieldset class="tests">
    <legend class="mono-label">{t('lot.germTests')}</legend>
    {#each x.germTests as g, i}
      <div class="row small"><span class="mono">{g.date}</span><span>{t('lot.germResult', { up: g.up, sown: g.sown, pct: g.sown ? Math.round((g.up / g.sown) * 100) : 0 })}</span>
        <button class="btn quiet small" onclick={() => x.germTests.splice(i, 1)}>×</button></div>
    {/each}
    <div class="row">
      <input type="date" bind:value={test.date} style="width:auto" aria-label={t('lot.testDate')} />
      <input type="number" min="1" bind:value={test.sown} style="width:5em" aria-label={t('lot.sown')} /> <span class="small">{t('lot.sown')}</span>
      <input type="number" min="0" bind:value={test.up} style="width:5em" aria-label={t('lot.up')} /> <span class="small">{t('lot.up')}</span>
      <button class="btn small" onclick={() => x.germTests.push({ ...test })}>{t('lot.addTest')}</button>
    </div>
  </fieldset>
  <label class="field"><span>{t('pe.notes')}</span><textarea bind:value={x.notes}></textarea></label>
  {#snippet footer()}
    {#if !isNew}
      {#if confirmDelete}<button class="btn primary" onclick={remove}>{t('pe.deleteYes')}</button>
      {:else}<button class="btn quiet danger" onclick={() => (confirmDelete = true)}>{t('lot.delete')}</button>{/if}
    {/if}
    <span style="flex:1"></span>
    <button class="btn quiet" onclick={onclose}>{t('settings.cancel')}</button>
    <button class="btn primary" disabled={!valid} onclick={save}>{isNew ? t('lot.add') : t('pe.save')}</button>
  {/snippet}
</Dialog>

<style>
  .tests { border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; margin: 0; display: grid; gap: 8px; }
</style>
