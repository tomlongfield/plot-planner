<script lang="ts">
  // Merge a backup from another device. Shows what differs and lets the grower
  // pick, record by record. Nothing changes until "Merge".
  import { untrack } from 'svelte';
  import { fullDate, t, tn } from '../lib/i18n';
  import { applyMerge, choiceKey, defaultChoice, diffDatasets, MERGE_STORES, type Choice, type MergeItem, type MergeStore } from '../lib/merge';
  import { app } from '../lib/store.svelte';
  import type { Dataset } from '../lib/types';
  import Dialog from './Dialog.svelte';

  let props: { theirs: Dataset; onclose: () => void } = $props();
  const onclose = () => props.onclose();
  // A plain copy: the file may arrive as reactive state, which can't be cloned.
  const theirs = $state.snapshot(untrack(() => props.theirs)) as Dataset;
  const items = diffDatasets(app.snapshot(), theirs);
  let choices = $state(new Map<string, Choice>(items.map((i) => [choiceKey(i), defaultChoice(i)])));

  const groups = MERGE_STORES.map((store) => ({ store, items: items.filter((i) => i.store === store) })).filter((g) => g.items.length);

  function label(i: MergeItem): string {
    const r = (i.theirs ?? i.mine)! as Record<string, unknown>;
    switch (i.store as MergeStore) {
      case 'plantings': return `${app.varietyName(String(r.varietyId))}, ${areaName(String(r.areaId))}`;
      case 'tasks': return String(r.title);
      case 'entries': return `${t(`entryKind.${r.kind}`)} ${fullDate(String(r.date))}${r.text ? `: ${String(r.text).slice(0, 40)}` : ''}`;
      case 'stock': return app.varietyName(String(r.varietyId));
      case 'varieties': return String(r.name);
      case 'cropOverrides': return String((r.names as Record<string, string[]>)?.en?.[0] ?? r.id);
      case 'reservations': return String(r.label);
      case 'taskStates': return t('merge.taskState', { status: String(r.status) });
      default: return String(r.name ?? r.label ?? r.id);
    }
  }
  function areaName(id: string): string {
    return app.areaName(id) || (theirs.areas.find((a) => a.id === id)?.name ?? '');
  }

  function setAll(c: Choice) {
    const m = new Map(choices);
    for (const i of items) m.set(choiceKey(i), c === 'theirs' ? 'theirs' : i.kind === 'theirs' ? 'mine' : 'mine');
    choices = m;
  }
  function set(i: MergeItem, c: Choice) {
    const m = new Map(choices);
    m.set(choiceKey(i), c);
    choices = m;
  }

  const counts = $derived({
    add: items.filter((i) => i.kind === 'theirs' && choices.get(choiceKey(i)) === 'theirs').length,
    remove: items.filter((i) => i.kind === 'mine' && choices.get(choiceKey(i)) === 'theirs').length,
    replace: items.filter((i) => i.kind === 'changed' && choices.get(choiceKey(i)) === 'theirs').length,
  });

  function merge() {
    const out = applyMerge(app.snapshot(), items, choices);
    app.replace(out, t('merge.done', { add: counts.add, replace: counts.replace, remove: counts.remove }));
    onclose();
  }
</script>

<Dialog open title={t('merge.title')} {onclose} wide>
  {#if !items.length}
    <p>{t('merge.same')}</p>
  {:else}
    <p>{t('merge.intro')}</p>
    <div class="row">
      <button class="btn small" onclick={() => setAll('theirs')}>{t('merge.allTheirs')}</button>
      <button class="btn small" onclick={() => setAll('mine')}>{t('merge.allMine')}</button>
    </div>
    {#each groups as g (g.store)}
      <section>
        <h3>{t(`merge.store.${g.store}`)} <span class="muted small">({g.items.length})</span></h3>
        <ul class="ruled">
          {#each g.items as i (i.id)}
            {@const c = choices.get(choiceKey(i))}
            <li>
              <span class="what">
                <strong>{label(i)}</strong>
                <span class="small muted">{t(`merge.kind.${i.kind}`)}{i.fields?.length ? `: ${i.fields.join(', ')}` : ''}</span>
              </span>
              <span class="pick" role="radiogroup" aria-label={label(i)}>
                {#if i.kind === 'theirs'}
                  <label class="check"><input type="checkbox" checked={c === 'theirs'} onchange={(e) => set(i, e.currentTarget.checked ? 'theirs' : 'mine')} />{t('merge.add')}</label>
                {:else if i.kind === 'mine'}
                  <label class="check"><input type="checkbox" checked={c === 'mine'} onchange={(e) => set(i, e.currentTarget.checked ? 'mine' : 'theirs')} />{t('merge.keep')}</label>
                {:else}
                  <label class="check"><input type="radio" name={choiceKey(i)} checked={c === 'mine'} onchange={() => set(i, 'mine')} />{t('merge.thisDevice')}</label>
                  <label class="check"><input type="radio" name={choiceKey(i)} checked={c === 'theirs'} onchange={() => set(i, 'theirs')} />{t('merge.otherDevice')}</label>
                {/if}
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
  {#snippet footer()}
    {#if items.length}<span class="small muted grow">{tn('merge.summaryAdd', counts.add)}, {tn('merge.summaryReplace', counts.replace)}, {tn('merge.summaryRemove', counts.remove)}.</span>{/if}
    <button class="btn quiet" onclick={onclose}>{t('settings.cancel')}</button>
    {#if items.length}<button class="btn primary" onclick={merge}>{t('merge.apply')}</button>{/if}
  {/snippet}
</Dialog>

<style>
  section { display: grid; gap: 4px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 16px; padding: 8px 0; align-items: center; }
  .what { display: grid; gap: 2px; min-width: 0; }
  .pick { display: flex; gap: 14px; }
  .grow { flex: 1; }
</style>
