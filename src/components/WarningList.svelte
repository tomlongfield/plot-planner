<script lang="ts">
  import type { Warning } from '../lib/checks';
  import { t } from '../lib/i18n';
  import { app } from '../lib/store.svelte';
  import { warningText } from '../lib/warningText';

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
