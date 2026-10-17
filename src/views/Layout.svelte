<script lang="ts">
  // The layout editor: beds, sections, rows and features. Drag to move, drag a
  // handle to resize, or type numbers. Everything snaps to a grid.
  import PlanSvg from '../components/PlanSvg.svelte';
  import { setProtection } from '../lib/actions';
  import { areaM2, gridFit, rectOf } from '../lib/capacity';
  import { polygonFit } from '../lib/geometry';
  import { t } from '../lib/i18n';
  import { uid } from '../lib/ids';
  import { app } from '../lib/store.svelte';
  import type { Area, AreaKind, Category, Dataset, Direction, Feature, FeatureType, PlotType, Protection, Rect } from '../lib/types';
  import { area as fmtArea } from '../lib/units';

  let selected = $state<{ kind: 'area' | 'feature'; id: string } | null>(null);
  let grid = $state(0.05);
  let svgEl: SVGSVGElement | undefined = $state();
  let spacingCalc = $state(30);

  const plot = $derived(app.plot!);
  const area = $derived(selected?.kind === 'area' ? app.data.areas.find((a) => a.id === selected!.id) : undefined);
  const feature = $derived(selected?.kind === 'feature' ? app.data.features.find((f) => f.id === selected!.id) : undefined);
  const children = $derived(area ? app.data.areas.filter((a) => a.parentId === area.id) : []);
  const plantingsIn = $derived(area ? app.data.plantings.filter((p) => p.areaId === area.id).length : 0);

  const snap = (v: number) => Math.round(v / grid) * grid;
  const r2 = (v: number) => Math.round(v * 1000) / 1000;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  function toMetres(e: PointerEvent, g: { s: number; ox: number; oy: number }): [number, number] {
    const svg = svgEl!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [(p.x - g.ox) / g.s, (p.y - g.oy) / g.s];
  }

  // ── Dragging ──
  type Drag = {
    mode: 'move' | 'resize' | 'point' | 'vertex';
    origPoly?: [number, number][];
    handle?: string;
    pointIndex?: number;
    start: [number, number];
    orig: Rect;
    origLine?: [number, number][];
    kids: { id: string; rect: Rect }[];
    before: Dataset;
    g: { s: number; ox: number; oy: number };
    moved: boolean;
  };
  let drag: Drag | null = null;

  function itemDown(e: PointerEvent, kind: 'area' | 'feature', id: string, g: { s: number; ox: number; oy: number }) {
    e.stopPropagation();
    selected = { kind, id };
    const item = kind === 'area' ? app.data.areas.find((a) => a.id === id)! : app.data.features.find((f) => f.id === id)!;
    const kids = kind === 'area' ? descendants(id).map((a) => ({ id: a.id, rect: [...rectOf(a)] as Rect })) : [];
    drag = {
      mode: 'move', start: toMetres(e, g), orig: [...rectOf(item)] as Rect, origLine: item.shape.line?.map((p) => [...p] as [number, number]),
      origPoly: item.shape.polygon?.map((p) => [...p] as [number, number]), kids, before: app.snapshot(), g, moved: false,
    };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function handleDown(e: PointerEvent, handle: string, g: { s: number; ox: number; oy: number }, pointIndex?: number) {
    e.stopPropagation();
    if (!selected) return;
    const item = selected.kind === 'area' ? area! : feature!;
    drag = {
      mode: pointIndex != null ? 'point' : 'resize', handle, pointIndex, start: toMetres(e, g), orig: [...rectOf(item)] as Rect,
      origLine: item.shape.line?.map((p) => [...p] as [number, number]), kids: [], before: app.snapshot(), g, moved: false,
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function vertexDown(e: PointerEvent, i: number, g: { s: number; ox: number; oy: number }) {
    e.stopPropagation();
    if (!area?.shape.polygon) return;
    drag = { mode: 'vertex', pointIndex: i, start: toMetres(e, g), orig: [...rectOf(area)] as Rect, origPoly: area.shape.polygon.map((p) => [...p] as [number, number]), kids: [], before: app.snapshot(), g, moved: false };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function addVertex(i: number) {
    if (!area?.shape.polygon) return;
    const poly = area.shape.polygon;
    const [a, b] = [poly[i], poly[(i + 1) % poly.length]];
    const id = area.id;
    app.update(t('layout.cornerAdded'), (d) => {
      const x = d.areas.find((q) => q.id === id)!;
      const next = poly.map((p) => [...p] as [number, number]);
      next.splice(i + 1, 0, [r2(snap((a[0] + b[0]) / 2)), r2(snap((a[1] + b[1]) / 2))]);
      x.shape = { polygon: next };
    });
  }

  function removeVertex(i: number) {
    if (!area?.shape.polygon || area.shape.polygon.length <= 3) return;
    const id = area.id;
    const poly = area.shape.polygon;
    app.update(t('layout.cornerRemoved'), (d) => {
      d.areas.find((q) => q.id === id)!.shape = { polygon: poly.filter((_, j) => j !== i).map((p) => [...p] as [number, number]) };
    });
  }

  function toShape() {
    if (!area) return;
    const [x, y, w, h] = rectOf(area);
    const id = area.id;
    app.update(t('layout.madeShape'), (d) => {
      d.areas.find((q) => q.id === id)!.shape = { polygon: [[x, y], [r2(x + w), y], [r2(x + w), r2(y + h)], [x, r2(y + h)]] };
    });
  }

  function toRect() {
    if (!area) return;
    const r = rectOf(area);
    const id = area.id;
    app.update(t('layout.madeRect'), (d) => { d.areas.find((q) => q.id === id)!.shape = { rect: r.map(r2) as Rect }; });
  }

  function onMove(e: PointerEvent) {
    if (!drag || !selected) return;
    const [mx, my] = toMetres(e, drag.g);
    const dx = mx - drag.start[0];
    const dy = my - drag.start[1];
    if (!drag.moved && Math.hypot(dx, dy) * drag.g.s < 3) return;
    drag.moved = true;
    const [x, y, w, h] = drag.orig;
    const d = drag;
    const sel = selected;
    app.live((data) => {
      const item = sel.kind === 'area' ? data.areas.find((a) => a.id === sel.id)! : data.features.find((f) => f.id === sel.id)!;
      if (d.mode === 'vertex' && d.origPoly && d.pointIndex != null) {
        const poly = d.origPoly.map((p) => [...p] as [number, number]);
        poly[d.pointIndex] = [r2(clamp(snap(mx), 0, plot.widthM)), r2(clamp(snap(my), 0, plot.lengthM))];
        item.shape = { polygon: poly };
        return;
      }
      if (d.mode === 'move' && d.origPoly) {
        // Keep the whole shape on the plot.
        const [bx, by, bw, bh] = d.orig;
        const sdx = clamp(snap(dx), -bx, plot.widthM - bx - bw);
        const sdy = clamp(snap(dy), -by, plot.lengthM - by - bh);
        item.shape = { polygon: d.origPoly.map(([px, py]) => [r2(px + sdx), r2(py + sdy)]) };
        return;
      }
      if (d.mode === 'point' && d.origLine && d.pointIndex != null) {
        const line = d.origLine.map((p) => [...p] as [number, number]);
        line[d.pointIndex] = [r2(clamp(snap(mx), 0, plot.widthM)), r2(clamp(snap(my), 0, plot.lengthM))];
        item.shape = { line };
        return;
      }
      if (d.mode === 'move' && d.origLine) {
        const sdx = snap(dx);
        const sdy = snap(dy);
        item.shape = { line: d.origLine.map(([px, py]) => [r2(clamp(px + sdx, 0, plot.widthM)), r2(clamp(py + sdy, 0, plot.lengthM))]) };
        return;
      }
      let nx = x, ny = y, nw = w, nh = h;
      if (d.mode === 'move') {
        nx = clamp(snap(x + dx), 0, Math.max(0, plot.widthM - w));
        ny = clamp(snap(y + dy), 0, Math.max(0, plot.lengthM - h));
      } else {
        const hd = d.handle!;
        if (hd.includes('e')) nw = clamp(snap(x + w + dx) - x, grid, plot.widthM - x);
        if (hd.includes('s')) nh = clamp(snap(y + h + dy) - y, grid, plot.lengthM - y);
        if (hd.includes('w')) { nx = clamp(snap(x + dx), 0, x + w - grid); nw = x + w - nx; }
        if (hd.includes('n')) { ny = clamp(snap(y + dy), 0, y + h - grid); nh = y + h - ny; }
      }
      item.shape = { rect: [r2(nx), r2(ny), r2(nw), r2(nh)] };
      // Sections and rows move with their bed.
      if (d.mode === 'move') {
        for (const k of d.kids) {
          const child = data.areas.find((a) => a.id === k.id);
          if (child) child.shape = { rect: [r2(k.rect[0] + nx - x), r2(k.rect[1] + ny - y), k.rect[2], k.rect[3]] };
        }
      }
    });
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove);
    if (drag?.moved) app.commit(t('layout.moved'), drag.before);
    drag = null;
  }

  function descendants(id: string): Area[] {
    const out: Area[] = [];
    const walk = (pid: string) => {
      for (const a of app.data.areas) if (a.parentId === pid) { out.push(a); walk(a.id); }
    };
    walk(id);
    return out;
  }

  function keydown(e: KeyboardEvent) {
    if (!selected || (e.target as HTMLElement).closest('input, select, textarea')) return;
    const step = e.shiftKey ? grid * 10 : grid;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      nudge(...moves[e.key]);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeSelected();
    } else if (e.key === 'Escape') selected = null;
  }

  function nudge(dx: number, dy: number) {
    const sel = selected!;
    app.update(null, (d) => {
      const item = sel.kind === 'area' ? d.areas.find((a) => a.id === sel.id)! : d.features.find((f) => f.id === sel.id)!;
      if (item.shape.line) item.shape = { line: item.shape.line.map(([x, y]) => [r2(x + dx), r2(y + dy)]) };
      else if (item.shape.polygon) item.shape = { polygon: item.shape.polygon.map(([x, y]) => [r2(x + dx), r2(y + dy)]) };
      else {
        const [x, y, w, h] = rectOf(item);
        item.shape = { rect: [r2(clamp(x + dx, 0, plot.widthM - w)), r2(clamp(y + dy, 0, plot.lengthM - h)), w, h] };
        if (sel.kind === 'area') for (const c of d.areas.filter((a) => isDescendant(d.areas, a, sel.id))) {
          const [cx, cy, cw, ch] = rectOf(c);
          const [nx, ny] = rectOf(item);
          c.shape = { rect: [r2(cx + nx - x), r2(cy + ny - y), cw, ch] };
        }
      }
    });
  }

  function isDescendant(areas: Area[], a: Area, id: string): boolean {
    for (let p = a.parentId; p; p = areas.find((x) => x.id === p)?.parentId) if (p === id) return true;
    return false;
  }

  // ── Adding and changing ──
  function freeSpot(w: number, h: number): Rect {
    // First grid position that doesn't overlap a top-level bed or feature.
    const taken = [...app.areas.filter((a) => !a.parentId), ...app.features.filter((f) => !f.shape.line)].map(rectOf);
    for (let y = 0; y + h <= plot.lengthM + 1e-9; y += 0.25)
      for (let x = 0; x + w <= plot.widthM + 1e-9; x += 0.25) {
        const r: Rect = [r2(x), r2(y), w, h];
        if (!taken.some((t) => r[0] < t[0] + t[2] && t[0] < r[0] + r[2] && r[1] < t[1] + t[3] && t[1] < r[1] + r[3])) return r;
      }
    return [0, 0, w, h];
  }

  function addBed() {
    const n = app.areas.filter((a) => a.kind === 'bed').length + 1;
    const w = Math.min(1.2, plot.widthM);
    const h = Math.min(2.4, plot.lengthM);
    const id = uid('area');
    app.update(t('layout.bedAdded'), (d) => {
      d.areas.push({ id, plotId: plot.id, kind: 'bed', name: t('layout.bedName', { n }), shape: { rect: freeSpot(w, h) } });
    });
    selected = { kind: 'area', id };
  }

  function addShapedBed() {
    const n = app.areas.filter((a) => a.kind === 'bed').length + 1;
    const [x, y] = freeSpot(1.6, 1.6);
    const id = uid('area');
    // An L-shape to start from; drag corners to fit.
    const L: [number, number][] = [[0, 0], [0.8, 0], [0.8, 0.8], [1.6, 0.8], [1.6, 1.6], [0, 1.6]];
    app.update(t('layout.bedAdded'), (d) => {
      d.areas.push({ id, plotId: plot.id, kind: 'bed', name: t('layout.bedName', { n }), shape: { polygon: L.map(([px, py]) => [r2(Math.min(px + x, plot.widthM)), r2(Math.min(py + y, plot.lengthM))]) } });
    });
    selected = { kind: 'area', id };
  }

  function addContainer() {
    const n = app.areas.filter((a) => a.kind === 'container').length + 1;
    const id = uid('area');
    app.update(t('layout.containerAdded'), (d) => {
      d.areas.push({ id, plotId: plot.id, kind: 'container', name: t('layout.containerName', { n }), volumeL: 30, shape: { rect: freeSpot(0.4, 0.4) } });
    });
    selected = { kind: 'area', id };
  }

  let featureType: FeatureType = $state('fence');
  const FEATURES: FeatureType[] = ['fence', 'wall', 'hedge', 'path', 'shed', 'greenhouse', 'polytunnel', 'coldframe', 'water', 'tap', 'compost', 'tree', 'seating', 'tools', 'other'];
  function addFeature() {
    const id = uid('feat');
    const lineish = featureType === 'fence' || featureType === 'wall' || featureType === 'hedge';
    app.update(t('layout.featureAdded'), (d) => {
      d.features.push({
        id, plotId: plot.id, type: featureType, label: t(`feature.${featureType}`),
        shape: lineish ? { line: [[0, plot.lengthM], [plot.widthM, plot.lengthM]] } : { rect: freeSpot(featureType === 'path' ? 0.5 : 1, 1) },
        ...(lineish ? { side: oppositeOf(plot.topDirection) } : {}),
      });
    });
    selected = { kind: 'feature', id };
  }

  function oppositeOf(d: Direction): Direction {
    return ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[d];
  }

  let splitCount = $state(3);
  function splitSections() {
    if (!area) return;
    const [x, y, w, h] = rectOf(area);
    const along = h >= w;
    const len = along ? h : w;
    const step = len / splitCount;
    const parent = area;
    app.update(t('layout.split', { n: splitCount }), (d) => {
      for (let i = 0; i < splitCount; i++) {
        const rect: Rect = along ? [x, r2(y + i * step), w, r2(step)] : [r2(x + i * step), y, r2(step), h];
        d.areas.push({ id: uid('area'), plotId: plot.id, parentId: parent.id, kind: 'section', name: `${parent.name} ${i + 1}`, shape: { rect } });
      }
    });
  }

  let rowCount = $state(5);
  function makeRows() {
    if (!area) return;
    const [, , w, h] = rectOf(area);
    const id = area.id;
    app.update(t('layout.rows', { n: rowCount }), (d) => {
      const a = d.areas.find((x) => x.id === id)!;
      a.kind = 'rows';
      a.rows = rowCount;
      // Rows run along the longer side.
      a.rowsAxis = h >= w ? 'x' : 'y';
    });
  }

  function removeSelected() {
    if (!selected) return;
    const sel = selected;
    if (sel.kind === 'area') {
      const ids = new Set([sel.id, ...descendants(sel.id).map((a) => a.id)]);
      const name = area?.name ?? '';
      app.update(t('layout.deleted', { name }), (d) => {
        d.areas = d.areas.filter((a) => !ids.has(a.id));
        // Plantings in a deleted area are kept but flagged, so nothing is lost silently.
      });
    } else {
      const name = feature?.label ?? '';
      app.update(t('layout.deleted', { name }), (d) => {
        d.features = d.features.filter((f) => f.id !== sel.id);
      });
    }
    selected = null;
  }

  function duplicate() {
    if (!area) return;
    const [x, y, w, h] = rectOf(area);
    const id = uid('area');
    const src = area;
    app.update(t('layout.duplicated', { name: src.name }), (d) => {
      d.areas.push({ ...$state.snapshot(src), id, parentId: src.parentId, name: `${src.name} (2)`, shape: { rect: src.parentId ? [x, y, w, h] : freeSpot(w, h) } } as Area);
    });
    selected = { kind: 'area', id };
  }

  function setRect(i: number, v: number) {
    if (!Number.isFinite(v)) return;
    const sel = selected!;
    app.update(null, (d) => {
      const item = sel.kind === 'area' ? d.areas.find((a) => a.id === sel.id)! : d.features.find((f) => f.id === sel.id)!;
      const r = [...rectOf(item)] as Rect;
      r[i] = r2(Math.max(i >= 2 ? 0.01 : 0, v));
      item.shape = { rect: r };
    });
  }

  function editArea(fn: (a: Area) => void) {
    const id = area!.id;
    app.update(null, (d) => { fn(d.areas.find((a) => a.id === id)!); });
  }
  function editFeature(fn: (f: Feature) => void) {
    const id = feature!.id;
    app.update(null, (d) => { fn(d.features.find((f) => f.id === id)!); });
  }
  function editPlot(fn: (p: NonNullable<typeof app.plot>) => void) {
    const id = plot.id;
    app.update(null, (d) => { fn(d.plots.find((p) => p.id === id)!); });
  }

  const PROTECTIONS: Protection[] = ['none', 'cloche', 'coldframe', 'greenhouse', 'polytunnel', 'heated'];
  const CATS: Category[] = ['fruit', 'herb', 'flower', 'leaf', 'allium'];
  const fit = $derived(area && !area.shape.polygon?.length ? gridFit(rectOf(area)[2], rectOf(area)[3], spacingCalc) : undefined);
  const shapeFit = $derived(area?.shape.polygon?.length ? polygonFit(area.shape.polygon, spacingCalc / 100) : undefined);
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  function handlePos(hd: string, b: { x: number; y: number; w: number; h: number }): [number, number] {
    const x = hd.includes('w') ? b.x : hd.includes('e') ? b.x + b.w : b.x + b.w / 2;
    const y = hd.includes('n') ? b.y : hd.includes('s') ? b.y + b.h : b.y + b.h / 2;
    return [x, y];
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="layout-view">
  <div class="spread">
    <h1>{t('nav.plan')}</h1>
    <div class="row">
      <button class="btn" onclick={addBed}>{t('layout.addBed')}</button>
      <button class="btn" onclick={addShapedBed}>{t('layout.addShaped')}</button>
      <button class="btn" onclick={addContainer}>{t('layout.addContainer')}</button>
      <span class="row add-feature">
        <select bind:value={featureType} aria-label={t('layout.featureType')}>
          {#each FEATURES as f}<option value={f}>{t(`feature.${f}`)}</option>{/each}
        </select>
        <button class="btn" onclick={addFeature}>{t('layout.addFeature')}</button>
      </span>
    </div>
  </div>

  <div class="cols">
    <div class="canvas">
      <PlanSvg
        bind:svgEl
        {plot}
        areas={app.areas}
        features={app.features}
        mode="edit"
        selected={selected?.id ?? null}
        onitemdown={itemDown}
        onbackgrounddown={() => (selected = null)}
        title={t('layout.canvas', { name: plot.name })}
      >
        {#snippet overlay(g)}
          {#if area?.shape.polygon}
            {@const poly = area.shape.polygon}
            {#each poly as [px, py], i}
              {@const [nx, ny] = poly[(i + 1) % poly.length]}
              <circle class="mid" cx={g.ox + ((px + nx) / 2) * g.s} cy={g.oy + ((py + ny) / 2) * g.s} r="5" role="presentation" onpointerdown={(e) => { e.stopPropagation(); addVertex(i); }}><title>{t('layout.addCorner')}</title></circle>
            {/each}
            {#each poly as [px, py], i}
              <circle class="handle" cx={g.ox + px * g.s} cy={g.oy + py * g.s} r="7" role="presentation" onpointerdown={(e) => vertexDown(e, i, g)} ondblclick={() => removeVertex(i)}><title>{t('layout.cornerHelp')}</title></circle>
            {/each}
          {:else if area || (feature && !feature.shape.line)}
            {@const [x, y, w, h] = rectOf((area ?? feature)!)}
            {@const b = { x: g.ox + x * g.s, y: g.oy + y * g.s, w: w * g.s, h: h * g.s }}
            {#each HANDLES as hd}
              {@const [hx, hy] = handlePos(hd, b)}
              <rect class="handle {hd}" x={hx - 6} y={hy - 6} width="12" height="12" rx="2" role="presentation" onpointerdown={(e) => handleDown(e, hd, g)} />
            {/each}
          {:else if feature?.shape.line}
            {#each feature.shape.line as [px, py], i}
              <circle class="handle" cx={g.ox + px * g.s} cy={g.oy + py * g.s} r="7" role="presentation" onpointerdown={(e) => handleDown(e, 'pt', g, i)} />
            {/each}
          {/if}
        {/snippet}
      </PlanSvg>
      <div class="row small muted canvas-help">
        <span>{t('layout.help')}</span>
        <label class="row">{t('layout.grid')}
          <select bind:value={grid} style="width:auto">
            <option value={0.01}>1 cm</option><option value={0.05}>5 cm</option><option value={0.1}>10 cm</option><option value={0.25}>25 cm</option><option value={0.5}>50 cm</option>
          </select></label>
      </div>
    </div>

    <aside class="props">
      {#if area}
        {@const [x, y, w, h] = rectOf(area)}
        {@const shaped = !!area.shape.polygon?.length}
        <section class="stack">
          <p class="eyebrow">{t(`kind.${area.kind}`)}{#if area.parentId}: <button class="linkish" onclick={() => (selected = { kind: 'area', id: area.parentId! })}>{t('layout.inBed', { name: app.areaName(area.parentId) })}</button>{/if}</p>
          <label class="field"><span>{t('layout.name')}</span><input value={area.name} onchange={(e) => editArea((a) => (a.name = e.currentTarget.value))} /></label>
          {#if shaped}
            <p class="small muted">{t('layout.shapeHelp')}</p>
          {:else}
            <div class="grid4">
              {#each [['x', x], ['y', y], ['w', w], ['h', h]] as [k, v], i}
                <label class="field"><span>{t(`layout.${k}`)}</span><input type="number" step="0.01" min="0" value={v} onchange={(e) => setRect(i, Number(e.currentTarget.value))} /></label>
              {/each}
            </div>
          {/if}
          <p class="small muted">{t('layout.size', { area: fmtArea(areaM2(area), app.units) })}{plantingsIn ? `, ${t('layout.plantingsIn', { n: plantingsIn })}` : ''}</p>
          {#if area.kind === 'bed' && !children.length}
            <button class="btn small quiet" onclick={shaped ? toRect : toShape}>{shaped ? t('layout.makeRect') : t('layout.makeShape')}</button>
          {/if}
          <div class="grid2">
            <label class="field"><span>{t('layout.kind')}</span>
              <select value={area.kind} onchange={(e) => editArea((a) => { a.kind = e.currentTarget.value as AreaKind; if (a.kind === 'rows' && !a.rows) a.rows = 3; })}>
                {#each ['bed', 'section', 'rows', 'grid', 'container'] as k}<option value={k}>{t(`kind.${k}`)}</option>{/each}
              </select></label>
            <label class="field"><span>{t('layout.protection')}</span>
              <select value={area.protection ?? 'none'} onchange={(e) => setProtection(area.id, e.currentTarget.value as Protection)}>
                {#each PROTECTIONS as pr}<option value={pr}>{t(`protection.${pr}`)}</option>{/each}
              </select></label>
          </div>
          {#if area.kind === 'rows'}
            <div class="grid2">
              <label class="field"><span>{t('layout.rowCount')}</span><input type="number" min="1" max="40" value={area.rows ?? 3} onchange={(e) => editArea((a) => (a.rows = Math.max(1, Number(e.currentTarget.value) || 1)))} /></label>
              <label class="field"><span>{t('layout.rowsRun')}</span>
                <select value={area.rowsAxis ?? 'x'} onchange={(e) => editArea((a) => (a.rowsAxis = e.currentTarget.value as 'x' | 'y'))}>
                  <option value="x">{t('layout.rowsDown')}</option><option value="y">{t('layout.rowsAcross')}</option>
                </select></label>
            </div>
          {/if}
          {#if area.kind === 'grid'}
            <label class="field"><span>{t('layout.gridCm')}</span><input type="number" min="5" value={area.gridCm ?? 30} onchange={(e) => editArea((a) => (a.gridCm = Number(e.currentTarget.value) || 30))} /></label>
          {/if}
          {#if area.kind === 'container'}
            <label class="field"><span>{t('layout.volume')}</span><input type="number" min="1" value={area.volumeL ?? ''} onchange={(e) => editArea((a) => (a.volumeL = Number(e.currentTarget.value) || undefined))} /></label>
          {/if}
          <label class="check"><input type="checkbox" checked={!!area.perennial} onchange={(e) => editArea((a) => (a.perennial = e.currentTarget.checked || undefined))} />{t('layout.perennial')}</label>
          {#if area.perennial}
            <label class="field"><span>{t('layout.fill')}</span>
              <select value={area.fill ?? 'fruit'} onchange={(e) => editArea((a) => (a.fill = e.currentTarget.value as Category))}>
                {#each CATS as c}<option value={c}>{t(`cat.${c}`)}</option>{/each}
              </select></label>
          {/if}
          <div class="grid2">
            <label class="field"><span>{t('layout.from')}</span><input type="date" value={area.fromDate ?? ''} onchange={(e) => editArea((a) => (a.fromDate = e.currentTarget.value || undefined))} /></label>
            <label class="field"><span>{t('layout.until')}</span><input type="date" value={area.toDate ?? ''} onchange={(e) => editArea((a) => (a.toDate = e.currentTarget.value || undefined))} /></label>
          </div>
          <p class="help small muted">{t('layout.fromHelp')}</p>

          {#if area.kind === 'bed' && !children.length && !shaped}
            <div class="row">
              <input type="number" min="2" max="12" bind:value={splitCount} style="width:5em" aria-label={t('layout.sectionCount')} />
              <button class="btn small" onclick={splitSections}>{t('layout.splitButton')}</button>
            </div>
          {/if}
          {#if (area.kind === 'section' || area.kind === 'bed') && !children.length && !shaped}
            <div class="row">
              <input type="number" min="2" max="40" bind:value={rowCount} style="width:5em" aria-label={t('layout.rowCount')} />
              <button class="btn small" onclick={makeRows}>{t('layout.rowsButton')}</button>
            </div>
          {/if}

          <div class="calc">
            <span class="mono-label">{t('layout.calc')}</span>
            <div class="row">
              <input type="number" min="5" bind:value={spacingCalc} style="width:5em" aria-label={t('layout.calcSpacing')} /> <span>cm</span>
              {#if fit}<strong>{t('layout.calcResult', { across: fit.across, along: fit.along, total: fit.total })}</strong>{/if}
              {#if shapeFit}<strong>{t('layout.calcShape', { total: shapeFit })}</strong>{/if}
            </div>
          </div>

          <div class="row">
            <button class="btn small" onclick={() => app.go('plantings', `new:${area.id}`)}>{t('area.addPlanting')}</button>
            <button class="btn small quiet" onclick={duplicate}>{t('layout.duplicate')}</button>
            <button class="btn small quiet danger" onclick={removeSelected}>{t('layout.delete')}</button>
          </div>
        </section>
      {:else if feature}
        <section class="stack">
          <p class="eyebrow">{t(`feature.${feature.type}`)}</p>
          <label class="field"><span>{t('layout.label')}</span><input value={feature.label} onchange={(e) => editFeature((f) => (f.label = e.currentTarget.value))} /></label>
          <label class="field"><span>{t('layout.featureType')}</span>
            <select value={feature.type} onchange={(e) => editFeature((f) => (f.type = e.currentTarget.value as FeatureType))}>
              {#each FEATURES as f}<option value={f}>{t(`feature.${f}`)}</option>{/each}
            </select></label>
          {#if feature.shape.line}
            <label class="field"><span>{t('layout.side')}</span>
              <select value={feature.side ?? ''} onchange={(e) => editFeature((f) => (f.side = (e.currentTarget.value || undefined) as Direction))}>
                <option value="">{t('layout.sideNone')}</option>
                {#each ['N', 'E', 'S', 'W'] as d}<option value={d}>{t(`dir.long.${d}`)}</option>{/each}
              </select>
              <span class="help">{t('layout.sideHelp')}</span></label>
          {:else}
            {@const [x, y, w, h] = rectOf(feature)}
            <div class="grid4">
              {#each [['x', x], ['y', y], ['w', w], ['h', h]] as [k, v], i}
                <label class="field"><span>{t(`layout.${k}`)}</span><input type="number" step="0.01" min="0" value={v} onchange={(e) => setRect(i, Number(e.currentTarget.value))} /></label>
              {/each}
            </div>
          {/if}
          {#if feature.type === 'water'}
            <label class="field"><span>{t('layout.capacityL')}</span><input type="number" min="0" value={(feature.props?.capacityL as number) ?? ''} onchange={(e) => editFeature((f) => (f.props = { ...f.props, capacityL: Number(e.currentTarget.value) || undefined }))} /></label>
          {/if}
          <div class="grid2">
            <label class="field"><span>{t('layout.from')}</span><input type="date" value={feature.fromDate ?? ''} onchange={(e) => editFeature((f) => (f.fromDate = e.currentTarget.value || undefined))} /></label>
            <label class="field"><span>{t('layout.until')}</span><input type="date" value={feature.toDate ?? ''} onchange={(e) => editFeature((f) => (f.toDate = e.currentTarget.value || undefined))} /></label>
          </div>
          <button class="btn small quiet danger" onclick={removeSelected}>{t('layout.delete')}</button>
        </section>
      {:else}
        <section class="stack">
          <p class="eyebrow">{t('layout.plot')}</p>
          <label class="field"><span>{t('settings.plotName')}</span><input value={plot.name} onchange={(e) => editPlot((p) => (p.name = e.currentTarget.value))} /></label>
          <label class="field"><span>{t('settings.plotType')}</span>
            <select value={plot.type} onchange={(e) => editPlot((p) => (p.type = e.currentTarget.value as PlotType))}>
              {#each ['allotment', 'garden', 'raised-beds', 'greenhouse', 'containers', 'field'] as ty}<option value={ty}>{t(`plotType.${ty}`)}</option>{/each}
            </select></label>
          <div class="grid2">
            <label class="field"><span>{t('settings.width')}</span><input type="number" min="0.5" step="0.1" value={plot.widthM} onchange={(e) => editPlot((p) => (p.widthM = Math.max(0.5, Number(e.currentTarget.value) || p.widthM)))} /></label>
            <label class="field"><span>{t('settings.length')}</span><input type="number" min="0.5" step="0.1" value={plot.lengthM} onchange={(e) => editPlot((p) => (p.lengthM = Math.max(0.5, Number(e.currentTarget.value) || p.lengthM)))} /></label>
          </div>
          <label class="field"><span>{t('settings.top')}</span>
            <select value={plot.topDirection} onchange={(e) => editPlot((p) => (p.topDirection = e.currentTarget.value as Direction))}>
              {#each ['N', 'E', 'S', 'W'] as d}<option value={d}>{t(`dir.long.${d}`)}</option>{/each}
            </select>
            <span class="help">{t('settings.topHelp')}</span></label>
          <div class="grid2">
            <label class="field"><span>{t('layout.plotStart')}</span><input type="date" value={plot.startDate ?? ''} onchange={(e) => editPlot((p) => (p.startDate = e.currentTarget.value || undefined))} /></label>
            <label class="field"><span>{t('layout.plotEnd')}</span><input type="date" value={plot.endDate ?? ''} onchange={(e) => editPlot((p) => (p.endDate = e.currentTarget.value || undefined))} /></label>
          </div>
          <p class="help small muted">{t('layout.plotEndHelp')}</p>
          <label class="field"><span>{t('pe.notes')}</span><textarea value={plot.notes ?? ''} onchange={(e) => editPlot((p) => (p.notes = e.currentTarget.value))}></textarea></label>
          <p class="small muted">{t('layout.selectHint')}</p>
        </section>
      {/if}
    </aside>
  </div>
</div>

<style>
  .layout-view { display: grid; gap: 16px; }
  .cols { display: grid; grid-template-columns: minmax(0, 460px) minmax(0, 1fr); gap: 28px; align-items: start; }
  .canvas { position: sticky; top: 12px; touch-action: none; }
  .canvas-help { margin-top: 8px; justify-content: space-between; }
  .props { min-width: 0; }
  .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .add-feature select { width: auto; }
  .linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-decoration: underline; }
  .calc { border-top: 1px solid var(--line); padding-top: 10px; display: grid; gap: 6px; }
  :global(.mid) { fill: var(--accent); opacity: 0.55; cursor: copy; }
  :global(.mid:hover) { opacity: 1; }
  :global(.handle) { fill: var(--surface); stroke: var(--accent); stroke-width: 2; cursor: pointer; touch-action: none; }
  :global(.handle.n), :global(.handle.s) { cursor: ns-resize; }
  :global(.handle.e), :global(.handle.w) { cursor: ew-resize; }
  :global(.handle.nw), :global(.handle.se) { cursor: nwse-resize; }
  :global(.handle.ne), :global(.handle.sw) { cursor: nesw-resize; }
  @media (max-width: 760px) {
    .cols { grid-template-columns: minmax(0, 1fr); }
    .canvas { position: static; }
  }
</style>
