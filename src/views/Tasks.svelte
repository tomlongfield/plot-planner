<script lang="ts">
  import TaskEditor from '../components/TaskEditor.svelte';
  import TaskRow from '../components/TaskRow.svelte';
  import { addMonths, monthKey, monthsBetween } from '../lib/dates';
  import { tasksCSV } from '../lib/exports';
  import { download, slug } from '../lib/files';
  import { monthYear, t } from '../lib/i18n';
  import { toICS } from '../lib/ics';
  import { app } from '../lib/store.svelte';
  import { isOverdue, nextUp, sortTasks, tasksInMonth, thisWeek, type PlanTask } from '../lib/tasks';
  import type { Task, TaskPlace, TaskType } from '../lib/types';

  type Tab = 'next' | 'week' | 'month' | 'list';
  let tab: Tab = $state('next');
  let place: TaskPlace | '' = $state('');
  let type: TaskType | '' = $state('');
  let plotId = $state('');
  let hideDone = $state(true);
  let editing: { task?: Task } | null = $state(null);

  const filtered = $derived(
    app.tasks.filter((x) => (!place || x.place === place) && (!type || x.type === type) && (!plotId || x.plotId === plotId) && (!hideDone || x.status !== 'done')),
  );
  const weekStart = $derived(app.site?.weekStart ?? 1);
  const shown = $derived(
    tab === 'next' ? nextUp(filtered, app.today) : tab === 'week' ? thisWeek(filtered, app.today, weekStart) : sortTasks(filtered),
  );
  const overdue = $derived(shown.filter((x) => isOverdue(x, app.today)));
  const months = $derived(monthsBetween(monthKey(app.today), addMonths(monthKey(app.today), 11)));

  function exportICS() {
    const open = app.tasks.filter((x) => x.agreement === 'agreed' && x.status === 'todo' && x.window.to >= app.today);
    const where = (x: PlanTask) => (x.place === 'plot' ? [app.plotName(x.plotId), app.areaName(x.areaId)].filter(Boolean).join(', ') : t(`place.${x.place}`));
    download(`${slug(app.plot?.name ?? 'plot')}-tasks.ics`, toICS(open, { name: `${t('app.name')}: ${app.site?.name ?? ''}`, where }), 'text/calendar');
    app.notify(t('tasks.icsSaved', { n: open.length }));
  }
</script>

<div class="tasks">
  <div class="spread">
    <h1>{t('nav.tasks')}</h1>
    <span class="row">
      <button class="btn" onclick={() => download(`${slug(app.plot?.name ?? 'plot')}-tasks.csv`, tasksCSV(shown, app), 'text/csv')}>{t('seeds.export')}</button>
      <button class="btn" onclick={exportICS}>{t('tasks.ics')}</button>
      <button class="btn primary" onclick={() => (editing = {})}>{t('te.add')}</button>
    </span>
  </div>

  <div class="tabs" role="tablist" aria-label={t('tasks.views')}>
    {#each ['next', 'week', 'month', 'list'] as k (k)}
      <button class="pill" role="tab" aria-selected={tab === k} onclick={() => (tab = k as Tab)}>{t(`tasks.tab.${k}`)}</button>
    {/each}
  </div>

  <div class="row filters">
    {#if app.plots.length > 1}
      <select bind:value={plotId} aria-label={t('tasks.plot')}><option value="">{t('tasks.allPlots')}</option>{#each app.plots as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select>
    {/if}
    <select bind:value={place} aria-label={t('tasks.place')}>
      <option value="">{t('tasks.allPlaces')}</option>
      {#each ['plot', 'home', 'propagation', 'admin'] as p}<option value={p}>{t(`place.${p}`)}</option>{/each}
    </select>
    <select bind:value={type} aria-label={t('tasks.type')}>
      <option value="">{t('tasks.allTypes')}</option>
      {#each ['sow', 'plant', 'harvest', 'order', 'job'] as ty}<option value={ty}>{t(`ttype.${ty}`)}</option>{/each}
    </select>
    <label class="check"><input type="checkbox" bind:checked={hideDone} />{t('tasks.hideDone')}</label>
  </div>

  {#if tab === 'month'}
    {#each months as k (k)}
      {@const items = tasksInMonth(filtered, k)}
      {#if items.length}
        <section>
          <h2 class="mh">{monthYear(k)}</h2>
          <div class="ruled">{#each items as task (task.id + k)}<TaskRow {task} onopen={(x) => (editing = { task: x.source })} />{/each}</div>
        </section>
      {/if}
    {/each}
  {:else}
    {#if tab === 'next' && overdue.length}
      <p class="small"><span class="chip warn">{t('tasks.overdueCount', { n: overdue.length })}</span></p>
    {/if}
    {#if shown.length}
      <div class="ruled">{#each shown as task (task.id)}<TaskRow {task} onopen={(x) => (editing = { task: x.source })} />{/each}</div>
    {:else}
      <div class="empty card"><p>{t(`tasks.empty.${tab}`)}</p></div>
    {/if}
  {/if}
  <p class="small muted">{t('tasks.icsHelp')}</p>
</div>

{#if editing}
  <TaskEditor task={editing.task} onclose={() => (editing = null)} />
{/if}

<style>
  .tasks { display: grid; gap: 14px; max-width: 900px; }
  .filters select { width: auto; }
  .mh { font-size: 18px; margin: 12px 0 2px; }
</style>
