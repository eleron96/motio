// A person's colour, as picked in workspace settings (PERSON_PRESET_COLORS).
//
// One stored value serves three surfaces with different contrast needs:
//   * calendar day circles and dashboard series take the pastel hex as-is;
//   * the avatar monogram cannot — its initials are white, and white on pastel
//     is unreadable. toMonogramColor keeps the HUE and swaps in the saturation
//     and lightness getMonogramColor already uses, so the person stays
//     recognisable by colour and the initials stay legible.

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Saturation/lightness of every monogram background, see getMonogramColor. */
const MONOGRAM_SATURATION = 55;
const MONOGRAM_LIGHTNESS = 45;

/** Below this the source colour is grey, and a hue would be meaningless. */
const GREY_SATURATION_THRESHOLD = 0.08;

export const isPersonColor = (value: unknown): value is string => (
  typeof value === 'string' && HEX_COLOR.test(value)
);

/**
 * Who may recolour whom, mirroring set_assignee_color() in migration 0135: a
 * workspace admin recolours anyone, anybody else only the person that is
 * themselves. People without an account (external contacts) are admin-only,
 * since nobody can claim them.
 */
export const canEditPersonColor = ({
  isAdmin,
  assigneeUserId,
  currentUserId,
}: {
  isAdmin: boolean;
  assigneeUserId?: string | null;
  currentUserId?: string | null;
}): boolean => (
  isAdmin || Boolean(assigneeUserId && currentUserId && assigneeUserId === currentUserId)
);

/** Hue in degrees plus saturation as 0..1, from a #rrggbb string. */
const readHueAndSaturation = (hex: string): { hue: number; saturation: number } => {
  const red = parseInt(hex.slice(1, 3), 16) / 255;
  const green = parseInt(hex.slice(3, 5), 16) / 255;
  const blue = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) return { hue: 0, saturation: 0 };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));

  let hue: number;
  if (max === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  return { hue: (hue * 60 + 360) % 360, saturation };
};

/**
 * Monogram background for a person who picked a colour. Returns null for
 * anything that is not a colour we stored, so callers fall back to the
 * id-hashed default instead of rendering a broken style.
 */
export const toMonogramColor = (color: unknown): string | null => {
  if (!isPersonColor(color)) return null;
  const { hue, saturation } = readHueAndSaturation(color);
  if (saturation < GREY_SATURATION_THRESHOLD) {
    return `hsl(0, 0%, ${MONOGRAM_LIGHTNESS}%)`;
  }
  return `hsl(${Math.round(hue)}, ${MONOGRAM_SATURATION}%, ${MONOGRAM_LIGHTNESS}%)`;
};
