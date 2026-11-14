/**
 * Official LEPDO logo artwork (Brand Guidelines, Nov 2026).
 *
 * The SVGs are the exact vector paths of the approved logo master, taken
 * from the "Logo Backgrounds" page (p.15) of LEPDO_IDENTITY.pdf in the
 * colourways that page approves. They are not redrawn, recoloured or
 * cropped. Do not edit the path data.
 *
 * Usage rules: minimum digital width 150px; keep clear space of one
 * "L" width (≈13% of logo width) on all sides; never stretch, rotate,
 * add effects or separate the looping O from the wordmark.
 */
import onIndigo from "./lepdo-logo-cream-orange-on-indigo.svg";
import indigoOnLight from "./lepdo-logo-indigo-on-light.svg";
import indigoOrangeOnCream from "./lepdo-logo-indigo-orange-on-cream.svg";
import blackOnWhite from "./lepdo-logo-black-on-white.svg";
import white from "./lepdo-logo-white.svg";

export const LEPDO_LOGO = {
  /** Cream wordmark + Orange O — for Indigo panels (sidebar band, login, invoice header). */
  onIndigo,
  /** Indigo wordmark — for Cream / white / Orange / Amber backgrounds. */
  indigoOnLight,
  /** Indigo wordmark + Orange O — for Cream backgrounds at large sizes. */
  indigoOrangeOnCream,
  /** Black on white — monochrome documents. */
  blackOnWhite,
  /** White — for Black / Dark Grey / Blue backgrounds. */
  white,
} as const;

/** Width ÷ height of the logo artwork (outermost swash points included). */
export const LEPDO_LOGO_ASPECT = 2.9588;
/** Brand minimum digital width for the full logo. */
export const LEPDO_LOGO_MIN_WIDTH_PX = 150;
