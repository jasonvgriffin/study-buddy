import { describe, expect, it } from 'vitest';
import { feedbackMailHref } from './feedbackMail';

describe('feedback mail link', () => {
  it('prefills the subject and includes the build', () => {
    const href = feedbackMailHref('abc1234', '2026-10-02T00:40:12.000Z');
    expect(href.startsWith('mailto:eve.chief_of_staff@agentmail.to?')).toBe(true);
    const query = href.slice(href.indexOf('?') + 1);
    const params = new URLSearchParams(query);
    expect(params.get('subject')).toBe('Study Buddy feedback');
    expect(params.get('body')).toContain('What happened:');
    expect(params.get('body')).toContain('App version: abc1234');
    expect(params.get('body')).toContain('Build: 2026-10-02 00:40 UTC');
  });
});