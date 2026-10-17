<script lang="ts">
  // Weekly occupancy of one propagation space: stacked bars per week (one
  // segment per planting or reservation), with the space's capacity as a
  // dashed line. Hover a segment for details; the table below gives the same
  // figures to keyboard and screen-reader users.
  import { dayMonth, t } from '../lib/i18n';
  import type { LoadItem, SpaceLoad } from '../lib/propagation';

  let { load }: { load: SpaceLoad } = $props();

  const W = 640;
  const H = 180;
  const PAD = { l: 34, r: 8, t: 12, b: 26 };
  const max = $derived(Math.max(load.space.capacity, ...load.weeks.map((w) => w.used), 1) * 1.1);
  const bw = $derived((W - PAD.l - PAD.r) / load.weeks.length);
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);
  const ticks = $derived(niceTicks(max));
  let tip: { x: number; y: number; week: string; item: LoadItem } | null = $state(null);

  function niceTicks(m: number): number[] {
    const step = m <= 6 ? 1 : m <= 15 ? 2 : m <= 40 ? 5 : m <= 100 ? 20 : 50;
    const out: number[] = [];
    for (let v = 0; v <= m; v += step) out.push(v);
    return out;
  }
  const fill = (i: LoadItem) => (i.category ? `var(--c-${i.category})` : 'var(--c-static)');
</script>

<div class="chart">
  <svg viewBox="0 0 {W} {H}" role="img" aria-label={t('prop.chartAria', { name: load.space.name, capacity: load.space.capacity, unit: t(`prop.unit.${load.space.unit}`) })}>
    {#each ticks as v}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} class="grid" />
      <text x={PAD.l - 6} y={y(v) + 3} text-anchor="end" class="axis">{v}</text>
    {/each}
    {#each load.weeks as w, i (w.week)}
      {@const x = PAD.l + i * bw + 2}
      {@const over = w.used > load.space.capacity}
      {#if i % Math.max(1, Math.round(load.weeks.length / 8)) === 0}
        <text x={x + (bw - 4) / 2} y={H - 8} text-anchor="middle" class="axis">{dayMonth(w.week)}</text>
      {/if}
      {#each w.items as item, j (item.kind + item.id)}
        {@const below = w.items.slice(0, j).reduce((s, x) => s + x.amount, 0)}
        {@const top = y(below + item.amount)}
        {@const h = Math.max(0, y(below) - top - (j < w.items.length - 1 ? 0 : 0))}
        <rect
          x={x} y={top + 1} width={Math.max(1, bw - 4)} height={Math.max(0, h - 2)} rx="2"
          fill={fill(item)} class="seg" class:res={item.kind === 'reservation'}
          role="graphics-symbol"
          aria-label={t('prop.segAria', { week: dayMonth(w.week), label: item.label, n: item.amount, unit: t(`prop.unit.${load.space.unit}`) })}
          onpointerenter={() => (tip = { x: x + bw / 2, y: top, week: w.week, item })}
          onpointerleave={() => (tip = null)}
        />
      {/each}
      {#if over}<text x={x + (bw - 4) / 2} y={y(w.used) - 4} text-anchor="middle" class="over">!</text>{/if}
    {/each}
    <line x1={PAD.l} x2={W - PAD.r} y1={y(load.space.capacity)} y2={y(load.space.capacity)} class="cap" />
    <text x={W - PAD.r} y={y(load.space.capacity) - 4} text-anchor="end" class="cap-label">{t('prop.capacity', { n: load.space.capacity })}</text>
  </svg>
  {#if tip}
    <div class="tip" style="left: {(tip.x / W) * 100}%; top: {(tip.y / H) * 100}%">
      <span class="mono">{t('prop.weekOf', { date: dayMonth(tip.week) })}</span>
      <strong>{tip.item.label}</strong>
      <span>{tip.item.amount} {t(`prop.unit.${load.space.unit}`)}</span>
    </div>
  {/if}
</div>

<details class="table">
  <summary class="small">{t('prop.table')}</summary>
  <table>
    <thead><tr><th>{t('prop.week')}</th><th>{t('prop.used')}</th><th>{t('prop.what')}</th></tr></thead>
    <tbody>
      {#each load.weeks.filter((w) => w.items.length) as w (w.week)}
        <tr class:over={w.used > load.space.capacity}>
          <td class="mono">{dayMonth(w.week)}</td>
          <td class="mono">{w.used} / {load.space.capacity}</td>
          <td>{w.items.map((i) => `${i.label} (${i.amount})`).join(', ')}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</details>

<style>
  .chart { position: relative; }
  svg { display: block; width: 100%; height: auto; }
  .grid { stroke: var(--line); stroke-width: 1; }
  .axis { font: 400 10px var(--font-mono); fill: var(--muted); }
  .seg { stroke: color-mix(in srgb, var(--ink) 25%, transparent); stroke-width: 0.6; cursor: default; }
  .seg:hover { stroke: var(--ink); stroke-width: 1.5; }
  .seg.res { stroke-dasharray: 3 2; }
  .cap { stroke: var(--ink); stroke-width: 1.5; stroke-dasharray: 5 4; }
  .cap-label { font: 500 10px var(--font-mono); fill: var(--ink); letter-spacing: 0.04em; }
  .over { font: 600 12px var(--font-mono); fill: var(--warn); }
  .tip {
    position: absolute; transform: translate(-50%, calc(-100% - 8px)); pointer-events: none;
    display: grid; gap: 2px; padding: 6px 10px; border-radius: 8px; background: var(--ink); color: var(--bg); font-size: 13px; white-space: nowrap;
  }
  .table summary { cursor: pointer; color: var(--accent); }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
  th { text-align: left; font: 500 11px var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  th, td { padding: 6px 8px 6px 0; border-top: 1px solid var(--line); vertical-align: top; }
  tr.over td { color: var(--warn); }
</style>
