<script lang="ts">
  // One job, set as a ledger line: dates, then what to do, then where.
  import { setTaskStatus } from '../lib/actions';
  import { range, t } from '../lib/i18n';
  import { app } from '../lib/store.svelte';
  import { isOverdue, type PlanTask } from '../lib/tasks';

  let { task, showPlace = true, onopen }: { task: PlanTask; showPlace?: boolean; onopen?: (t: PlanTask) => void } = $props();

  const done = $derived(task.status === 'done');
  const overdue = $derived(isOverdue(task, app.today));
  const where = $derived(
    task.place === 'plot' ? [app.plotName(task.plotId), app.areaName(task.areaId)].filter(Boolean).join(', ') : t(`place.${task.place}`),
  );
</script>

<div class="task" class:done class:draft={task.agreement === 'draft'}>
  <label class="tick">
    <input
      type="checkbox"
      checked={done}
      disabled={task.agreement === 'draft'}
      onchange={(e) => setTaskStatus(task, e.currentTarget.checked ? 'done' : 'todo')}
    />
    <span class="sr-only">{done ? t('task.markTodo', { title: task.title }) : t('task.markDone', { title: task.title })}</span>
  </label>
  <span class="when mono" class:overdue>{range(task.window.from, task.window.to)}</span>
  <div class="what">
    {#if onopen && !task.generated}
      <button class="title linkish" onclick={() => onopen?.(task)}>{task.title}</button>
    {:else}
      <span class="title">{task.title}</span>
    {/if}
    {#if task.qty || task.details || (showPlace && where)}
      <span class="meta">
        {#if showPlace && where}<span>{where}</span>{/if}
        {#if task.qty}<span class="mono">{task.qty}</span>{/if}
        {#if task.details}<span>{task.details}</span>{/if}
      </span>
    {/if}
    {#if task.agreement === 'draft'}<span class="chip draft">{t('draft')}</span>{/if}
    {#if overdue}<span class="chip warn">{t('task.overdue')}</span>{/if}
  </div>
  <span class="ttype {task.type}">{t(`ttype.${task.type}`)}</span>
</div>

<style>
  .task {
    display: grid;
    grid-template-columns: auto minmax(6.6em, max-content) 1fr auto;
    gap: 4px 10px;
    align-items: start;
    padding: 9px 0;
  }
  .tick { display: grid; place-items: center; min-width: 28px; min-height: 28px; margin-top: -4px; cursor: pointer; }
  .when { color: var(--muted); padding-top: 1px; font-size: 12.5px; white-space: nowrap; }
  .when.overdue { color: var(--warn); }
  .what { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; min-width: 0; }
  .title { font-weight: 500; }
  .linkish { background: none; border: 0; padding: 0; cursor: pointer; text-align: left; font-weight: 500; }
  .linkish:hover { text-decoration: underline; }
  .meta { display: flex; flex-wrap: wrap; gap: 0 10px; width: 100%; font-size: 13px; color: var(--muted); }
  .ttype { margin-top: 1px; }
  .done .title { text-decoration: line-through; color: var(--muted); }
  .draft .title { font-style: italic; }
  @media (max-width: 420px) {
    .task { grid-template-columns: auto 1fr auto; }
    .when { grid-column: 2; grid-row: 2; }
    .what { grid-column: 2; grid-row: 1; }
    .ttype { grid-column: 3; grid-row: 1; }
  }
</style>
