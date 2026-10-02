export const UPLOADING_STATUS = 'Uploading…';
export const READING_STATUS = 'Reading questions… please wait';

export function addedQuestionsMessage(count: number, fileName: string): string {
  const noun = count === 1 ? 'question' : 'questions';
  return `Added ${count} ${noun} from ${fileName}`;
}
