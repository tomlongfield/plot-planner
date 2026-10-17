<script lang="ts">
  // Add or edit a journal entry: a note, a harvest, a problem or a store record.
  import { untrack } from 'svelte';
  import { t } from '../lib/i18n';
  import { uid } from '../lib/ids';
  import { shrinkPhoto } from '../lib/journal';
  import { app } from '../lib/store.svelte';
  import type { Entry, EntryKind } from '../lib/types';
  import Dialog from './Dialog.svelte';

  let props: { entry?: Entry; preset?: Partial<Entry>; onclose: () => void } = $props();
  const onclose = () => props.onclose();
  const { entry, preset } = untrack(() => ({ entry: props.entry, preset: props.preset }));
  const isNew = !entry;
  let e: Entry = $state(
    entry ? structuredClone($state.snapshot(entry) as Entry) : { id: uid('entry'), date: app.today, kind: 'note', plotId: app.plot?.id, ...preset },
  );
  // Weights are stored in grams and entered in the grower's own units.
  const FACTOR = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 } as const;
  type WUnit = keyof typeof FACTOR;
  const UNITS: WUnit[] = app.units === 'imperial' ? ['lb', 'oz'] : ['kg', 'g'];
  let weightUnit: WUnit = $state(UNITS[0]);
  let weight = $state<number | undefined>(e.grams != null ? Math.round((e.grams / FACTOR[UNITS[0]]) * 100) / 100 : undefined);
  let busy = $state(false);
  let confirmDelete = $state(false);

  const plantings = $derived(
    app.data.plantings.filter((p) => p.plotId === e.plotId && (!e.areaId || p.areaId === e.areaId || app.data.areas.find((a) => a.id === p.areaId)?.parentId === e.areaId)),
  );
  const KINDS: EntryKind[] = ['note', 'harvest', 'problem', 'store'];

  async function addPhoto(files: FileList | null) {
    if (!files?.length) return;
    busy = true;
    try {
      const shots = await Promise.all([...files].map((f) => shrinkPhoto(f)));
      e.media = [...(e.media ?? []), ...shots];
    } finally {
      busy = false;
    }
  }

  function save() {
    const out = $state.snapshot(e) as Entry;
    if (weight != null && !Number.isNaN(weight)) out.grams = Math.round(weight * FACTOR[weightUnit]);
    else delete out.grams;
    if (out.kind === 'problem' && !out.problem?.name) out.problem = undefined;
    if (!out.plantingId) delete out.plantingId;
    app.update(isNew ? t(`entry.added.${out.kind}`) : t('entry.saved'), (d) => {
      const i = d.entries.findIndex((x) => x.id === out.id);
      if (i >= 0) d.entries[i] = out;
      else d.entries.push(out);
      // A first harvest moves the planting along.
      if (out.kind === 'harvest' && out.plantingId) {
        const p = d.plantings.find((x) => x.id === out.plantingId);
        if (p && (p.status === 'planned' || p.status === 'sown' || p.status === 'growing')) {
          p.status = 'harvesting';
          p.actual = { ...p.actual, firstHarvest: p.actual.firstHarvest ?? out.date };
        }
      }
    });
    onclose();
  }

  function remove() {
    app.update(t('entry.deleted'), (d) => { d.entries = d.entries.filter((x) => x.id !== e.id); });
    onclose();
  }

  const valid = $derived(
    !!e.date && (e.kind !== 'harvest' || weight != null || e.count != null) && (e.kind !== 'problem' || !!e.problem?.name?.trim()) && (e.kind !== 'note' || !!e.text?.trim() || !!e.media?.length),
  );
</script>

