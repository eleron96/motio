import { sanitizeCommentRichText, sanitizeTaskRichText } from '@/shared/lib/sanitizer';

/**
 * Normalises HTML arriving from the system clipboard before it is inserted
 * into one of our contenteditable editors.
 *
 * DOMPurify decides which tags survive but keeps `style` verbatim, so pasting
 * from an external editor (Bitrix24 chat, Word, mail clients) drags that
 * editor's entire layout into a task description: absolute-positioned
 * toolbars, background images, hard-coded fonts and colours, plus metadata the
 * source app deliberately hides off-screen (author name, message timestamp).
 * Rendered inside our own layout that markup escapes its container and
 * repaints the description.
 *
 * This runs on paste only — values already stored in the database are left
 * exactly as they are.
 *
 * Order matters: hidden nodes are dropped BEFORE styles are stripped. Doing it
 * the other way round would make the source app's hidden text (author names,
 * timestamps) suddenly visible in our editor.
 */

/** Inline styles we keep, and only on images — the editor sizes them itself. */
const KEPT_IMAGE_STYLE_PROPS = ['width', 'height', 'max-width', 'max-height'] as const;

/** `120px`, `70%`, `auto` — anything exotic is dropped rather than parsed. */
const SAFE_LENGTH_VALUE = /^(?:auto|\d+(?:\.\d+)?(?:px|%|em|rem|vw|vh)?)$/i;

/** Only absolute web images survive; `file://`, `cid:` and relative paths from
 *  the source app would render as broken icons. */
const USABLE_IMAGE_SRC = /^(?:https?:\/\/|data:image\/)/i;

/** Elements pruned when they end up empty after cleanup. */
const PRUNABLE_EMPTY_TAGS = new Set([
  'DIV', 'SPAN', 'P', 'I', 'B', 'STRONG', 'EM', 'U', 'S', 'STRIKE', 'BLOCKQUOTE', 'LI', 'UL', 'OL',
]);

/** `data-*` attributes that mean something to us. Everything else is the source
 *  app's bookkeeping (message ids, thread markers) and goes. */
const KEPT_DATA_ATTRS = new Set([
  'data-mention-user-id',
  'data-mention-name',
  'data-rte-image',
  'data-handle',
]);

const OFFSCREEN_PX = -1000;
const TINY_PX = 2;

const toPx = (value: string): number | null => {
  const match = /^(-?\d+(?:\.\d+)?)px$/i.exec(value.trim());
  return match ? Number(match[1]) : null;
};

const isTransparentColor = (value: string): boolean => {
  const color = value.trim().toLowerCase();
  if (color === 'transparent') return true;
  const rgba = /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/.exec(color);
  return rgba ? Number(rgba[1]) === 0 : false;
};

/**
 * Detects the tricks source apps use to park text out of sight: chat clients
 * ship the author name and timestamp inside 1px, off-screen or transparent
 * nodes so a copy carries them without showing them.
 */
const isVisuallyHidden = (element: HTMLElement): boolean => {
  // getPropertyValue rather than the typed accessors: jsdom's CSS layer only
  // implements a subset of them, and a missing accessor would silently read as
  // "not hidden" in tests while behaving differently in the browser.
  const read = (property: string) => element.style.getPropertyValue(property).trim();

  if (read('display') === 'none') return true;
  const visibility = read('visibility');
  if (visibility === 'hidden' || visibility === 'collapse') return true;
  const opacity = read('opacity');
  if (opacity !== '' && Number(opacity) === 0) return true;
  const color = read('color');
  if (color !== '' && isTransparentColor(color)) return true;
  if (toPx(read('font-size')) === 0) return true;

  const width = toPx(read('width'));
  const height = toPx(read('height'));
  const isTiny = width !== null && width <= TINY_PX && height !== null && height <= TINY_PX;

  const position = read('position');
  if (position === 'absolute' || position === 'fixed') {
    const left = toPx(read('left'));
    const top = toPx(read('top'));
    if (left !== null && left <= OFFSCREEN_PX) return true;
    if (top !== null && top <= OFFSCREEN_PX) return true;
    if (isTiny) return true;
  }

  return isTiny && read('overflow') === 'hidden';
};

