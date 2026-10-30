/**
 * Picture files of a paste, when the paste IS a picture (a screenshot). A
 * clipboard that also carries text — a spreadsheet range, a web page — pastes
 * as text: those apps add a rendered image of the copy that nobody asked for.
 */
export const pastedImageFiles = (clipboard: DataTransfer | null): File[] => {
  if (!clipboard) return [];
  if (clipboard.getData('text/plain').trim() !== '') return [];
  const fromItems = Array.from(clipboard.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  if (fromItems.length > 0) return fromItems;
  return Array.from(clipboard.files ?? []).filter((file) => file.type.startsWith('image/'));
};