<Dialog open title={isNew ? t(`entry.new.${e.kind}`) : t('entry.edit')} {onclose}>
  <div class="row" role="radiogroup" aria-label={t('entry.kind')}>
    {#each KINDS as k}<button class="pill" role="radio" aria-checked={e.kind === k} class:on={e.kind === k} onclick={() => (e.kind = k)}>{t(`entryKind.${k}`)}</button>{/each}
  </div>
  <div class="grid2">
    <label class="field"><span>{t('entry.date')}</span><input type="date" bind:value={e.date} max={app.today} /></label>
    <label class="field"><span>{t('te.area')}</span>
      <select value={e.areaId ?? ''} onchange={(ev) => { e.areaId = ev.currentTarget.value || undefined; e.plantingId = undefined; }}>
        <option value="">{t('te.wholePlot')}</option>
        {#each app.areas as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
      </select></label>
    <label class="field"><span>{t('entry.planting')}</span>
      <select value={e.plantingId ?? ''} onchange={(ev) => (e.plantingId = ev.currentTarget.value || undefined)}>
        <option value="">{t('entry.noPlanting')}</option>
        {#each plantings as p (p.id)}<option value={p.id}>{app.nameOf(p)}{e.areaId ? '' : `, ${app.areaName(p.areaId)}`}</option>{/each}
      </select></label>
  </div>

  {#if e.kind === 'harvest' || e.kind === 'store'}
    <div class="grid2">
      <label class="field"><span>{t('entry.weight')}</span>
        <span class="row nowrap">
          <input type="number" min="0" step="any" bind:value={weight} />
          <select bind:value={weightUnit} aria-label={t('entry.weightUnit')} style="width:5em">{#each UNITS as u}<option value={u}>{u}</option>{/each}</select>
        </span></label>
      <label class="field"><span>{t('entry.count')}</span><input type="number" min="0" bind:value={e.count} /></label>
    </div>
  {/if}
  {#if e.kind === 'problem'}
    <div class="grid2">
      <label class="field"><span>{t('entry.problem')}</span>
        <input value={e.problem?.name ?? ''} list="pest-list" onchange={(ev) => (e.problem = { name: ev.currentTarget.value, severity: e.problem?.severity ?? 2 })} /></label>
      <label class="field"><span>{t('entry.severity')}</span>
        <select value={e.problem?.severity ?? 2} onchange={(ev) => (e.problem = { name: e.problem?.name ?? '', severity: Number(ev.currentTarget.value) as 1 | 2 | 3 })}>
          <option value={1}>{t('severity.1')}</option><option value={2}>{t('severity.2')}</option><option value={3}>{t('severity.3')}</option>
        </select></label>
    </div>
    <datalist id="pest-list">{#each [...new Set([...app.lib.crops.values()].flatMap((c) => c.pests ?? []))].sort() as pest}<option value={pest}></option>{/each}</datalist>
    <p class="small muted">{t('entry.problemHelp')}</p>
  {/if}

  <label class="field"><span>{e.kind === 'store' ? t('entry.storeText') : t('pe.notes')}</span><textarea bind:value={e.text}></textarea></label>

  <div class="photos">
    {#each e.media ?? [] as src, i}
      <figure><img {src} alt={t('entry.photoAlt', { n: i + 1 })} /><button class="btn small quiet" onclick={() => e.media?.splice(i, 1)}>{t('entry.removePhoto')}</button></figure>
    {/each}
    <label class="btn small">
      {busy ? t('entry.photoBusy') : t('entry.addPhoto')}
      <input type="file" accept="image/*" capture="environment" multiple class="sr-only" onchange={(ev) => addPhoto(ev.currentTarget.files)} />
    </label>
  </div>

  {#snippet footer()}
    {#if !isNew}
      {#if confirmDelete}<button class="btn primary" onclick={remove}>{t('pe.deleteYes')}</button>
      {:else}<button class="btn quiet danger" onclick={() => (confirmDelete = true)}>{t('entry.delete')}</button>{/if}
    {/if}
    <span style="flex:1"></span>
    <button class="btn quiet" onclick={onclose}>{t('settings.cancel')}</button>
    <button class="btn primary" disabled={!valid || busy} onclick={save}>{isNew ? t('entry.save') : t('pe.save')}</button>
  {/snippet}
</Dialog>

<style>
  .nowrap { flex-wrap: nowrap; }
  .photos { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
  figure { margin: 0; display: grid; gap: 4px; }
  figure img { width: 120px; height: 90px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); }
</style>
