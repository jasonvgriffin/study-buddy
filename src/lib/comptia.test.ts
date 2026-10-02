import { describe, expect, it } from 'vitest';
import { CERTS, detectCert } from './comptia';

describe('official weights', () => {
  it('sums each exam to 100', () => {
    for (const cert of CERTS) {
      const total = cert.domains.reduce((sum, domain) => sum + domain.percent, 0);
      expect(total, cert.id).toBe(100);
    }
  });
});

describe('detectCert', () => {
  it('reads exam codes from a subject, a test, or a PDF name', () => {
    expect(detectCert(['A+ Core 1 220-1201'])).toBe('220-1201');
    expect(detectCert(['220-1202 practice'])).toBe('220-1202');
    expect(detectCert(['professor-messer-a-plus-220-1101-core-1.pdf'])).toBe('220-1101');
    expect(detectCert(['Core 2 1102'])).toBe('220-1102');
    expect(detectCert(['Network+ N10-009'])).toBe('N10-009');
    expect(detectCert(['SY0-701 Security+'])).toBe('SY0-701');
  });

  it('uses the current exam when the name has no code', () => {
    expect(detectCert(['Core 1'])).toBe('220-1201');
    expect(detectCert(['Core 2'])).toBe('220-1202');
    expect(detectCert(['Network+'])).toBe('N10-009');
    expect(detectCert(['Security+'])).toBe('SY0-701');
  });

  it('lets an explicit code beat a nickname, and returns null when nothing matches', () => {
    expect(detectCert(['Core 1', 'notes-220-1101.pdf'])).toBe('220-1101');
    expect(detectCert(['Biology', 'chapter-4.pdf'])).toBeNull();
    expect(detectCert(['A+'])).toBeNull();
  });
});
