// Measurements are stored in metric and converted for display.

import { num } from './i18n';

export type Units = 'metric' | 'imperial';

export function length(m: number, u: Units): string {
  if (u === 'metric') return `${num(m, 2)} m`;
  const inches = m / 0.0254;
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches - ft * 12);
  return inch === 12 ? `${ft + 1} ft` : inch ? `${ft} ft ${inch} in` : `${ft} ft`;
}

export function spacing(cm: number, u: Units): string {
  return u === 'metric' ? `${num(cm)} cm` : `${num(cm / 2.54)} in`;
}

export function area(m2: number, u: Units): string {
  return u === 'metric' ? `${num(m2, 2)} m²` : `${num(m2 * 10.7639, 1)} sq ft`;
}

/** Seed weights in grams, harvests in kilograms (or ounces and pounds). */
export function weight(g: number, u: Units, kind: 'seed' | 'harvest' = 'harvest'): string {
  if (u === 'imperial') return g < 454 ? `${num(g / 28.3495, 1)} oz` : `${num(g / 453.592, 1)} lb`;
  if (kind === 'seed' || g < 1000) return `${num(g, g < 10 ? 1 : 0)} g`;
  return `${num(g / 1000, 2)} kg`;
}

export function temp(c: number, u: Units): string {
  return u === 'metric' ? `${num(c)} °C` : `${num(c * 1.8 + 32)} °F`;
}

/** Parse a length typed by the user in their units, returning metres. */
export function parseLength(s: string, u: Units): number | undefined {
  const v = parseFloat(s.replace(',', '.'));
  if (!Number.isFinite(v)) return undefined;
  return u === 'metric' ? v : v * 0.3048;
}

export function toDisplayLength(m: number, u: Units): number {
  return u === 'metric' ? Math.round(m * 100) / 100 : Math.round((m / 0.3048) * 100) / 100;
}
