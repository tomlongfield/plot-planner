import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { isDataset } from '../src/lib/store.svelte';
import { demoDataset } from '../src/lib/demo';
import { buildLibrary, bundledCrops } from '../src/lib/library';

describe('store updates', () => {
  it('only takes a whole dataset as a replacement', () => {
    expect(isDataset(demoDataset(buildLibrary(bundledCrops(), [], []), '2026-10-17'))).toBe(true);
    // What an arrow like (s) => (s.name = 'x') returns.
    expect(isDataset('x')).toBe(false);
    expect(isDataset({ label: 'Thirsk', lat: 54.2, lon: -1.3 })).toBe(false);
    expect(isDataset(undefined)).toBe(false);
  });
});
