<script lang="ts">
  // The plot drawn to scale, in its own orientation, with compass labels on all
  // four sides. Used for the month view, the small multiples and the layout editor.
  import type { Snippet } from 'svelte';
  import { rectOf } from '../lib/capacity';
  import { fonts } from '../lib/fonts.svelte';
  import { t } from '../lib/i18n';
  import type { Cell } from '../lib/monthview';
  import { fitBlock, type FitLine, type FitStyle } from '../lib/textfit';
  import type { Area, Direction, Feature, Plot } from '../lib/types';

  interface Geometry { s: number; ox: number; oy: number; w: number; h: number }

  interface Props {
    plot: Plot;
    areas: Area[];
    features: Feature[];
    cells?: Map<string, Cell>;
    mode?: 'full' | 'mini' | 'edit';
    selected?: string | null;
    onselect?: (areaId: string) => void;
    /** Extra drawing on top (editor handles), given the geometry. */
    overlay?: Snippet<[Geometry]>;
    /** Pointer down on an area or feature, for the editor. */
    onitemdown?: (e: PointerEvent, kind: 'area' | 'feature', id: string, g: Geometry) => void;
    onbackgrounddown?: (e: PointerEvent, g: Geometry) => void;
    title?: string;
    svgEl?: SVGSVGElement;
  }

  let { plot, areas, features, cells, mode = 'full', selected = null, onselect, overlay, onitemdown, onbackgrounddown, title, svgEl = $bindable() }: Props = $props();

  const mini = $derived(mode === 'mini');
  const VW = $derived(mini ? 200 : 430);
  const M = $derived(mini ? 6 : 24);
  const MAX_H = $derived(mini ? 420 : 900);

  const geo: Geometry = $derived.by(() => {
    const s = Math.min((VW - 2 * M) / plot.widthM, (MAX_H - 2 * M) / plot.lengthM);
    const w = plot.widthM * s;
    const h = plot.lengthM * s;
    return { s, ox: (VW - w) / 2, oy: M, w, h };
  });
  const VH = $derived(geo.h + 2 * M);

  const CLOCKWISE: Direction[] = ['N', 'E', 'S', 'W'];
  const compass = $derived.by(() => {
    const i = CLOCKWISE.indexOf(plot.topDirection);
    const at = (n: number) => CLOCKWISE[(i + n) % 4];
    return { top: at(0), right: at(1), bottom: at(2), left: at(3) };
  });

  // Draw parents before children.
  const depth = (a: Area): number => {
    let d = 0;
    for (let p = a.parentId; p && d < 6; p = areas.find((x) => x.id === p)?.parentId) d++;
    return d;
  };
  const ordered = $derived([...areas].sort((a, b) => depth(a) - depth(b)));
  const parents = $derived(new Set(areas.map((a) => a.parentId).filter(Boolean)));

  const style: FitStyle = $derived(
    mini
      ? { labelFont: '600 9px "Public Sans"', labelLine: 10.5, detailFont: '400 8px "Public Sans"', detailLine: 9.5 }
      : { labelFont: '600 12px "Public Sans"', labelLine: 14, detailFont: '400 10.5px "Public Sans"', detailLine: 12.5 },
  );

  function box(a: { shape: Area['shape'] }) {
    const [x, y, w, h] = rectOf(a);
    return { x: geo.ox + x * geo.s, y: geo.oy + y * geo.s, w: w * geo.s, h: h * geo.s };
  }

  function layout(a: Area, cell: Cell | undefined): { lines: FitLine[]; top: number } {
    void fonts.ready;
    if (!cell || parents.has(a.id)) return { lines: [], top: 0 };
    const b = box(a);
    const pad = mini ? 3 : 6;
    const corner = mini ? 0 : 13;
    const labels = mini ? cell.shortLabels : cell.labels;
    const lines = fitBlock(labels, mini ? [] : cell.details, cell.draft ? t('draft') : null, b.w - 2 * pad, b.h - 2 * pad - corner, style);
    return { lines, top: b.y + pad + corner };
  }

  function lineY(lines: FitLine[], i: number): number {
    let y = 0;
    for (let j = 0; j < i; j++) y += lines[j].kind === 'label' ? style.labelLine : style.detailLine;
    return y + (lines[i].kind === 'label' ? style.labelLine : style.detailLine) - 3;
  }

  function featureFill(f: Feature): string {
    switch (f.type) {
      case 'path': return 'var(--path)';
      case 'water': case 'tap': return 'var(--c-brassica)';
      case 'compost': return 'var(--c-root)';
      case 'tree': case 'hedge': return 'var(--c-leaf)';
      case 'greenhouse': case 'polytunnel': case 'coldframe': return 'var(--surface)';
      default: return 'var(--c-static)';
    }
  }

  function points(pts: [number, number][]): string {
    return pts.map(([x, y]) => `${geo.ox + x * geo.s},${geo.oy + y * geo.s}`).join(' ');
  }

  function keydown(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onselect?.(id);
    }
  }

  const interactive = $derived(!!onselect && mode !== 'edit');
