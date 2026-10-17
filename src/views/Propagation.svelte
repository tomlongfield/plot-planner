<script lang="ts">
  import Dialog from '../components/Dialog.svelte';
  import LoadChart from '../components/LoadChart.svelte';
  import { addDays } from '../lib/dates';
  import { dayMonth, t } from '../lib/i18n';
  import { uid } from '../lib/ids';
  import { propagationLoad } from '../lib/propagation';
  import { app } from '../lib/store.svelte';
  import type { PropSpace, Reservation } from '../lib/types';

  let weeks = $state(16);
  let editing = $state<PropSpace | null>(null);
  let reserving = $state<Reservation | null>(null);

  const spaces = $derived(app.data.propSpaces.filter((s) => s.siteId === app.site?.id));
  const loads = $derived(
    propagationLoad([...app.resolved.values()], spaces, app.data.reservations, {
      from: addDays(app.today, -7), weeks, weekStart: app.site?.weekStart ?? 1, cropOf: app.cropOf, nameOf: app.nameOf,
    }),
  );
  const assigned = (spaceId: string) =>
    app.data.plantings.filter((p) => {
      if (p.method !== 'module' || p.status === 'cleared' || p.status === 'failed') return false;
      if (!(p.propagationSpaceId === spaceId || (!p.propagationSpaceId && spaces[0]?.id === spaceId))) return false;
      // Only what's in the space now or still to come.
      const out = app.resolved.get(p.id)?.windows.plantOut?.from;
      return !out || out >= app.today;
    });

  function newSpace() {
    editing = { id: uid('prop'), siteId: app.site!.id, name: '', capacity: 4, unit: 'trays', modulesPerTray: 40, lights: false, bottomHeat: false };
  }
  function saveSpace() {
    const s = $state.snapshot(editing) as PropSpace;
    app.update(t('prop.saved', { name: s.name }), (d) => {
      const i = d.propSpaces.findIndex((x) => x.id === s.id);
      if (i >= 0) d.propSpaces[i] = s;
      else d.propSpaces.push(s);
    });
    editing = null;
  }
  function deleteSpace(id: string) {
    app.update(t('prop.deleted'), (d) => {
      d.propSpaces = d.propSpaces.filter((s) => s.id !== id);
      d.reservations = d.reservations.filter((r) => r.propSpaceId !== id);
      for (const p of d.plantings) if (p.propagationSpaceId === id) p.propagationSpaceId = undefined;
    });
    editing = null;
  }
  function saveReservation() {
    const r = $state.snapshot(reserving) as Reservation;
    app.update(t('prop.reserved', { label: r.label }), (d) => {
      const i = d.reservations.findIndex((x) => x.id === r.id);
      if (i >= 0) d.reservations[i] = r;
      else d.reservations.push(r);
    });
    reserving = null;
  }
  function deleteReservation(id: string) {
    app.update(t('prop.reservationDeleted'), (d) => { d.reservations = d.reservations.filter((r) => r.id !== id); });
    reserving = null;
  }
</script>

