<script lang="ts">
  import CropEditor from '../components/CropEditor.svelte';
  import Dialog from '../components/Dialog.svelte';
  import { describeRule } from '../lib/describe';
  import { download, pickFile } from '../lib/files';
  import { range, t, tn } from '../lib/i18n';
  import { uid } from '../lib/ids';
  import { bundledCrops, cropName, varietiesOf } from '../lib/library';
  import { availablePlans, defaultMethod, nextSeason, resolveWindows } from '../lib/resolve';
  import { app } from '../lib/store.svelte';
  import type { Category, Crop, Variety } from '../lib/types';
  import { spacing as fmtSpacing } from '../lib/units';

  const BUNDLED_IDS = new Set(bundledCrops().map((c) => c.id));
  const CATS: Category[] = ['allium', 'brassica', 'legume', 'leaf', 'root', 'fruiting', 'cucurbit', 'herb', 'fruit', 'flower'];
  let query = $state('');
  let editing: { crop?: Crop } | null = $state(null);
  let addingVariety = $state(false);
  let newVariety: Partial<Variety> = $state({ name: '', seedType: 'OP' });
  let fileError = $state('');

  const selected = $derived(app.route.arg ? app.lib.crops.get(app.route.arg) : undefined);
  const groups = $derived(
    CATS.map((c) => ({
      c,
      crops: [...app.lib.crops.values()]
        .filter((x) => x.category === c)
        .filter((x) => !query || Object.values(x.names).flat().join(' ').toLowerCase().includes(query.toLowerCase()) || x.species.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => cropName(a).localeCompare(cropName(b))),
    })).filter((g) => g.crops.length),
  );
  const edited = $derived(new Set(app.data.cropOverrides.map((c) => c.id)));

  const place = $derived(app.site ? { climate: app.site.climate, lat: app.site.location.lat } : undefined);
  const yourDates = $derived.by(() => {
    if (!selected || !place) return [];
    return availablePlans(selected).map((plan) => {
      const m = defaultMethod(selected, plan);
      const season = nextSeason(selected, plan, m, place, app.today);
      return { plan, method: m, w: resolveWindows(selected, plan, m, place, season) };
    });
  });

  function exportCrop(c: Crop) {
    const own = app.data.varieties.filter((v) => v.cropId === c.id);
    const data = { $schema: 'https://github.com/tomlongfield/plot-planner/raw/main/schema/crop.schema.json', ...$state.snapshot(c), varieties: [...(c.varieties ?? []), ...own] };
    download(`${c.id}.json`, JSON.stringify(data, null, 2) + '\n');
  }

  async function importCrop() {
    fileError = '';
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const c = JSON.parse(await f.text()) as Crop;
      if (!c.id || !c.names?.en?.length || !Array.isArray(c.timing) || !c.category) throw new Error('shape');
      delete (c as { $schema?: string }).$schema;
      app.update(t('crop.imported', { name: cropName(c) }), (d) => {
        const { varieties = [], ...rest } = c;
        d.cropOverrides = d.cropOverrides.filter((x) => x.id !== c.id);
        d.cropOverrides.push(BUNDLED_IDS.has(c.id) ? (rest as Crop) : { ...rest, varieties: varieties.filter((v) => v.cropId === c.id) });
        if (BUNDLED_IDS.has(c.id)) {
          const known = new Set((app.lib.crops.get(c.id)?.varieties ?? []).map((v) => v.id));
          for (const v of varieties) if (!known.has(v.id) && !d.varieties.some((x) => x.id === v.id)) d.varieties.push({ ...v, cropId: c.id });
        }
      });
      app.go('crops', c.id);
    } catch {
      fileError = t('crop.importError');
    }
  }

  function resetCrop(id: string) {
    app.update(t('crop.reset'), (d) => { d.cropOverrides = d.cropOverrides.filter((x) => x.id !== id); });
  }

  function addVariety() {
    if (!selected || !newVariety.name?.trim()) return;
    const v: Variety = { id: `${selected.id}--user-${uid()}`, cropId: selected.id, name: newVariety.name.trim(), seedType: (newVariety.seedType ?? 'unknown') as Variety['seedType'], notes: newVariety.notes };
    app.update(t('crop.varietyAdded', { name: v.name }), (d) => { d.varieties.push(v); });
    addingVariety = false;
    newVariety = { name: '', seedType: 'OP' };
  }

  function removeVariety(id: string) {
    if (app.data.plantings.some((p) => p.varietyId === id) || app.data.stock.some((s) => s.varietyId === id)) {
      app.notify(t('crop.varietyInUse'));
      return;
    }
    app.update(t('crop.varietyRemoved'), (d) => { d.varieties = d.varieties.filter((v) => v.id !== id); });
  }

  const contributeUrl = (c: Crop) =>
    `https://github.com/tomlongfield/plot-planner/issues/new?template=crop.yml&title=${encodeURIComponent(`Crop: ${cropName(c)}`)}`;
