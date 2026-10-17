// Downloads and file reading. Everything happens in the browser.

import { toBackup } from './backup';
import { t } from './i18n';
import { app } from './store.svelte';
import type { Dataset } from './types';

export function download(name: string, content: string | Blob, type = 'application/json'): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plot';
}

export function downloadBackup(): void {
  const data = $state.snapshot(app.data) as Dataset;
  const stamp = new Date().toISOString().slice(0, 10);
  download(`plot-planner-backup-${stamp}.json`, JSON.stringify(toBackup(data), null, 1));
  app.update(null, (d) => { d.meta.lastBackupAt = new Date().toISOString(); });
  app.notify(t('toast.backedUp'));
}

export function pickFile(accept: string): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0]);
    input.oncancel = () => resolve(undefined);
    input.click();
  });
}
