<script lang="ts">
  // Edit a crop's growing knowledge. Edits to library crops are kept as the
  // grower's overrides, so a library update never wipes them.
  import { t } from '../lib/i18n';
  import { app } from '../lib/store.svelte';
  import type { Anchor, Category, Crop, TimingKind, TimingRule } from '../lib/types';
  import { untrack } from 'svelte';
  import Dialog from './Dialog.svelte';

  let props: { crop?: Crop; onclose: () => void } = $props();
  const onclose = () => props.onclose();
  const crop = untrack(() => props.crop);
  const isNew = !crop;
  const blank: Crop = {
    id: '', names: { en: [''] }, family: '', species: '', category: 'leaf', lifecycle: 'annual', hardiness: 'hardy', rotationGroup: 'misc',
    timing: [{ kind: 'sowOutdoor', anchor: 'lastFrost', fromOffsetDays: 0, toOffsetDays: 28 }], daysToHarvest: 60, harvestWindowDays: 30, varieties: [],
  };
  let c: Crop = $state(structuredClone(crop ? ($state.snapshot(crop) as Crop) : blank));
  let altNames = $state((c.names.en ?? []).slice(1).join(', '));

  const KINDS: TimingKind[] = ['sowIndoor', 'sowOutdoor', 'plantOut', 'overwinter', 'harvest'];
  const ANCHORS: Anchor[] = ['lastFrost', 'firstFrost', 'soilTemp', 'dayLength'];
  const CATS: Category[] = ['allium', 'brassica', 'legume', 'leaf', 'root', 'fruiting', 'cucurbit', 'herb', 'fruit', 'flower'];
  const GROUPS = ['alliums', 'brassicas', 'legumes', 'roots', 'potatoes', 'cucurbits', 'salads', 'misc', 'perennial'];

  function slugify(s: string) {
    return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  const valid = $derived(!!c.names.en[0]?.trim() && c.timing.length > 0);

  function save() {
    const out = $state.snapshot(c) as Crop;
    out.names = { ...out.names, en: [out.names.en[0].trim(), ...altNames.split(',').map((s) => s.trim()).filter(Boolean)] };
    if (isNew) {
      let id = slugify(out.names.en[0]) || 'crop';
      while (app.lib.crops.has(id)) id += '-2';
      out.id = id;
      out.varieties = [{ id: `${id}--${id}`, cropId: id, name: out.names.en[0], seedType: 'unknown' }];
    } else {
      // Library varieties stay with the bundled file.
      delete out.varieties;
    }
    if (out.timing.some((r) => r.kind === 'sowIndoor') && !out.moduleDays) out.moduleDays = 28;
    app.update(isNew ? t('crop.added', { name: out.names.en[0] }) : t('crop.saved', { name: out.names.en[0] }), (d) => {
      const i = d.cropOverrides.findIndex((x) => x.id === out.id);
      if (i >= 0) d.cropOverrides[i] = out;
      else d.cropOverrides.push(out);
    });
    onclose();
  }

  function num(v: string): number | undefined {
    const n = Number(v);
    return v === '' || !Number.isFinite(n) ? undefined : n;
  }
</script>

<Dialog open title={isNew ? t('crop.new') : t('crop.edit', { name: c.names.en[0] })} {onclose} wide>
  <div class="grid2">
    <label class="field"><span>{t('crop.name')}</span><input bind:value={c.names.en[0]} /></label>
    <label class="field"><span>{t('crop.altNames')}</span><input bind:value={altNames} placeholder={t('crop.altNamesHint')} /></label>
  </div>
  <div class="grid2">
    <label class="field"><span>{t('crop.family')}</span><input bind:value={c.family} /></label>
    <label class="field"><span>{t('crop.species')}</span><input bind:value={c.species} /></label>
    <label class="field"><span>{t('crop.category')}</span><select bind:value={c.category}>{#each CATS as x}<option value={x}>{t(`cat.${x}`)}</option>{/each}</select></label>
    <label class="field"><span>{t('crop.rotation')}</span><select bind:value={c.rotationGroup}>{#each GROUPS as g}<option value={g}>{t(`rotation.${g}`)}</option>{/each}</select></label>
    <label class="field"><span>{t('crop.lifecycle')}</span><select bind:value={c.lifecycle}>{#each ['annual', 'biennial', 'perennial'] as x}<option value={x}>{t(`lifecycle.${x}`)}</option>{/each}</select></label>
    <label class="field"><span>{t('crop.hardiness')}</span><select bind:value={c.hardiness}>{#each ['hardy', 'half-hardy', 'tender'] as x}<option value={x}>{t(`hardiness.${x}`)}</option>{/each}</select></label>
  </div>

  <fieldset class="box">
    <legend><h3>{t('crop.timing')}</h3></legend>
    <p class="small muted">{t('crop.timingHelp')}</p>
    {#each c.timing as r, i}
      <div class="rule">
        <select bind:value={r.kind} aria-label={t('crop.ruleKind')}>{#each KINDS as k}<option value={k}>{t(`rule.${k}`)}</option>{/each}</select>
        <input type="number" value={r.fromOffsetDays ?? 0} onchange={(e) => (r.fromOffsetDays = num(e.currentTarget.value))} aria-label={t('crop.fromDays')} />
        <span class="small">{t('crop.to')}</span>
        <input type="number" value={r.toOffsetDays ?? r.fromOffsetDays ?? 0} onchange={(e) => (r.toOffsetDays = num(e.currentTarget.value))} aria-label={t('crop.toDays')} />
        <span class="small">{t('crop.daysFrom')}</span>
        <select bind:value={r.anchor} aria-label={t('crop.anchor')}>{#each ANCHORS as a}<option value={a}>{t(`anchor.${a}`)}</option>{/each}</select>
        {#if r.anchor === 'soilTemp' || r.anchor === 'dayLength'}
          <input type="number" value={r.threshold ?? ''} onchange={(e) => (r.threshold = num(e.currentTarget.value))} aria-label={t('crop.threshold')} placeholder={r.anchor === 'soilTemp' ? '°C' : 'h'} />
        {/if}
        <button class="btn quiet small" onclick={() => c.timing.splice(i, 1)} aria-label={t('crop.removeRule')}>×</button>
      </div>
    {/each}
    <button class="btn small" onclick={() => c.timing.push({ kind: 'sowOutdoor', anchor: 'lastFrost', fromOffsetDays: 0, toOffsetDays: 14 } as TimingRule)}>{t('crop.addRule')}</button>
  </fieldset>

  <div class="grid2">
    <label class="field"><span>{t('crop.moduleDays')}</span><input type="number" min="0" bind:value={c.moduleDays} /></label>
    <label class="field"><span>{t('crop.maxModuleDays')}</span><input type="number" min="0" bind:value={c.maxModuleDays} /></label>
    <label class="field"><span>{t('crop.daysToHarvest')}</span><input type="number" min="1" bind:value={c.daysToHarvest} /></label>
    <label class="field"><span>{t('crop.harvestWindow')}</span><input type="number" min="1" bind:value={c.harvestWindowDays} /></label>
    <label class="field"><span>{t('crop.frostFree')}</span><input type="number" min="0" bind:value={c.frostFreeDaysNeeded} /></label>
    <label class="field"><span>{t('crop.seedLife')}</span><input type="number" min="0" bind:value={c.seedLifeYears} /></label>
  </div>
  <div class="grid2">
    <label class="field"><span>{t('crop.gridCm')}</span><input type="number" min="1" value={c.spacing?.gridCm ?? ''} onchange={(e) => (c.spacing = { ...c.spacing, gridCm: num(e.currentTarget.value) })} /></label>
    <label class="field"><span>{t('crop.inRowCm')}</span><input type="number" min="1" value={c.spacing?.inRowCm ?? ''} onchange={(e) => (c.spacing = { ...c.spacing, inRowCm: num(e.currentTarget.value) })} /></label>
    <label class="field"><span>{t('crop.betweenRowsCm')}</span><input type="number" min="1" value={c.spacing?.betweenRowsCm ?? ''} onchange={(e) => (c.spacing = { ...c.spacing, betweenRowsCm: num(e.currentTarget.value) })} /></label>
    <label class="field"><span>{t('crop.seedsPerModule')}</span><input type="number" min="1" value={c.propagation?.seedsPerModule ?? ''} onchange={(e) => (c.propagation = { ...c.propagation, seedsPerModule: num(e.currentTarget.value) })} /></label>
  </div>
  <div class="grid2">
    <label class="field"><span>{t('crop.pollination')}</span>
      <select value={c.seedSaving?.pollination ?? ''} onchange={(e) => (c.seedSaving = { ...c.seedSaving, pollination: (e.currentTarget.value || undefined) as 'self' })}>
        <option value="">—</option>{#each ['self', 'insect', 'wind'] as x}<option value={x}>{t(`pollination.${x}`)}</option>{/each}
      </select></label>
    <label class="field"><span>{t('crop.crosses')}</span>
      <select value={c.seedSaving?.crosses ?? ''} onchange={(e) => (c.seedSaving = { ...c.seedSaving, crosses: (e.currentTarget.value || undefined) as 'rarely' })}>
        <option value="">—</option>{#each ['rarely', 'sometimes', 'readily'] as x}<option value={x}>{t(`crosses.${x}`)}</option>{/each}
      </select></label>
    <label class="field"><span>{t('crop.isolation')}</span><input type="number" min="0" value={c.seedSaving?.isolationM ?? ''} onchange={(e) => (c.seedSaving = { ...c.seedSaving, isolationM: num(e.currentTarget.value) })} /></label>
    <label class="field"><span>{t('crop.minPlants')}</span><input type="number" min="1" value={c.seedSaving?.minPlants ?? ''} onchange={(e) => (c.seedSaving = { ...c.seedSaving, minPlants: num(e.currentTarget.value) })} /></label>
  </div>
  <label class="field"><span>{t('crop.pests')}</span><input value={(c.pests ?? []).join(', ')} onchange={(e) => (c.pests = e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean))} /></label>
  <label class="field"><span>{t('pe.notes')}</span><textarea bind:value={c.notes}></textarea></label>
  <label class="field"><span>{t('crop.source')}</span><input value={c.sources?.[0]?.note ?? ''} placeholder={t('crop.sourceHint')} onchange={(e) => (c.sources = e.currentTarget.value ? [{ note: e.currentTarget.value }] : [])} /></label>

  {#snippet footer()}
    <button class="btn quiet" onclick={onclose}>{t('settings.cancel')}</button>
    <button class="btn primary" disabled={!valid} onclick={save}>{isNew ? t('crop.add') : t('pe.save')}</button>
  {/snippet}
</Dialog>

<style>
  .box { border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px 14px; margin: 0; display: grid; gap: 8px; min-width: 0; }
  .rule { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .rule select { width: auto; }
  .rule input { width: 5.5em; }
</style>
