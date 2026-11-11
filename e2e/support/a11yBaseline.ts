/**
 * Accessibility rules each screen already breaks (axe rule ids). A rule that is
 * not listed fails the test; a listed one that axe no longer reports shows up
 * as a note on the test — remove it then, so the list only shrinks.
 */
export const A11Y_BASELINE = {
  "desktop timeline": ["aria-allowed-attr", "color-contrast", "label-content-name-mismatch"],
  "desktop task card": [
    "aria-input-field-name",
    "color-contrast",
    "label",
    "label-content-name-mismatch",
  ],
  "desktop dashboard": ["color-contrast", "label-content-name-mismatch", "svg-img-alt"],
  "desktop projects": ["color-contrast", "label-content-name-mismatch"],
  "desktop team": ["color-contrast", "label-content-name-mismatch"],
  "phone timeline": ["aria-allowed-attr", "color-contrast", "label-content-name-mismatch"],
} satisfies Record<string, string[]>;

export type A11yScreen = keyof typeof A11Y_BASELINE;
