// Plain message files per language (src/i18n/<lang>.json). Adding a language is
// one new file. Missing keys fall back to English, then to the key itself.

import en from '../i18n/en.json';

type Messages = Record<string, string>;
const catalogs = import.meta.glob<Messages>('../i18n/*.json', { eager: true, import: 'default' });

export const languages: { code: string; name: string }[] = Object.entries(catalogs)
  .map(([path, m]) => ({ code: path.match(/([\w-]+)\.json$/)![1], name: m['language.name'] ?? path }))
  .sort((a, b) => a.name.localeCompare(b.name));

let current: Messages = en;
let currentLocale = 'en-GB';

export function setLocale(locale: string): void {
  currentLocale = locale;
  const lang = locale.split('-')[0];
  current = catalogs[`../i18n/${locale}.json`] ?? catalogs[`../i18n/${lang}.json`] ?? en;
}

export function locale(): string {
  return currentLocale;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const s = current[key] ?? (en as Messages)[key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : ''));
}

/** Pick `key.one` or `key.other` by count. */
export function tn(key: string, n: number, params?: Record<string, string | number>): string {
  const rule = new Intl.PluralRules(currentLocale).select(n);
  const k = rule === 'one' && (current[`${key}.one`] ?? (en as Messages)[`${key}.one`]) ? `${key}.one` : `${key}.other`;
  return t(k, { n, ...params });
}

// ── Formatting ──────────────────────────────────────────

const MONTH_FMT = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = currentLocale + JSON.stringify(opts);
  let f = MONTH_FMT.get(key);
  if (!f) MONTH_FMT.set(key, (f = new Intl.DateTimeFormat(currentLocale, { timeZone: 'UTC', ...opts })));
  return f;
}

function utc(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, day || 1));
}

export function monthName(monthKey: string, style: 'long' | 'short' = 'long'): string {
  return fmt({ month: style }).format(utc(`${monthKey}-01`));
}

export function monthYear(monthKey: string): string {
  return fmt({ month: 'long', year: 'numeric' }).format(utc(`${monthKey}-01`));
}

/** "9 Nov" */
export function dayMonth(d: string): string {
  return fmt({ day: 'numeric', month: 'short' }).format(utc(d));
}

/** "9 Nov 2026" */
export function fullDate(d: string): string {
  return fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(utc(d));
}

/** "9–30 Nov", "28 Nov – 6 Dec", "Dec 2026 – Jan 2027" style ranges. */
export function range(from: string, to: string): string {
  if (from === to) return dayMonth(from);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  try {
    const f = fmt(sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
    return (f as Intl.DateTimeFormat & { formatRange(a: Date, b: Date): string }).formatRange(utc(from), utc(to));
  } catch {
    return `${dayMonth(from)} – ${dayMonth(to)}`;
  }
}

export function num(n: number, digits = 0): string {
  return new Intl.NumberFormat(currentLocale, { maximumFractionDigits: digits }).format(n);
}
