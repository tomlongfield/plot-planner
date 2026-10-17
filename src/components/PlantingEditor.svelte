<script lang="ts">
  // Add or edit a planting. Dates are worked out from the crop's rules and the
  // site's frost dates until the grower changes one by hand.
  import { deletePlanting, savePlanting, setPlantingStatus } from '../lib/actions';
  import { capacityFor, gridCells, spacingFor } from '../lib/capacity';
  import { allPlotWarnings } from '../lib/checks';
  import { dayMonth, range, t, tn } from '../lib/i18n';
  import { uid } from '../lib/ids';
  import { cropName, varietiesOf } from '../lib/library';
  import { reviewNotesFor } from '../lib/lineage';
  import { resolvePlantings } from '../lib/plantings';
  import { availablePlans, defaultMethod, nextSeason, resolveWindows, type Plan } from '../lib/resolve';
  import { app } from '../lib/store.svelte';
  import type { Category, Method, Planting, QtyUnit, Window, WindowKey } from '../lib/types';
  import { warningText } from '../lib/warningText';
  import { untrack } from 'svelte';
  import Dialog from './Dialog.svelte';

  let props: { planting?: Planting; areaId?: string; onclose: () => void } = $props();
  const onclose = () => props.onclose();
  // A one-shot form: it copies the planting once and is remounted for each edit.
  const { planting, areaId } = untrack(() => ({ planting: props.planting, areaId: props.areaId }));

  const isNew = !planting;
  const initial: Planting = planting
    ? structuredClone($state.snapshot(planting) as Planting)
    : {
        id: uid('pl'), plotId: app.plot!.id, areaId: areaId ?? '', varietyId: '', windows: {}, purpose: 'eat', status: 'planned',
        agreement: 'agreed', actual: {}, method: 'module', qtyUnit: 'plants',
      };
  let p: Planting = $state(initial);
  let cropId = $state(planting ? (app.lib.varieties.get(planting.varietyId)?.cropId ?? '') : '');
  let plan: Plan = $state('main');
  let season = $state(0);
  let datesTouched = $state(!isNew);
  let confirmDelete = $state(false);

  const crop = $derived(cropId ? app.lib.crops.get(cropId) : undefined);
  const varietyCrop = $derived(p.varietyId ? app.cropOf(p) : crop);
  const varieties = $derived(cropId ? varietiesOf(app.lib, cropId) : []);
  const plans = $derived(crop ? availablePlans(crop) : []);
  const area = $derived(app.data.areas.find((a) => a.id === p.areaId));
  const parentIds = $derived(new Set(app.areas.map((a) => a.parentId).filter(Boolean)));
  const place = $derived(app.site ? { climate: app.site.climate, lat: app.site.location.lat, protection: area?.protection } : undefined);

  const CATS: Category[] = ['allium', 'brassica', 'legume', 'leaf', 'root', 'fruiting', 'cucurbit', 'herb', 'fruit', 'flower'];
  const cropsByCat = $derived(
    CATS.map((c) => ({ c, crops: [...app.lib.crops.values()].filter((x) => x.category === c).sort((a, b) => cropName(a).localeCompare(cropName(b))) })).filter((g) => g.crops.length),
  );

  function chooseCrop(id: string) {
    cropId = id;
    const c = app.lib.crops.get(id);
    if (!c) return;
    const vs = varietiesOf(app.lib, id);
    p.varietyId = vs[0]?.id ?? '';
    const ps = availablePlans(c);
    plan = ps[0] ?? 'main';
    p.method = defaultMethod(c, plan);
    p.qtyUnit = c.category === 'allium' && c.id === 'garlic' ? 'cloves' : p.method === 'module' ? 'plugs' : 'plants';
    season = 0;
    if (!datesTouched) workOutDates();
  }

  function workOutDates() {
    const c = varietyCrop;
    if (!c || !place) return;
    const m = p.method ?? 'module';
    const s = season || nextSeason(c, plan, m, place, app.today);
    season = s;
    p.windows = resolveWindows(c, plan, m, place, s);
    datesTouched = false;
  }

  // Re-work dates when the inputs that drive them change, until the grower edits a date.
  $effect(() => {
    void p.varietyId; void p.method; void plan; void season; void area?.protection;
    if (!datesTouched && isNew) workOutDates();
  });

  const KEYS: WindowKey[] = ['sow', 'potOn', 'hardenOff', 'plantOut', 'harvest', 'clear'];
  function setDate(k: WindowKey, end: 'from' | 'to', v: string) {
    if (!v) return;
    const w: Window = { ...(p.windows[k] ?? { from: v, to: v }) };
    w[end] = v;
    if (w.to < w.from) end === 'from' ? (w.to = w.from) : (w.from = w.to);
    p.windows = { ...p.windows, [k]: w };
    datesTouched = true;
  }
  function removeWindow(k: WindowKey) {
    const { [k]: _, ...rest } = p.windows;
    p.windows = rest;
    datesTouched = true;
  }

  const cap = $derived(area && p.qty ? capacityFor(p, area, varietyCrop) : undefined);
  const spacingDefault = $derived(spacingFor({ spacingCm: undefined }, varietyCrop));

  // Warnings for this planting as it stands, checked against everything else on the plot.
  const warnings = $derived.by(() => {
    if (!app.plot || !app.site || !p.varietyId || !p.areaId) return [];
    const others = app.data.plantings.filter((x) => x.id !== p.id && x.plotId === app.plot!.id);
    const resolved = resolvePlantings([...others, $state.snapshot(p) as Planting], app.cropOf);
    return allPlotWarnings({
      plot: app.plot, areas: app.areas, resolved: [...resolved.values()], climate: app.site.climate, lat: app.site.location.lat,
      cropOf: app.cropOf, nameOf: app.nameOf, entries: app.data.entries, rotationYears: app.data.settings.rotationYears,
    }).filter((w) => w.plantingId === p.id || w.otherId === p.id);
  });

  const sameArea = $derived(app.data.plantings.filter((x) => x.id !== p.id && x.plotId === p.plotId && x.areaId === p.areaId));
  const sameAreaCells = $derived(new Set(sameArea.filter((x) => x.status !== 'cleared' && x.status !== 'failed').flatMap((x) => x.cells ?? [])));
  const spaces = $derived(app.data.propSpaces.filter((s) => s.siteId === app.site?.id));
  const needsHeat = $derived(p.bottomHeat ?? varietyCrop?.propagation?.bottomHeat ?? false);
  const lots = $derived(app.data.stock.filter((s) => s.varietyId === p.varietyId && s.status !== 'used'));
  const valid = $derived(!!p.varietyId && !!p.areaId);
  const notes = $derived(cropId ? reviewNotesFor(cropId, app.data.entries).slice(0, 3) : []);

  function saveSeed() {
    const id = uid('lot');
    app.update(t('pe.seedSaved', { name: app.nameOf(p) }), (d) => {
      d.stock.push({ id, varietyId: p.varietyId, kind: 'seed', source: 'saved', acquired: app.today, status: 'plenty', parentPlantingId: p.id, germTests: [] });
    });
    onclose();
    app.go('seeds', id);
  }

  function save() {
    const out = $state.snapshot(p) as Planting;
    if (!out.qty) delete out.qty;
    if (!out.spacingCm) delete out.spacingCm;
    if (!out.rows?.length) delete out.rows;
    if (!out.interplanted) delete out.interplanted;
    if (!out.cells?.length || area?.kind !== 'grid') delete out.cells;
    savePlanting(out, isNew);
    onclose();
  }

  const UNITS: QtyUnit[] = ['plants', 'plugs', 'clumps', 'cloves', 'sets', 'tubers', 'metres', 'seeds'];
  const METHODS: Method[] = ['module', 'direct', 'bought'];
  const nextStatus = $derived(
    ({ planned: p.method === 'module' ? 'sown' : 'growing', sown: 'growing', growing: 'harvesting', harvesting: 'cleared', cleared: null, failed: null } as const)[p.status],
  );
