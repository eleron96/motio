const PARAGRAPH_BLOCK_TAGS = new Set(['DIV', 'P']);

export const hasTaskCommentRichTags = (value: string) => (
  /<\/?(b|strong|i|em|u|s|strike|ul|ol|li|blockquote|br|div|p|span|img)\b/i.test(value)
);

export const normalizeTaskCommentPlainText = (text: string) => text.replace(/\u00a0/g, ' ');

const isWhitespaceTextNode = (node: Node) => (
  node.nodeType === Node.TEXT_NODE
  && normalizeTaskCommentPlainText(node.textContent ?? '').trim().length === 0
);

const hasVisibleContent = (node: Node): boolean => {
  if (node.nodeType === Node.TEXT_NODE) {
    return normalizeTaskCommentPlainText(node.textContent ?? '').trim().length > 0;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  const element = node as HTMLElement;
  if (element.tagName === 'IMG') return true;

  return Array.from(element.childNodes).some(hasVisibleContent);
};

const isEmptyVisualNode = (node: Node) => !hasVisibleContent(node);

const trimBoundaryNodes = (root: HTMLElement) => {
  while (root.firstChild && (isWhitespaceTextNode(root.firstChild) || isEmptyVisualNode(root.firstChild))) {
    root.removeChild(root.firstChild);
  }

  while (root.lastChild && (isWhitespaceTextNode(root.lastChild) || isEmptyVisualNode(root.lastChild))) {
    root.removeChild(root.lastChild);
  }
};

export const normalizeTaskCommentEditorHtml = (html: string): string => {
  if (typeof document === 'undefined' || !html) return html;

  const root = document.createElement('div');
  root.innerHTML = html;

  Array.from(root.childNodes).forEach((node) => {
    if (isWhitespaceTextNode(node)) root.removeChild(node);
  });
  trimBoundaryNodes(root);

  const topLevelNodes = Array.from(root.childNodes);
  const hasOnlyParagraphBlocks = topLevelNodes.length > 0 && topLevelNodes.every((node) => (
    node.nodeType === Node.ELEMENT_NODE
    && PARAGRAPH_BLOCK_TAGS.has((node as HTMLElement).tagName)
  ));

  if (!hasOnlyParagraphBlocks) {
    return root.innerHTML;
  }

  const normalizedRoot = document.createElement('div');
  normalizedRoot.innerHTML = topLevelNodes
    .map((node) => (isEmptyVisualNode(node) ? '' : (node as HTMLElement).innerHTML))
    .join('<br>');

  trimBoundaryNodes(normalizedRoot);
  return normalizedRoot.innerHTML;
};
