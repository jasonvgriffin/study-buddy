import { describe, expect, it } from 'vitest';
import { messerCourseIndex, messerHref } from './messer';

const INDEX = {
  '220-1201': 'https://www.professormesser.com/free-a-plus-training/220-1201/220-1201-video/220-1201-training-course/',
  '220-1202': 'https://www.professormesser.com/free-a-plus-training/220-1202/220-1202-video/220-1202-training-course/',
  '220-1101': 'https://www.professormesser.com/free-a-plus-training/220-1101/220-1101-video/220-1101-training-course/',
  '220-1102': 'https://www.professormesser.com/free-a-plus-training/220-1102/220-1102-video/220-1102-training-course/',
  'N10-009': 'https://www.professormesser.com/network-plus/n10-009/n10-009-video/n10-009-training-course/',
  'SY0-701': 'https://www.professormesser.com/security-plus/sy0-701/sy0-701-video/sy0-701-comptia-security-plus-course/',
} as const;

describe('messer links', () => {
  it('hides the link when no cert is detected', () => {
    expect(messerHref(null, 'Mobile Devices')).toBeNull();
    expect(messerHref('biology', 'Hardware')).toBeNull();
  });

  it('opens the matching section when that page has an anchor', () => {
    expect(messerHref('220-1201', 'Mobile Devices')).toBe(`${INDEX['220-1201']}#section-1-mobile-devices`);
    expect(messerHref('220-1201', 'hardware and network troubleshooting')).toBe(
      `${INDEX['220-1201']}#section-5-hardware-and-network-troubleshooting`,
    );
    expect(messerHref('220-1202', 'Operating Systems')).toBe(`${INDEX['220-1202']}#section-1-operating-systems`);
    expect(messerHref('220-1101', 'Networking')).toBe(`${INDEX['220-1101']}#section-2-networking`);
    expect(messerHref('220-1102', 'Operational Procedures')).toBe(
      `${INDEX['220-1102']}#section-4-operational-procedures`,
    );
    expect(messerHref('N10-009', 'Networking Concepts')).toBe(`${INDEX['N10-009']}#section-1-networking-concepts`);
    expect(messerHref('SY0-701', 'Threats, Vulnerabilities, and Mitigations')).toBe(
      `${INDEX['SY0-701']}#section-2-threats-vulnerabilities-and-mitigations`,
    );
  });

  it('uses the course index when the section has no unique anchor or the name does not match', () => {
    expect(messerHref('N10-009', 'Network Implementation')).toBe(INDEX['N10-009']);
    expect(messerHref('N10-009', 'Network Troubleshooting')).toBe(INDEX['N10-009']);
    expect(messerHref('SY0-701', 'Security Architecture')).toBe(INDEX['SY0-701']);
    expect(messerHref('SY0-701', 'Security Program Management and Oversight')).toBe(INDEX['SY0-701']);
    expect(messerHref('SY0-701', 'Security')).toBe(INDEX['SY0-701']);
    expect(messerHref('220-1201', 'Rivers')).toBe(messerCourseIndex('220-1201'));
    expect(messerHref('220-1201', 'No domain')).toBe(INDEX['220-1201']);
  });
});

import { mentionsProfessorMesser } from './messer';
import { describe as describeMention, expect as expectMention, it as itMention } from 'vitest';

describeMention('mentionsProfessorMesser', () => {
  itMention('needs the name Professor Messer', () => {
    expectMention(mentionsProfessorMesser(['CompTIA A+ 220-1201 practice exam'])).toBe(false);
    expectMention(mentionsProfessorMesser(['', 'From PROFESSOR  MESSER, LLC'])).toBe(true);
    expectMention(mentionsProfessorMesser([null, 'professormesser.com'])).toBe(true);
  });
});
