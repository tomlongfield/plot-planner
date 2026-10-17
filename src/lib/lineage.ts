// Seed lineage: a saved seed lot comes from a planting, which was grown from a
// lot, which may itself have been saved from an earlier planting, and so on.

import type { Entry, Planting, StockLot } from './types';

export interface Generation {
  lot: StockLot;
  /** The planting this lot was saved from, if recorded. */
  from?: Planting;
}

/** Follow a lot back through the plantings it was saved from, oldest last. */
export function lineage(lotId: string, stock: StockLot[], plantings: Planting[], max = 30): Generation[] {
  const lots = new Map(stock.map((s) => [s.id, s]));
  const byId = new Map(plantings.map((p) => [p.id, p]));
  const out: Generation[] = [];
  const seen = new Set<string>();
  let lot = lots.get(lotId);
  while (lot && !seen.has(lot.id) && out.length < max) {
    seen.add(lot.id);
    const from = lot.parentPlantingId ? byId.get(lot.parentPlantingId) : undefined;
    out.push({ lot, from });
    lot = from?.stockLotId ? lots.get(from.stockLotId) : undefined;
  }
  return out;
}

/** Lots saved from a planting's descendants: the generations that came after a lot. */
export function descendants(lotId: string, stock: StockLot[], plantings: Planting[]): StockLot[] {
  const out: StockLot[] = [];
  const seen = new Set([lotId]);
  let frontier = [lotId];
  while (frontier.length) {
    const grown = plantings.filter((p) => p.stockLotId && frontier.includes(p.stockLotId)).map((p) => p.id);
    const next = stock.filter((s) => s.parentPlantingId && grown.includes(s.parentPlantingId) && !seen.has(s.id));
    for (const s of next) seen.add(s.id);
    out.push(...next);
    frontier = next.map((s) => s.id);
  }
  return out;
}

/** Notes from earlier season reviews about a crop, newest first. */
export function reviewNotesFor(cropId: string, entries: Entry[]): { season: number; note: string }[] {
  const out: { season: number; note: string }[] = [];
  for (const e of entries) {
    if (e.kind !== 'review' || !e.review) continue;
    for (const n of e.review.next) if (n.cropId === cropId && n.note.trim()) out.push({ season: e.review.season, note: n.note });
  }
  return out.sort((a, b) => b.season - a.season);
}
