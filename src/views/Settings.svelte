<script lang="ts">
  import { untrack } from 'svelte';
  import Dialog from '../components/Dialog.svelte';
  import MergeDialog from '../components/MergeDialog.svelte';
  import MonthDayInput from '../components/MonthDayInput.svelte';
  import ShareDialog from '../components/ShareDialog.svelte';
  import ShareImport from '../components/ShareImport.svelte';
  import { parseShare, type SharePayload } from '../lib/share';
  import { setClimate } from '../lib/actions';
  import { emptyDataset, parseBackup } from '../lib/backup';
  import { defaultClimate, frostFreeDays } from '../lib/climate';
  import { localDate } from '../lib/dates';
  import { clearDataset, isPersisted, requestPersistence } from '../lib/db';
  import { demoDataset } from '../lib/demo';
  import { downloadBackup, pickFile } from '../lib/files';
  import { fullDate, languages, setLocale, t } from '../lib/i18n';
  import { uid } from '../lib/ids';
  import { app } from '../lib/store.svelte';
  import type { Climate, Direction, Plot, PlotType } from '../lib/types';
  import { ATTRIBUTION, climateFromEstimate, lookupFrostDates, searchPlaces, type FrostEstimate, type Place } from '../lib/weather';

  const site = $derived(app.site);

  // Frost dates are edited as a draft and applied together, because applying moves the plan.
  let climate: Climate = $state(defaultClimate('N'));
  let lat = $state(0);
  let lon = $state(0);
  // Reset the drafts only when the stored site location or climate really changes,
  // not on every edit elsewhere (which would wipe a looked-up estimate).
  const siteKey = $derived(site ? `${site.id}|${JSON.stringify(site.climate)}|${site.location.lat}|${site.location.lon}` : '');
  $effect(() => {
    void siteKey;
    untrack(() => {
      if (!site) return;
      climate = { ...site.climate };
      lat = site.location.lat;
      lon = site.location.lon;
    });
  });
  const climateChanged = $derived(
    !!site && (climate.lastFrost !== site.climate.lastFrost || climate.firstFrost !== site.climate.firstFrost || climate.hemisphere !== site.climate.hemisphere),
  );

  // ── Optional online lookups ──
  let placeQuery = $state('');
  let places = $state<Place[]>([]);
  let lookupBusy = $state(false);
  let lookupError = $state('');
  let estimate = $state<FrostEstimate | null>(null);
  let safer = $state(true);
  /** Climate as it came from a lookup, so applying it keeps that source unless edited. */
  let fromLookup = $state<Climate | null>(null);

  async function findPlace() {
    lookupError = '';
    lookupBusy = true;
    try {
      places = await searchPlaces(placeQuery.trim(), (site?.locale ?? 'en').split('-')[0]);
      if (!places.length) lookupError = t('lookup.noPlaces');
    } catch {
      lookupError = t('lookup.failed');
    } finally {
      lookupBusy = false;
    }
  }

  function choosePlace(p: Place) {
    lat = Math.round(p.lat * 100) / 100;
    lon = Math.round(p.lon * 100) / 100;
    editSite((s) => (s.location = { label: p.label, lat, lon }));
    places = [];
    placeQuery = '';
  }

  async function lookUpFrost() {
    lookupError = '';
    lookupBusy = true;
    estimate = null;
    try {
      estimate = await lookupFrostDates(lat, lon, climate.hemisphere, app.today);
    } catch (e) {
      lookupError = (e as Error).message === 'nodata' ? t('lookup.noData') : t('lookup.failed');
    } finally {
      lookupBusy = false;
    }
  }

  function useEstimate() {
    if (!estimate) return;
    climate = climateFromEstimate(estimate, climate.hemisphere, safer);
    fromLookup = { ...climate };
    estimate = null;
  }

  function setForecast(on: boolean) {
    app.update(on ? t('weather.on') : t('weather.off'), (d) => { d.settings.forecast = on ? { enabled: true } : { enabled: false }; });
    if (on) app.refreshForecast(true);
  }

  function setHemisphere(h: 'N' | 'S') {
    if (h === climate.hemisphere) return;
    // Offer typical frost dates for the other hemisphere as a starting point.
    climate = { ...defaultClimate(h), source: 'user' };
    if (Math.sign(lat) !== (h === 'N' ? 1 : -1)) lat = -lat;
  }

  function applyClimate() {
    if (!site) return;
    app.update(null, (d) => {
      const s = d.sites.find((x) => x.id === site.id)!;
      s.location = { ...s.location, lat, lon };
    });
    const looked = fromLookup && fromLookup.lastFrost === climate.lastFrost && fromLookup.firstFrost === climate.firstFrost && fromLookup.hemisphere === climate.hemisphere;
    setClimate(site.id, looked ? { ...fromLookup!, userEdited: false } : { ...climate, source: 'user', userEdited: true });
    fromLookup = null;
  }

  function saveLocation() {
    if (!site) return;
    app.update(t('settings.saved'), (d) => {
      const s = d.sites.find((x) => x.id === site.id)!;
      s.location = { ...s.location, lat: Number(lat) || 0, lon: Number(lon) || 0 };
    });
  }

  function editSite(fn: (s: NonNullable<typeof site>) => void) {
    if (!site) return;
    app.update(null, (d) => { fn(d.sites.find((x) => x.id === site.id)!); });
  }

  // ── Plots ──
  let plotDialog = $state(false);
  let newPlot = $state({ name: '', type: 'allotment' as PlotType, widthM: 5, lengthM: 10, topDirection: 'N' as Direction });

  function addPlot() {
    let siteId = site?.id;
    const plotId = uid('plot');
    app.update(t('settings.plotAdded', { name: newPlot.name }), (d) => {
      if (!siteId) {
        siteId = uid('site');
        d.sites.push({ id: siteId, name: t('settings.mySite'), location: { lat: 52, lon: 0, label: '' }, climate: defaultClimate('N'), units: 'metric', locale: navigator.language || 'en-GB' });
        d.settings.activeSiteId = siteId;
      }
      const p: Plot = { id: plotId, siteId, ...newPlot, name: newPlot.name || t('settings.newPlotName') };
      d.plots.push(p);
      d.settings.activePlotId = plotId;
    });
    plotDialog = false;
    app.go('plan');
  }

  let deleting = $state<Plot | null>(null);
  let deletingSite = $state<{ id: string; name: string } | null>(null);

  function deleteSite(id: string) {
    const name = app.data.sites.find((s) => s.id === id)?.name ?? '';
    app.update(t('settings.gardenDeleted', { name }), (d) => {
      const plotIds = new Set(d.plots.filter((p) => p.siteId === id).map((p) => p.id));
      const areaIds = new Set(d.areas.filter((a) => plotIds.has(a.plotId)).map((a) => a.id));
      const plantingIds = new Set(d.plantings.filter((x) => plotIds.has(x.plotId)).map((x) => x.id));
      d.sites = d.sites.filter((s) => s.id !== id);
      d.plots = d.plots.filter((p) => !plotIds.has(p.id));
      d.areas = d.areas.filter((a) => !plotIds.has(a.plotId));
      d.features = d.features.filter((f) => !plotIds.has(f.plotId));
      d.plantings = d.plantings.filter((x) => !plotIds.has(x.plotId));
      d.tasks = d.tasks.filter((x) => !(x.plotId && plotIds.has(x.plotId)) && !(x.areaId && areaIds.has(x.areaId)));
      d.taskStates = d.taskStates.filter((s) => !plantingIds.has(s.id.split(':')[0]));
      d.propSpaces = d.propSpaces.filter((s) => s.siteId !== id);
      if (d.settings.activeSiteId === id) {
        d.settings.activeSiteId = d.sites[0]?.id;
        d.settings.activePlotId = d.plots.find((p) => p.siteId === d.sites[0]?.id)?.id;
      }
    });
    deletingSite = null;
  }
  function deletePlot(p: Plot) {
    app.update(t('settings.plotDeleted', { name: p.name }), (d) => {
      const areaIds = new Set(d.areas.filter((a) => a.plotId === p.id).map((a) => a.id));
      const plantingIds = new Set(d.plantings.filter((x) => x.plotId === p.id).map((x) => x.id));
      d.plots = d.plots.filter((x) => x.id !== p.id);
      d.areas = d.areas.filter((a) => a.plotId !== p.id);
      d.features = d.features.filter((f) => f.plotId !== p.id);
      d.plantings = d.plantings.filter((x) => x.plotId !== p.id);
      d.tasks = d.tasks.filter((x) => x.plotId !== p.id && !(x.areaId && areaIds.has(x.areaId)));
      d.taskStates = d.taskStates.filter((s) => !plantingIds.has(s.id.split(':')[0]));
      if (d.settings.activePlotId === p.id) d.settings.activePlotId = d.plots[0]?.id;
    });
    deleting = null;
  }

  // ── Data ──
  let persisted = $state(false);
  isPersisted().then((p) => (persisted = p));
  let confirmReset: 'demo' | 'erase' | null = $state(null);
  let restoreError = $state('');
  let sharing = $state(false);
  let shared = $state<SharePayload | null>(null);
  let shareError = $state('');

  async function openShared() {
    shareError = '';
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      shared = parseShare(await f.text());
    } catch (e) {
      shareError = t(`shared.error.${(e as Error).message === 'newer' ? 'newer' : 'bad'}`);
    }
  }

  async function restore() {
    restoreError = '';
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const d = parseBackup(await f.text(), __APP_VERSION__);
      app.replace(d, t('settings.restored', { date: d.meta.lastBackupAt ? fullDate(localDate(d.meta.lastBackupAt)) : f.name }));
    } catch (e) {
      restoreError = t(`settings.restoreError.${(e as Error).message}`);
    }
  }

  let merging = $state<import('../lib/types').Dataset | null>(null);
  async function mergeFile() {
    restoreError = '';
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      merging = parseBackup(await f.text(), __APP_VERSION__);
    } catch (e) {
      restoreError = t(`settings.restoreError.${(e as Error).message}`);
    }
  }

  async function reset(kind: 'demo' | 'erase') {
    if (kind === 'demo') app.replace(demoDataset(app.lib), t('settings.demoLoaded'));
    else {
      await clearDataset();
      app.replace(emptyDataset(__APP_VERSION__), t('settings.erased'));
    }
    confirmReset = null;
  }

  const range = $derived(app.data.settings.monthRange);
