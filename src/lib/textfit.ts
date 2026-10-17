// Fit labels inside plan areas by measuring real text, not estimating.
// Order of give: drop detail lines, then use the shorter label, then the tiny one.

let ctx: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();

export function measure(text: string, font: string): number {
  const key = font + '|' + text;
  const hit = cache.get(key);
  if (hit != null) return hit;
  if (ctx === undefined) ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  let w: number;
  if (ctx) {
    ctx.font = font;
    w = ctx.measureText(text).width;
  } else {
    // No canvas (tests): a conservative average character width.
    const size = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '12');
    w = text.length * size * 0.56;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(key, w);
  return w;
}

/** Forget measurements, e.g. once web fonts finish loading. */
export function resetMeasurements(): void {
  cache.clear();
}

/** Greedy word wrap. Returns null if a single word is wider than the box. */
export function wrap(text: string, font: string, width: number): string[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (measure(w, font) > width) return null;
    const next = line ? `${line} ${w}` : w;
    if (measure(next, font) <= width) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface FitStyle {
  labelFont: string;
  labelLine: number;
  detailFont: string;
  detailLine: number;
}

export interface FitLine { text: string; kind: 'label' | 'detail' | 'draft' }

/**
 * Lay out a label block in a box. `labels` goes from the fullest label to the
 * shortest; the first that fits wins. `draft` is always kept if anything fits,
 * so drafts are never shown by colour alone.
 */
export function fitBlock(
  labels: string[],
  details: string[],
  draft: string | null,
  width: number,
  height: number,
  style: FitStyle,
  maxDetailLines = 2,
): FitLine[] {
  if (width <= 4 || height <= 4) return [];
  const draftLines: FitLine[] = draft ? [{ text: draft, kind: 'draft' }] : [];
  for (const label of labels) {
    const lw = wrap(label, style.labelFont, width);
    if (!lw) continue;
    const labelLines: FitLine[] = lw.map((text) => ({ text, kind: 'label' }));
    // Detail lines, wrapped, up to the limit, dropping from the end.
    const detailLines: FitLine[] = [];
    for (const d of details) {
      const dw = wrap(d, style.detailFont, width);
      if (!dw) continue;
      for (const text of dw) if (detailLines.length < maxDetailLines) detailLines.push({ text, kind: 'detail' });
    }
    for (let keep = detailLines.length; keep >= 0; keep--) {
      const lines = [...labelLines, ...detailLines.slice(0, keep), ...draftLines];
      if (blockHeight(lines, style) <= height) return lines;
    }
    if (blockHeight(labelLines, style) <= height) return labelLines;
  }
  return [];
}

export function blockHeight(lines: FitLine[], style: FitStyle): number {
  return lines.reduce((h, l) => h + (l.kind === 'label' ? style.labelLine : style.detailLine), 0);
}
