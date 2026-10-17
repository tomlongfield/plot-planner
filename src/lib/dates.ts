// Pure date helpers. All dates are ISO 'YYYY-MM-DD' strings handled in UTC,
// so time zones and daylight saving never shift a day.

import type { ISODate, MonthDay, Window } from './types';

const DAY = 86_400_000;

export function parseISO(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

export function toISO(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return toISO(parseISO(d) + n * DAY);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(a) - parseISO(b)) / DAY);
}

export function today(): ISODate {
  const now = new Date();
  return toISO(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function minDate(...ds: (ISODate | undefined)[]): ISODate | undefined {
  return ds.filter(Boolean).sort()[0];
}

export function maxDate(...ds: (ISODate | undefined)[]): ISODate | undefined {
  const s = ds.filter(Boolean).sort();
  return s[s.length - 1];
}

/** The date of a month-day in a given year. 29 Feb falls back to 28 Feb in common years. */
export function onYear(md: MonthDay, year: number): ISODate {
  const [m, d] = md.split('-').map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return toISO(Date.UTC(year, m - 1, Math.min(d, last)));
}

export function monthDay(d: ISODate): MonthDay {
  return d.slice(5);
}

export function yearOf(d: ISODate): number {
  return Number(d.slice(0, 4));
}

/** 'YYYY-MM' month key. */
export type MonthKey = string;

export function monthKey(d: ISODate): MonthKey {
  return d.slice(0, 7);
}

export function monthStart(k: MonthKey): ISODate {
  return `${k}-01`;
}

export function monthEnd(k: MonthKey): ISODate {
  const [y, m] = k.split('-').map(Number);
  return toISO(Date.UTC(y, m, 0));
}

export function addMonths(k: MonthKey, n: number): MonthKey {
  const [y, m] = k.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 7);
}

export function monthsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let k = from; k <= to && out.length < 120; k = addMonths(k, 1)) out.push(k);
  return out;
}

export function overlaps(a: Window, b: Window): boolean {
  return a.from <= b.to && b.from <= a.to;
}

export function inWindow(d: ISODate, w: Window): boolean {
  return d >= w.from && d <= w.to;
}

export function shiftWindow(w: Window, n: number): Window {
  return { from: addDays(w.from, n), to: addDays(w.to, n) };
}

export function windowOverlapsMonth(w: Window, k: MonthKey): boolean {
  return overlaps(w, { from: monthStart(k), to: monthEnd(k) });
}

/** Monday-start (or Sunday-start) week containing d. */
export function weekOf(d: ISODate, weekStart: 0 | 1 = 1): Window {
  const dow = new Date(parseISO(d)).getUTCDay();
  const back = (dow - weekStart + 7) % 7;
  const from = addDays(d, -back);
  return { from, to: addDays(from, 6) };
}

/**
 * Parse a date written in any of the forms people put in spreadsheets.
 * Returns an ISO date, or undefined when the text isn't a date ("Gift", "?").
 * Month-only values resolve to the first of the month.
 */
export function parseLooseDate(input: unknown, order: 'dmy' | 'mdy' = 'dmy'): ISODate | undefined {
  if (input == null) return undefined;
  if (typeof input === 'number' && Number.isFinite(input)) {
    // Spreadsheet serial date (days since 1899-12-30).
    if (input > 20000 && input < 80000) return toISO(Date.UTC(1899, 11, 30) + Math.round(input) * DAY);
    return undefined;
  }
  const s = String(input).trim();
  if (!s) return undefined;
  let m: RegExpMatchArray | null;

  if ((m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/))) return mk(+m[1], +m[2], m[3] ? +m[3] : 1);
  if ((m = s.match(/^(\d{4})\/(\d{1,2})(?:\/(\d{1,2}))?$/))) return mk(+m[1], +m[2], m[3] ? +m[3] : 1);
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) {
    const [a, b] = [+m[1], +m[2]];
    const y = fullYear(+m[3]);
    if (a > 12) return mk(y, b, a);
    if (b > 12) return mk(y, a, b);
    return order === 'dmy' ? mk(y, b, a) : mk(y, a, b);
  }
  if ((m = s.match(/^(\d{1,2})[/.-](\d{4})$/))) return mk(+m[2], +m[1], 1);
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})\.?,?\s+(\d{2,4})$/))) {
    const mon = monthFromName(m[2]);
    return mon ? mk(fullYear(+m[3]), mon, +m[1]) : undefined;
  }
  if ((m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/))) {
    const mon = monthFromName(m[1]);
    return mon ? mk(+m[3], mon, +m[2]) : undefined;
  }
  if ((m = s.match(/^([A-Za-z]{3,})\.?[\s,/-]+(\d{2,4})$/))) {
    const mon = monthFromName(m[1]);
    return mon ? mk(fullYear(+m[2]), mon, 1) : undefined;
  }
  if ((m = s.match(/^(\d{4})$/))) return mk(+m[1], 1, 1);
  return undefined;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function monthFromName(name: string): number | undefined {
  const i = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  return i >= 0 ? i + 1 : undefined;
}

function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

function mk(y: number, m: number, d: number): ISODate | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return undefined;
  const t = Date.UTC(y, m - 1, d);
  if (new Date(t).getUTCMonth() !== m - 1) return undefined;
  return toISO(t);
}
