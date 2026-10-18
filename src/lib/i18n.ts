// Plain message files per language (src/i18n/<lang>.json). Adding a language is
// one new file. Missing keys fall back to English, then to the key itself.

import en from '../i18n/en.json';

type Messages = Record<string, string>;
// English is built in; other languages load when chosen (and are precached for offline use).
const loaders = import.meta.glob<Messages>(['../i18n/*.json', '!../i18n/en.json'], { import: 'default' });
const loaded = new Map<string, Messages>([['../i18n/en.json', en]]);

const codeOf = (path: string) => path.match(/([\w-]+)\.json$/)![1];

/** Languages available, named in their own language. */
export const languages: { code: string; name: string }[] = ['../i18n/en.json', ...Object.keys(loaders)]
  .map((path) => {
    const code = codeOf(path);
    let name = code === 'en' ? 'English' : code;
    try {
      const n = new Intl.DisplayNames([code], { type: 'language' }).of(code);
      if (n) name = n.charAt(0).toUpperCase() + n.slice(1);
    } catch {}
    return { code, name };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

let current: Messages = en;
let currentLocale = 'en-GB';

function pathFor(locale: string): string | undefined {
  const lang = locale.split('-')[0];
  return [`../i18n/${locale}.json`, `../i18n/${lang}.json`].find((p) => p in loaders || loaded.has(p));
}

/** Load a language's messages if needed. Call before setLocale for anything but English. */
export async function loadLocale(locale: string): Promise<void> {
  const path = pathFor(locale);
  if (path && !loaded.has(path) && loaders[path]) loaded.set(path, await loaders[path]());
}

/** Switch language. Messages must already be loaded (see loadLocale); otherwise English is used. */
export function setLocale(locale: string): void {
  currentLocale = locale;
  const path = pathFor(locale);
  current = (path && loaded.get(path)) || en;
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
