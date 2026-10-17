// The crop library: bundled crop files, with the user's own crops and edits layered on top.

import type { Crop, Variety } from './types';

export interface Library {
  crops: Map<string, Crop>;
  varieties: Map<string, Variety>;
}

/** Bundled crops, loaded from /crops/*.json at build time. */
export function bundledCrops(): Crop[] {
  const mods = import.meta.glob<Crop>('../../crops/*.json', { eager: true, import: 'default' });
  return Object.values(mods).sort((a, b) => cropName(a).localeCompare(cropName(b)));
}

/**
 * Build the working library. User overrides replace bundled crops field by field,
 * so a library update never wipes a user's edit, and user varieties are added alongside.
 */
export function buildLibrary(bundled: Crop[], overrides: Crop[], userVarieties: Variety[]): Library {
  const crops = new Map<string, Crop>();
  for (const c of bundled) crops.set(c.id, c);
  for (const o of overrides) {
    const base = crops.get(o.id);
    crops.set(o.id, base ? { ...base, ...o, varieties: base.varieties } : o);
  }
  const varieties = new Map<string, Variety>();
  for (const c of crops.values()) for (const v of c.varieties ?? []) varieties.set(v.id, v);
  for (const v of userVarieties) varieties.set(v.id, v);
  return { crops, varieties };
}

export function cropName(c: Crop, locale = 'en'): string {
  const lang = locale.split('-')[0];
  return c.names[locale]?.[0] ?? c.names[lang]?.[0] ?? c.names.en?.[0] ?? c.id;
}

/** A crop with a variety's overrides applied. */
export function cropForVariety(lib: Library, varietyId: string): Crop | undefined {
  const v = lib.varieties.get(varietyId);
  if (!v) return undefined;
  const c = lib.crops.get(v.cropId);
  if (!c) return undefined;
  return v.overrides ? { ...c, ...v.overrides, id: c.id, varieties: c.varieties } : c;
}

export function varietiesOf(lib: Library, cropId: string): Variety[] {
  return [...lib.varieties.values()].filter((v) => v.cropId === cropId);
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(seeds?|plants?|f1|organic|mix)\b/g, ' ')
    .replace(/(ies)\b/g, 'y')
    .replace(/([^s])s\b/g, '$1')
    .trim()
    .replace(/\s+/g, ' ');
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export interface CropMatch {
  crop: Crop;
  variety?: Variety;
  score: number; // 1 = exact
  how: 'variety' | 'name' | 'contains' | 'fuzzy';
}

/** Match free text such as "Dwarf French beans (Borlotti)" to the library. */
export function matchCrop(lib: Library, text: string, varietyText?: string): CropMatch | undefined {
  const q = norm(text);
  const vq = varietyText ? norm(varietyText) : '';
  if (!q && !vq) return undefined;
  let best: CropMatch | undefined;
  const consider = (m: CropMatch) => {
    if (!best || m.score > best.score) best = m;
  };

  for (const v of lib.varieties.values()) {
    const c = lib.crops.get(v.cropId);
    if (!c) continue;
    const vn = norm(v.name);
    if (vn && (vn === q || (vq && vn === vq) || (vq && vn === norm(`${text} ${varietyText}`))))
      consider({ crop: c, variety: v, score: 1, how: 'variety' });
  }
  for (const c of lib.crops.values()) {
    for (const names of Object.values(c.names)) {
      for (const n of names) {
        const nn = norm(n);
        if (!nn) continue;
        if (nn === q) consider({ crop: c, score: 0.95, how: 'name' });
        else if (q.split(' ').includes(nn) || (` ${q} `).includes(` ${nn} `)) consider({ crop: c, score: 0.8 + nn.length / 200, how: 'contains' });
        else {
          const d = editDistance(nn, q);
          const tol = nn.length <= 4 ? 0 : nn.length <= 7 ? 1 : 2;
          if (d <= tol) consider({ crop: c, score: 0.7 - d * 0.05, how: 'fuzzy' });
        }
      }
    }
  }
  if (best && !best.variety && vq) {
    const v = varietiesOf(lib, best.crop.id).find((x) => norm(x.name) === vq || norm(x.name).includes(vq));
    if (v) best = { ...best, variety: v };
  }
  return best;
}
