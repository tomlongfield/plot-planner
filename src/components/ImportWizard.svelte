<script lang="ts">
  // Import seeds from any spreadsheet: pick a file, say which column is which,
  // review suggestions, then accept. Nothing is saved before "Add".
  import { pickFile } from '../lib/files';
  import { t, tn } from '../lib/i18n';
  import { uid } from '../lib/ids';
  import { cropName, varietiesOf } from '../lib/library';
  import { buildRows, FIELDS, guessMapping, looksLikeHeader, type Field, type ImportRow, type Issue } from '../lib/seedImport';
  import { readSheets, type Sheet } from '../lib/sheets';
  import { app } from '../lib/store.svelte';
  import type { Variety } from '../lib/types';
  import Dialog from './Dialog.svelte';

  let { onclose }: { onclose: () => void } = $props();

  let step: 1 | 2 | 3 = $state(1);
  let fileName = $state('');
  let sheets: Sheet[] = $state([]);
  let sheetIndex = $state(0);
  let hasHeader = $state(true);
  let order: 'dmy' | 'mdy' = $state(app.site?.locale === 'en-US' ? 'mdy' : 'dmy');
  let mapping: Field[] = $state([]);
  let rows: ImportRow[] = $state([]);
  let error = $state('');

  const sheet = $derived(sheets[sheetIndex]);
  const header = $derived(sheet ? (hasHeader ? sheet.rows[0] : sheet.rows[0].map((_, i) => t('imp.column', { n: i + 1 }))) : []);
  const body = $derived(sheet ? (hasHeader ? sheet.rows.slice(1) : sheet.rows) : []);

  async function choose() {
    error = '';
    const f = await pickFile('.csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (!f) return;
    try {
      sheets = (await readSheets(f)).filter((s) => s.rows.length);
      if (!sheets.length) throw new Error('empty');
      fileName = f.name;
      sheetIndex = 0;
      setup();
      step = 2;
    } catch (e) {
      error = t(`imp.error.${(e as Error).message === 'empty' ? 'empty' : 'read'}`);
    }
  }

  function setup() {
    if (!sheet) return;
    hasHeader = looksLikeHeader(sheet.rows[0]);
    mapping = guessMapping(header, body.slice(0, 20));
  }

  function review() {
    rows = buildRows(body, mapping, app.lib, app.data.stock, order);
    step = 3;
  }

  function setCrop(r: ImportRow, cropId: string) {
    r.cropId = cropId || undefined;
    r.issues = r.issues.filter((i) => i.kind !== 'unmatched' && i.kind !== 'typo' && i.kind !== 'newVariety');
    const vs = cropId ? varietiesOf(app.lib, cropId) : [];
    const want = r.raw.variety?.toLowerCase();
    const match = vs.find((v) => v.name.toLowerCase() === want);
    r.varietyId = match?.id ?? (r.raw.variety ? undefined : vs[0]?.id);
    r.newVarietyName = match || !r.raw.variety ? undefined : r.raw.variety;
    r.include = !!cropId;
  }

  const included = $derived(rows.filter((r) => r.include && r.cropId));
  const newVarieties = $derived(new Set(included.filter((r) => !r.varietyId && r.newVarietyName).map((r) => `${r.cropId}|${r.newVarietyName}`)));

  function accept() {
    const made = new Map<string, string>();
    const varieties: Variety[] = [];
    for (const key of newVarieties) {
      const [cropId, name] = key.split('|');
      const id = `${cropId}--user-${uid()}`;
      made.set(key, id);
      varieties.push({ id, cropId, name, seedType: 'unknown' });
    }
    const lots = included.map((r) => ({
      ...$state.snapshot(r.lot),
      id: uid('lot'),
      varietyId: r.varietyId ?? made.get(`${r.cropId}|${r.newVarietyName}`) ?? varietiesOf(app.lib, r.cropId!)[0]?.id ?? '',
    }));
    app.update(tn('imp.added', lots.length), (d) => {
      d.varieties.push(...varieties);
      d.stock.push(...lots);
    });
    onclose();
  }

  function issueText(i: Issue): string {
    return t(`imp.issue.${i.kind}`, { ...i.params, source: i.params.source ? t(`source.${i.params.source}`) : '' });
  }
  const crops = $derived([...app.lib.crops.values()].sort((a, b) => cropName(a).localeCompare(cropName(b))));
</script>

<Dialog open title={t('imp.title')} {onclose} wide>
  <ol class="steps" aria-label={t('imp.steps')}>
    <li class:on={step === 1}>{t('imp.step1')}</li>
    <li class:on={step === 2}>{t('imp.step2')}</li>
    <li class:on={step === 3}>{t('imp.step3')}</li>
  </ol>

  {#if step === 1}
    <p>{t('imp.intro')}</p>
    <button class="btn primary" onclick={choose}>{t('imp.choose')}</button>
    {#if error}<p class="warning" role="alert">{error}</p>{/if}
    <p class="small muted">{t('imp.privacy')}</p>
  {:else if step === 2}
    <p class="small muted">{fileName}</p>
    <div class="row">
      {#if sheets.length > 1}
        <label class="field"><span>{t('imp.sheet')}</span>
          <select bind:value={sheetIndex} onchange={setup}>{#each sheets as s, i}<option value={i}>{s.name}</option>{/each}</select></label>
      {/if}
      <label class="check"><input type="checkbox" bind:checked={hasHeader} onchange={() => (mapping = guessMapping(header, body.slice(0, 20)))} />{t('imp.hasHeader')}</label>
      <label class="field"><span>{t('imp.dateOrder')}</span>
        <select bind:value={order}><option value="dmy">{t('imp.dmy')}</option><option value="mdy">{t('imp.mdy')}</option></select></label>
    </div>
    <p>{t('imp.mapHelp')}</p>
    <div class="map">
      {#each header as h, i}
        <div class="map-row">
          <div><strong>{h || t('imp.column', { n: i + 1 })}</strong>
            <span class="muted small sample">{body.slice(0, 3).map((r) => r[i]).filter(Boolean).join(', ')}</span></div>
          <select bind:value={mapping[i]} aria-label={t('imp.fieldFor', { column: h })}>
            {#each FIELDS as f}<option value={f}>{t(`imp.field.${f}`)}</option>{/each}
          </select>
        </div>
      {/each}
    </div>
    {#if !mapping.includes('crop') && !mapping.includes('variety')}<p class="warning">{t('imp.needCrop')}</p>{/if}
  {:else}
    <p>{t('imp.reviewHelp')}</p>
    <p class="small"><strong>{tn('imp.willAdd', included.length)}</strong>{#if newVarieties.size}, {tn('imp.newVarieties', newVarieties.size)}{/if}.
      {rows.length - included.length ? tn('imp.skipped', rows.length - included.length) : ''}</p>
    <div class="review">
      {#each rows as r (r.index)}
        <div class="rv" class:off={!r.include}>
          <label class="check"><input type="checkbox" bind:checked={r.include} disabled={!r.cropId} aria-label={t('imp.include', { row: r.index + 1 })} /></label>
          <div class="rv-main">
            <div class="row">
              <span class="mono muted">{r.index + (hasHeader ? 2 : 1)}</span>
              <select value={r.cropId ?? ''} onchange={(e) => setCrop(r, e.currentTarget.value)} aria-label={t('imp.cropFor', { row: r.index + 1 })} class="crop-select">
                <option value="">{t('imp.noCrop')}</option>
                {#each crops as c (c.id)}<option value={c.id}>{cropName(c)}</option>{/each}
              </select>
              <span>{r.varietyId ? app.varietyName(r.varietyId) : r.newVarietyName ? t('imp.newVariety', { name: r.newVarietyName }) : ''}</span>
            </div>
            <div class="small muted row facts">
              <span>{t(`stockKind.${r.lot.kind}`)}</span>
              <span>{t(`source.${r.lot.source}`)}{r.lot.supplier ? `: ${r.lot.supplier}` : ''}</span>
              {#if r.lot.acquired}<span class="mono">{r.lot.acquired}</span>{/if}
              {#if r.lot.useBy}<span class="mono">{t('seeds.useBy')} {r.lot.useBy}</span>{/if}
              {#if r.lot.quantity != null}<span class="mono">{r.lot.quantity} {r.lot.unit}</span>{:else}<span>{t(`stockStatus.${r.lot.status}`)}</span>{/if}
            </div>
            {#each r.issues as i}<p class="suggest small">{issueText(i)}</p>{/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#snippet footer()}
    {#if step > 1}<button class="btn quiet" onclick={() => (step = (step - 1) as 1 | 2)}>{t('imp.back')}</button>{/if}
    <span style="flex:1"></span>
    <button class="btn quiet" onclick={onclose}>{t('settings.cancel')}</button>
    {#if step === 2}<button class="btn primary" disabled={!mapping.includes('crop') && !mapping.includes('variety')} onclick={review}>{t('imp.next')}</button>{/if}
    {#if step === 3}<button class="btn primary" disabled={!included.length} onclick={accept}>{tn('imp.accept', included.length)}</button>{/if}
  {/snippet}
</Dialog>

<style>
  .steps { display: flex; gap: 16px; list-style: none; padding: 0; margin: 0; counter-reset: s; flex-wrap: wrap; }
  .steps li { counter-increment: s; font: 500 12px var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  .steps li::before { content: counter(s) '. '; }
  .steps li.on { color: var(--ink); }
  .map { display: grid; gap: 0; }
  .map-row { display: grid; grid-template-columns: 1fr 12em; gap: 12px; align-items: center; padding: 8px 0; border-top: 1px solid var(--line); }
  .sample { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .review { display: grid; }
  .rv { display: grid; grid-template-columns: auto 1fr; gap: 10px; padding: 10px 0; border-top: 1px solid var(--line); }
  .rv.off .rv-main > :not(.suggest) { opacity: 0.6; }
  .crop-select { width: auto; min-height: 32px; padding: 3px 8px; }
  .facts { gap: 4px 12px; margin-top: 2px; }
  .suggest { margin: 6px 0 0; padding: 6px 10px; border-left: 3px solid var(--t-order); background: var(--surface); }
  @media (max-width: 560px) { .map-row { grid-template-columns: 1fr; } }
</style>
