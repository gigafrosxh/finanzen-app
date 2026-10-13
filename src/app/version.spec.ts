import { describe, expect, it } from 'vitest';
import { RELEASES, VERSION } from './version';

describe('Version', () => {
  it('neueste Änderungsliste passt zur Version in package.json', () => {
    expect(RELEASES[0].version).toBe(VERSION);
  });
  it('Versionen sind absteigend sortiert und eindeutig', () => {
    const v = RELEASES.map((r) => r.version.split('.').map(Number));
    for (let i = 1; i < v.length; i++) {
      const [a, b] = [v[i - 1], v[i]];
      expect(a[0] * 1e6 + a[1] * 1e3 + a[2]).toBeGreaterThan(b[0] * 1e6 + b[1] * 1e3 + b[2]);
    }
  });
});
