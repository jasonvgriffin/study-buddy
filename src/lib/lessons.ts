import links from '../data/lesson-links.json';

export type LessonLink = {
  youtubeId: string;
  title: string;
  /** Only present when a verified chapter marks the start. Omit to open at 0:00. */
  startSeconds?: number;
};

const map = links as Record<string, LessonLink>;

/** YouTube when the build-time map verified the PDF link; otherwise the PDF URL itself. */
export function watchUrl(lessonUrl: string | null, videoStartSec: number | null): string | null {
  if (!lessonUrl) return null;
  const known = map[lessonUrl];
  const base = known ? `https://www.youtube.com/watch?v=${known.youtubeId}` : lessonUrl;
  const start = videoStartSec ?? known?.startSeconds ?? null;
  if (start == null || start <= 0) return base;
  const join = base.includes('?') ? '&' : '?';
  return `${base}${join}t=${Math.floor(start)}`;
}

export function lessonTitle(lessonUrl: string | null): string | null {
  if (!lessonUrl) return null;
  return map[lessonUrl]?.title ?? null;
}
