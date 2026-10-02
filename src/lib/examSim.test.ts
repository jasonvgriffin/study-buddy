import { describe, expect, it } from 'vitest';
import { allocateCounts, hasKnownWeights, initialWeightRows, officialRows, sampleExam, sampleNotes } from './examSim';

function randomFrom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

describe('allocateCounts', () => {
  it('follows the 220-1201 weights for a 90-question sitting', () => {
    const counts = allocateCounts([13, 23, 25, 11, 28], 90);
    expect(counts).toEqual([12, 21, 22, 10, 25]);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(90);
  });
});

describe('sampleExam', () => {
  const rows = officialRows('220-1201');

  it('uses the PDF percents when the deck recorded them', () => {
    const weights = initialWeightRows(
      '220-1201',
      [{ domains: [{ number: 1, name: 'Waterways', weight: 0.4 }, { number: 2, name: 'Skies', weight: 0.6 }] }],
      [],
    );
    expect(weights.map((row) => [row.name, row.percent])).toEqual([
      ['Waterways', 40],
      ['Skies', 60],
    ]);
  });

  it('falls back to the official weights when the PDF has none', () => {
    expect(initialWeightRows('N10-009', [{ domains: [] }], []).map((row) => row.percent)).toEqual([23, 20, 19, 14, 24]);
  });

  it('draws the domain mix and says when a domain is short', () => {
    const half = [
      { key: 'd:1', number: 1, name: 'Mobile Devices', percent: 50 },
      { key: 'd:2', number: 2, name: 'Networking', percent: 50 },
    ];
    const cards = [
      { id: 'm0', domainNumber: 1, domainName: 'Mobile Devices' },
      ...Array.from({ length: 20 }, (_, index) => ({ id: `n${index}`, domainNumber: 2, domainName: 'Networking' })),
    ];
    const result = sampleExam({ cards, rows: half, count: 10, random: randomFrom(3) });
    expect(result.ids.filter((id) => id.startsWith('m'))).toEqual(['m0']);
    expect(result.ids).toHaveLength(10);
    expect(result.shortages).toEqual([{ name: 'Mobile Devices', have: 1, wanted: 5 }]);
    expect(result.filledFromOthers).toBe(true);
    const text = sampleNotes(result).join(' ');
    expect(text).toContain('Mobile Devices has 1 question, so this sitting uses 1 instead of 5.');
    expect(text).toContain('filled from the other questions');
  });

  it('fills a short subject from every question it has', () => {
    const cards = [
      { id: 'a', domainNumber: null, domainName: null },
      { id: 'b', domainNumber: null, domainName: null },
    ];
    const result = sampleExam({ cards, rows, count: 90, random: randomFrom(1) });
    expect(result.ids.slice().sort()).toEqual(['a', 'b']);
    const text = sampleNotes(result).join(' ');
    expect(text).toContain('This subject has 2 questions, so the sitting uses 2 instead of 90.');
    expect(text).toContain('filled from the other questions');
  });

  it('knows the weights only for a known cert or a PDF with domain percents', () => {
    expect(hasKnownWeights('Rivers', [{ name: 'Practice Test 1', domains: [] }])).toBe(false);
    expect(hasKnownWeights('Security+ SY0-701', [])).toBe(true);
    expect(hasKnownWeights('Rivers', [{ domains: [{ number: 1, name: 'Waterways', weight: 0.4 }] }])).toBe(true);
  });
});
