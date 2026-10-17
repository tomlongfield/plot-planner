// Geometry for shaped (polygon) beds: point-in-polygon, the largest upright
// rectangle inside a shape (for fitting labels), and plant positions inside it.

import type { Point, Rect } from './types';

export function pointInPolygon([x, y]: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function bbox(poly: Point[]): Rect {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
}

/**
 * The largest axis-aligned rectangle inside a polygon, found on an n × n grid
 * over its bounding box: a cell counts if all four corners are inside, then the
 * classic largest-rectangle-in-a-histogram pass finds the biggest block.
 */
export function interiorRect(poly: Point[], n = 24): Rect {
  const [bx, by, bw, bh] = bbox(poly);
  if (poly.length < 3 || bw <= 0 || bh <= 0) return [bx, by, bw, bh];
  const cw = bw / n;
  const ch = bh / n;
  const corner = new Map<string, boolean>();
  const inside = (i: number, j: number) => {
    const k = `${i},${j}`;
    let v = corner.get(k);
    if (v === undefined) {
      // Nudge corners inward a hair so points on the outline count as inside.
      const px = bx + i * cw + (i === 0 ? 1e-6 : i === n ? -1e-6 : 0);
      const py = by + j * ch + (j === 0 ? 1e-6 : j === n ? -1e-6 : 0);
      v = pointInPolygon([px, py], poly);
      corner.set(k, v);
    }
    return v;
  };
  const heights = Array(n).fill(0);
  let best = { area: 0, rect: [bx, by, 0, 0] as Rect };
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const ok = inside(col, row) && inside(col + 1, row) && inside(col, row + 1) && inside(col + 1, row + 1);
      heights[col] = ok ? heights[col] + 1 : 0;
    }
    // Largest rectangle in this row's histogram.
    const stack: number[] = [];
    for (let col = 0; col <= n; col++) {
      const h = col < n ? heights[col] : 0;
      while (stack.length && heights[stack[stack.length - 1]] >= h) {
        const top = stack.pop()!;
        const height = heights[top];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const width = col - left;
        const area = width * cw * height * ch;
        if (area > best.area) best = { area, rect: [bx + left * cw, by + (row - height + 1) * ch, width * cw, height * ch] };
      }
      stack.push(col);
    }
  }
  return best.rect;
}

/** How many plants fit at a square spacing inside a polygon (positions on a grid offset half a spacing). */
export function polygonFit(poly: Point[], spacingM: number): number {
  const [x, y, w, h] = bbox(poly);
  if (spacingM <= 0) return 0;
  let n = 0;
  for (let px = x + spacingM / 2; px < x + w; px += spacingM)
    for (let py = y + spacingM / 2; py < y + h; py += spacingM) if (pointInPolygon([px, py], poly)) n++;
  return Math.max(n, 1);
}
