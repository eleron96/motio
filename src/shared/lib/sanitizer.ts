import DOMPurify from 'dompurify';

const RICH_TEXT_TAGS = [
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
];

const RICH_TEXT_CSS_PROPERTIES = ['width', 'height'];

const RICH_TEXT_URI_REGEXP =
  /^(?:(?:https?|mailto)|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i;

const TASK_DESCRIPTION_ATTRS = ['src', 'alt', 'style', 'width', 'height'];

const COMMENT_ATTRS = [
  ...TASK_DESCRIPTION_ATTRS,
  'class',
  'data-mention-user-id',
  'data-mention-name',
  'contenteditable',
];

const isBrowser = typeof window !== 'undefined';

export const sanitizeTaskRichText = (html: string): string => {
  if (!isBrowser) return html;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: RICH_TEXT_TAGS,
    ALLOWED_ATTR: TASK_DESCRIPTION_ATTRS,
    ALLOWED_URI_REGEXP: RICH_TEXT_URI_REGEXP,
    ALLOWED_CSS_PROPERTIES: RICH_TEXT_CSS_PROPERTIES,
  });
};

export const sanitizeCommentRichText = (html: string): string => {
  if (!isBrowser) return html;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: RICH_TEXT_TAGS,
    ALLOWED_ATTR: COMMENT_ATTRS,
    ALLOWED_URI_REGEXP: RICH_TEXT_URI_REGEXP,
    ALLOWED_CSS_PROPERTIES: RICH_TEXT_CSS_PROPERTIES,
  });
};
