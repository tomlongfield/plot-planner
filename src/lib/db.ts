// Browser storage. Each collection of the dataset is one IndexedDB record:
// small, simple, and written in a single transaction.

import type { Dataset } from './types';

const DB_NAME = 'plot-planner';
const STORE = 'collections';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbp: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  return (dbp ??= open());
}

export async function loadDataset(): Promise<Partial<Dataset> | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const out: Record<string, unknown> = {};
    const req = store.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (c) {
        out[String(c.key)] = c.value;
        c.continue();
      } else resolve(Object.keys(out).length ? (out as Partial<Dataset>) : undefined);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveDataset(data: Dataset, only?: (keyof Dataset)[]): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const k of only ?? (Object.keys(data) as (keyof Dataset)[])) store.put(data[k], k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearDataset(): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Ask the browser not to clear our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function isPersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}