const removeUnusableImages = (root: DocumentFragment) => {
  root.querySelectorAll('img').forEach((image) => {
    const src = image.getAttribute('src') ?? '';
    if (!USABLE_IMAGE_SRC.test(src)) {
      image.remove();
    }
  });
};

const removeHiddenElements = (root: DocumentFragment) => {
  root.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    // An ancestor may already have taken this node out with it.
    if (!root.contains(element)) return;
    // Never drop a subtree that carries an image — a mis-detected wrapper
    // would cost the user real content, while a stray style costs nothing.
    if (element.querySelector('img')) return;
    if (isVisuallyHidden(element)) {
      element.remove();
    }
  });
};

const stripInlineStyles = (root: DocumentFragment) => {
  root.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    if (element.tagName !== 'IMG') {
      element.removeAttribute('style');
      return;
    }
    const kept = KEPT_IMAGE_STYLE_PROPS
      .map((property) => [property, element.style.getPropertyValue(property).trim()] as const)
      .filter(([, value]) => value !== '' && SAFE_LENGTH_VALUE.test(value))
      .map(([property, value]) => `${property}: ${value}`);

    if (kept.length === 0) {
      element.removeAttribute('style');
      return;
    }
    element.setAttribute('style', kept.join('; '));
  });
};

const stripForeignDataAttrs = (root: DocumentFragment) => {
  root.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach(({ name }) => {
      if (name.startsWith('data-') && !KEPT_DATA_ATTRS.has(name)) {
        element.removeAttribute(name);
      }
    });
  });
};

/**
 * Blocks that were already empty on the clipboard are the user's own blank
 * lines — notes written before line breaks became `<br>` still store them as
 * empty `div`s, and `.feedRichText div:empty` is what gives them their height
 * back. Only blocks *we* emptied are shells worth pruning.
 */
const collectPreExistingEmpties = (root: DocumentFragment): WeakSet<Element> => {
  const empties = new WeakSet<Element>();
  root.querySelectorAll('*').forEach((element) => {
    if (element.childNodes.length === 0 && element.attributes.length === 0) {
      empties.add(element);
    }
  });
  return empties;
};

const isPrunableEmpty = (element: Element, preExistingEmpties: WeakSet<Element>): boolean => {
  if (!PRUNABLE_EMPTY_TAGS.has(element.tagName)) return false;
  if (preExistingEmpties.has(element)) return false;
  // Attributes surviving sanitisation are meaningful to us (mention metadata,
  // the image wrapper's class) — keep those nodes even when they look empty.
  if (element.attributes.length > 0) return false;
  if (element.querySelector('img, br')) return false;
  return (element.textContent ?? '').replace(/\u00a0/g, ' ').trim() === '';
};

/**
 * Source apps wrap every message in several layers of layout `div`s. Once the
 * styles are gone the ones that only held a background image or an icon are
 * empty shells, so drop them — repeatedly, because pruning a child can leave
 * its parent empty in turn.
 */
const pruneEmptyElements = (root: DocumentFragment, preExistingEmpties: WeakSet<Element>) => {
  let removedSomething = true;
  while (removedSomething) {
    removedSomething = false;
    root.querySelectorAll('*').forEach((element) => {
      if (!root.contains(element)) return;
      if (isPrunableEmpty(element, preExistingEmpties)) {
        element.remove();
        removedSomething = true;
      }
    });
  }
};

const cleanPastedFragment = (sanitizedHtml: string): string => {
  if (!sanitizedHtml.includes('<')) return sanitizedHtml;
  const template = document.createElement('template');
  template.innerHTML = sanitizedHtml;
  const root = template.content;

  const preExistingEmpties = collectPreExistingEmpties(root);
  removeUnusableImages(root);
  removeHiddenElements(root);
  stripInlineStyles(root);
  stripForeignDataAttrs(root);
  pruneEmptyElements(root, preExistingEmpties);

  return template.innerHTML;
};

/** Clipboard HTML normalised for task descriptions and project notes. */
export const normalizePastedTaskHtml = (html: string): string => (
  cleanPastedFragment(sanitizeTaskRichText(html))
);

/** Clipboard HTML normalised for task comments (keeps mention metadata). */
export const normalizePastedCommentHtml = (html: string): string => (
  cleanPastedFragment(sanitizeCommentRichText(html))
);
