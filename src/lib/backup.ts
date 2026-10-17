// Backup files: the whole dataset as one JSON file, with a format marker and a
// schema version. Older files are migrated forward on restore.

import { SCHEMA_VERSION, type Dataset } from './types';

export const FORMAT = 'plot-planner-backup';

export interface BackupFile extends Partial<Dataset> {
  format: typeof FORMAT;
  schemaVersion: number;
  exportedAt: string;
}

export function emptyDataset(appVersion: string): Dataset {
  return {
    sites: [], plots: [], features: [], areas: [], plantings: [], tasks: [], taskStates: [], stock: [], cropOverrides: [],
    varieties: [], propSpaces: [], reservations: [], entries: [], imports: [],
    settings: { id: 'settings', theme: 'system', rotationYears: 3, monthRange: { mode: 'auto' }, dateFormat: 'dmy' },
    meta: { id: 'meta', schemaVersion: SCHEMA_VERSION, appVersion, createdAt: new Date().toISOString() },
  };
}

export function toBackup(d: Dataset): BackupFile {
  return { format: FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), ...d };
}

/**
 * Each migration takes data at version n and returns data at version n + 1.
 * Add one here whenever SCHEMA_VERSION goes up, and never edit an old one.
 */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  // 0 → 1: files made before versioning had no taskStates or imports.
  0: (d) => ({ ...d, taskStates: d.taskStates ?? [], imports: d.imports ?? [] }),
};

export function migrate(raw: Record<string, unknown>, appVersion: string): Dataset {
  let v = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : ((raw.meta as { schemaVersion?: number })?.schemaVersion ?? 0);
  if (v > SCHEMA_VERSION) throw new Error('newer');
  let d = { ...raw };
  while (v < SCHEMA_VERSION) d = MIGRATIONS[v++](d);
  const base = emptyDataset(appVersion);
  const out = { ...base } as Record<string, unknown>;
  for (const k of Object.keys(base)) if (d[k] !== undefined) out[k] = d[k];
  const ds = out as unknown as Dataset;
  ds.settings = { ...base.settings, ...ds.settings, id: 'settings' };
  ds.meta = { ...base.meta, ...ds.meta, id: 'meta', schemaVersion: SCHEMA_VERSION, appVersion };
  return ds;
}

/** Parse and check a backup file. Throws Error('format' | 'newer' | 'json'). */
export function parseBackup(text: string, appVersion: string): Dataset {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('json');
  }
  if (!raw || typeof raw !== 'object' || (raw.format !== FORMAT && !Array.isArray(raw.plots))) throw new Error('format');
  return migrate(raw, appVersion);
}
