import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('reference nginx config', () => {
  const conf = readFileSync('deploy/nginx.conf', 'utf8');
  const csps = [...conf.matchAll(/Content-Security-Policy "([^"]+)"/g)].map((m) => m[1]);

  it('quotes CSP keywords, which browsers otherwise read as host names', () => {
    expect(csps.length).toBeGreaterThan(0);
    for (const csp of csps) {
      expect(csp).toMatch(/default-src 'self'/);
      expect(csp).not.toMatch(/(^|[\s;])(self|none|unsafe-inline)(?=[\s;]|$)/);
    }
  });

  it('allows only first-party scripts', () => {
    for (const csp of csps) expect(csp).toMatch(/script-src 'self';/);
  });
});
