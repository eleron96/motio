import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge, twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// tailwind.config adds its own font sizes (`text-ui-2xs` … `text-ui-2xl`).
// Plain tailwind-merge does not read the config and takes them for a text
// *colour*, so a size and a real colour "conflict" and one of them is dropped.
// `cn` still behaves that way on purpose: switching it would also resize
// buttons and segmented controls across the app, which needs its own review.
// Components that must keep both — badges, whose text colour was being
// dropped (black text on a dark accent) — use this merge instead.
// Keep the list in sync with theme.extend.fontSize in tailwind.config.
export const UI_FONT_SIZES = ["ui-2xs", "ui-xs", "ui-sm", "ui-base", "ui-lg", "ui-xl", "ui-2xl"];

const twMergeWithUiSizes = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: UI_FONT_SIZES }],
    },
  },
});

export function cnWithUiSizes(...inputs: ClassValue[]) {
  return twMergeWithUiSizes(clsx(inputs));
}
