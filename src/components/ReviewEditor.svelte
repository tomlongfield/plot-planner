<script lang="ts">
  // A season review: what worked, what didn't, and notes to carry into next
  // year's plan. Notes tied to a crop appear when that crop is planned again.
  import { untrack } from 'svelte';
  import { t } from '../lib/i18n';
  import { uid } from '../lib/ids';
  import { cropName } from '../lib/library';
  import { app } from '../lib/store.svelte';
  import type { Entry } from '../lib/types';
  import Dialog from './Dialog.svelte';

  let props: { entry?: Entry; onclose: () => void } = $props();
  const onclose = () => props.onclose();
  const entry = untrack(() => props.entry);
  const year = Number(app.today.slice(0, 4));
  let e: Entry = $state(
    entry ? structuredClone($state.snapshot(entry) as Entry)
      : { id: uid('entry'), date: app.today, kind: 'review', plotId: app.plot?.id, review: { season: Number(app.today.slice(5, 7)) < 7 ? year - 1 : year, worked: '', failed: '', next: [{ note: '' }] } },
  );
  const review = $derived(e.review!);

  // Crops grown that season come first in the list.
  const grown = $derived(new Set(app.plotResolved.filter((r) => r.occupancy.from.startsWith(String(review.season)) || r.occupancy.to.startsWith(String(review.season))).map((r) => app.cropOf(r.planting)?.id).filter(Boolean)));
  const crops = $derived([...app.lib.crops.values()].sort((a, b) => Number(grown.has(b.id)) - Number(grown.has(a.id)) || cropName(a).localeCompare(cropName(b))));

  function save() {
    const out = $state.snapshot(e) as Entry;
    out.review!.next = out.review!.next.filter((n) => n.note.trim());
    app.update(entry ? t('entry.saved') : t('entry.added.review'), (d) => {
      const i = d.entries.findIndex((x) => x.id === out.id);
      if (i >= 0) d.entries[i] = out;
      else d.entries.push(out);
    });
    onclose();
  }
  function remove() {
    app.update(t('entry.deleted'), (d) => { d.entries = d.entries.filter((x) => x.id !== e.id); });
    onclose();
  }
</script>

<Dialog open title={t('review.title', { season: review.season })} {onclose} wide>
  <label class="field"><span>{t('review.season')}</span>
    <select bind:value={review.season} style="width:auto">{#each [year - 2, year - 1, year, year + 1] as y}<option value={y}>{y}</option>{/each}</select></label>
  <label class="field"><span>{t('review.worked')}</span><textarea bind:value={review.worked} placeholder={t('review.workedHint')}></textarea></label>
  <label class="field"><span>{t('review.failed')}</span><textarea bind:value={review.failed} placeholder={t('review.failedHint')}></textarea></label>
  <fieldset class="next">
    <legend><h3>{t('review.next')}</h3></legend>
    <p class="small muted">{t('review.nextHelp')}</p>
    {#each review.next as n, i}
      <div class="row note">
        <select value={n.cropId ?? ''} onchange={(ev) => (n.cropId = ev.currentTarget.value || undefined)} aria-label={t('review.crop')} style="width:12em">
          <option value="">{t('review.general')}</option>
          {#each crops as c (c.id)}<option value={c.id}>{cropName(c)}</option>{/each}
        </select>
        <input bind:value={n.note} placeholder={t('review.noteHint')} aria-label={t('review.note')} />
        <button class="btn quiet small" onclick={() => review.next.splice(i, 1)} aria-label={t('review.removeNote')}>×</button>
      </div>
    {/each}
    <button class="btn small" onclick={() => review.next.push({ note: '' })}>{t('review.addNote')}</button>
  </fieldset>
  {#snippet footer()}
    {#if entry}<button class="btn quiet danger" onclick={remove}>{t('entry.delete')}</button>{/if}
    <span style="flex:1"></span>
    <button class="btn quiet" onclick={onclose}>{t('settings.cancel')}</button>
    <button class="btn primary" onclick={save}>{t('entry.save')}</button>
  {/snippet}
</Dialog>

<style>
  .next { border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px 14px; margin: 0; display: grid; gap: 8px; }
  .next > .btn { justify-self: start; }
  .note { flex-wrap: nowrap; }
  .note input { flex: 1; min-width: 0; }
  @media (max-width: 560px) { .note { flex-wrap: wrap; } .note select { width: 100% !important; } }
</style>
