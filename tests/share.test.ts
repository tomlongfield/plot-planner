import { describe, expect, it } from 'vitest';
import { demoDataset } from '../src/lib/demo';
import { buildLibrary, bundledCrops } from '../src/lib/library';
import { acceptDrafts } from '../src/lib/ops';
import { buildShare, decodeShare, encodeShare, importAsGarden, importIntoPlot, LINK_LIMIT, parseShare, settleImports } from '../src/lib/share';

const lib = buildLibrary(bundledCrops(), [], []);
const NOW = '2026-10-17';

/** Someone else's plan: the example, with a different garlic planting and a custom variety. */
function friendsPlan() {
  const d = demoDataset(lib, NOW);
  d.varieties.push({ id: 'garlic--user-friend', cropId: 'garlic', name: 'Friend\'s garlic', seedType: 'OP' });
  d.plantings.find((p) => p.id === 'pl1')!.varietyId = 'garlic--user-friend';
  d.sites[0].location = { lat: 54.2, lon: -1.3, label: 'Friend\'s town' };
  return d;
}

describe('sharing (acceptance 8)', () => {
  it('leaves out the location unless asked', () => {
    const d = friendsPlan();
    expect(buildShare(d, ['p1'], false).site.location).toEqual({ lat: 50, lon: 0, label: '' });
    expect(buildShare(d, ['p1'], true).site.location.label).toBe('Friend\'s town');
  });

  it('includes the custom varieties a plan uses', () => {
    const p = buildShare(friendsPlan(), ['p1'], false);
    expect(p.varieties.map((v) => v.id)).toEqual(['garlic--user-friend']);
    expect(p.plantings).toHaveLength(9);
  });

  it('round-trips through a link fragment that fits the size limit', async () => {
    const p = buildShare(friendsPlan(), ['p1'], false);
    const frag = await encodeShare(p);
    expect(frag).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(frag.length).toBeLessThan(LINK_LIMIT);
    const back = await decodeShare(`#share=${frag}`);
    expect(back.plantings.map((x) => x.id)).toEqual(p.plantings.map((x) => x.id));
    expect(back.plantings[0].windows).toEqual(p.plantings[0].windows);
  });

  it('rejects things that are not shared plans', async () => {
    expect(() => parseShare('{"format":"something-else"}')).toThrow('format');
    expect(() => parseShare('not json')).toThrow('json');
    await expect(decodeShare('#share=!!!')).rejects.toThrow();
  });

  it('adds a shared plan as a separate garden, all drafts, without touching your plan', () => {
    const mine = demoDataset(lib, NOW);
    const before = JSON.stringify({ plantings: mine.plantings, tasks: mine.tasks });
    const { data, siteId, importId } = importAsGarden(mine, buildShare(friendsPlan(), ['p1'], false), 'file', 'Sam');
    // Your own plantings and tasks are exactly as they were.
    expect(JSON.stringify({ plantings: data.plantings.filter((p) => !p.importId), tasks: data.tasks.filter((t) => !t.importId) })).toBe(before);
    const theirs = data.plantings.filter((p) => p.importId === importId);
    expect(theirs).toHaveLength(9);
    expect(theirs.every((p) => p.agreement === 'draft')).toBe(true);
    expect(data.sites.find((s) => s.id === siteId)!.name).toBe('Example site (Sam)');
    // Ids are new, and successions still point at the right planting.
    const spinach = theirs.find((p) => p.varietyId === 'spinach--winter')!;
    const fennel = theirs.find((p) => p.varietyId === 'florence-fennel--fennel')!;
    expect(spinach.followsPlantingId).toBe(fennel.id);
    expect(theirs.some((p) => mine.plantings.some((m) => m.id === p.id))).toBe(false);
    expect(data.varieties.map((v) => v.id)).toContain('garlic--user-friend');
  });

  it('adds a shared plan to your plot as drafts, matching areas by name', () => {
    const mine = demoDataset(lib, NOW);
    mine.areas = mine.areas.filter((a) => a.id !== 'c'); // you have no Bed C
    mine.plantings = mine.plantings.filter((p) => p.areaId !== 'c');
    const agreed = JSON.stringify(mine.plantings);
    const { data, added, skipped, importId } = importIntoPlot(mine, buildShare(friendsPlan(), ['p1'], false), 'p1', 'p1', 'link');
    expect(added).toBe(8);
    expect(skipped).toBe(1);
    expect(JSON.stringify(data.plantings.filter((p) => !p.importId))).toBe(agreed);
    const drafts = data.plantings.filter((p) => p.importId === importId);
    expect(drafts.every((p) => p.agreement === 'draft' && p.status === 'planned')).toBe(true);
    expect(data.tasks.filter((t) => t.importId === importId).every((t) => t.agreement === 'draft')).toBe(true);

    // Accepting turns the drafts into part of the plan, and the import settles.
    const accepted = settleImports(acceptDrafts(data, { plantings: drafts.map((p) => p.id), tasks: data.tasks.filter((t) => t.importId === importId).map((t) => t.id) }));
    expect(accepted.plantings.filter((p) => p.agreement === 'draft' && p.id !== 'pl9')).toHaveLength(0);
    expect(accepted.imports.find((i) => i.id === importId)!.status).toBe('accepted');
  });
});
