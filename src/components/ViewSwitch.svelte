<script lang="ts">
  import { t } from '../lib/i18n';
  import { app } from '../lib/store.svelte';

  const VIEWS = ['month', 'timeline', 'rotation'] as const;
</script>

<div class="switch" role="tablist" aria-label={t('views.label')}>
  {#each VIEWS as v (v)}
    <a role="tab" aria-selected={app.route.view === v} class:on={app.route.view === v} href="#/{v}">{t(`views.${v}`)}</a>
  {/each}
</div>

<style>
  .switch { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; background: var(--surface); }
  a { padding: 6px 14px; font: 500 13px var(--font-body); color: var(--ink); text-decoration: none; min-height: 34px; display: inline-flex; align-items: center; }
  a + a { border-left: 1px solid var(--line); }
  a.on { background: var(--ink); color: var(--bg); }
</style>
