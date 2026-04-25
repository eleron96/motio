import { sanitizeTaskRichText } from '@/shared/lib/sanitizer';

export const hasRichTags = (value: string) => (
  /<\/?(b|strong|i|em|u|s|strike|ul|ol|li|blockquote|br|div|p|span|img)\b/i.test(value)
);

export const sanitizeTaskDescription = sanitizeTaskRichText;
