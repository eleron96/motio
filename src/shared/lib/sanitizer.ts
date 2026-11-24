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

// DOMPurify's own pattern narrowed to http(s) and mailto. The hyphen before
// `:` is escaped on purpose (an unescaped `.-:` is a range that also covers digits
// and `/`, which rejected relative paths like `img/x.png`), and the scheme
// must end in `:` (without it `httpfoo:` passed as http).
const RICH_TEXT_URI_REGEXP =
  /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

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
    ALLOWED_URI_REGEXP: RICH_TEXT_URI_REGEXP,  });
};

export const sanitizeCommentRichText = (html: string): string => {
  if (!isBrowser) return html;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: RICH_TEXT_TAGS,
    ALLOWED_ATTR: COMMENT_ATTRS,
    ALLOWED_URI_REGEXP: RICH_TEXT_URI_REGEXP,  });
};
