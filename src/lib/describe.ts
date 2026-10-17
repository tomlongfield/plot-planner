// Timing rules in plain words: "8 to 6 weeks before last frost".

import { t } from './i18n';
import type { TimingRule } from './types';

function amount(days: number): { n: number; unit: 'weeks' | 'days' } {
  const a = Math.abs(days);
  return a % 7 === 0 && a >= 14 ? { n: a / 7, unit: 'weeks' } : { n: a, unit: 'days' };
}

function point(days: number, anchor: TimingRule['anchor'], threshold?: number): string {
  const ev = t(`anchor.${anchor}`, { n: threshold ?? '' }).toLowerCase();
  if (!days) return t('rule.at', { event: ev });
  const { n, unit } = amount(days);
  return t(days < 0 ? 'rule.before' : 'rule.after', { n, unit: t(`rule.unit.${unit}`), event: ev });
}

export function describeRule(r: TimingRule): string {
  const from = r.fromOffsetDays ?? 0;
  const to = r.toOffsetDays ?? from;
  const toAnchor = r.toAnchor ?? r.anchor;
  if (toAnchor === r.anchor && Math.sign(from) === Math.sign(to) && from !== to && from !== 0) {
    const a = amount(from);
    const b = amount(to);
    if (a.unit === b.unit)
      return t(from < 0 ? 'rule.rangeBefore' : 'rule.rangeAfter', { a: a.n, b: b.n, unit: t(`rule.unit.${a.unit}`), event: t(`anchor.${r.anchor}`, { n: r.threshold ?? '' }).toLowerCase() });
  }
  if (from === to && toAnchor === r.anchor) return point(from, r.anchor, r.threshold);
  return t('rule.between', { a: point(from, r.anchor, r.threshold), b: point(to, toAnchor, r.threshold) });
}