</script>

<div class="crops">
  <div class="spread">
    <h1>{t('nav.crops')}</h1>
    <span class="row">
      <button class="btn" onclick={importCrop}>{t('crop.importFile')}</button>
      <button class="btn primary" onclick={() => (editing = {})}>{t('crop.new')}</button>
    </span>
  </div>
  {#if fileError}<p class="warning" role="alert">{fileError}</p>{/if}

  <div class="cols">
    <nav class="list" aria-label={t('crop.list')}>
      <input type="search" placeholder={t('crop.search')} aria-label={t('crop.search')} bind:value={query} />
      {#each groups as g (g.c)}
        <h2 class="cat"><span class="swatch" style="background: var(--c-{g.c})"></span>{t(`cat.${g.c}`)}</h2>
        <ul>
          {#each g.crops as c (c.id)}
            <li><a href="#/crops/{c.id}" class:on={selected?.id === c.id} aria-current={selected?.id === c.id ? 'true' : undefined}>
              {cropName(c)}{#if edited.has(c.id)}<span class="chip">{BUNDLED_IDS.has(c.id) ? t('crop.editedChip') : t('crop.yoursChip')}</span>{/if}
            </a></li>
          {/each}
        </ul>
      {/each}
    </nav>

    <article class="detail">
      {#if selected}
        {@const c = selected}
        <p class="eyebrow">{t(`cat.${c.category}`)}</p>
        <h2 class="crop-title">{cropName(c)}</h2>
        <p class="muted"><em>{c.species}</em>, {c.family}. {t(`lifecycle.${c.lifecycle}`)}, {t(`hardiness.${c.hardiness}`).toLowerCase()}{c.minTempC != null ? ` (${t('crop.minTemp', { temp: c.minTempC })})` : ''}.</p>
        {#if c.names.en.length > 1}<p class="small muted">{t('crop.alsoCalled', { names: c.names.en.slice(1).join(', ') })}</p>{/if}
        {#if c.notes}<p>{c.notes}</p>{/if}

        <h3>{t('crop.timing')}</h3>
        <dl class="facts">
          {#each c.timing as r}
            <dt>{t(`rule.${r.kind}`)}</dt><dd>{describeRule(r)}</dd>
          {/each}
          {#if c.moduleDays}<dt>{t('crop.moduleDays')}</dt><dd>{t('crop.daysN', { n: c.moduleDays })}{c.maxModuleDays ? `, ${t('crop.maxN', { n: c.maxModuleDays })}` : ''}</dd>{/if}
          {#if c.daysToHarvest}<dt>{t('crop.daysToHarvest')}</dt><dd>{t('crop.daysN', { n: c.daysToHarvest })}</dd>{/if}
          {#if c.frostFreeDaysNeeded}<dt>{t('crop.frostFree')}</dt><dd>{t('crop.daysN', { n: c.frostFreeDaysNeeded })}</dd>{/if}
        </dl>

        {#if yourDates.length && app.site}
          <h3>{t('crop.yourDates', { place: app.site.location.label || app.site.name })}</h3>
          {#each yourDates as d}
            <p class="plan-name">{t(`plan.${d.plan}`)}, {t(`method.${d.method}`).toLowerCase()}</p>
            <dl class="facts">
              {#each ['sow', 'plantOut', 'harvest'] as k}
                {#if d.w[k as 'sow']}<dt>{t(`window.${k}`)}</dt><dd class="mono">{range(d.w[k as 'sow']!.from, d.w[k as 'sow']!.to)}</dd>{/if}
              {/each}
            </dl>
          {/each}
        {/if}

        <h3>{t('crop.growing')}</h3>
        <dl class="facts">
          {#if c.spacing?.gridCm}<dt>{t('crop.gridCm')}</dt><dd>{fmtSpacing(c.spacing.gridCm, app.units)}</dd>{/if}
          {#if c.spacing?.inRowCm}<dt>{t('crop.inRowCm')}</dt><dd>{fmtSpacing(c.spacing.inRowCm, app.units)}{c.spacing.betweenRowsCm ? `, ${t('crop.rowsApart', { s: fmtSpacing(c.spacing.betweenRowsCm, app.units) })}` : ''}</dd>{/if}
          {#if c.propagation?.seedsPerModule}<dt>{t('crop.seedsPerModule')}</dt><dd>{c.propagation.seedsPerModule}{c.propagation.moduleSize ? `, ${c.propagation.moduleSize}` : ''}</dd>{/if}
          {#if c.propagation?.germTempC}<dt>{t('crop.germ')}</dt><dd>{c.propagation.germTempC} °C{c.propagation.bottomHeat ? `, ${t('crop.bottomHeat')}` : ''}{c.propagation.light ? `, ${c.propagation.light}` : ''}</dd>{/if}
          <dt>{t('crop.rotation')}</dt><dd>{t(`rotation.${c.rotationGroup}`)}</dd>
          {#if c.pests?.length}<dt>{t('crop.pests')}</dt><dd>{c.pests.join(', ')}</dd>{/if}
        </dl>

        {#if c.seedSaving}
          <h3>{t('crop.seedSaving')}</h3>
          <dl class="facts">
            {#if c.seedSaving.pollination}<dt>{t('crop.pollination')}</dt><dd>{t(`pollination.${c.seedSaving.pollination}`)}</dd>{/if}
            {#if c.seedSaving.crosses}<dt>{t('crop.crosses')}</dt><dd>{t(`crosses.${c.seedSaving.crosses}`)}</dd>{/if}
            {#if c.seedSaving.isolationM}<dt>{t('crop.isolation')}</dt><dd>{c.seedSaving.isolationM} m</dd>{/if}
            {#if c.seedSaving.minPlants}<dt>{t('crop.minPlants')}</dt><dd>{c.seedSaving.minPlants}</dd>{/if}
            {#if c.seedLifeYears}<dt>{t('crop.seedLife')}</dt><dd>{tn('crop.yearsN', c.seedLifeYears)}</dd>{/if}
          </dl>
        {/if}

        <h3>{t('crop.varieties')}</h3>
        <ul class="varieties">
          {#each varietiesOf(app.lib, c.id) as v (v.id)}
            <li>
              <span>{v.name}</span>
              {#if v.seedType !== 'unknown'}<span class="chip">{v.seedType}</span>{/if}
              {#if v.notes}<span class="small muted">{v.notes}</span>{/if}
              {#if app.data.varieties.some((x) => x.id === v.id)}<button class="btn quiet small" onclick={() => removeVariety(v.id)}>{t('crop.removeVariety')}</button>{/if}
            </li>
          {/each}
        </ul>
        <button class="btn small" onclick={() => (addingVariety = true)}>{t('crop.addVariety')}</button>

        {#if c.sources?.length}<p class="small muted source">{t('crop.sourceLabel')} {c.sources.map((s) => s.note).join(' ')}</p>{/if}

        <div class="row actions">
          <button class="btn" onclick={() => (editing = { crop: c })}>{t('crop.editButton')}</button>
          <button class="btn quiet" onclick={() => exportCrop(c)}>{t('crop.export')}</button>
          {#if edited.has(c.id) && BUNDLED_IDS.has(c.id)}<button class="btn quiet" onclick={() => resetCrop(c.id)}>{t('crop.resetButton')}</button>{/if}
          <a class="btn quiet" href={contributeUrl(c)} target="_blank" rel="noopener">{t('crop.contribute')}</a>
        </div>
      {:else}
        <div class="intro">
          <h2>{t('crop.introTitle')}</h2>
          <p>{t('crop.intro', { n: app.lib.crops.size })}</p>
          <p class="small muted">{t('crop.introLicence')}</p>
        </div>
      {/if}
    </article>
  </div>
</div>

{#if editing}<CropEditor crop={editing.crop} onclose={() => (editing = null)} />{/if}

<Dialog open={addingVariety} title={t('crop.addVariety')} onclose={() => (addingVariety = false)}>
  <label class="field"><span>{t('lot.varietyName')}</span><input bind:value={newVariety.name} /></label>
  <label class="field"><span>{t('crop.seedType')}</span>
    <select bind:value={newVariety.seedType}><option value="OP">{t('seedType.OP')}</option><option value="F1">{t('seedType.F1')}</option><option value="unknown">{t('seedType.unknown')}</option></select></label>
  <label class="field"><span>{t('pe.notes')}</span><input bind:value={newVariety.notes} /></label>
  {#snippet footer()}
    <button class="btn quiet" onclick={() => (addingVariety = false)}>{t('settings.cancel')}</button>
    <button class="btn primary" disabled={!newVariety.name?.trim()} onclick={addVariety}>{t('crop.addVariety')}</button>
  {/snippet}
</Dialog>

<style>
  .crops { display: grid; gap: 16px; }
  .cols { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 32px; align-items: start; }
  .list { display: grid; gap: 4px; position: sticky; top: 12px; max-height: calc(100dvh - 24px); overflow: auto; padding-right: 4px; }
  .cat { font: 500 12px var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin: 12px 0 2px; display: flex; align-items: center; gap: 8px; }
  .swatch { width: 12px; height: 12px; border-radius: 3px; border: 1px solid var(--line); }
  .list ul { list-style: none; margin: 0; padding: 0; }
  .list a { display: flex; justify-content: space-between; gap: 6px; padding: 5px 8px; border-radius: 8px; color: var(--ink); text-decoration: none; }
  .list a:hover { background: var(--surface); }
  .list a.on { background: var(--ink); color: var(--bg); }
  .detail { display: grid; gap: 8px; align-content: start; max-width: 720px; }
  .crop-title { font-size: clamp(24px, 3vw, 30px); font-weight: 700; }
  h3 { margin-top: 14px; }
  .facts { display: grid; grid-template-columns: 11em 1fr; gap: 6px 14px; margin: 0; }
  .facts dt { font: 500 11.5px/1.6 var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  .facts dd { margin: 0; }
  .plan-name { margin: 6px 0 0; font-weight: 500; }
  .detail > .btn { justify-self: start; }
  .varieties { list-style: none; margin: 0; padding: 0; }
  .varieties li { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; padding: 6px 0; border-top: 1px solid var(--line); }
  .actions { margin-top: 16px; }
  .source { margin-top: 12px; }
  @media (max-width: 760px) {
    .cols { grid-template-columns: 1fr; }
    .list { position: static; max-height: 40dvh; border: 1px solid var(--line); border-radius: var(--radius); padding: 8px; }
    .facts { grid-template-columns: 1fr; gap: 0 0; }
    .facts dd { margin-bottom: 6px; }
  }
</style>
