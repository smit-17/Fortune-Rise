# Changed files: LEPDO brand refresh (Nov 2026)

Every change below is visual: a logo, colour, font or icon-style change.
No calculation, validation, permission, route, query, schema or workflow code was modified.

## Modified

| File | Change |
|---|---|
| `src/styles.css` | Central LEPDO design tokens (palette, neutrals, accessibility shades). Existing token names were remapped to the new values. Self-hosted Inter `@font-face`. `--font-sans` set to Inter. Dashboard headings moved from Sora to Inter. Uniform Lucide icon stroke (1.75, round caps). Blue focus outline. Tabular numerals on numeric inputs. |
| `src/routes/__root.tsx` | Removed the Manrope/Sora Google Fonts stylesheet. Added Inter preload links and a `theme-color` meta. |
| `src/components/lepdo/AppShell.tsx` | Sidebar logo replaced with the official logo (cream + orange O on Indigo, 150 px). Nav icons are Indigo, and the active icon is Orange. |
| `src/components/lepdo/AuthGate.tsx` | Login card logo replaced (180 px), with logo panel padding for clear space. "Access denied" icon uses the accessible orange shade. |
| `src/routes/reset-password.tsx` | Same logo replacement as the login card. |
| `src/routes/settings.tsx` | The default-logo preview in Settings → Branding shows the new logo on an Indigo panel at 150 px. An uploaded custom logo still displays exactly as before. The default pastel swatch value was updated. |
| `src/lib/lepdo/extras.ts` | Default branding colours only (`primary` → Indigo, `accent` → Cream, `pastel` → cream tint). Saved settings are not touched. |
| `src/lib/lepdo/invoiceDoc.ts` | Invoice / quotation / proforma template: new logo, Inter, Indigo header band and item header, Orange rules, Amber labels on Indigo, accessible orange caption text. Content, fields, numbers and layout are unchanged. |
| `src/lib/lepdo/report.ts`, `cashReport.ts`, `expenseReport.ts`, `salesReport.ts`, `uchhinaReport.ts`, `exportTable.ts` | Print / "Save as PDF" reports: Inter, Indigo table headers, Cream total rows, neutral borders. Excel output is unchanged. |
| `src/lib/lepdo/advancedReportExport.ts` | jsPDF export: embeds Inter (falls back to Helvetica), adds an Indigo title and header row, and right-aligns money columns. The text sanitising and values are unchanged. |
| `src/lib/error-page.ts` | Server error page colours and font. |
| `src/components/lepdo/sales/ui.tsx` | The `gold` stat tone uses the accessible orange text shade. |
| `src/routes/expense.tsx` | The "Unpaid" label uses the accessible orange text shade. |
| `src/routes/capital.tsx` | The small label on the Indigo EMI card uses Amber (approved pairing). |
| `src/routes/reports.tsx` | The three extra pie-chart colours were changed to brand tints. |
| `public/favicon.png`, `public/favicon.ico` | Old "Lepdo" diamond favicon replaced with a plain Indigo tile (see note). |
| `README.md` | Pointer to the rebrand documentation. |

## Added

| File | Purpose |
|---|---|
| `src/assets/brand/*.svg`, `index.ts` | Official logo artwork in the approved colourways, with usage notes |
| `src/assets/brand/lepdo-logo-white-on-black-master.png` | Supplied master logo (archived) |
| `src/lib/lepdo/brandPrint.ts` | Shared Inter font loading and brand colours for printable HTML reports |
| `src/lib/lepdo/brandPdfFont.ts` | Loads Inter into jsPDF exports |
| `public/fonts/*` | Inter woff2 files (latin + latin-ext, which includes ₹), subset Inter TTFs for PDF, and the Inter OFL licence |
| `.env.example` | Variable names only. Your real `.env` is intentionally not in the ZIP. |
| `preview-demo/**` | Optional demo kit with sample data (not used by the app) |
| `docs/rebrand/**` | This documentation and screenshots |

## Removed

| File | Reason |
|---|---|
| `src/assets/lepdo-logo.png.asset.json` | Pointer to the old logo on the Lovable CDN; nothing references it any more |

## Notes and decisions

- **Favicon.** The guideline (p.11) forbids cropping the O or building a favicon from part of the logo until a dedicated symbol is approved, and the full wordmark is illegible at 16–64 px. The favicon is therefore a plain Indigo tile with no mark. When an approved symbol exists, replace `public/favicon.png` and `public/favicon.ico`.
- **Sidebar clear space.** The logo is at the 150 px minimum inside the existing 64 px band. Horizontal clear space is met. Vertical clear space is tighter than one "L" width, because the band height was kept to avoid any layout change.
- **Login logo panel.** The logo panel padding grew (12 px → 24 px) so the larger logo keeps clear space. The form fields themselves are unchanged.
- **Custom uploaded logo.** If a logo was previously uploaded in Settings → Branding, invoices keep using it, because that is a saved setting. Click "Remove" there to use the new official logo.
- **Saved branding colours.** If Settings → Branding was saved before, the old primary/accent values remain stored and still drive the small preview on that page. Update them there if you want.
- **Re-printing old invoices.** Invoices are generated on demand from stored data, so re-printing a historical invoice now uses the new design. The invoice data itself (numbers, amounts, dates, GST) is never modified.
