/**
 * LEPDO brand styling shared by the printable / "Save as PDF" HTML reports.
 * Visual only: fonts and colours. Report content is produced elsewhere.
 */

function origin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

/** Brand colours (LEPDO Brand Guidelines, Nov 2026). */
export const BRAND = {
  indigo: "#2329A8",
  orange: "#FF6624",
  orangeInk: "#B83C0A",
  cream: "#F2E7E1",
  creamLight: "#FBF5F2",
  blue: "#355CF5",
  amber: "#FF9B29",
  ink: "#17181C",
  greyInk: "#5E636A",
  lightGrey: "#EDEDED",
  midGrey: "#CACBCC",
} as const;

/**
 * <head> fragment that loads self-hosted Inter for print windows.
 * The preload links delay the window's load event until the fonts are
 * fetched, so the existing `window.onload = print()` prints in Inter.
 */
export function brandPrintHead(): string {
  const o = origin();
  const face = (w: number, subset: "latin" | "latin-ext") =>
    `@font-face{font-family:"Inter";font-weight:${w};font-display:block;src:url("${o}/fonts/inter-${subset}-${w}-normal.woff2") format("woff2");${
      subset === "latin-ext" ? "unicode-range:U+0100-02BA,U+20A0-20C0;" : ""
    }}`;
  const weights = [400, 600, 700];
  return [
    ...weights.map(
      (w) =>
        `<link rel="preload" as="font" type="font/woff2" crossorigin href="${o}/fonts/inter-latin-${w}-normal.woff2">`,
    ),
    `<link rel="preload" as="font" type="font/woff2" crossorigin href="${o}/fonts/inter-latin-ext-400-normal.woff2">`,
    `<style>${weights.map((w) => face(w, "latin") + face(w, "latin-ext")).join("")}</style>`,
  ].join("");
}

/** Common font stack for printable documents. */
export const PRINT_FONT = `"Inter",Arial,Helvetica,sans-serif`;
