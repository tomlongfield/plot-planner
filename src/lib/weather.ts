// Optional online lookups, only when the grower asks. Open-Meteo is free,
// needs no key, and is called straight from the browser: no server of ours
// is involved. Everything in the app works without these.

import { addDays, diffDays, monthDay, today as todayISO } from './dates';
import type { Climate, Hemisphere, ISODate, MonthDay } from './types';

export const ATTRIBUTION = { name: 'Open-Meteo.com', url: 'https://open-meteo.com/' };
const FROST_C = 0;

export interface Place { name: string; label: string; lat: number; lon: number; country?: string }

export async function searchPlaces(q: string, lang = 'en'): Promise<Place[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=${encodeURIComponent(lang)}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('lookup');
  const data = (await res.json()) as { results?: { name: string; latitude: number; longitude: number; country?: string; admin1?: string }[] };
  return (data.results ?? []).map((r) => ({
    name: r.name, lat: r.latitude, lon: r.longitude, country: r.country,
    label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
  }));
}

export interface FrostEstimate {
  /** Median: half of years have a later last frost (or an earlier first frost). */
  lastFrost: MonthDay;
  firstFrost: MonthDay;
  /** Nine years in ten are frost-free from this date until the safer first frost. */
  safeLastFrost: MonthDay;
  safeFirstFrost: MonthDay;
  years: number;
  /** The earliest and latest last frosts seen, to show how much it varies. */
  lastRange: [MonthDay, MonthDay];
  firstRange: [MonthDay, MonthDay];
  monthlyMeanC: number[];
  source: string;
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
};
const median = (xs: number[]) => quantile(xs, 0.5);

/**
 * Average frost dates from daily minimum temperatures. Each growing year runs
 * from midwinter to midwinter, so the last spring frost and the first autumn
 * frost fall in the same year in either hemisphere.
 */
export function frostDatesFromDaily(dates: ISODate[], mins: (number | null)[], means: (number | null)[], hemisphere: Hemisphere): FrostEstimate | undefined {
  const lastOffsets: number[] = [];
  const firstOffsets: number[] = [];
  // Midwinter: 1 Jan in the north, 1 Jul in the south. Offsets count from it.
  const startOf = (y: number) => (hemisphere === 'N' ? `${y}-01-01` : `${y}-07-01`);
  const years = new Set(dates.map((d) => Number(d.slice(0, 4))));
  for (const y of years) {
    const start = startOf(y);
    const mid = addDays(start, 182);
    const end = addDays(start, 364);
    let last: number | undefined;
    let first: number | undefined;
    let have = 0;
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      if (d < start || d > end) continue;
      have++;
      const m = mins[i];
      if (m == null || m > FROST_C) continue;
      const off = diffDays(d, start);
      if (d < mid) last = off;
      else if (first == null) first = off;
    }
    if (have < 330) continue; // skip incomplete years
    // A frost-free spring or autumn counts as the earliest or latest possible.
    lastOffsets.push(last ?? 0);
    firstOffsets.push(first ?? 364);
  }
  if (!lastOffsets.length) return undefined;
  const md = (off: number) => monthDay(addDays(startOf(2001), off));
  const sums = Array(12).fill(0);
  const counts = Array(12).fill(0);
  for (let i = 0; i < dates.length; i++) {
    const v = means[i];
    if (v == null) continue;
    const m = Number(dates[i].slice(5, 7)) - 1;
    sums[m] += v;
    counts[m]++;
  }
  return {
    lastFrost: md(median(lastOffsets)),
    firstFrost: md(median(firstOffsets)),
    safeLastFrost: md(quantile(lastOffsets, 0.9)),
    safeFirstFrost: md(quantile(firstOffsets, 0.1)),
    years: lastOffsets.length,
    lastRange: [md(Math.min(...lastOffsets)), md(Math.max(...lastOffsets))],
    firstRange: [md(Math.min(...firstOffsets)), md(Math.max(...firstOffsets))],
    monthlyMeanC: sums.map((s, i) => (counts[i] ? Math.round((s / counts[i]) * 10) / 10 : 0)),
    source: '',
  };
}

