// Harvest totals and yields from journal entries.

import { areaM2 } from './capacity';
import type { Area, Crop, Entry, Planting } from './types';

export interface Total { key: string; grams: number; count: number; entries: number }

function add(map: Map<string, Total>, key: string, e: Entry) {
  const t = map.get(key) ?? { key, grams: 0, count: 0, entries: 0 };
  t.grams += e.grams ?? 0;
  t.count += e.count ?? 0;
  t.entries++;
  map.set(key, t);
}

export interface HarvestTotals {
  byCrop: Total[];
  byPlot: Total[];
  byYear: Total[];
  /** Grams per square metre for each planting with a known area. */
  yieldByPlanting: { plantingId: string; grams: number; m2: number; perM2: number }[];
}

export function harvestTotals(
  entries: Entry[],
  plantings: Map<string, Planting>,
  areas: Map<string, Area>,
  cropOf: (p: Planting) => Crop | undefined,
  filter: { year?: string; plotId?: string } = {},
): HarvestTotals {
  const byCrop = new Map<string, Total>();
  const byPlot = new Map<string, Total>();
  const byYear = new Map<string, Total>();
  const byPlanting = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== 'harvest') continue;
    const p = e.plantingId ? plantings.get(e.plantingId) : undefined;
    const plotId = e.plotId ?? p?.plotId;
    if (filter.plotId && plotId !== filter.plotId) continue;
    if (filter.year && !e.date.startsWith(filter.year)) continue;
    add(byYear, e.date.slice(0, 4), e);
    if (plotId) add(byPlot, plotId, e);
    const crop = p ? cropOf(p) : undefined;
    add(byCrop, crop?.id ?? 'other', e);
    if (p && e.grams) byPlanting.set(p.id, (byPlanting.get(p.id) ?? 0) + e.grams);
  }
  const sort = (m: Map<string, Total>) => [...m.values()].sort((a, b) => b.grams - a.grams || b.count - a.count);
  const yieldByPlanting = [...byPlanting.entries()].flatMap(([plantingId, grams]) => {
    const p = plantings.get(plantingId)!;
    const a = areas.get(p.areaId);
    if (!a) return [];
    let m2 = areaM2(a);
    if (a.kind === 'rows' && a.rows && p.rows?.length) m2 = (m2 * p.rows.length) / a.rows;
    return m2 > 0 ? [{ plantingId, grams, m2, perM2: grams / m2 }] : [];
  });
  return { byCrop: sort(byCrop), byPlot: sort(byPlot), byYear: [...byYear.values()].sort((a, b) => b.key.localeCompare(a.key)), yieldByPlanting };
}

/** Shrink a photo to at most `max` pixels on its longest side, as a JPEG data URL. */
export async function shrinkPhoto(file: File, max = 1280, quality = 0.8): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}