</script>

<Dialog open title={isNew ? t('pe.add') : app.nameOf(p)} onclose={onclose} wide>
  <div class="grid2">
    <label class="field"><span>{t('pe.crop')}</span>
      <select value={cropId} onchange={(e) => chooseCrop(e.currentTarget.value)}>
        <option value="" disabled>{t('pe.chooseCrop')}</option>
        {#each cropsByCat as g (g.c)}
          <optgroup label={t(`cat.${g.c}`)}>{#each g.crops as c (c.id)}<option value={c.id}>{cropName(c)}</option>{/each}</optgroup>
        {/each}
      </select></label>
    <label class="field"><span>{t('pe.variety')}</span>
      <select bind:value={p.varietyId} disabled={!cropId}>
        {#each varieties as v (v.id)}<option value={v.id}>{v.name}{v.seedType === 'F1' ? ' (F1)' : ''}</option>{/each}
      </select></label>
  </div>

  {#if notes.length}
    <div class="notes">
      {#each notes as n}<p class="small"><span class="mono-label">{t('pe.reviewNote', { season: n.season })}</span> {n.note}</p>{/each}
    </div>
  {/if}

  <div class="grid2">
    <label class="field"><span>{t('pe.area')}</span>
      <select bind:value={p.areaId}>
        <option value="" disabled>{t('pe.chooseArea')}</option>
        {#each app.areas as a (a.id)}
          <option value={a.id}>{a.parentId ? `  ${a.name}` : a.name}{parentIds.has(a.id) ? ` ${t('pe.wholeBed')}` : ''}</option>
        {/each}
      </select></label>
    {#if area?.kind === 'grid'}
      {@const g = gridCells(area)}
      <fieldset class="field cells">
        <legend class="mono-label">{t('pe.cells', { n: p.cells?.length ?? 0 })}</legend>
        <div class="cell-grid" style="grid-template-columns: repeat({g.cols}, 28px)">
          {#each Array.from({ length: g.cols * g.rows }, (_, i) => i + 1) as c}
            {@const taken = sameAreaCells.has(c)}
            <button type="button" class="cell" class:on={p.cells?.includes(c)} class:taken aria-pressed={p.cells?.includes(c) ?? false}
              aria-label={t('pe.cell', { n: c })} title={taken ? t('pe.cellTaken') : ''}
              onclick={() => {
                const set = new Set(p.cells ?? []);
                set.has(c) ? set.delete(c) : set.add(c);
                p.cells = [...set].sort((a, b) => a - b);
              }}>{c}</button>
          {/each}
        </div>
      </fieldset>
    {/if}
    {#if area?.kind === 'rows' && area.rows}
      <fieldset class="field rows">
        <legend class="mono-label">{t('pe.rows')}</legend>
        <div class="row">
          {#each Array.from({ length: area.rows }, (_, i) => i + 1) as r}
            <label class="check"><input type="checkbox" checked={p.rows?.includes(r)} onchange={(e) => {
              const set = new Set(p.rows ?? []);
              e.currentTarget.checked ? set.add(r) : set.delete(r);
              p.rows = [...set].sort((a, b) => a - b);
            }} />{r}</label>
          {/each}
        </div>
      </fieldset>
    {/if}
  </div>

  {#if crop}
    <div class="grid2">
      {#if plans.length > 1}
        <label class="field"><span>{t('pe.plan')}</span>
          <select bind:value={plan}>{#each plans as pl}<option value={pl}>{t(`plan.${pl}`)}</option>{/each}</select></label>
      {/if}
      <label class="field"><span>{t('pe.method')}</span>
        <select bind:value={p.method}>{#each METHODS as m}<option value={m}>{t(`method.${m}`)}</option>{/each}</select></label>
      {#if isNew}
        <label class="field"><span>{t('pe.season')}</span>
          <select value={season} onchange={(e) => (season = Number(e.currentTarget.value))}>
            {#each [season - 1, season, season + 1].filter((y) => y > 2000) as y}<option value={y}>{t('pe.seasonOf', { year: y })}</option>{/each}
          </select></label>
      {/if}
    </div>
  {/if}

  <fieldset class="dates">
    <legend><h3>{t('pe.dates')}</h3></legend>
    <p class="small muted">{datesTouched ? t('pe.datesEdited') : t('pe.datesAuto')}</p>
    <div class="date-grid">
      {#each KEYS as k (k)}
        {@const w = p.windows[k]}
        <span class="mono-label">{t(`window.${k}`)}</span>
        {#if w}
          <input type="date" aria-label="{t(`window.${k}`)}: {t('pe.from')}" value={w.from} onchange={(e) => setDate(k, 'from', e.currentTarget.value)} />
          <input type="date" aria-label="{t(`window.${k}`)}: {t('pe.to')}" value={w.to} onchange={(e) => setDate(k, 'to', e.currentTarget.value)} />
          <button class="btn quiet small" onclick={() => removeWindow(k)} aria-label={t('pe.removeDate', { what: t(`window.${k}`) })}>×</button>
        {:else}
          <span class="muted small span2">{t('pe.none')}</span>
          <button class="btn quiet small" onclick={() => setDate(k, 'from', p.windows.plantOut?.from ?? p.windows.sow?.from ?? app.today)}>{t('pe.addDate')}</button>
        {/if}
      {/each}
    </div>
    {#if crop && place}<button class="btn small" onclick={workOutDates}>{t('pe.workOut')}</button>{/if}
  </fieldset>

  <div class="grid2">
    <label class="field"><span>{t('pe.qty')}</span><input type="number" min="0" bind:value={p.qty} /></label>
    <label class="field"><span>{t('pe.unit')}</span>
      <select bind:value={p.qtyUnit}>{#each UNITS as u}<option value={u}>{t(`unitName.${u}`)}</option>{/each}</select></label>
    {#if p.qtyUnit === 'clumps'}
      <label class="field"><span>{t('pe.perClump')}</span><input type="number" min="1" bind:value={p.perClump} /></label>
    {/if}
    <label class="field"><span>{t('pe.spacing')}</span><input type="number" min="1" bind:value={p.spacingCm} placeholder={spacingDefault ? String(spacingDefault) : ''} /></label>
  </div>
  {#if cap}
    <p class={cap.ok ? 'small muted' : 'warning'}>
      {t(cap.ok ? 'pe.fits' : 'pe.fitsNot', { fits: cap.fits, needed: cap.needed, unit: tn(`unit.${cap.unit}`, cap.fits).replace(/^[\d.,\s]+/, ''), working: cap.working, area: area?.name ?? '' })}
    </p>
  {/if}

  {#if p.method === 'module'}
    <div class="grid2">
      <label class="field"><span>{t('pe.seedsPerCell')}</span><input type="number" min="1" bind:value={p.seedsPerCell} placeholder={String(varietyCrop?.propagation?.seedsPerModule ?? 1)} /></label>
      <label class="check"><input type="checkbox" checked={p.bottomHeat ?? varietyCrop?.propagation?.bottomHeat ?? false} onchange={(e) => (p.bottomHeat = e.currentTarget.checked)} />{t('pe.bottomHeat')}</label>
      {#if spaces.length}
        <label class="field"><span>{t('pe.space')}</span>
          <select value={p.propagationSpaceId ?? ''} onchange={(e) => (p.propagationSpaceId = e.currentTarget.value || undefined)}>
            <option value="">{t('pe.spaceDefault', { name: spaces[0].name })}</option>
            {#each spaces as s (s.id)}<option value={s.id}>{s.name}{needsHeat && !s.bottomHeat ? ` (${t('pe.noHeat')})` : ''}</option>{/each}
          </select></label>
      {/if}
    </div>
  {/if}

  <div class="grid2">
    <label class="field"><span>{t('pe.follows')}</span>
      <select value={p.followsPlantingId ?? ''} onchange={(e) => (p.followsPlantingId = e.currentTarget.value || undefined)}>
        <option value="">{t('pe.followsNone')}</option>
        {#each sameArea as q (q.id)}<option value={q.id}>{app.nameOf(q)}{q.windows.clear ? ` (${t('pe.clears', { date: dayMonth(q.windows.clear.from) })})` : ''}</option>{/each}
      </select>
      <span class="help">{t('pe.followsHelp')}</span></label>
    <label class="field"><span>{t('pe.stock')}</span>
      <select value={p.stockLotId ?? ''} onchange={(e) => (p.stockLotId = e.currentTarget.value || undefined)}>
        <option value="">{t('pe.stockNone')}</option>
        {#each lots as l (l.id)}<option value={l.id}>{t(`stockKind.${l.kind}`)}{l.supplier ? `, ${l.supplier}` : ''}{l.acquired ? `, ${l.acquired.slice(0, 7)}` : ''}</option>{/each}
      </select></label>
  </div>

  <div class="row">
    <label class="check"><input type="checkbox" bind:checked={p.interplanted} />{t('pe.interplanted')}</label>
  </div>

  <div class="grid2">
    <label class="field"><span>{t('pe.purpose')}</span>
      <select bind:value={p.purpose}>{#each ['eat', 'seed', 'both'] as x}<option value={x}>{t(`purpose.${x}`)}</option>{/each}</select></label>
    <label class="field"><span>{t('pe.agreement')}</span>
      <select bind:value={p.agreement}><option value="agreed">{t('agreement.agreed')}</option><option value="draft">{t('agreement.draft')}</option></select>
      <span class="help">{t('pe.agreementHelp')}</span></label>
    <label class="field"><span>{t('pe.status')}</span>
      <select bind:value={p.status}>{#each ['planned', 'sown', 'growing', 'harvesting', 'cleared', 'failed'] as s}<option value={s}>{t(`status.${s}`)}</option>{/each}</select></label>
  </div>

  {#if p.actual.sown || p.actual.plantedOut || p.actual.firstHarvest || p.actual.cleared}
    <p class="small muted">
      {#each Object.entries(p.actual) as [k, v]}{#if v}<span class="actual">{t(`actual.${k}`, { date: range(v, v) })}</span>{/if}{/each}
    </p>
  {/if}

  <label class="field"><span>{t('pe.notes')}</span><textarea bind:value={p.notes}></textarea></label>

  {#if warnings.length}
    <ul class="warnings">{#each warnings as w (w.id)}<li class="warning" class:info={w.level === 'info'}>{warningText(w)}</li>{/each}</ul>
  {/if}

  {#snippet footer()}
    {#if !isNew}
      <button class="btn quiet danger" onclick={() => (confirmDelete = true)}>{t('pe.delete')}</button>
      {#if planting && planting.purpose !== 'eat' && (planting.status === 'harvesting' || planting.status === 'cleared' || planting.status === 'growing')}
        <button class="btn" onclick={saveSeed}>{t('pe.saveSeed')}</button>
      {/if}
      {#if nextStatus && planting?.agreement === 'agreed'}
        <button class="btn" onclick={() => { setPlantingStatus(p.id, nextStatus); onclose(); }}>{t(`pe.mark.${nextStatus}`)}</button>
      {/if}
    {/if}
    <span class="grow"></span>
    {#if confirmDelete}
      <span class="small">{t('pe.deleteConfirm')}</span>
      <button class="btn primary" onclick={() => { deletePlanting(p.id); onclose(); }}>{t('pe.deleteYes')}</button>
      <button class="btn quiet" onclick={() => (confirmDelete = false)}>{t('settings.cancel')}</button>
    {:else}
      <button class="btn quiet" onclick={onclose}>{t('settings.cancel')}</button>
      <button class="btn primary" disabled={!valid} onclick={save}>{isNew ? t('pe.addSave') : t('pe.save')}</button>
    {/if}
  {/snippet}
</Dialog>

<style>
  .dates { border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px 14px; margin: 0; display: grid; gap: 8px; min-width: 0; }
  .dates legend { padding: 0 4px; }
  .dates > .btn { justify-self: start; }
  .date-grid { display: grid; grid-template-columns: 7.5em 1fr 1fr auto; gap: 6px 8px; align-items: center; }
  .span2 { grid-column: span 2; }
  .rows, .cells { border: 0; padding: 0; margin: 0; }
  .cell-grid { display: grid; gap: 3px; }
  .cell { width: 28px; height: 28px; padding: 0; border: 1px solid var(--line); border-radius: 4px; background: var(--surface); font: 400 10px var(--font-mono); color: var(--muted); cursor: pointer; }
  .cell.taken { background: repeating-linear-gradient(135deg, var(--surface) 0 3px, var(--line) 3px 5px); }
  .cell.on { background: var(--accent); color: var(--surface); border-color: var(--accent); }
  .warnings { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .grow { flex: 1; }
  .notes { border-left: 3px solid var(--t-sow); padding: 2px 0 2px 12px; display: grid; gap: 4px; }
  .notes p { margin: 0; }
  .actual + .actual::before { content: ', '; }
  @media (max-width: 520px) {
    .date-grid { grid-template-columns: 1fr 1fr auto; }
    .date-grid .mono-label { grid-column: 1 / -1; margin-top: 4px; }
  }
</style>
