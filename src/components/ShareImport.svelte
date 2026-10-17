<script lang="ts">
  // Bring a shared plan in, as drafts in one of your plots or as a separate garden.
  // Your agreed plan doesn't change until you accept the drafts.
  import { fullDate, t } from '../lib/i18n';
  import { importAsGarden, importIntoPlot, matchAreas, type SharePayload } from '../lib/share';
  import { app } from '../lib/store.svelte';
  import { untrack } from 'svelte';
  import Dialog from './Dialog.svelte';

  let { payload, source, onclose, ondone }: { payload: SharePayload; source: 'file' | 'link'; onclose: () => void; ondone?: () => void } = $props();

  let mode: 'plot' | 'garden' = $state(app.plot ? 'plot' : 'garden');
  let sharedPlotId = $state(untrack(() => payload.plots[0]?.id ?? ''));
  let targetPlotId = $state(app.plot?.id ?? '');
  let from = $state('');

  const sharedPlantings = $derived(payload.plantings.filter((p) => p.plotId === sharedPlotId));
  const matched = $derived.by(() => {
    const m = matchAreas(payload.areas.filter((a) => a.plotId === sharedPlotId), app.data.areas.filter((a) => a.plotId === targetPlotId));
    return sharedPlantings.filter((p) => m.has(p.areaId)).length;
  });

  function go() {
    const d = app.snapshot();
    if (mode === 'garden') {
      const r = importAsGarden(d, payload, source, from.trim() || undefined);
      const firstPlot = r.data.plots.find((p) => p.siteId === r.siteId);
      r.data.settings.activeSiteId = r.siteId;
      r.data.settings.activePlotId = firstPlot?.id;
      app.update(t('shareIn.addedGarden', { n: payload.plantings.length }), () => r.data);
    } else {
      const r = importIntoPlot(d, payload, sharedPlotId, targetPlotId, source, from.trim() || undefined);
      app.update(t('shareIn.addedPlot', { n: r.added }), () => r.data);
    }
    ondone?.();
    onclose();
    app.go('plantings', 'drafts');
  }
</script>

<Dialog open title={t('shareIn.title')} {onclose}>
  <p>{t('shareIn.summary', { plots: payload.plots.map((p) => p.name).join(', '), plantings: payload.plantings.length, date: fullDate(payload.sharedAt.slice(0, 10)) })}</p>
  <p class="small muted">{t('shareIn.safe')}</p>
  <label class="field"><span>{t('shareIn.from')}</span><input bind:value={from} placeholder={t('shareIn.fromHint')} /></label>

  <fieldset class="choice">
    <legend class="sr-only">{t('shareIn.how')}</legend>
    {#if app.plots.length}
      <label class="option" class:on={mode === 'plot'}>
        <input type="radio" name="mode" value="plot" bind:group={mode} />
        <span>
          <strong>{t('shareIn.intoPlot')}</strong>
          <span class="small muted">{t('shareIn.intoPlotHelp')}</span>
          {#if mode === 'plot'}
            <span class="grid2 pick">
              {#if payload.plots.length > 1}
                <label class="field"><span>{t('shareIn.sharedPlot')}</span>
                  <select bind:value={sharedPlotId}>{#each payload.plots as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select></label>
              {/if}
              <label class="field"><span>{t('shareIn.yourPlot')}</span>
                <select bind:value={targetPlotId}>{#each app.data.plots as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select></label>
            </span>
            <span class={matched === sharedPlantings.length ? 'small' : 'warning'}>{t('shareIn.matched', { n: matched, of: sharedPlantings.length })}</span>
          {/if}
        </span>
      </label>
    {/if}
    <label class="option" class:on={mode === 'garden'}>
      <input type="radio" name="mode" value="garden" bind:group={mode} />
      <span>
        <strong>{t('shareIn.asGarden')}</strong>
        <span class="small muted">{t('shareIn.asGardenHelp')}</span>
      </span>
    </label>
  </fieldset>

  {#snippet footer()}
    <button class="btn quiet" onclick={onclose}>{t('settings.cancel')}</button>
    <button class="btn primary" disabled={mode === 'plot' && !matched} onclick={go}>{t('shareIn.add')}</button>
  {/snippet}
</Dialog>

<style>
  .choice { border: 0; padding: 0; margin: 0; display: grid; gap: 8px; }
  .option { display: grid; grid-template-columns: auto 1fr; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; background: var(--surface); }
  .option.on { border-color: var(--ink); }
  .option > span { display: grid; gap: 4px; }
  .pick { margin-top: 6px; }
</style>
