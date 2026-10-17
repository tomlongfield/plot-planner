// Climate maths: frost dates, protection shifts, day length and re-anchoring.
//
// Plans are stored as real ISO dates, but every date "belongs" to its nearest
// local frost event. When the climate changes (new frost dates, a move to the
// other hemisphere, or a bed gaining a polytunnel) each date keeps its offset
// from that event, so the whole plan moves with the local season.

import { addDays, diffDays, monthDay, onYear, parseISO, yearOf } from './dates';
import type { Climate, Hardiness, ISODate, MonthDay, Protection, Window } from './types';

export const PROTECTION_SHIFT_DAYS: Record<Protection, number> = {
  none: 0,
  cloche: 14,
  coldframe: 21,
  greenhouse: 28,
  polytunnel: 28,
  heated: 56,
};

const REF_YEAR = 2001; // a common year, for month-day arithmetic

function shiftMonthDay(md: MonthDay, days: number): MonthDay {
  return monthDay(addDays(onYear(md, REF_YEAR), days));
}

/** Frost dates as experienced inside a protected area. */
export function effectiveClimate(c: Climate, protection: Protection | undefined, hardiness?: Hardiness, overrideShift?: number): Climate {
  const shift = overrideShift ?? (hardiness === 'hardy' ? 0 : PROTECTION_SHIFT_DAYS[protection ?? 'none']);
  if (!shift) return c;
  return { ...c, lastFrost: shiftMonthDay(c.lastFrost, -shift), firstFrost: shiftMonthDay(c.firstFrost, shift) };
}

/** Length of the frost-free season in days. */
export function frostFreeDays(c: Climate): number {
  const last = onYear(c.lastFrost, REF_YEAR);
  let first = onYear(c.firstFrost, REF_YEAR);
  if (first <= last) first = onYear(c.firstFrost, REF_YEAR + 1);
  return diffDays(first, last);
}

/** The last spring frost that opens the growing season labelled `season`. */
export function seasonLastFrost(c: Climate, season: number): ISODate {
  return onYear(c.lastFrost, season);
}

/** The first autumn frost that closes the growing season labelled `season`. */
export function seasonFirstFrost(c: Climate, season: number): ISODate {
  const last = seasonLastFrost(c, season);
  const first = onYear(c.firstFrost, season);
  return first > last ? first : onYear(c.firstFrost, season + 1);
}

/** The growing season a date falls in: the season whose last frost is the latest one on or before it. */
export function seasonOf(c: Climate, d: ISODate): number {
  const y = yearOf(d);
  return seasonLastFrost(c, y) <= d ? y : y - 1;
}

export interface AnchorRef {
  anchor: 'lastFrost' | 'firstFrost';
  occurrence: ISODate;
  offset: number;
}

/** The frost event nearest to a date, and how far the date sits from it. */
export function anchorOf(d: ISODate, c: Climate): AnchorRef {
  const y = yearOf(d);
  let best: AnchorRef | undefined;
  for (const anchor of ['lastFrost', 'firstFrost'] as const) {
    for (let yy = y - 1; yy <= y + 1; yy++) {
      const occurrence = onYear(c[anchor], yy);
      const offset = diffDays(d, occurrence);
      if (!best || Math.abs(offset) < Math.abs(best.offset)) best = { anchor, occurrence, offset };
    }
  }
  return best!;
}

/**
 * Move a date from one climate to another, keeping its offset from its frost event.
 * The new event is the first occurrence no more than 90 days before the old one,
 * so a plan never jumps into the past when switching hemisphere.
 */
export function reanchorDate(d: ISODate, from: Climate, to: Climate): ISODate {
  if (from.lastFrost === to.lastFrost && from.firstFrost === to.firstFrost) return d;
  const ref = anchorOf(d, from);
  const earliest = addDays(ref.occurrence, -90);
  let y = yearOf(earliest);
  let occ = onYear(to[ref.anchor], y);
  while (occ < earliest) occ = onYear(to[ref.anchor], ++y);
  return addDays(occ, ref.offset);
}

/** Re-anchor a window by its start date, keeping its length. */
export function reanchorWindow(w: Window, from: Climate, to: Climate): Window {
  const start = reanchorDate(w.from, from, to);
  return { from: start, to: addDays(start, diffDays(w.to, w.from)) };
}

/** Hours of daylight at a latitude on a date (sunrise to sunset, geometric). */
export function dayLengthHours(latDeg: number, d: ISODate): number {
  const start = Date.UTC(yearOf(d), 0, 1);
  const n = Math.round((parseISO(d) - start) / 86_400_000) + 1;
  const decl = (23.44 * Math.PI / 180) * Math.sin((2 * Math.PI * (284 + n)) / 365);
  const lat = (Math.max(-89.9, Math.min(89.9, latDeg)) * Math.PI) / 180;
  const cosH = -Math.tan(lat) * Math.tan(decl);
  if (cosH <= -1) return 24;
  if (cosH >= 1) return 0;
  return (2 * Math.acos(cosH) * 180) / Math.PI / 15;
}

/** Below this many hours of daylight most crops make little or no growth. */
export const SLOW_GROWTH_HOURS = 10;

export function isSlowGrowth(latDeg: number, d: ISODate): boolean {
  return dayLengthHours(latDeg, d) < SLOW_GROWTH_HOURS;
}

/** Days between two dates when there is enough daylight to grow. */
export function growingDaysBetween(latDeg: number, from: ISODate, to: ISODate): number {
  let n = 0;
  for (let d = from; d < to; d = addDays(d, 1)) if (!isSlowGrowth(latDeg, d)) n++;
  return n;
}

/** The date by which a crop that needs `days` of growth will be ready, skipping slow-growth days. */
export function addGrowingDays(latDeg: number, from: ISODate, days: number): ISODate {
  let d = from;
  let left = days;
  // Guard against latitudes where growth never resumes.
  for (let i = 0; left > 0 && i < 800; i++) {
    d = addDays(d, 1);
    if (!isSlowGrowth(latDeg, d)) left--;
  }
  return left > 0 ? addDays(from, days) : d;
}

export type SeasonName = 'spring' | 'summer' | 'autumn' | 'winter';

export function seasonName(month: number, hemisphere: 'N' | 'S'): SeasonName {
  const m = hemisphere === 'N' ? month : ((month + 5) % 12) + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

/** Sensible frost dates to start from when a user picks a hemisphere but has no local figures. */
export function defaultClimate(hemisphere: 'N' | 'S'): Climate {
  return hemisphere === 'N'
    ? { hemisphere, lastFrost: '05-01', firstFrost: '10-15', source: 'default' }
    : { hemisphere, lastFrost: '10-15', firstFrost: '04-20', source: 'default' };
}
