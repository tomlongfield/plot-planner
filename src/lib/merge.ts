// Merging two copies of the data, such as a phone and a laptop. There's no
// server and no shared history, so the merge is shown to the grower: what is
// only on the other device, only on this one, or different on both. They pick;
// nothing changes until they apply.

import type { Dataset } from './types';

export const MERGE_STORES = [
  'sites', 'plots', 'areas', 'features', 'plantings', 'tasks', 'taskStates', 'stock',
  'cropOverrides', 'varieties', 'propSpaces', 'reservations', 'entries',
] as const;
export type MergeStore = (typeof MERGE_STORES)[number];

type Rec = { id: string } & Record<string, unknown>;

export interface MergeItem {
  store: MergeStore;
  id: string;
  kind: 'theirs' | 'mine' | 'changed';
  mine?: Rec;
  theirs?: Rec;
  /** Top-level fields that differ, for "changed" items. */
  fields?: string[];
}

export type Choice = 'mine' | 'theirs';

/** Empty values (undefined, null, false, '', []) mean the same thing as a missing field. */
function blank(x: unknown): boolean {
  return x === undefined || x === null || x === false || x === '' || (Array.isArray(x) && x.length === 0);
}

function stable(v: unknown): string {
  if (blank(v)) return '';
  return JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).filter(([, y]) => !blank(y)).sort(([a], [b]) => a.localeCompare(b))) : x));
}

export function diffDatasets(mine: Dataset, theirs: Dataset): MergeItem[] {
  const out: MergeItem[] = [];
  for (const store of MERGE_STORES) {
    const a = new Map((mine[store] as unknown as Rec[]).map((r) => [r.id, r]));
    const b = new Map((theirs[store] as unknown as Rec[]).map((r) => [r.id, r]));
    for (const [id, t] of b) {
      const m = a.get(id);
      if (!m) out.push({ store, id, kind: 'theirs', theirs: t });
      else if (stable(m) !== stable(t)) {
        const keys = new Set([...Object.keys(m), ...Object.keys(t)]);
        const fields = [...keys].filter((k) => stable(m[k]) !== stable(t[k]));
        out.push({ store, id, kind: 'changed', mine: m, theirs: t, fields });
      }
    }
    for (const [id, m] of a) if (!b.has(id)) out.push({ store, id, kind: 'mine', mine: m });
  }
  return out;
}

/** What happens by default: add what's new from the other device, keep yours otherwise. */
export function defaultChoice(item: MergeItem): Choice {
  return item.kind === 'theirs' ? 'theirs' : 'mine';
}

const key = (i: Pick<MergeItem, 'store' | 'id'>) => `${i.store}:${i.id}`;

/**
 * Apply choices. For an item only on the other device, "theirs" adds it. For one
 * only on this device, "theirs" removes it (it was deleted there). For a changed
 * item, "theirs" takes their version.
 */
export function applyMerge(mine: Dataset, items: MergeItem[], choices: Map<string, Choice>): Dataset {
  const out = structuredClone(mine);
  for (const item of items) {
    const choice = choices.get(key(item)) ?? defaultChoice(item);
    if (choice === 'mine') continue;
    const list = out[item.store] as unknown as Rec[];
    const i = list.findIndex((r) => r.id === item.id);
    if (item.kind === 'theirs') list.push(structuredClone(item.theirs!));
    else if (item.kind === 'mine' && i >= 0) list.splice(i, 1);
    else if (item.kind === 'changed' && i >= 0) list[i] = structuredClone(item.theirs!);
  }
  return out;
}

export function choiceKey(i: Pick<MergeItem, 'store' | 'id'>): string {
  return key(i);
}
