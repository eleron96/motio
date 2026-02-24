import DOMPurify from 'dompurify';

export const hasRichTags = (value: string) => (
  /<\/?(b|strong|i|em|u|s|strike|ul|ol|li|blockquote|br|div|p|span|img)\b/i.test(value)
);

export const sanitizeTaskDescription = (value: string) => (
  DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [
      'b',
      'strong',
      'i',
      'em',
      'u',
      's',
      'strike',
      'ul',
      'ol',
      'li',
      'blockquote',
      'br',
      'div',
      'p',
      'span',
      'img',
    ],
    ALLOWED_ATTR: ['src', 'alt', 'style', 'width', 'height'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data:image\/)|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  })
);
