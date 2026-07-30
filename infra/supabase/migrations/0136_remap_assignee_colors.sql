-- The person palette (0135) grew from twelve colours to twenty, and the values
-- changed: the old list had pairs only ΔE 7.7 apart — "violet" and "periwinkle"
-- were the same swatch to the eye — so it was re-picked rather than extended.
--
-- A stored colour is just a hex string and stays valid whatever the palette says,
-- but a person holding a retired colour would see their swatch missing from the
-- picker, and "reset to auto" would be the only way back. So each retired colour
-- is moved to its nearest surviving one (nearest by CIE76 distance in Lab,
-- computed offline; distances are 6.7–16.6, i.e. the same colour family).
--
-- Only rows that still hold one of the twelve retired values are touched. Anything
-- else — a colour already from the new list, or NULL for automatic — is left alone.
--
-- Rollback: none needed. The values are cosmetic and the reverse mapping is not
-- unique anyway (two retired colours can land on the same new one).

update public.assignees as a
set color = m.new_color
from (values
  ('#a7ccf1', '#c2d6f4'), -- blue        -> powder blue
  ('#a0e3c2', '#bcf0c1'), -- green       -> mint cream
  ('#f7c9a1', '#deb373'), -- orange      -> amber
  ('#dab8ea', '#afa6d3'), -- violet      -> lavender
  ('#f4b9cc', '#ce8da0'), -- pink        -> dusty rose
  ('#9ddae7', '#c4f3f3'), -- teal        -> ice
  ('#f3e291', '#e5d96c'), -- yellow      -> butter
  ('#cabeef', '#afa6d3'), -- periwinkle  -> lavender
  ('#f1bcb1', '#cea08d'), -- coral       -> clay
  ('#b0ddb0', '#bcf0c1'), -- sage        -> mint cream
  ('#e6bcd8', '#e7cfcf'), -- mauve       -> rose mist
  ('#c7e0a3', '#bac68b')  -- lime        -> olive
) as m(old_color, new_color)
where lower(a.color) = m.old_color;
