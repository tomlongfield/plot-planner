import type { Warning } from './checks';
import { fullDate, t } from './i18n';

const DATE_KEYS = new Set(['from', 'to', 'until', 'end', 'date', 'lastFrost', 'acquired', 'useBy', 'week']);

/** The words for a warning, in the current language. */
export function warningText(w: Warning): string {
  const p: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(w.params)) p[k] = DATE_KEYS.has(k) && typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) ? fullDate(v) : v;
  if (w.kind === 'rotation') p.group = t(`rotation.${w.params.group}`);
  if (w.kind === 'crossing' && !w.params.distance) return t('warn.crossing.apart', p);
  if (w.kind === 'conflict' && !w.params.from) return t('warn.conflict.now', p);
  return t(`warn.${w.kind}`, p);
}
