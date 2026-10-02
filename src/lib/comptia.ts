/**
 * Official CompTIA domain weights, as a percent of that exam.
 * Checked against CompTIA exam objectives on 2026-10-02.
 *
 * 220-1201 — CompTIA A+ Core 1 (220-1201) Exam Objectives, document version 3.0:
 *   https://assets.ctfassets.net/82ripq7fjls2/1oSdlyujpaX3GrM0rir6Ge/91afb2be72785281e8fb4c0d9a70c6f4/CompTIA-A-220-1201-Exam-Objectives-3.0.pdf
 *   and https://www.comptia.org/en-us/certifications/a/core-1-and-2-v15/
 * 220-1202 — CompTIA A+ Core 2 (220-1202) Exam Objectives (Copyright 2024 CompTIA)
 *   and https://www.comptia.org/en-us/certifications/a/core-2-v15/
 * 220-1101 and 220-1102 — CompTIA, "The New CompTIA A+: Your Questions Answered":
 *   https://www.comptia.org/en/blog/the-new-comptia-a-your-questions-answered/
 * N10-009 — CompTIA Network+ N10-009 Exam Objectives, document version 6.0,
 *   and https://www.comptia.org/en/blog/comptia-network-n10-008-vs-n10-009-whats-the-difference/
 * SY0-701 — CompTIA Security+ SY0-701 Exam Objectives:
 *   https://comptiacdn.azureedge.net/webcontent/docs/default-source/exam-objectives/comptia-security-sy0-701-exam-objectives-(6-0).pdf
 *   and https://www.comptia.org/en-us/blog/the-new-comptia-security-your-questions-answered/
 */

export const CERT_IDS = ['220-1201', '220-1202', '220-1101', '220-1102', 'N10-009', 'SY0-701'] as const;

export type CertId = (typeof CERT_IDS)[number];

export type OfficialDomain = {
  number: number;
  name: string;
  /** Percent of the exam, such as 13 for 13%. */
  percent: number;
};

export type CertExam = {
  id: CertId;
  label: string;
  domains: readonly OfficialDomain[];
};

const A_PLUS_CORE_1_1201: readonly OfficialDomain[] = [
  { number: 1, name: 'Mobile Devices', percent: 13 },
  { number: 2, name: 'Networking', percent: 23 },
  { number: 3, name: 'Hardware', percent: 25 },
  { number: 4, name: 'Virtualization and Cloud Computing', percent: 11 },
  { number: 5, name: 'Hardware and Network Troubleshooting', percent: 28 },
];

const A_PLUS_CORE_2_1202: readonly OfficialDomain[] = [
  { number: 1, name: 'Operating Systems', percent: 28 },
  { number: 2, name: 'Security', percent: 28 },
  { number: 3, name: 'Software Troubleshooting', percent: 23 },
  { number: 4, name: 'Operational Procedures', percent: 21 },
];

const A_PLUS_CORE_1_1101: readonly OfficialDomain[] = [
  { number: 1, name: 'Mobile Devices', percent: 15 },
  { number: 2, name: 'Networking', percent: 20 },
  { number: 3, name: 'Hardware', percent: 25 },
  { number: 4, name: 'Virtualization and Cloud Computing', percent: 11 },
  { number: 5, name: 'Hardware and Network Troubleshooting', percent: 29 },
];

const A_PLUS_CORE_2_1102: readonly OfficialDomain[] = [
  { number: 1, name: 'Operating Systems', percent: 31 },
  { number: 2, name: 'Security', percent: 25 },
  { number: 3, name: 'Software Troubleshooting', percent: 22 },
  { number: 4, name: 'Operational Procedures', percent: 22 },
];

const NETWORK_PLUS: readonly OfficialDomain[] = [
  { number: 1, name: 'Networking Concepts', percent: 23 },
  { number: 2, name: 'Network Implementation', percent: 20 },
  { number: 3, name: 'Network Operations', percent: 19 },
  { number: 4, name: 'Network Security', percent: 14 },
  { number: 5, name: 'Network Troubleshooting', percent: 24 },
];

