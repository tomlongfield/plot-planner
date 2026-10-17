// Importing a seed list from any spreadsheet. Pure functions: guess which column
// is which, match crop names to the library, parse dates, and list suggestions.
// The caller shows all of this and changes nothing until the grower accepts.

import { parseLooseDate } from './dates';
import { cropName, matchCrop, varietiesOf, type Library } from './library';
import type { StockKind, StockLot, StockSource, StockStatus } from './types';

export type Field =
  | 'crop' | 'variety' | 'supplier' | 'source' | 'acquired' | 'useBy' | 'quantity' | 'status' | 'organic'
  | 'storage' | 'notes' | 'family' | 'link' | 'kind' | 'ignore';

export const FIELDS: Field[] = ['crop', 'variety', 'supplier', 'source', 'acquired', 'useBy', 'quantity', 'status', 'organic', 'storage', 'family', 'kind', 'link', 'notes', 'ignore'];

const SYNONYMS: Record<Exclude<Field, 'ignore'>, string[]> = {
  crop: ['crop', 'vegetable', 'veg', 'plant', 'type', 'what', 'name', 'seed', 'common name', 'kind of plant'],
  variety: ['variety', 'cultivar', 'cv', 'var', 'strain', 'name of variety'],
  supplier: ['supplier', 'company', 'shop', 'seller', 'bought from', 'vendor', 'brand', 'where from', 'from'],
  source: ['source', 'origin', 'how got', 'got from', 'acquired how', 'bought or saved'],
  acquired: ['date', 'bought', 'purchased', 'purchase date', 'acquired', 'date bought', 'harvested', 'saved', 'year', 'when', 'packed', 'packed for'],
  useBy: ['use by', 'sow by', 'best before', 'expiry', 'expires', 'exp', 'bbe', 'sow before'],
  quantity: ['quantity', 'qty', 'amount', 'how many', 'count', 'seeds', 'weight', 'grams', 'packets', 'left'],
  status: ['status', 'stock', 'remaining', 'have', 'level'],
  organic: ['organic', 'org', 'certified organic'],
  storage: ['storage', 'location', 'box', 'tin', 'where kept', 'stored', 'shelf'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks', 'details'],
  family: ['family', 'fam', 'botanical family', 'plant family'],
  link: ['link', 'url', 'website', 'web'],
  kind: ['form', 'stock type', 'seed or plant', 'unit type'],
};

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Guess a field for each column from its header (and, as a tiebreak, its values). */
export function guessMapping(header: string[], sample: string[][] = []): Field[] {
  const used = new Set<Field>();
  const scores = header.map((h) => {
    const n = normHeader(h);
    const best: { f: Field; s: number }[] = [];
    for (const [f, syns] of Object.entries(SYNONYMS) as [Field, string[]][]) {
      let s = 0;
      for (const syn of syns) {
        if (n === syn) s = Math.max(s, 3);
        else if (n.split(' ').includes(syn) || (syn.includes(' ') && n.includes(syn))) s = Math.max(s, 2);
        else if (n.startsWith(syn) && syn.length > 3) s = Math.max(s, 1);
      }
      if (s) best.push({ f, s });
    }
    return best.sort((a, b) => b.s - a.s);
  });
  const out: Field[] = header.map(() => 'ignore');
  // Assign strongest matches first so "Variety name" beats "name" for crop.
  const order = scores.flatMap((list, col) => list.map((x) => ({ ...x, col }))).sort((a, b) => b.s - a.s);
  for (const { f, col } of order) {
    if (out[col] !== 'ignore' || used.has(f)) continue;
    out[col] = f;
    used.add(f);
  }
  // A column of mostly dates with no header match is probably when they were acquired.
  header.forEach((_, col) => {
    if (out[col] !== 'ignore' || used.has('acquired')) return;
    const vals = sample.map((r) => r[col]).filter(Boolean);
    if (vals.length && vals.filter((v) => parseLooseDate(v)).length / vals.length > 0.6) { out[col] = 'acquired'; used.add('acquired'); }
  });
  return out;
}

export type IssueKind = 'unmatched' | 'typo' | 'family' | 'duplicate' | 'dateText' | 'badDate' | 'newVariety';

export interface Issue {
  kind: IssueKind;
  params: Record<string, string | number>;
}

export interface ImportRow {
  index: number;
  raw: Record<Field, string>;
  cropId?: string;
  /** An existing library variety, if the name matched one. */
  varietyId?: string;
  /** A new variety the grower will add, if no existing one matched. */
  newVarietyName?: string;
  lot: Omit<StockLot, 'id' | 'varietyId'>;
  issues: Issue[];
  include: boolean;
}

function pick(row: string[], mapping: Field[]): Record<Field, string> {
  const out = {} as Record<Field, string>;
  for (const f of FIELDS) out[f] = '';
  mapping.forEach((f, i) => {
    if (f !== 'ignore' && row[i] != null && row[i] !== '') out[f] = out[f] ? `${out[f]} ${row[i]}` : row[i];
  });
  return out;
}

function parseSource(s: string): StockSource | undefined {
  const n = s.toLowerCase();
  if (/gift|given|free|present/.test(n)) return 'gift';
  if (/swap|exchange|library/.test(n)) return 'swap';
  if (/saved|own|home|harvested/.test(n)) return 'saved';
  if (/bought|purchase|shop|order/.test(n)) return 'bought';
  return undefined;
}

function parseQuantity(s: string): { quantity?: number; unit?: string; status?: StockStatus } {
  const n = s.toLowerCase().trim();
  if (!n) return {};
  if (/^(none|used( up)?|empty|finished|0|gone|out)$/.test(n)) return { status: 'used' };
  if (/^(low|few|some|half|nearly out|running low)$/.test(n)) return { status: 'low' };
  if (/^(plenty|lots|loads|full|yes|ok|good|many)$/.test(n)) return { status: 'plenty' };
  const m = n.match(/^~?\s*(\d+(?:[.,]\d+)?)\s*([a-z]*)/);
  if (m) {
    const q = Number(m[1].replace(',', '.'));
    const u = m[2];
    const unit = /^g|gram/.test(u) ? 'g' : /^(pk|pack|packet)/.test(u) ? 'packets' : /^(bulb)/.test(u) ? 'bulbs' : u ? u : 'seeds';
    return { quantity: q, unit, status: q === 0 ? 'used' : 'plenty' };
  }
  return {};
}

function parseKind(s: string, cropId?: string): StockKind {
  const n = s.toLowerCase();
  if (/clove/.test(n)) return 'clove';
  if (/bulb/.test(n)) return 'bulb';
  if (/\bsets?\b/.test(n)) return 'set';
  if (/tuber|seed potato/.test(n)) return 'tuber';
  if (/crown/.test(n)) return 'crown';
  if (/plug|plant/.test(n)) return 'plant';
  if (/cutting|runner/.test(n)) return 'cutting';
  if (cropId === 'garlic') return 'clove';
  if (cropId === 'potato') return 'tuber';
  if (cropId === 'asparagus' || cropId === 'rhubarb') return 'crown';
  return 'seed';
}

const TRUE = /^(y|yes|true|1|x|✓|organic)$/i;

export function buildRows(rows: string[][], mapping: Field[], lib: Library, existing: StockLot[] = [], order: 'dmy' | 'mdy' = 'dmy'): ImportRow[] {
  const seen = new Map<string, number>();
  return rows.map((row, index) => {
    const raw = pick(row, mapping);
    const issues: Issue[] = [];
    const cropText = raw.crop || raw.variety;
    const m = cropText ? matchCrop(lib, cropText, raw.crop ? raw.variety : undefined) : undefined;
    let cropId: string | undefined;
    let varietyId: string | undefined;
    let newVarietyName: string | undefined;
    if (!m) {
      if (cropText) issues.push({ kind: 'unmatched', params: { text: cropText } });
    } else {
      cropId = m.crop.id;
      // Check the crop text on its own too: a variety can match while the crop name is misspelt.
      const byName = raw.crop ? matchCrop(lib, raw.crop) : m;
      if (m.how === 'fuzzy' || (byName?.how === 'fuzzy' && byName.crop.id === m.crop.id))
        issues.push({ kind: 'typo', params: { text: raw.crop || cropText, crop: cropName(m.crop) } });
      if (m.variety) varietyId = m.variety.id;
      else if (raw.variety) {
        newVarietyName = raw.variety;
        issues.push({ kind: 'newVariety', params: { name: raw.variety, crop: cropName(m.crop) } });
      } else varietyId = varietiesOf(lib, m.crop.id)[0]?.id;
      if (raw.family && m.crop.family && raw.family.trim().toLowerCase() !== m.crop.family.toLowerCase())
        issues.push({ kind: 'family', params: { given: raw.family, family: m.crop.family, crop: cropName(m.crop) } });
    }

    let source = parseSource(raw.source) ?? (raw.supplier ? 'bought' : undefined);
    const acquired = parseLooseDate(raw.acquired, order);
    if (raw.acquired && !acquired) {
      // Text like "Gift" in a date column says how, not when.
      const s = parseSource(raw.acquired);
      if (s) { source = source ?? s; issues.push({ kind: 'dateText', params: { text: raw.acquired, source: s } }); }
      else issues.push({ kind: 'badDate', params: { text: raw.acquired } });
    }
    const useBy = parseLooseDate(raw.useBy, order);
    if (raw.useBy && !useBy) issues.push({ kind: 'badDate', params: { text: raw.useBy } });
    const q = parseQuantity(raw.quantity || raw.status);
    const statusFromCol = raw.status ? parseQuantity(raw.status).status : undefined;

    const lot: ImportRow['lot'] = {
      kind: parseKind(`${raw.kind} ${raw.quantity}`, cropId),
      source: source ?? 'unknown',
      supplier: raw.supplier || undefined,
      organic: raw.organic ? TRUE.test(raw.organic.trim()) : undefined,
      acquired,
      useBy,
      storage: raw.storage || undefined,
      quantity: q.quantity,
      unit: q.unit,
      status: statusFromCol ?? q.status ?? 'plenty',
      link: raw.link || undefined,
      germTests: [],
      notes: raw.notes || undefined,
    };

    // Duplicates: same variety, supplier and date, in the file or already stored.
    const key = `${varietyId ?? `${cropId}:${(newVarietyName ?? '').toLowerCase()}`}|${(lot.supplier ?? '').toLowerCase()}|${lot.acquired ?? ''}`;
    if (cropId) {
      if (seen.has(key)) issues.push({ kind: 'duplicate', params: { row: seen.get(key)! + 2 } });
      else if (varietyId && existing.some((e) => e.varietyId === varietyId && (e.supplier ?? '').toLowerCase() === (lot.supplier ?? '').toLowerCase() && (e.acquired ?? '') === (lot.acquired ?? '')))
        issues.push({ kind: 'duplicate', params: { row: 0 } });
      else seen.set(key, index);
    }
    const include = !!cropId && !issues.some((i) => i.kind === 'duplicate');
    return { index, raw, cropId, varietyId, newVarietyName, lot, issues, include };
  });
}

/** Whether a header row looks like headers rather than data. */
export function looksLikeHeader(row: string[]): boolean {
  return row.filter((c) => c && !parseLooseDate(c) && !/^\d+([.,]\d+)?$/.test(c)).length >= Math.ceil(row.length / 2);
}
