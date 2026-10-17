/** Short random ids. Collisions across devices are vanishingly unlikely at this length. */
export function uid(prefix = ''): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  let s = '';
  for (const b of bytes) s += (b % 36).toString(36);
  return prefix ? `${prefix}_${s}` : s;
}
