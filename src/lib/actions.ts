// Changes the views make, each with a plain label for the undo toast.

import { addDays, diffDays, today } from './dates';
import { t } from './i18n';
import { uid } from './ids';
import { acceptDrafts, rejectDrafts, setAreaProtection, setSiteClimate } from './ops';
import { app } from './store.svelte';
import type { PlanTask } from './tasks';
import type { Climate, Dataset, Planting, PlantingStatus, Protection, TaskStatus, Windows } from './types';

export function setTaskStatus(task: PlanTask, status: TaskStatus): void {
  const doneOn = status === 'done' ? app.today : undefined;
  const label = status === 'done' ? t('toast.taskDone', { title: task.title }) : null;
  app.update(label, (d) => {
    if (!task.generated && task.source && !task.source.recurrence) {
      const m = d.tasks.find((x) => x.id === task.id);
      if (m) Object.assign(m, { status, doneOn });
      return;
    }
    const s = d.taskStates.find((x) => x.id === task.id);
    if (status === 'todo') d.taskStates = d.taskStates.filter((x) => x.id !== task.id);
    else if (s) Object.assign(s, { status, doneOn });
    else d.taskStates.push({ id: task.id, status, doneOn });
    // Ticking off a sowing or planting moves the planting along.
    if (task.generated && task.plantingId && status === 'done') {
      const p = d.plantings.find((x) => x.id === task.plantingId);
      if (!p) return;
      if ((task.kind === 'sow' || task.kind === 'sowDirect') && p.status === 'planned') {
        p.status = task.kind === 'sowDirect' ? 'growing' : 'sown';
        p.actual = { ...p.actual, sown: app.today };
      }
      if (task.kind === 'plantOut' && (p.status === 'planned' || p.status === 'sown')) {
        p.status = 'growing';
        p.actual = { ...p.actual, plantedOut: app.today };
      }
      if (task.kind === 'harvest' && p.status !== 'harvesting') {
        p.status = 'harvesting';
        p.actual = { ...p.actual, firstHarvest: app.today };
      }
      if (task.kind === 'clear') {
        p.status = 'cleared';
        p.actual = { ...p.actual, cleared: app.today };
      }
    }
  });
}

export function setPlantingStatus(id: string, status: PlantingStatus): void {
  const now = today();
  app.update(t(`toast.status.${status}`), (d) => {
    const p = d.plantings.find((x) => x.id === id);
    if (!p) return;
    p.status = status;
    if (status === 'sown') p.actual = { ...p.actual, sown: p.actual.sown ?? now };
    if (status === 'growing') p.actual = { ...p.actual, plantedOut: p.actual.plantedOut ?? now };
    if (status === 'harvesting') p.actual = { ...p.actual, firstHarvest: p.actual.firstHarvest ?? now };
    if (status === 'cleared' || status === 'failed') p.actual = { ...p.actual, cleared: p.actual.cleared ?? now };
  });
}

export function savePlanting(p: Planting, isNew: boolean): void {
  app.update(isNew ? t('toast.plantingAdded', { name: app.nameOf(p) }) : t('toast.plantingSaved', { name: app.nameOf(p) }), (d) => {
    // Keep a succession's gap after the planting it follows.
    if (p.followsPlantingId) {
      const pred = d.plantings.find((x) => x.id === p.followsPlantingId);
      const start = p.windows.plantOut?.from ?? p.windows.sow?.from;
      if (pred?.windows.clear && start) p.followGapDays = diffDays(start, pred.windows.clear.from);
    } else p.followGapDays = undefined;
    const i = d.plantings.findIndex((x) => x.id === p.id);
    if (i >= 0) d.plantings[i] = p;
    else d.plantings.push(p);
  });
}

export function deletePlanting(id: string): void {
  const p = app.data.plantings.find((x) => x.id === id);
  app.update(t('toast.plantingDeleted', { name: p ? app.nameOf(p) : '' }), (d) => {
    d.plantings = d.plantings.filter((x) => x.id !== id);
    for (const q of d.plantings) if (q.followsPlantingId === id) q.followsPlantingId = undefined;
    d.taskStates = d.taskStates.filter((s) => !s.id.startsWith(`${id}:`));
  });
}

/** Move one window by some days. A planting's later windows move with it. */
export function shiftWindow(id: string, key: keyof Windows, days: number): void {
  const order: (keyof Windows)[] = ['sow', 'potOn', 'hardenOff', 'plantOut', 'harvest', 'clear'];
  app.update(t('toast.datesMoved'), (d) => {
    const p = d.plantings.find((x) => x.id === id);
    if (!p) return;
    for (const k of order.slice(order.indexOf(key))) {
      const w = p.windows[k];
      if (w) p.windows[k] = { from: addDays(w.from, days), to: addDays(w.to, days) };
    }
  });
}

export function acceptDraft(ids: { plantings?: string[]; tasks?: string[] }): void {
  app.update(t('toast.draftAccepted'), (d) => acceptDrafts(d, ids));
}

export function rejectDraft(ids: { plantings?: string[]; tasks?: string[] }): void {
  app.update(t('toast.draftRejected'), (d) => rejectDrafts(d, ids));
}

export function setClimate(siteId: string, climate: Climate): void {
  app.update(t('toast.climateChanged'), (d) => setSiteClimate($snapshot(d), siteId, climate));
}

export function setProtection(areaId: string, protection: Protection): void {
  app.update(t('toast.protectionChanged'), (d) => setAreaProtection($snapshot(d), app.lib, areaId, protection));
}

function $snapshot(d: Dataset): Dataset {
  return JSON.parse(JSON.stringify(d));
}

export function newId(prefix: string): string {
  return uid(prefix);
}
