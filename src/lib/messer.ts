import { isCertId, type CertId } from './comptia';

/**
 * Professor Messer's free course index for each exam.
 * Section ids were read from those pages on 2026-10-02.
 * A section is linked with #id only when that id is unique and points at the section heading.
 * Sections whose id is missing or duplicated link to the course index.
 */
const COURSES: Record<CertId, { index: string; sections: { name: string; anchor: string | null }[] }> = {
  '220-1201': {
    index: 'https://www.professormesser.com/free-a-plus-training/220-1201/220-1201-video/220-1201-training-course/',
    sections: [
      { name: 'Mobile Devices', anchor: 'section-1-mobile-devices' },
      { name: 'Networking', anchor: 'section-2-networking' },
      { name: 'Hardware', anchor: 'section-3-hardware' },
      { name: 'Virtualization and Cloud Computing', anchor: 'section-4-virtualization-and-cloud-computing' },
      { name: 'Hardware and Network Troubleshooting', anchor: 'section-5-hardware-and-network-troubleshooting' },
    ],
  },
  '220-1202': {
    index: 'https://www.professormesser.com/free-a-plus-training/220-1202/220-1202-video/220-1202-training-course/',
    sections: [
      { name: 'Operating Systems', anchor: 'section-1-operating-systems' },
      { name: 'Security', anchor: 'section-2-security' },
      { name: 'Software Troubleshooting', anchor: 'section-3-software-troubleshooting' },
      { name: 'Operational Procedures', anchor: 'section-4-operational-procedures' },
    ],
  },
  '220-1101': {
    index: 'https://www.professormesser.com/free-a-plus-training/220-1101/220-1101-video/220-1101-training-course/',
    sections: [
      { name: 'Mobile Devices', anchor: 'section-1-mobile-devices' },
      { name: 'Networking', anchor: 'section-2-networking' },
      { name: 'Hardware', anchor: 'section-3-hardware' },
      { name: 'Virtualization and Cloud Computing', anchor: 'section-4-virtualization-and-cloud-computing' },
      { name: 'Hardware and Network Troubleshooting', anchor: 'section-5-hardware-and-network-troubleshooting' },
    ],
  },
  '220-1102': {
    index: 'https://www.professormesser.com/free-a-plus-training/220-1102/220-1102-video/220-1102-training-course/',
    sections: [
      { name: 'Operating Systems', anchor: 'section-1-operating-systems' },
      { name: 'Security', anchor: 'section-2-security' },
      { name: 'Software Troubleshooting', anchor: 'section-3-software-troubleshooting' },
      { name: 'Operational Procedures', anchor: 'section-4-operational-procedures' },
    ],
  },
  'N10-009': {
    index: 'https://www.professormesser.com/network-plus/n10-009/n10-009-video/n10-009-training-course/',
    sections: [
      { name: 'Networking Concepts', anchor: 'section-1-networking-concepts' },
      { name: 'Network Implementation', anchor: null },
      { name: 'Network Operations', anchor: null },
      { name: 'Network Security', anchor: null },
      { name: 'Network Troubleshooting', anchor: null },
    ],
  },
  'SY0-701': {
    index: 'https://www.professormesser.com/security-plus/sy0-701/sy0-701-video/sy0-701-comptia-security-plus-course/',
    sections: [
      { name: 'General Security Concepts', anchor: 'section-1-general-security-concepts' },
      { name: 'Threats, Vulnerabilities, and Mitigations', anchor: 'section-2-threats-vulnerabilities-and-mitigations' },
      { name: 'Security Architecture', anchor: null },
      { name: 'Security Operations', anchor: null },
      { name: 'Security Program Management and Oversight', anchor: null },
    ],
  },
};

export function messerCourseIndex(certId: CertId): string {
  return COURSES[certId].index;
}

export function normDomainName(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(domain|section)\b/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sectionHref(index: string, anchor: string | null): string {
  return anchor ? `${index}#${anchor}` : index;
}

/**
 * Course page for one domain. Unknown certs return null so the UI shows no link.
 * A domain that does not match a section still opens that cert's course index.
 */
export function messerHref(certId: string | null | undefined, domainName: string): string | null {
  if (!isCertId(certId)) return null;
  const course = COURSES[certId];
  const name = normDomainName(domainName);
  if (!name || name === 'no') return course.index;
  const hits: { anchor: string | null; score: number; length: number }[] = [];
  for (const section of course.sections) {
    const sectionName = normDomainName(section.name);
    let score = 0;
    if (name === sectionName) score = 3;
    else if (sectionName && name.includes(sectionName)) score = 2;
    else if (sectionName && sectionName.includes(name)) score = 1;
    if (score) hits.push({ anchor: section.anchor, score, length: sectionName.length });
  }
  if (!hits.length) return course.index;
  const bestScore = Math.max(...hits.map((hit) => hit.score));
  const top = hits.filter((hit) => hit.score === bestScore);
  if (bestScore < 3 && top.length > 1) return course.index;
  const winner = [...top].sort((a, b) => b.length - a.length)[0];
  return sectionHref(course.index, winner?.anchor ?? null);
}

/** True when any of the text names Professor Messer. */
export function mentionsProfessorMesser(texts: Iterable<string | null | undefined>): boolean {
  for (const text of texts) {
    if (text && /professor\s*messer/i.test(text)) return true;
  }
  return false;
}