export async function lookupFrostDates(lat: number, lon: number, hemisphere: Hemisphere, now: ISODate = todayISO()): Promise<FrostEstimate> {
  const endYear = Number(now.slice(0, 4)) - 1;
  const startYear = endYear - 9;
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&start_date=${startYear}-01-01&end_date=${endYear}-12-31&daily=temperature_2m_min,temperature_2m_mean&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('lookup');
  const data = (await res.json()) as { daily?: { time: string[]; temperature_2m_min: (number | null)[]; temperature_2m_mean: (number | null)[] } };
  if (!data.daily) throw new Error('lookup');
  const est = frostDatesFromDaily(data.daily.time, data.daily.temperature_2m_min, data.daily.temperature_2m_mean, hemisphere);
  if (!est) throw new Error('nodata');
  return { ...est, source: `Open-Meteo historical weather, ${startYear}–${endYear}, median of ${est.years} years (air frost at 2 m)` };
}

export function climateFromEstimate(e: FrostEstimate, hemisphere: Hemisphere, safer: boolean): Climate {
  return {
    hemisphere, lastFrost: safer ? e.safeLastFrost : e.lastFrost, firstFrost: safer ? e.safeFirstFrost : e.firstFrost,
    source: `${e.source}${safer ? ', safer dates (nine years in ten)' : ', typical dates (median)'}`, monthlyMeanC: e.monthlyMeanC, userEdited: false,
  };
}

// ── Forecast nudges ────────────────────────────────────

export interface ForecastDay { date: ISODate; minC: number; maxC: number; rainMm: number; gustKmh: number }

export async function fetchForecast(lat: number, lon: number): Promise<ForecastDay[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,wind_gusts_10m_max&forecast_days=7&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('lookup');
  const d = (await res.json()) as { daily: { time: string[]; temperature_2m_min: number[]; temperature_2m_max: number[]; precipitation_sum: number[]; wind_gusts_10m_max: number[] } };
  return d.daily.time.map((date, i) => ({
    date, minC: d.daily.temperature_2m_min[i], maxC: d.daily.temperature_2m_max[i], rainMm: d.daily.precipitation_sum[i] ?? 0, gustKmh: d.daily.wind_gusts_10m_max[i] ?? 0,
  }));
}

export type Nudge =
  | { kind: 'frost'; date: ISODate; minC: number; tender: string[] }
  | { kind: 'dry'; days: number; rainMm: number }
  | { kind: 'wind'; date: ISODate; gustKmh: number }
  | { kind: 'heat'; date: ISODate; maxC: number };

/**
 * Turn a forecast into a few useful nudges. Frost warnings only matter when
 * something tender is out (or about to go out).
 */
export function forecastNudges(days: ForecastDay[], tenderOut: string[]): Nudge[] {
  const out: Nudge[] = [];
  const frost = days.slice(0, 3).find((d) => d.minC <= 1);
  if (frost && tenderOut.length) out.push({ kind: 'frost', date: frost.date, minC: frost.minC, tender: tenderOut });
  const rain = days.reduce((s, d) => s + d.rainMm, 0);
  if (days.length >= 5 && days.every((d) => d.rainMm < 1) && rain < 2) out.push({ kind: 'dry', days: days.length, rainMm: Math.round(rain * 10) / 10 });
  const wind = days.slice(0, 3).find((d) => d.gustKmh >= 60);
  if (wind) out.push({ kind: 'wind', date: wind.date, gustKmh: Math.round(wind.gustKmh) });
  const heat = days.slice(0, 3).find((d) => d.maxC >= 28);
  if (heat) out.push({ kind: 'heat', date: heat.date, maxC: Math.round(heat.maxC) });
  return out;
}