<div class="prop">
  <div class="spread">
    <h1>{t('nav.propagation')}</h1>
    <span class="row">
      <select bind:value={weeks} aria-label={t('prop.weeksShown')} style="width:auto">
        <option value={8}>{t('prop.weeks', { n: 8 })}</option><option value={16}>{t('prop.weeks', { n: 16 })}</option><option value={26}>{t('prop.weeks', { n: 26 })}</option><option value={52}>{t('prop.weeks', { n: 52 })}</option>
      </select>
      <button class="btn primary" onclick={newSpace}>{t('prop.add')}</button>
    </span>
  </div>
  <p class="muted intro">{t('prop.intro')}</p>

  {#if !spaces.length}
    <div class="empty card"><p>{t('prop.empty')}</p><button class="btn primary" onclick={newSpace}>{t('prop.add')}</button></div>
  {/if}

  {#each loads as l (l.space.id)}
    <section class="card stack">
      <div class="spread">
        <div>
          <h2>{l.space.name}</h2>
          <p class="small muted">
            {t('prop.holds', { n: l.space.capacity, unit: t(`prop.unit.${l.space.unit}`) })}{#if l.space.unit === 'trays'}, {t('prop.perTray', { n: l.space.modulesPerTray ?? 40 })}{/if}{#if l.space.lights}, {t('prop.lights')}{/if}{#if l.space.bottomHeat}, {t('prop.heat')}{/if}{#if l.space.tempC != null}, {l.space.tempC} °C{/if}
          </p>
        </div>
        <span class="row">
          <button class="btn small" onclick={() => (reserving = { id: uid('res'), propSpaceId: l.space.id, label: '', window: { from: app.today, to: addDays(app.today, 14) }, amount: 1 })}>{t('prop.reserve')}</button>
          <button class="btn small quiet" onclick={() => (editing = structuredClone($state.snapshot(l.space)))}>{t('crop.editButton')}</button>
        </span>
      </div>
      {#if l.over.length}
        <p class="warning">{t('prop.overWarn', { n: l.over.length, week: dayMonth(l.over[0].week), peak: Math.max(...l.over.map((w) => w.used)), capacity: l.space.capacity })}</p>
      {/if}
      <LoadChart load={l} />
      <details>
        <summary class="small">{t('prop.whatsHere', { n: assigned(l.space.id).length })}</summary>
        <ul class="plain">
          {#each assigned(l.space.id) as p (p.id)}
            {@const r = app.resolved.get(p.id)}
            <li><button class="linkish" onclick={() => app.go('plantings', p.id)}>{app.nameOf(p)}</button>
              <span class="muted small mono">{r?.windows.sow ? dayMonth(r.windows.sow.from) : ''} → {r?.windows.plantOut ? dayMonth(r.windows.plantOut.from) : ''}</span>
              {#if r?.waitingDays}<span class="chip warn">{t('area.waiting', { days: r.waitingDays })}</span>{/if}</li>
          {/each}
          {#each app.data.reservations.filter((x) => x.propSpaceId === l.space.id) as r (r.id)}
            <li><button class="linkish" onclick={() => (reserving = structuredClone($state.snapshot(r)))}>{r.label}</button>
              <span class="muted small mono">{dayMonth(r.window.from)} → {dayMonth(r.window.to)}, {r.amount}</span> <span class="chip">{t('prop.reservation')}</span></li>
          {/each}
        </ul>
      </details>
    </section>
  {/each}
</div>

{#if editing}
  <Dialog open title={editing.name || t('prop.add')} onclose={() => (editing = null)}>
    <label class="field"><span>{t('layout.name')}</span><input bind:value={editing.name} placeholder={t('prop.nameHint')} /></label>
    <div class="grid2">
      <label class="field"><span>{t('prop.capacityLabel')}</span><input type="number" min="1" bind:value={editing.capacity} /></label>
      <label class="field"><span>{t('prop.unitLabel')}</span>
        <select bind:value={editing.unit}><option value="trays">{t('prop.unit.trays')}</option><option value="modules">{t('prop.unit.modules')}</option></select></label>
      {#if editing.unit === 'trays'}<label class="field"><span>{t('prop.perTrayLabel')}</span><input type="number" min="1" bind:value={editing.modulesPerTray} /></label>{/if}
      <label class="field"><span>{t('prop.temp')}</span><input type="number" bind:value={editing.tempC} /></label>
    </div>
    <div class="row">
      <label class="check"><input type="checkbox" bind:checked={editing.lights} />{t('prop.hasLights')}</label>
      <label class="check"><input type="checkbox" bind:checked={editing.bottomHeat} />{t('prop.hasHeat')}</label>
    </div>
    {#snippet footer()}
      {#if app.data.propSpaces.some((s) => s.id === editing?.id)}<button class="btn quiet danger" onclick={() => editing && deleteSpace(editing.id)}>{t('layout.delete')}</button>{/if}
      <span style="flex:1"></span>
      <button class="btn quiet" onclick={() => (editing = null)}>{t('settings.cancel')}</button>
      <button class="btn primary" disabled={!editing?.name.trim() || !(editing.capacity > 0)} onclick={saveSpace}>{t('pe.save')}</button>
    {/snippet}
  </Dialog>
{/if}

{#if reserving}
  <Dialog open title={t('prop.reserve')} onclose={() => (reserving = null)}>
    <p class="small muted">{t('prop.reserveHelp')}</p>
    <label class="field"><span>{t('prop.reserveFor')}</span><input bind:value={reserving.label} placeholder={t('prop.reserveHint')} /></label>
    <div class="grid2">
      <label class="field"><span>{t('te.from')}</span><input type="date" bind:value={reserving.window.from} /></label>
      <label class="field"><span>{t('te.to')}</span><input type="date" bind:value={reserving.window.to} min={reserving.window.from} /></label>
      <label class="field"><span>{t('prop.amount')}</span><input type="number" min="1" bind:value={reserving.amount} /></label>
    </div>
    {#snippet footer()}
      {#if app.data.reservations.some((r) => r.id === reserving?.id)}<button class="btn quiet danger" onclick={() => reserving && deleteReservation(reserving.id)}>{t('layout.delete')}</button>{/if}
      <span style="flex:1"></span>
      <button class="btn quiet" onclick={() => (reserving = null)}>{t('settings.cancel')}</button>
      <button class="btn primary" disabled={!reserving?.label.trim()} onclick={saveReservation}>{t('pe.save')}</button>
    {/snippet}
  </Dialog>
{/if}

<style>
  .prop { display: grid; gap: 16px; max-width: 900px; }
  .intro { max-width: 65ch; }
  .plain { list-style: none; padding: 0; margin: 8px 0 0; }
  .plain li { padding: 5px 0; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
  details summary { cursor: pointer; color: var(--accent); }
  .linkish { background: none; border: 0; padding: 0; cursor: pointer; font-weight: 500; color: var(--ink); }
  .linkish:hover { text-decoration: underline; }
</style>
