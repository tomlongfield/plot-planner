import { describe, expect, it } from 'vitest';
import { demoDataset } from '../src/lib/demo';
import { buildLibrary, bundledCrops } from '../src/lib/library';
import { applyMerge, choiceKey, diffDatasets } from '../src/lib/merge';

const lib = buildLibrary(bundledCrops(), [], []);
const base = () => demoDataset(lib, '2026-10-17');

describe('merging two devices', () => {
  it('finds what is new, missing and different', () => {
    const phone = base();
    const laptop = base();
    laptop.entries.push({ id: 'e1', date: '2026-10-17', kind: 'note', text: 'From the laptop' });
    phone.entries.push({ id: 'e2', date: '2026-10-17', kind: 'note', text: 'From the phone' });
    laptop.plantings.find((p) => p.id === 'pl8')!.qty = 14;
    const items = diffDatasets(phone, laptop);
    expect(items.map((i) => `${i.store}:${i.id}:${i.kind}`).sort()).toEqual(['entries:e1:theirs', 'entries:e2:mine', 'plantings:pl8:changed']);
    expect(items.find((i) => i.kind === 'changed')!.fields).toEqual(['qty']);
  });

  it('ignores differences in key order and undefined fields', () => {
    const a = base();
    const b = base();
    const p = b.plantings[0];
    b.plantings[0] = { ...Object.fromEntries(Object.entries(p).reverse()), notes: undefined, interplanted: false, rows: [] } as unknown as typeof p;
    expect(diffDatasets(a, b)).toEqual([]);
  });

  it('adds theirs and keeps mine by default, and follows explicit choices', () => {
    const phone = base();
    const laptop = base();
    laptop.entries.push({ id: 'e1', date: '2026-10-17', kind: 'note', text: 'From the laptop' });
    phone.entries.push({ id: 'e2', date: '2026-10-17', kind: 'note', text: 'From the phone' });
    laptop.plantings.find((p) => p.id === 'pl8')!.qty = 14;
    const items = diffDatasets(phone, laptop);

    const byDefault = applyMerge(phone, items, new Map());
    expect(byDefault.entries.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
    expect(byDefault.plantings.find((p) => p.id === 'pl8')!.qty).toBe(12);
    expect(phone.entries).toHaveLength(1); // the original is untouched

    const chosen = applyMerge(phone, items, new Map([
      [choiceKey({ store: 'plantings', id: 'pl8' }), 'theirs'],
      [choiceKey({ store: 'entries', id: 'e2' }), 'theirs'],
    ]));
    expect(chosen.plantings.find((p) => p.id === 'pl8')!.qty).toBe(14);
    expect(chosen.entries.map((e) => e.id)).toEqual(['e1']);
  });
});
