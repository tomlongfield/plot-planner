<script lang="ts">
  import { t } from '../lib/i18n';

  const SECTIONS = ['start', 'month', 'plantings', 'drafts', 'tasks', 'seeds', 'backup', 'offline', 'privacy'];
</script>

<div class="help">
  <h1>{t('help.title')}</h1>
  <p class="lede">{t('help.intro')}</p>
  {#each SECTIONS as s (s)}
    <section aria-labelledby="help-{s}">
      <h2 id="help-{s}">{t(`help.${s}.title`)}</h2>
      {#each t(`help.${s}.body`).split('\n') as para}<p>{para}</p>{/each}
    </section>
  {/each}
  <p class="small muted">{t('help.more')} <a href="https://github.com/tomlongfield/plot-planner/blob/main/docs/user-guide.md" rel="noopener">{t('help.guideLink')}</a></p>
</div>

<style>
  .help { display: grid; gap: 18px; max-width: 68ch; }
  .lede { font-size: 17px; }
  section { display: grid; gap: 6px; }
  h2 { font-size: 20px; }
</style>
