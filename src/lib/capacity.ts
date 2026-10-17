// Area maths: sizes, and how many plants fit at a spacing.

import type { Area, Crop, Planting, Rect } from './types';

export function rectOf(a: { shape: { rect?: Rect; polygon?: [number, number][] } }): Rect {
  if (a.shape.rect) return a.shape.rect;
  const pts = a.shape.polygon ?? [];
  if (!pts.length) return [0, 0, 0, 0];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
}

export function areaM2(a: Area): number {
  if (a.shape.polygon?.length) {
    const p = a.shape.polygon;
    let s = 0;
    for (let i = 0; i < p.length; i++) {
      const [x1, y1] = p[i];
      const [x2, y2] = p[(i + 1) % p.length];
      s += x1 * y2 - x2 * y1;
    }
    return Math.abs(s) / 2;
  }
  const [, , w, h] = rectOf(a);
  return w * h;
}

/**
 * Plants along one side at a spacing. Each plant gets a spacing-sized square;
 * a partial square counts if at least half of it fits, because plants at the
 * edge can lean over a path a little.
 */
export function alongSide(lengthM: number, spacingCm: number): number {
  if (spacingCm <= 0) return 0;
  return Math.max(1, Math.floor((lengthM * 100) / spacingCm + 0.5));
}

/** Plants or clumps that fit in a w × h area at a square spacing. 1.0 × 1.1 m at 30 cm → 3 × 4 = 12. */
export function gridFit(widthM: number, lengthM: number, spacingCm: number): { across: number; along: number; total: number } {
  const across = alongSide(widthM, spacingCm);
  const along = alongSide(lengthM, spacingCm);
  return { across, along, total: across * along };
}

/** Plants that fit with separate in-row and between-row spacings. */
export function rowFit(widthM: number, lengthM: number, inRowCm: number, betweenRowsCm: number): { rows: number; perRow: number; total: number } {
  const rows = alongSide(widthM, betweenRowsCm);
  const perRow = alongSide(lengthM, inRowCm);
  return { rows, perRow, total: rows * perRow };
}

/** The part of an area a planting can use, allowing for chosen rows. */
export function usableSize(area: Area, rows?: number[]): { widthM: number; lengthM: number; rowCount?: number } {
  const [, , w, h] = rectOf(area);
  if (area.kind === 'rows' && area.rows && rows?.length) {
    const axisX = (area.rowsAxis ?? 'x') === 'x';
    const rowW = (axisX ? w : h) / area.rows;
    return { widthM: rowW * rows.length, lengthM: axisX ? h : w, rowCount: rows.length };
  }
  return { widthM: w, lengthM: h };
}

export function spacingFor(p: Pick<Planting, 'spacingCm'>, crop?: Crop): number | undefined {
  return p.spacingCm ?? crop?.spacing?.gridCm ?? crop?.spacing?.inRowCm;
}

export interface CapacityResult {
  fits: number;
  needed: number;
  unit: string;
  ok: boolean;
  /** How the number was worked out, for showing to the grower. */
  working: string;
}

/** How many of a planting's units fit in its area, and whether the quantity asked for does. */
export function capacityFor(p: Planting, area: Area, crop?: Crop): CapacityResult | undefined {
  if (p.qty == null) return undefined;
  const unit = p.qtyUnit ?? 'plants';
  const { widthM, lengthM, rowCount } = usableSize(area, p.rows);

  if (unit === 'metres') {
    const between = crop?.spacing?.betweenRowsCm ?? 30;
    const rows = rowCount ?? alongSide(widthM, between);
    const metres = Math.round(rows * lengthM * 10) / 10;
    return { fits: metres, needed: p.qty, unit, ok: p.qty <= metres + 1e-9, working: `${rows} rows × ${fmt(lengthM)} m` };
  }
  if (unit === 'seeds') return undefined;

  const spacing = spacingFor(p, crop);
  if (!spacing) return undefined;

  if (rowCount) {
    // Single rows: one line of plants per chosen row.
    const perRow = alongSide(lengthM, p.spacingCm ?? crop?.spacing?.inRowCm ?? spacing);
    const fits = perRow * rowCount;
    return { fits, needed: p.qty, unit, ok: p.qty <= fits, working: `${rowCount} rows × ${perRow}` };
  }
  if (!p.spacingCm && crop?.spacing?.inRowCm && crop.spacing.betweenRowsCm && !crop.spacing.gridCm) {
    const r = rowFit(widthM, lengthM, crop.spacing.inRowCm, crop.spacing.betweenRowsCm);
    return { fits: r.total, needed: p.qty, unit, ok: p.qty <= r.total, working: `${r.rows} rows × ${r.perRow}` };
  }
  const g = gridFit(widthM, lengthM, spacing);
  return { fits: g.total, needed: p.qty, unit, ok: p.qty <= g.total, working: `${g.across} × ${g.along} at ${spacing} cm` };
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Centre of an area, in metres. */
export function centre(a: Area): [number, number] {
  const [x, y, w, h] = rectOf(a);
  return [x + w / 2, y + h / 2];
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  const eps = 1e-6;
  return a[0] < b[0] + b[2] - eps && b[0] < a[0] + a[2] - eps && a[1] < b[1] + b[3] - eps && b[1] < a[1] + a[3] - eps;
}

/** Areas that share ground with an area: its ancestors, its descendants and anything overlapping it. */
export function relatedAreas(areaId: string, areas: Area[]): Set<string> {
  const byId = new Map(areas.map((a) => [a.id, a]));
  const out = new Set<string>([areaId]);
  const a = byId.get(areaId);
  if (!a) return out;
  for (let p = a.parentId; p; p = byId.get(p)?.parentId) out.add(p);
  const addKids = (id: string) => {
    for (const c of areas) if (c.parentId === id && !out.has(c.id)) { out.add(c.id); addKids(c.id); }
  };
  addKids(areaId);
  const r = rectOf(a);
  for (const b of areas) if (b.plotId === a.plotId && !out.has(b.id) && rectsOverlap(r, rectOf(b))) {
    // Overlap between unrelated areas counts only if neither contains the other as family.
    out.add(b.id);
  }
  return out;
}
