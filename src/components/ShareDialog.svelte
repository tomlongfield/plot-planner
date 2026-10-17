<script lang="ts">
  // Share a plan as a file or a read-only link. Nothing goes to a server: the
  // link carries the plan in its #fragment, which browsers never send.
  import { download, slug } from '../lib/files';
  import { num, t } from '../lib/i18n';
  import { buildShare, encodeShare, LINK_LIMIT } from '../lib/share';
  import { buildStandalone } from '../lib/standalone';
  import { app } from '../lib/store.svelte';
  import Dialog from './Dialog.svelte';

  let { onclose }: { onclose: () => void } = $props();
  let scope: 'plot' | 'site' = $state('plot');
  let includeLocation = $state(false);
  let link = $state('');
  let copied = $state(false);
  let pageDrafts = $state(false);
  let building = $state(false);

  async function savePage() {
    building = true;
    try {
      const html = await buildStandalone({ includeLocation, includeDrafts: pageDrafts });
      download(`${slug(app.plot!.name)}.html`, html, 'text/html');
      app.notify(t('share.pageSaved'));
    } finally {
      building = false;
    }
  }

  const plotIds = $derived(scope === 'plot' ? [app.plot!.id] : app.plots.map((p) => p.id));
  const payload = $derived(buildShare(app.snapshot(), plotIds, includeLocation));
  const name = $derived(scope === 'plot' ? app.plot!.name : (app.site?.name ?? 'garden'));

  $effect(() => {
    const p = payload;
    copied = false;
    encodeShare(p).then((f) => (link = `${location.origin}${location.pathname}#share=${f}`));
  });
  const tooLong = $derived(link.length > LINK_LIMIT);

  function saveFile() {
    download(`${slug(name)}.plotplan.json`, JSON.stringify(payload, null, 1));
    app.notify(t('share.fileSaved'));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
    } catch {
      copied = false;
    }
  }
</script>

<Dialog open title={t('share.title')} {onclose}>
  <p>{t('share.intro')}</p>
  {#if app.plots.length > 1}
    <div class="row" role="radiogroup" aria-label={t('share.what')}>
      <button class="pill" role="radio" aria-checked={scope === 'plot'} class:on={scope === 'plot'} onclick={() => (scope = 'plot')}>{t('share.thisPlot', { name: app.plot!.name })}</button>
      <button class="pill" role="radio" aria-checked={scope === 'site'} class:on={scope === 'site'} onclick={() => (scope = 'site')}>{t('share.allPlots', { n: app.plots.length })}</button>
    </div>
  {/if}
  <label class="check"><input type="checkbox" bind:checked={includeLocation} />{t('share.location')}</label>
  <p class="small muted">{t('share.locationHelp')}</p>
  <p class="small muted">{t('share.contents', { plantings: payload.plantings.length, tasks: payload.tasks.length })}</p>

  <section class="opt">
    <h3>{t('share.fileTitle')}</h3>
    <p class="small">{t('share.fileHelp')}</p>
    <button class="btn primary" onclick={saveFile}>{t('share.saveFile')}</button>
  </section>

  <section class="opt">
    <h3>{t('share.pageTitle')}</h3>
    <p class="small">{t('share.pageHelp')}</p>
    <label class="check"><input type="checkbox" bind:checked={pageDrafts} />{t('share.pageDrafts')}</label>
    <button class="btn" onclick={savePage} disabled={building}>{building ? t('share.pageBuilding') : t('share.savePage')}</button>
  </section>

  <section class="opt">
    <h3>{t('share.linkTitle')}</h3>
    {#if tooLong}
      <p class="warning">{t('share.tooLong', { n: num(link.length), max: num(LINK_LIMIT) })}</p>
    {:else}
      <p class="small">{t('share.linkHelp', { n: num(link.length) })}</p>
      <div class="row">
        <input readonly value={link} aria-label={t('share.linkTitle')} onfocus={(e) => e.currentTarget.select()} class="link" />
        <button class="btn" onclick={copy} disabled={!link}>{copied ? t('share.copied') : t('share.copy')}</button>
      </div>
    {/if}
  </section>
</Dialog>

<style>
  .opt { display: grid; gap: 6px; border-top: 1px solid var(--line); padding-top: 12px; }
  .opt .btn { justify-self: start; }
  .link { flex: 1; min-width: 0; font-family: var(--font-mono); font-size: 12px; }
</style>