</script>

<div class="settings">
  <h1>{t('nav.settings')}</h1>

  {#if site}
    <section class="card stack" aria-labelledby="s-site">
      <h2 id="s-site">{t('settings.site')}</h2>
      <div class="grid2">
        <label class="field"><span>{t('settings.siteName')}</span>
          <input value={site.name} onchange={(e) => editSite((s) => (s.name = e.currentTarget.value))} /></label>
        <label class="field"><span>{t('settings.placeName')}</span>
          <input value={site.location.label} placeholder={t('settings.placeHint')} onchange={(e) => editSite((s) => (s.location.label = e.currentTarget.value))} /></label>
      </div>
      <div class="grid2">
        <label class="field"><span>{t('settings.lat')}</span><input type="number" step="0.01" min="-90" max="90" bind:value={lat} onchange={saveLocation} /></label>
        <label class="field"><span>{t('settings.lon')}</span><input type="number" step="0.01" min="-180" max="180" bind:value={lon} onchange={saveLocation} /></label>
      </div>
      <p class="help small muted">{t('settings.latHelp')}</p>
      <details>
        <summary>{t('lookup.findPlace')}</summary>
        <p class="small muted">{t('lookup.placePrivacy')}</p>
        <form class="row" onsubmit={(e) => { e.preventDefault(); if (placeQuery.trim()) findPlace(); }}>
          <input type="search" bind:value={placeQuery} placeholder={t('lookup.placeHint')} aria-label={t('lookup.findPlace')} style="flex:1;min-width:10em" />
          <button class="btn" type="submit" disabled={lookupBusy || !placeQuery.trim()}>{t('lookup.search')}</button>
        </form>
        {#if places.length}
          <ul class="ruled list">{#each places as p}<li class="spread"><span>{p.label} <span class="mono muted small">{p.lat.toFixed(2)}, {p.lon.toFixed(2)}</span></span><button class="btn small" onclick={() => choosePlace(p)}>{t('lookup.use')}</button></li>{/each}</ul>
          <p class="small muted">{t('weather.attribution')} <a href={ATTRIBUTION.url} rel="noopener">{ATTRIBUTION.name}</a></p>
        {/if}
      </details>
    </section>

    <section class="card stack" aria-labelledby="s-frost">
      <h2 id="s-frost">{t('settings.frost')}</h2>
      <p class="muted">{t('settings.frostIntro')}</p>
      <div class="field">
        <span>{t('settings.hemisphere')}</span>
        <div class="row" role="radiogroup" aria-label={t('settings.hemisphere')}>
          <button class="pill" role="radio" aria-checked={climate.hemisphere === 'N'} class:on={climate.hemisphere === 'N'} onclick={() => setHemisphere('N')}>{t('settings.north')}</button>
          <button class="pill" role="radio" aria-checked={climate.hemisphere === 'S'} class:on={climate.hemisphere === 'S'} onclick={() => setHemisphere('S')}>{t('settings.south')}</button>
        </div>
      </div>
      <div class="grid2">
        <div class="field"><span>{t('settings.lastFrost')}</span><MonthDayInput id="lf" label={t('settings.lastFrost')} bind:value={climate.lastFrost} /></div>
        <div class="field"><span>{t('settings.firstFrost')}</span><MonthDayInput id="ff" label={t('settings.firstFrost')} bind:value={climate.firstFrost} /></div>
      </div>
      <p class="small muted">{t('settings.frostFree', { days: frostFreeDays(climate) })}</p>
      <details>
        <summary>{t('settings.frostHelpTitle')}</summary>
        <p class="small">{t('settings.frostHelp')}</p>
      </details>
      <p class="small muted">{t('settings.frostSource', { source: site.climate.source === 'user' || site.climate.source === 'default' ? t('settings.sourceYou') : site.climate.source })}</p>
      <div class="lookup">
        <button class="btn small" onclick={lookUpFrost} disabled={lookupBusy}>{lookupBusy ? t('lookup.busy') : t('lookup.frost')}</button>
        <span class="small muted">{t('lookup.frostPrivacy', { lat: lat.toFixed(2), lon: lon.toFixed(2) })}</span>
      </div>
      {#if lookupError}<p class="warning" role="alert">{lookupError}</p>{/if}
      {#if estimate}
        <div class="estimate card">
          <p>{t('lookup.result', { years: estimate.years })}</p>
          <label class="check"><input type="radio" name="est" checked={safer} onchange={() => (safer = true)} />
            <span>{t('lookup.safer', { last: estimate.safeLastFrost, first: estimate.safeFirstFrost })}</span></label>
          <label class="check"><input type="radio" name="est" checked={!safer} onchange={() => (safer = false)} />
            <span>{t('lookup.typical', { last: estimate.lastFrost, first: estimate.firstFrost })}</span></label>
          <p class="small muted">{t('lookup.range', { a: estimate.lastRange[0], b: estimate.lastRange[1], c: estimate.firstRange[0], d: estimate.firstRange[1] })}</p>
          <p class="small muted">{estimate.source}. {t('lookup.groundFrost')} {t('weather.attribution')} <a href={ATTRIBUTION.url} rel="noopener">{ATTRIBUTION.name}</a>.</p>
          <div class="row"><button class="btn primary small" onclick={useEstimate}>{t('lookup.useDates')}</button><button class="btn quiet small" onclick={() => (estimate = null)}>{t('settings.cancel')}</button></div>
        </div>
      {/if}
      {#if climateChanged}
        <div class="warning info">
          <span>{t('settings.frostApplyHelp')}
            <span class="row" style="margin-top:8px">
              <button class="btn primary small" onclick={applyClimate}>{t('settings.frostApply')}</button>
              <button class="btn quiet small" onclick={() => (climate = { ...site.climate })}>{t('settings.cancel')}</button>
            </span>
          </span>
        </div>
      {/if}
    </section>

    <section class="card stack" aria-labelledby="s-weather">
      <h2 id="s-weather">{t('weather.title')}</h2>
      <p class="small">{t('weather.intro')}</p>
      <label class="check"><input type="checkbox" checked={!!app.data.settings.forecast?.enabled} onchange={(e) => setForecast(e.currentTarget.checked)} />{t('weather.toggle')}</label>
      {#if app.data.settings.forecast?.fetchedAt}<p class="small muted">{t('weather.fetched', { date: fullDate(localDate(app.data.settings.forecast.fetchedAt)) })}</p>{/if}
    </section>

    <section class="card stack" aria-labelledby="s-units">
      <h2 id="s-units">{t('settings.display')}</h2>
      <div class="grid2">
        <label class="field"><span>{t('settings.units')}</span>
          <select value={site.units} onchange={(e) => editSite((s) => (s.units = e.currentTarget.value as 'metric' | 'imperial'))}>
            <option value="metric">{t('settings.metric')}</option><option value="imperial">{t('settings.imperial')}</option>
          </select></label>
        <label class="field"><span>{t('settings.language')}</span>
          <select value={site.locale} onchange={(e) => { const v = e.currentTarget.value; editSite((s) => (s.locale = v)); setLocale(v); }}>
            {#each languages as l}<option value={l.code === 'en' ? 'en-GB' : l.code}>{l.name}</option>{/each}
            {#if site.locale.startsWith('en')}<option value="en-US">English (US dates)</option>{/if}
          </select></label>
        <label class="field"><span>{t('settings.weekStart')}</span>
          <select value={site.weekStart ?? 1} onchange={(e) => editSite((s) => (s.weekStart = Number(e.currentTarget.value) as 0 | 1))}>
            <option value={1}>{t('settings.monday')}</option><option value={0}>{t('settings.sunday')}</option>
          </select></label>
        <label class="field"><span>{t('settings.theme')}</span>
          <select value={app.data.settings.theme} onchange={(e) => app.update(null, (d) => { d.settings.theme = e.currentTarget.value as 'system'; })}>
            <option value="system">{t('theme.system')}</option><option value="light">{t('theme.light')}</option><option value="dark">{t('theme.dark')}</option>
          </select></label>
      </div>
    </section>
  {/if}

  <section class="card stack" aria-labelledby="s-plots">
    <div class="spread"><h2 id="s-plots">{t('settings.plots')}</h2><button class="btn small" onclick={() => (plotDialog = true)}>{t('settings.addPlot')}</button></div>
    {#if app.data.plots.length}
      {#each app.data.sites as s (s.id)}
      {#if app.data.sites.length > 1}
        <div class="spread site-head">
          <h3>{s.name}{#if s.id === app.site?.id} <span class="chip">{t('settings.current')}</span>{/if}</h3>
          {#if s.id !== app.site?.id}<button class="btn small quiet danger" onclick={() => (deletingSite = { id: s.id, name: s.name })}>{t('settings.deleteGarden')}</button>{/if}
        </div>
      {/if}
      <ul class="ruled list">
        {#each app.data.plots.filter((p) => p.siteId === s.id) as p (p.id)}
          <li class="spread">
            <span><strong>{p.name}</strong> <span class="muted small">{p.widthM} × {p.lengthM} m, {t(`plotType.${p.type}`)}</span>
              {#if p.id === app.plot?.id}<span class="chip">{t('settings.current')}</span>{/if}</span>
            <span class="row">
              {#if p.id !== app.plot?.id}<button class="btn small quiet" onclick={() => app.update(null, (d) => { d.settings.activePlotId = p.id; d.settings.activeSiteId = p.siteId; })}>{t('settings.open')}</button>{/if}
              <button class="btn small quiet" onclick={() => { app.update(null, (d) => { d.settings.activePlotId = p.id; }); app.go('plan'); }}>{t('settings.editLayout')}</button>
              <button class="btn small quiet danger" onclick={() => (deleting = p)}>{t('settings.delete')}</button>
            </span>
          </li>
        {/each}
      </ul>
      {/each}
    {:else}
      <p class="muted">{t('settings.noPlots')}</p>
    {/if}
  </section>

  <section class="card stack" aria-labelledby="s-plan">
    <h2 id="s-plan">{t('settings.planning')}</h2>
    <div class="grid2">
      <label class="field"><span>{t('settings.rotationYears')}</span>
        <input type="number" min="1" max="8" value={app.data.settings.rotationYears} onchange={(e) => app.update(null, (d) => { d.settings.rotationYears = Math.max(1, Number(e.currentTarget.value) || 3); })} />
        <span class="help">{t('settings.rotationHelp')}</span></label>
      <div class="field"><span>{t('settings.monthRange')}</span>
        <select value={range.mode} onchange={(e) => app.update(null, (d) => {
          d.settings.monthRange = e.currentTarget.value === 'auto' ? { mode: 'auto' } : { mode: 'fixed', from: app.months[0], months: 12 };
        })}>
          <option value="auto">{t('settings.rangeAuto')}</option><option value="fixed">{t('settings.rangeFixed')}</option>
        </select>
        {#if range.mode === 'fixed'}
          <div class="row">
            <input type="month" aria-label={t('settings.rangeFrom')} value={range.from} onchange={(e) => app.update(null, (d) => { if (d.settings.monthRange.mode === 'fixed') d.settings.monthRange.from = e.currentTarget.value; })} />
            <input type="number" min="1" max="36" aria-label={t('settings.rangeMonths')} value={range.months} style="width:6em" onchange={(e) => app.update(null, (d) => { if (d.settings.monthRange.mode === 'fixed') d.settings.monthRange.months = Number(e.currentTarget.value) || 12; })} />
            <span class="small muted">{t('settings.months')}</span>
          </div>
        {/if}
      </div>
    </div>
  </section>

  <section class="card stack" aria-labelledby="s-data">
    <h2 id="s-data">{t('settings.data')}</h2>
    <p>{t('settings.dataIntro')}</p>
    <p class="small muted">{t('settings.mergeHelp')}</p>
    <p class="small muted">
      {app.data.meta.lastBackupAt ? t('settings.lastBackup', { date: fullDate(localDate(app.data.meta.lastBackupAt)) }) : t('settings.neverBackedUp')}
      {persisted ? t('settings.persisted') : t('settings.notPersisted')}
    </p>
    <div class="row">
      <button class="btn primary" onclick={downloadBackup}>{t('settings.backupNow')}</button>
      <button class="btn" onclick={restore}>{t('settings.restore')}</button>
      <button class="btn" onclick={mergeFile}>{t('settings.merge')}</button>
      {#if !persisted}<button class="btn quiet" onclick={async () => (persisted = await requestPersistence())}>{t('settings.persist')}</button>{/if}
    </div>
    {#if restoreError}<p class="warning" role="alert">{restoreError}</p>{/if}
    <h3>{t('settings.sharing')}</h3>
    <p class="small">{t('settings.sharingHelp')}</p>
    <div class="row">
      {#if app.plot}<button class="btn" onclick={() => (sharing = true)}>{t('share.button')}</button>{/if}
      <button class="btn" onclick={openShared}>{t('settings.openShared')}</button>
    </div>
    {#if shareError}<p class="warning" role="alert">{shareError}</p>{/if}
    <div class="row">
      <button class="btn quiet" onclick={() => (confirmReset = 'demo')}>{t('settings.loadDemo')}</button>
      <button class="btn quiet danger" onclick={() => (confirmReset = 'erase')}>{t('settings.erase')}</button>
    </div>
  </section>

  <section class="card stack" aria-labelledby="s-about">
    <h2 id="s-about">{t('settings.about')}</h2>
    <p>{t('settings.aboutText')}</p>
    <p class="small muted">{t('settings.privacy')}</p>
    <p class="small"><a href="https://github.com/tomlongfield/plot-planner" rel="noopener">{t('settings.source')}</a> · <a href="./licenses/OFL-bitter.txt">{t('settings.fontLicences')}</a></p>
    <p class="mono muted">{__APP_VERSION__}</p>
  </section>
</div>

{#if merging}<MergeDialog theirs={merging} onclose={() => (merging = null)} />{/if}
{#if sharing}<ShareDialog onclose={() => (sharing = false)} />{/if}
{#if shared}<ShareImport payload={shared} source="file" onclose={() => (shared = null)} />{/if}

<Dialog open={plotDialog} title={t('settings.addPlot')} onclose={() => (plotDialog = false)}>
  <label class="field"><span>{t('settings.plotName')}</span><input bind:value={newPlot.name} placeholder={t('settings.plotNameHint')} /></label>
  <label class="field"><span>{t('settings.plotType')}</span>
    <select bind:value={newPlot.type}>
      {#each ['allotment', 'garden', 'raised-beds', 'greenhouse', 'containers', 'field'] as ty}<option value={ty}>{t(`plotType.${ty}`)}</option>{/each}
    </select></label>
  <div class="grid2">
    <label class="field"><span>{t('settings.width')}</span><input type="number" min="0.5" step="0.1" bind:value={newPlot.widthM} /></label>
    <label class="field"><span>{t('settings.length')}</span><input type="number" min="0.5" step="0.1" bind:value={newPlot.lengthM} /></label>
  </div>
  <p class="help small muted">{t('settings.sizeHelp')}</p>
  <label class="field"><span>{t('settings.top')}</span>
    <select bind:value={newPlot.topDirection}>{#each ['N', 'E', 'S', 'W'] as d}<option value={d}>{t(`dir.long.${d}`)}</option>{/each}</select>
    <span class="help">{t('settings.topHelp')}</span></label>
  {#snippet footer()}
    <button class="btn quiet" onclick={() => (plotDialog = false)}>{t('settings.cancel')}</button>
    <button class="btn primary" onclick={addPlot} disabled={!(newPlot.widthM > 0 && newPlot.lengthM > 0)}>{t('settings.addPlot')}</button>
  {/snippet}
</Dialog>

<Dialog open={!!deleting} title={t('settings.deletePlotTitle', { name: deleting?.name ?? '' })} onclose={() => (deleting = null)}>
  <p>{t('settings.deletePlotHelp')}</p>
  {#snippet footer()}
    <button class="btn quiet" onclick={() => (deleting = null)}>{t('settings.cancel')}</button>
    <button class="btn primary" onclick={() => deleting && deletePlot(deleting)}>{t('settings.deletePlot')}</button>
  {/snippet}
</Dialog>

<Dialog open={!!deletingSite} title={t('settings.deleteGardenTitle', { name: deletingSite?.name ?? '' })} onclose={() => (deletingSite = null)}>
  <p>{t('settings.deleteGardenHelp')}</p>
  {#snippet footer()}
    <button class="btn quiet" onclick={() => (deletingSite = null)}>{t('settings.cancel')}</button>
    <button class="btn primary" onclick={() => deletingSite && deleteSite(deletingSite.id)}>{t('settings.deleteGarden')}</button>
  {/snippet}
</Dialog>

<Dialog open={!!confirmReset} title={confirmReset === 'demo' ? t('settings.loadDemo') : t('settings.erase')} onclose={() => (confirmReset = null)}>
  <p>{confirmReset === 'demo' ? t('settings.loadDemoHelp') : t('settings.eraseHelp')}</p>
  {#snippet footer()}
    <button class="btn quiet" onclick={() => (confirmReset = null)}>{t('settings.cancel')}</button>
    <button class="btn" onclick={downloadBackup}>{t('settings.backupFirst')}</button>
    <button class="btn primary" onclick={() => confirmReset && reset(confirmReset)}>{confirmReset === 'demo' ? t('settings.loadDemo') : t('settings.erase')}</button>
  {/snippet}
</Dialog>

<style>
  .settings { display: grid; gap: 16px; max-width: 760px; }
  .list { list-style: none; margin: 0; padding: 0; }
  .list li { padding: 8px 0; }
  .site-head { margin-top: 8px; }
  details summary { cursor: pointer; color: var(--accent); font-weight: 500; }
  .lookup { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .estimate { display: grid; gap: 8px; }
  details p { margin-top: 8px; }
</style>
