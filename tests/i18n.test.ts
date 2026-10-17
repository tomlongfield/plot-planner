import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';

const messages = en as Record<string, string>;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f: string) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|svelte)$/.test(p) ? [p] : [];
  });
}

const has = (k: string) => k in messages || `${k}.other` in messages;

// Keys built at runtime, listed out so a missing translation fails here.
const DYNAMIC: Record<string, string[]> = {
  'nav.': ['month', 'plan', 'plantings', 'tasks', 'journal', 'seeds', 'crops', 'settings', 'help'],
  'nav.short.': ['month', 'plan', 'plantings', 'tasks', 'journal', 'seeds', 'crops', 'settings'],
  'entryKind.': ['note', 'harvest', 'problem', 'store', 'photo', 'review'],
  'entry.new.': ['note', 'harvest', 'problem', 'store'],
  'entry.added.': ['note', 'harvest', 'problem', 'store', 'photo', 'review'],
  'severity.': ['1', '2', '3'],
  'journal.tab.': ['all', 'note', 'harvest', 'problem', 'store'],
  'journal.empty.': ['all', 'note', 'harvest', 'problem', 'store'],
  'dir.': ['N', 'E', 'S', 'W'], 'dir.long.': ['N', 'E', 'S', 'W'],
  'kind.': ['bed', 'section', 'rows', 'grid', 'container'],
  'protection.': ['none', 'cloche', 'coldframe', 'greenhouse', 'polytunnel', 'heated'],
  'place.': ['plot', 'home', 'propagation', 'admin'],
  'ttype.': ['sow', 'plant', 'harvest', 'order', 'job'],
  'rotation.': ['alliums', 'legumes', 'brassicas', 'roots', 'potatoes', 'cucurbits', 'salads', 'misc', 'perennial'],
  'theme.': ['system', 'light', 'dark'],
  'status.': ['planned', 'sown', 'growing', 'harvesting', 'cleared', 'failed'],
  'toast.status.': ['planned', 'sown', 'growing', 'harvesting', 'cleared', 'failed'],
  'pe.mark.': ['sown', 'growing', 'harvesting', 'cleared'],
  'unit.': ['plants', 'plugs', 'clumps', 'cloves', 'sets', 'tubers', 'metres', 'seeds'],
  'unitName.': ['plants', 'plugs', 'clumps', 'cloves', 'sets', 'tubers', 'metres', 'seeds'],
  'window.': ['sow', 'potOn', 'hardenOff', 'plantOut', 'harvest', 'clear'],
  'warn.': ['conflict', 'capacity', 'endDate', 'frostFree', 'frost', 'rotation', 'problem', 'crossing', 'outgrow', 'waiting', 'oldSeed', 'seedUseBy', 'propCapacity', 'missingArea'],
  'task.': ['sow', 'sowDirect', 'potOn', 'hardenOff', 'plantOut', 'plant', 'fleece', 'net', 'mesh', 'thin', 'support', 'earthUp', 'pinchOut', 'chit', 'harvest', 'cure', 'clear'],
  'cat.': ['allium', 'brassica', 'legume', 'leaf', 'root', 'fruiting', 'cucurbit', 'herb', 'fruit', 'flower'],
  'feature.': ['fence', 'wall', 'hedge', 'path', 'shed', 'greenhouse', 'polytunnel', 'coldframe', 'water', 'tap', 'compost', 'tree', 'seating', 'tools', 'other'],
  'plotType.': ['allotment', 'garden', 'raised-beds', 'greenhouse', 'containers', 'field'],
  'stockKind.': ['seed', 'bulb', 'clove', 'set', 'tuber', 'crown', 'plant', 'cutting'],
  'source.': ['bought', 'saved', 'gift', 'swap', 'unknown'],
  'stockStatus.': ['plenty', 'low', 'used'],
  'imp.field.': ['crop', 'variety', 'supplier', 'source', 'acquired', 'useBy', 'quantity', 'status', 'organic', 'storage', 'notes', 'family', 'link', 'kind', 'ignore'],
  'imp.issue.': ['unmatched', 'typo', 'family', 'duplicate', 'dateText', 'badDate', 'newVariety'],
  'imp.error.': ['read', 'empty'],
  'shared.error.': ['bad', 'newer'],
  'settings.restoreError.': ['json', 'format', 'newer'],
  'tasks.tab.': ['next', 'week', 'month', 'list'], 'tasks.empty.': ['next', 'week', 'month', 'list'],
  'pl.filter.': ['active', 'drafts', 'done', 'all'],
  'te.unit.': ['day', 'week', 'month', 'year'],
  'plan.': ['main', 'overwinter'], 'method.': ['module', 'direct', 'bought'], 'purpose.': ['eat', 'seed', 'both'],
  'lifecycle.': ['annual', 'biennial', 'perennial'], 'hardiness.': ['hardy', 'half-hardy', 'tender'],
  'pollination.': ['self', 'insect', 'wind'], 'crosses.': ['rarely', 'sometimes', 'readily'],
  'anchor.': ['lastFrost', 'firstFrost', 'soilTemp', 'dayLength', 'fixed'],
  'rule.': ['sowIndoor', 'sowOutdoor', 'plantOut', 'overwinter', 'harvest'], 'rule.unit.': ['weeks', 'days'],
  'actual.': ['sown', 'plantedOut', 'firstHarvest', 'cleared'],
  'seedType.': ['OP', 'F1', 'unknown'],
  'layout.': ['x', 'y', 'w', 'h'],
  'help.': ['start.title', 'start.body', 'month.title', 'month.body', 'plantings.title', 'plantings.body', 'drafts.title', 'drafts.body', 'tasks.title', 'tasks.body', 'seeds.title', 'seeds.body', 'backup.title', 'backup.body', 'offline.title', 'offline.body', 'privacy.title', 'privacy.body'],
};

describe('messages', () => {
  const src = files('src').map((f) => readFileSync(f, 'utf8')).join('\n');

  it('has every key the code uses', () => {
    const used = new Set([...src.matchAll(/\bt[n]?\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)].map((m) => m[1]));
    const missing = [...used].filter((k) => !has(k));
    expect(missing).toEqual([]);
  });

  it('has every key built at runtime', () => {
    const prefixes = new Set([...src.matchAll(/\bt[n]?\(`([a-zA-Z0-9_.]+)\$\{/g)].map((m) => m[1]));
    const unknown = [...prefixes].filter((p) => !(p in DYNAMIC));
    expect(unknown).toEqual([]);
    const missing = Object.entries(DYNAMIC).flatMap(([p, vals]) => vals.map((v) => p + v)).filter((k) => !has(k));
    expect(missing).toEqual([]);
  });

  it('uses the same placeholders in plural forms', () => {
    for (const k of Object.keys(messages).filter((k) => k.endsWith('.one'))) {
      const base = k.slice(0, -4);
      expect(messages[`${base}.other`], base).toBeDefined();
    }
  });
});
