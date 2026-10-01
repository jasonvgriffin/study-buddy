export const TEXT_SIZES = ['small', 'normal', 'large', 'xlarge'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

const STORAGE_KEY = 'study-buddy-text-size';

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  small: 'Small',
  normal: 'Normal',
  large: 'Large',
  xlarge: 'Extra large',
};

export function parseTextSize(value: string | null | undefined): TextSize {
  if (value === 'small' || value === 'normal' || value === 'large' || value === 'xlarge') return value;
  return 'normal';
}

export function readTextSize(): TextSize {
  try {
    return parseTextSize(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'normal';
  }
}

export function applyTextSize(size: TextSize): void {
  document.documentElement.dataset.textSize = size;
}

export function writeTextSize(size: TextSize): void {
  try {
    localStorage.setItem(STORAGE_KEY, size);
  } catch {
    // Private mode can refuse storage. The size still applies for this visit.
  }
  applyTextSize(size);
}
