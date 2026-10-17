// Calendar export (iCalendar, RFC 5545). Each task becomes an all-day event
// spanning its window, so any calendar app can remind the grower. No server.

import { addDays } from './dates';
import type { PlanTask } from './tasks';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');
}

/** Fold lines longer than 75 octets, as the format requires. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const ymd = (d: string) => d.replace(/-/g, '');

export function toICS(tasks: PlanTask[], opts: { name: string; where?: (t: PlanTask) => string; now?: Date }): string {
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//plot-planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(opts.name)}`,
  ];
  for (const t of tasks) {
    const desc = [t.qty, t.details, t.notes].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${t.id.replace(/[^\w@.:-]/g, '-')}@plot-planner`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(t.window.from)}`,
      `DTEND;VALUE=DATE:${ymd(addDays(t.window.to, 1))}`,
      `SUMMARY:${esc(t.title)}`,
      ...(desc ? [`DESCRIPTION:${esc(desc)}`] : []),
      ...(opts.where?.(t) ? [`LOCATION:${esc(opts.where(t))}`] : []),
      `CATEGORIES:${t.type.toUpperCase()}`,
      ...(t.status === 'done' ? ['STATUS:CANCELLED'] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