const SECURITY_PLUS: readonly OfficialDomain[] = [
  { number: 1, name: 'General Security Concepts', percent: 12 },
  { number: 2, name: 'Threats, Vulnerabilities, and Mitigations', percent: 22 },
  { number: 3, name: 'Security Architecture', percent: 18 },
  { number: 4, name: 'Security Operations', percent: 28 },
  { number: 5, name: 'Security Program Management and Oversight', percent: 20 },
];

export const CERTS: readonly CertExam[] = [
  { id: '220-1201', label: 'A+ Core 1 (220-1201)', domains: A_PLUS_CORE_1_1201 },
  { id: '220-1202', label: 'A+ Core 2 (220-1202)', domains: A_PLUS_CORE_2_1202 },
  { id: '220-1101', label: 'A+ Core 1 (220-1101)', domains: A_PLUS_CORE_1_1101 },
  { id: '220-1102', label: 'A+ Core 2 (220-1102)', domains: A_PLUS_CORE_2_1102 },
  { id: 'N10-009', label: 'Network+ (N10-009)', domains: NETWORK_PLUS },
  { id: 'SY0-701', label: 'Security+ (SY0-701)', domains: SECURITY_PLUS },
];

export function isCertId(value: string | null | undefined): value is CertId {
  return CERT_IDS.some((id) => id === value);
}

export function certById(id: CertId): CertExam {
  const found = CERTS.find((cert) => cert.id === id);
  if (!found) throw new Error(`Unknown cert ${id}`);
  return found;
}

const EXPLICIT: { id: CertId; re: RegExp }[] = [
  { id: '220-1201', re: /220[-\s]?1201/i },
  { id: '220-1202', re: /220[-\s]?1202/i },
  { id: '220-1101', re: /220[-\s]?1101/i },
  { id: '220-1102', re: /220[-\s]?1102/i },
  { id: 'N10-009', re: /n10[-\s]?009/i },
  { id: 'SY0-701', re: /sy0[-\s]?701/i },
];

function firstExplicit(text: string): CertId | null {
  let best: { id: CertId; index: number } | null = null;
  for (const item of EXPLICIT) {
    const match = item.re.exec(text);
    if (match && (best == null || match.index < best.index)) best = { id: item.id, index: match.index };
  }
  const context = /a\s*\+|core\s*[12]|\b220\b/i.test(text);
  if (context) {
    for (const item of [
      { id: '220-1101' as const, re: /\b1101\b/ },
      { id: '220-1102' as const, re: /\b1102\b/ },
    ]) {
      const match = item.re.exec(text);
      if (match && (best == null || match.index < best.index)) best = { id: item.id, index: match.index };
    }
  }
  return best?.id ?? null;
}

function alias(text: string): CertId | null {
  if (/\bn10\b|network\s*\+|network plus/i.test(text)) return 'N10-009';
  if (/\bsy0\b|security\s*\+|security plus/i.test(text)) return 'SY0-701';
  const core1 = /core\s*1\b/i.test(text);
  const core2 = /core\s*2\b/i.test(text);
  if (core1 && !core2) return '220-1201';
  if (core2 && !core1) return '220-1202';
  return null;
}

/**
 * Exam code from a subject name, a test name, or a PDF name.
 * An explicit code wins over a nickname. Earlier texts win over later ones.
 * "Core 1" with no code means the current A+ Core 1 exam.
 */
export function detectCert(texts: readonly (string | null | undefined)[]): CertId | null {
  const values = texts.map((text) => text?.trim() ?? '').filter(Boolean);
  for (const text of values) {
    const code = firstExplicit(text);
    if (code) return code;
  }
  for (const text of values) {
    const nick = alias(text);
    if (nick) return nick;
  }
  return null;
}
