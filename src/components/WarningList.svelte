<script lang="ts">
  import type { Warning } from '../lib/checks';
  import { t } from '../lib/i18n';
  import { app } from '../lib/store.svelte';
  import { warningText } from '../lib/warningText';
  import { uid } from '../lib/ids';

  function handPollinate(w: Warning) {
    const ids = [w.plantingId, w.otherId].filter(Boolean) as string[];
    app.update(t('warn.crossing.added'), (d) => {
      for (const id of ids) {
        const p = d.plantings.find((x) => x.id === id);
        if (!p) continue;
        d.tasks.push({
          id: uid('task'), plotId: p.plotId, areaId: p.areaId, plantingId: p.id, place: 'plot', type: 'job',
          title: t('warn.crossing.task', { name: app.nameOf(p) }), details: t('warn.crossing.taskDetail'),
          window: { from: String(w.params.from), to: String(w.params.to || w.params.from) }, status: 'todo', agreement: 'agreed',
        });
      }
    });
  }

  let { warnings, limit = 50 }: { warnings: Warning[]; limit?: number } = $props();

</script>

{#if warnings.length}
  <ul class="warnings">
    {#each warnings.slice(0, limit) as w (w.id)}
      <li class="warning" class:info={w.level === 'info'}>
        <span>
          {warningText(w)}
          {#if w.kind === 'crossing'}
            <span class="muted small">{t('warn.crossing.options')}</span>
            {#if !app.data.tasks.some((x) => x.plantingId === w.plantingId && x.title === t('warn.crossing.task', { name: app.nameOf({ varietyId: app.data.plantings.find((p) => p.id === w.plantingId)?.varietyId ?? '' }) }))}
              <button class="btn small" onclick={() => handPollinate(w)}>{t('warn.crossing.addTasks')}</button>
            {/if}
          {/if}
          {#if w.kind === 'propCapacity' && app.route.view !== 'propagation'}
            <button class="btn quiet small" onclick={() => app.go('propagation')}>{t('warn.open')}</button>
          {/if}
          {#if w.plantingId && app.route.view !== 'plantings'}
            <button class="btn quiet small" onclick={() => app.go('plantings', w.plantingId)}>{t('warn.open')}</button>
          {/if}
        </span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .warnings { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .warnings .btn { margin-left: 4px; vertical-align: baseline; min-height: 24px; padding: 0 6px; }
</style>
