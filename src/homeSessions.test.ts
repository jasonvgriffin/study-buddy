import { describe, expect, it } from 'vitest';
import { openHomeSessions } from './homeSessions';

const sessions = [
  { id: 'a', status: 'paused', subjectId: 'rivers', updatedAt: 10 },
  { id: 'b', status: 'paused', subjectId: 'rivers', updatedAt: 30 },
  { id: 'c', status: 'finished', subjectId: 'rivers', updatedAt: 40 },
  { id: 'd', status: 'active', subjectId: 'weather', updatedAt: 20 },
];

describe('open home sessions', () => {
  it('lists every unfinished session, most recently active first', () => {
    expect(openHomeSessions(sessions, () => true).map((session) => session.id)).toEqual(['b', 'd', 'a']);
  });

  it('hides a finished sitting and sessions outside the focused subject', () => {
    expect(openHomeSessions(sessions, (subjectId) => subjectId === 'rivers').map((session) => session.id)).toEqual([
      'b',
      'a',
    ]);
    expect(openHomeSessions(sessions, (subjectId) => subjectId === 'weather').map((session) => session.id)).toEqual([
      'd',
    ]);
    expect(openHomeSessions(sessions, () => false)).toEqual([]);
  });
});
