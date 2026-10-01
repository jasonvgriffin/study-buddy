// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { gradeLabels } from './parser';
import { choiceForKey, choiceReferencesOthers, presentChoices, readShuffle, writeShuffle } from './shuffle';

const rivers = [
  { label: 'A', text: 'Nile' },
  { label: 'B', text: 'Amazon' },
  { label: 'C', text: 'Danube' },
  { label: 'D', text: 'Rhine' },
];

beforeEach(() => {
  localStorage.clear();
});

describe('shuffle answers', () => {
  it('keeps labels on their text and still grades the stored correct letter', () => {
    const shown = presentChoices(rivers, 4, true);
    expect(shown.map((choice) => choice.label).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(shown.find((choice) => choice.label === 'A')?.text).toBe('Nile');
    const nile = shown.find((choice) => choice.text === 'Nile');
    expect(nile).toBeTruthy();
    expect(gradeLabels(['A'], [nile!.label])).toBe(true);
    expect(gradeLabels(['A'], ['B'])).toBe(false);
  });

  it('changes order for some seeds and stays put when the setting is off', () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 30; seed += 1) {
      orders.add(presentChoices(rivers, seed, true).map((choice) => choice.label).join(''));
    }
    expect(orders.size).toBeGreaterThan(1);
    expect(presentChoices(rivers, 4, true)).toEqual(presentChoices(rivers, 4, true));
    expect(presentChoices(rivers, 4, false).map((choice) => choice.label)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('does not move options that refer to other options', () => {
    expect(choiceReferencesOthers('All of the above')).toBe(true);
    expect(choiceReferencesOthers('None of these')).toBe(true);
    expect(choiceReferencesOthers('Both A and B')).toBe(true);
    expect(choiceReferencesOthers('A and B only')).toBe(true);
    expect(choiceReferencesOthers('Answers A and C')).toBe(true);
    expect(choiceReferencesOthers('HDMI cable')).toBe(false);
    expect(choiceReferencesOthers('A barometer measures pressure')).toBe(false);

    const choices = [
      { label: 'A', text: 'Nile' },
      { label: 'B', text: 'Amazon' },
      { label: 'C', text: 'Both A and B' },
      { label: 'D', text: 'All of the above' },
    ];
    let moved = false;
    for (let seed = 1; seed <= 40; seed += 1) {
      const shown = presentChoices(choices, seed, true);
      expect(shown[2]).toEqual(choices[2]);
      expect(shown[3]).toEqual(choices[3]);
      expect(shown.map((choice) => choice.text).slice(0, 2).sort()).toEqual(['Amazon', 'Nile']);
      if (shown[0].text !== 'Nile') moved = true;
    }
    expect(moved).toBe(true);
  });

  it('maps number keys to screen order and letter keys to labels', () => {
    const shown = [
      { label: 'C', text: 'Danube' },
      { label: 'A', text: 'Nile' },
    ];
    expect(choiceForKey(shown, '1')?.text).toBe('Danube');
    expect(choiceForKey(shown, '2')?.label).toBe('A');
    expect(choiceForKey(shown, 'a')?.text).toBe('Nile');
    expect(choiceForKey(shown, 'b')).toBeNull();
    expect(choiceForKey(shown, '9')).toBeNull();
  });

  it('defaults to on and remembers when it is turned off', () => {
    expect(readShuffle()).toBe(true);
    writeShuffle(false);
    expect(readShuffle()).toBe(false);
    writeShuffle(true);
    expect(readShuffle()).toBe(true);
  });
});
