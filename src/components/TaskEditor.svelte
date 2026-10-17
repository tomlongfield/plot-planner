<script lang="ts">
  // Add or edit one of the grower's own tasks.
  import { addDays } from '../lib/dates';
  import { t } from '../lib/i18n';
  import { uid } from '../lib/ids';
  import { app } from '../lib/store.svelte';
  import type { Task, TaskPlace, TaskType } from '../lib/types';
  import { untrack } from 'svelte';
  import Dialog from './Dialog.svelte';

  let props: { task?: Task; onclose: () => void } = $props();
  const onclose = () => props.onclose();
  const task = untrack(() => props.task);
  const isNew = !task;
  let x: Task = $state(
    task
      ? (structuredClone($state.snapshot(task)) as Task)
      : { id: uid('task'), plotId: app.plot?.id, place: 'plot', type: 'job', title: '', window: { from: app.today, to: addDays(app.today, 7) }, status: 'todo', agreement: 'agreed' },
  );
  let repeats = $state(!!task?.recurrence);
  let confirmDelete = $state(false);

  function save() {
    const out = $state.snapshot(x) as Task;
    if (!repeats) delete out.recurrence;
    else out.recurrence = out.recurrence ?? { every: 1, unit: 'year' };
    if (out.place !== 'plot') {
      out.areaId = undefined;
    }
    app.update(isNew ? t('te.added', { title: out.title }) : t('te.saved', { title: out.title }), (d) => {
      const i = d.tasks.findIndex((y) => y.id === out.id);
      if (i >= 0) d.tasks[i] = out;
      else d.tasks.push(out);
    });
    onclose();
  }

  function remove() {
    app.update(t('te.deleted', { title: x.title }), (d) => {
      d.tasks = d.tasks.filter((y) => y.id !== x.id);
      d.taskStates = d.taskStates.filter((s) => s.id !== x.id && !s.id.startsWith(`${x.id}@`));
    });
    onclose();
  }

  const PLACES: TaskPlace[] = ['plot', 'home', 'propagation', 'admin'];
  const TYPES: TaskType[] = ['job', 'sow', 'plant', 'harvest', 'order'];
  const TEMPLATES = ['te.tpl.netting', 'te.tpl.prune', 'te.tpl.cuttings', 'te.tpl.compost', 'te.tpl.order', 'te.tpl.water'];
</script>

<Dialog open title={isNew ? t('te.add') : t('te.edit')} {onclose}>
  <label class="field"><span>{t('te.title')}</span><input bind:value={x.title} placeholder={t('te.titleHint')} /></label>
  {#if isNew}
    <div class="row templates">
      <span class="small muted">{t('te.templates')}</span>
      {#each TEMPLATES as k}<button class="chip" onclick={() => (x.title = t(k))}>{t(k)}</button>{/each}
    </div>
  {/if}
  <div class="grid2">
    <label class="field"><span>{t('te.type')}</span>
      <select bind:value={x.type}>{#each TYPES as ty}<option value={ty}>{t(`ttype.${ty}`)}</option>{/each}</select></label>
    <label class="field"><span>{t('te.place')}</span>
      <select bind:value={x.place}>{#each PLACES as p}<option value={p}>{t(`place.${p}`)}</option>{/each}</select></label>
    {#if x.place === 'plot'}
      <label class="field"><span>{t('te.area')}</span>
        <select value={x.areaId ?? ''} onchange={(e) => (x.areaId = e.currentTarget.value || undefined)}>
          <option value="">{t('te.wholePlot')}</option>
          {#each app.areas as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
        </select></label>
    {/if}
  </div>
  <div class="grid2">
    <label class="field"><span>{t('te.from')}</span><input type="date" bind:value={x.window.from} onchange={() => { if (x.window.to < x.window.from) x.window.to = x.window.from; }} /></label>
    <label class="field"><span>{t('te.to')}</span><input type="date" bind:value={x.window.to} min={x.window.from} /></label>
  </div>
  <label class="check"><input type="checkbox" bind:checked={repeats} onchange={() => { if (repeats && !x.recurrence) x.recurrence = { every: 1, unit: 'year' }; }} />{t('te.repeats')}</label>
  {#if repeats && x.recurrence}
    <div class="row">
      <span>{t('te.every')}</span>
      <input type="number" min="1" style="width:5em" bind:value={x.recurrence.every} aria-label={t('te.every')} />
      <select bind:value={x.recurrence.unit} style="width:auto" aria-label={t('te.unit')}>
        {#each ['day', 'week', 'month', 'year'] as u}<option value={u}>{t(`te.unit.${u}`)}</option>{/each}
      </select>
      <span>{t('te.until')}</span>
      <input type="date" style="width:auto" value={x.recurrence.until ?? ''} onchange={(e) => x.recurrence && (x.recurrence.until = e.currentTarget.value || undefined)} aria-label={t('te.until')} />
    </div>
  {/if}
  <label class="field"><span>{t('te.qty')}</span><input bind:value={x.qty} /></label>
  <label class="field"><span>{t('te.details')}</span><textarea bind:value={x.details}></textarea></label>
  <label class="field"><span>{t('pe.agreement')}</span>
    <select bind:value={x.agreement}><option value="agreed">{t('agreement.agreed')}</option><option value="draft">{t('agreement.draft')}</option></select></label>
  {#snippet footer()}
    {#if !isNew}
      {#if confirmDelete}
        <button class="btn primary" onclick={remove}>{t('pe.deleteYes')}</button>
      {:else}
        <button class="btn quiet danger" onclick={() => (confirmDelete = true)}>{t('te.delete')}</button>
      {/if}
    {/if}
    <span style="flex:1"></span>
    <button class="btn quiet" onclick={onclose}>{t('settings.cancel')}</button>
    <button class="btn primary" disabled={!x.title.trim()} onclick={save}>{isNew ? t('te.add') : t('pe.save')}</button>
  {/snippet}
</Dialog>

<style>
  .templates { gap: 6px; }
  .templates .chip { cursor: pointer; font-family: var(--font-body); letter-spacing: 0; }
</style>