</script>

<svg
  bind:this={svgEl}
  class="plan {mode}"
  viewBox="0 0 {VW} {VH}"
  role="group"
  aria-label={title ?? t('plan.aria', { name: plot.name, w: plot.widthM, l: plot.lengthM, top: t(`dir.${plot.topDirection}`) })}
>
  <!-- Ground: woodchip paths between beds. -->
  <rect
    x={geo.ox} y={geo.oy} width={geo.w} height={geo.h} fill="var(--path)" rx={mini ? 2 : 3}
    role="presentation"
    onpointerdown={(e) => onbackgrounddown?.(e, geo)}
  />

  {#if !mini}
    <g class="compass" aria-hidden="true">
      <text x={VW / 2} y={M - 9} text-anchor="middle">{t(`dir.long.${compass.top}`)}</text>
      <text x={VW / 2} y={VH - 8} text-anchor="middle">{t(`dir.long.${compass.bottom}`)}</text>
      <text transform="translate({VW - 9} {M + geo.h / 2}) rotate(90)" text-anchor="middle">{t(`dir.long.${compass.right}`)}</text>
      <text transform="translate({9} {M + geo.h / 2}) rotate(-90)" text-anchor="middle">{t(`dir.long.${compass.left}`)}</text>
    </g>
  {/if}

  {#each features.filter((f) => !f.shape.line) as f (f.id)}
    {@const b = box(f)}
    <g class="feature" class:selected={selected === f.id} onpointerdown={(e) => onitemdown?.(e, 'feature', f.id, geo)} role="presentation">
      {#if f.shape.polygon}
        <polygon points={points(f.shape.polygon)} fill={featureFill(f)} class="feature-shape" />
      {:else if f.type === 'tree'}
        <ellipse cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} fill={featureFill(f)} class="feature-shape" />
      {:else}
        <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={featureFill(f)} class="feature-shape" rx="2" />
      {/if}
      {#if !mini && b.w > 30 && b.h > 12}
        <text class="feature-label" x={b.x + b.w / 2} y={b.y + b.h / 2 + 3} text-anchor="middle">{f.label}</text>
      {/if}
    </g>
  {/each}

  {#each ordered as a (a.id)}
    {@const b = box(a)}
    {@const cell = cells?.get(a.id)}
    {@const isParent = parents.has(a.id)}
    {@const exists = cell?.exists ?? true}
    {#if exists}
      {@const fitted = layout(a, cell)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <g
        class="area"
        class:parent={isParent}
        class:selected={selected === a.id}
        class:clickable={interactive && !isParent}
        role={interactive && !isParent ? 'button' : 'presentation'}
        tabindex={interactive && !isParent ? 0 : undefined}
        aria-label={interactive && !isParent ? (cell?.description ?? a.name) : undefined}
        onclick={() => interactive && !isParent && onselect?.(a.id)}
        onkeydown={(e) => interactive && !isParent && keydown(e, a.id)}
        onpointerdown={(e) => onitemdown?.(e, 'area', a.id, geo)}
      >
        <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={cell?.fill ?? (a.perennial ? `var(--c-${a.fill ?? 'static'})` : 'var(--c-empty)')} class="area-shape" rx={mini ? 1.5 : 3} />
        {#if cell?.rowFills && a.rows}
          {@const axisX = (a.rowsAxis ?? 'x') === 'x'}
          {#each cell.rowFills as rf, i}
            {#if axisX}
              <rect x={b.x + (b.w / a.rows) * i} y={b.y} width={b.w / a.rows} height={b.h} fill={rf ?? 'var(--c-empty)'} class="row-strip" />
            {:else}
              <rect x={b.x} y={b.y + (b.h / a.rows) * i} width={b.w} height={b.h / a.rows} fill={rf ?? 'var(--c-empty)'} class="row-strip" />
            {/if}
          {/each}
        {:else if a.kind === 'rows' && a.rows && !mini}
          {#each Array.from({ length: a.rows - 1 }) as _, i}
            {#if (a.rowsAxis ?? 'x') === 'x'}
              <line x1={b.x + (b.w / a.rows) * (i + 1)} x2={b.x + (b.w / a.rows) * (i + 1)} y1={b.y} y2={b.y + b.h} class="row-line" />
            {:else}
              <line y1={b.y + (b.h / a.rows) * (i + 1)} y2={b.y + (b.h / a.rows) * (i + 1)} x1={b.x} x2={b.x + b.w} class="row-line" />
            {/if}
          {/each}
        {/if}
        {#if a.protection && a.protection !== 'none' && !mini}
          <rect x={b.x + 1} y={b.y + 1} width={b.w - 2} height={b.h - 2} class="protected" rx="3" />
        {/if}
        {#if cell?.changes}
          <rect x={b.x + 3} y={b.y + 3} width={Math.max(0, b.w - 6)} height={Math.max(0, b.h - 6)} class="changes" rx="2" />
        {/if}
        {#if cell?.draft}
          {@const inset = cell.changes ? 6.5 : 3}
          <rect x={b.x + inset} y={b.y + inset} width={Math.max(0, b.w - 2 * inset)} height={Math.max(0, b.h - 2 * inset)} class="draft" rx="2" />
        {/if}
        {#if !mini && !isParent}
          <text class="bed-name" x={b.x + 6} y={b.y + 13}>{a.name}</text>
        {:else if !mini && isParent}
          <text class="bed-name parent-name" x={b.x + b.w - 5} y={b.y + b.h - 5} text-anchor="end">{a.name}</text>
        {/if}
        {#each fitted.lines as line, i}
          <text
            class="cell-text {line.kind}"
            x={b.x + (mini ? 3 : 6)}
            y={fitted.top + lineY(fitted.lines, i)}
          >{line.text}</text>
        {/each}
      </g>
    {/if}
  {/each}

  {#each features.filter((f) => f.shape.line) as f (f.id)}
    <g class="feature line" class:selected={selected === f.id} onpointerdown={(e) => onitemdown?.(e, 'feature', f.id, geo)} role="presentation">
      <polyline points={points(f.shape.line as [number, number][])} class="fence {f.type}" class:mini />
      <!-- Wider invisible hit area for the editor. -->
      {#if mode === 'edit'}<polyline points={points(f.shape.line as [number, number][])} class="hit" />{/if}
    </g>
  {/each}

  {#if overlay}{@render overlay(geo)}{/if}
</svg>

<style>
  .plan { display: block; width: 100%; height: auto; user-select: none; -webkit-user-select: none; }
  .compass text { font: 500 10px var(--font-mono); letter-spacing: 0.08em; fill: var(--muted); text-transform: uppercase; }
  .area-shape { stroke: color-mix(in srgb, var(--ink) 22%, transparent); stroke-width: 0.8; }
  .parent > .area-shape { stroke: color-mix(in srgb, var(--ink) 35%, transparent); }
  .row-strip { stroke: color-mix(in srgb, var(--ink) 18%, transparent); stroke-width: 0.6; }
  .row-line { stroke: color-mix(in srgb, var(--ink) 20%, transparent); stroke-width: 0.6; stroke-dasharray: 2 2; }
  .changes { fill: none; stroke: var(--new); stroke-width: 2; }
  .draft { fill: none; stroke: var(--muted); stroke-width: 1.4; stroke-dasharray: 4 3; }
  .protected { fill: none; stroke: color-mix(in srgb, var(--surface) 75%, transparent); stroke-width: 2; }
  .bed-name { font: 500 8.5px var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; fill: var(--cell-muted); }
  .parent-name { opacity: 0.85; }
  .cell-text { fill: var(--cell-ink); }
  .cell-text.label { font: 600 12px var(--font-body); }
  .cell-text.detail { font: 400 10.5px var(--font-body); fill: var(--cell-muted); }
  .cell-text.draft { font: italic 400 10.5px var(--font-body); fill: var(--cell-muted); }
  .mini .cell-text.label { font-size: 9px; }
  .mini .cell-text.detail, .mini .cell-text.draft { font-size: 8px; }
  .feature-shape { stroke: color-mix(in srgb, var(--ink) 22%, transparent); stroke-width: 0.8; }
  .feature-label { font: 500 8px var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; fill: var(--cell-muted); pointer-events: none; }
  .fence { fill: none; stroke: var(--fence); stroke-width: 4; stroke-dasharray: 9 5; stroke-linecap: butt; }
  .fence.mini { stroke-width: 2.5; stroke-dasharray: 5 3; }
  .fence.hedge { stroke: var(--c-leaf); stroke-width: 7; stroke-dasharray: none; }
  .fence.wall { stroke: var(--c-static); stroke-width: 5; stroke-dasharray: none; }
  .hit { fill: none; stroke: transparent; stroke-width: 14; }
  .clickable { cursor: pointer; }
  .clickable:hover .area-shape { stroke: var(--ink); stroke-width: 1.2; }
  .area.clickable:focus-visible .area-shape, .area.selected:not(.parent) .area-shape { stroke: var(--accent); stroke-width: 2.5; }
  .edit .area, .edit .feature { cursor: grab; }
  .edit .selected .area-shape, .edit .selected .feature-shape { stroke: var(--accent); stroke-width: 2; }
  .edit .selected .fence { stroke: var(--accent); }
</style>
