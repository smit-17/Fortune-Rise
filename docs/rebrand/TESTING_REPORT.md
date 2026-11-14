# Functionality & testing report: LEPDO brand refresh

Date: 14 Nov 2026. Environment: Node 22, Chrome (headless), npm registry install.

## Automated checks

| Check | Original code | Rebranded code |
|---|---|---|
| `tsc --noEmit` | pass | pass (0 errors) |
| `npm run build` (client + SSR + Nitro) | pass | pass |
| Vitest unit tests (currency, bank import, date filters, sales reports) | 51 / 51 pass | 51 / 51 pass |
| Vitest routing tests (`app-routing.test.tsx`) | 2 fail in this sandbox | 2 pass |
| ESLint | 1,269 pre-existing errors (mostly Prettier formatting) | 1,281: +12 Prettier-format items in `advancedReportExport.ts` (the file already uses a non-Prettier style); no new rule types |

The routing tests are the only difference. In the original code, the test
render requested the Manrope/Sora stylesheet from Google Fonts, which cannot
load in an offline test environment. Inter is now self-hosted, so that request
is gone. No test or application logic was changed.

## Functional preservation

- The changes were reviewed line by line: every modified `.tsx`/`.ts` line is a class name, colour value, font, logo import or `<img>`. Diff summary is in `CHANGED_FILES.md`.
- No changes to: `src/lib/lepdo/store.tsx`, `sales.ts`, `purchase.ts`, `bank.ts`, `currency.ts`, `format.ts`, `merge.ts`, `workspace.functions.ts`, `src/lib/auth/*`, `src/integrations/supabase/*`, `supabase/migrations/*`, `drizzle/*`, `routeTree.gen.ts`, `package.json`, `bun.lock`, `vite.config.ts`.
- Routes: the same 17 pages plus the root route, and the same navigation entries in the same order with the same permission checks.
- Layout parity: the original and rebranded apps were rendered side by side with identical sample data at 1440 px. Every card, table, column and control is in the same position (see `screenshots/before_after.png`).

## Visual verification (demo data, Chrome)

| Screen | Desktop 1440 | Mobile 390 | Result |
|---|---|---|---|
| Dashboard | ✓ | ✓ | Logo, Indigo balance card, cream profit card, Inter tabular figures |
| P&L, Drawings, Bank Ledger, Other Bank Ledger, Expense, Cash Book, Uchhina | ✓ | Bank Ledger ✓ | Tokens applied; semantic green/red/amber kept |
| Sales, Purchase, Reports & Analysis, Capital, Stock, Seller & Team, Goals, Settings | ✓ | Sales ✓ | Consistent |
| Mobile navigation drawer | — | ✓ | Logo band, active item cream + orange marker |
| Login, Reset password | ✓ | — | New logo panel, Indigo heading and button |
| Invoice document (HTML → print/PDF, A4) | ✓ | — | Inter loads, ₹ renders, logo crisp (vector) |
| Advanced report PDF export (jsPDF) | ✓ | — | Inter embedded (verified with `pdffonts`), Indigo header, money right-aligned |

## Contrast (WCAG 2.1)

| Pair | Ratio | Use |
|---|---|---|
| Indigo on white | 10.75 | headings, links, buttons (inverse) |
| Indigo on cream | 8.85 | selected nav, highlight cards |
| White on Indigo | 10.75 | primary buttons, table headers |
| Amber on Indigo | 5.10 | small labels on Indigo |
| Orange ink `#B83C0A` on white / cream | 5.69 / 4.69 | small orange text |
| Grey ink `#5E636A` on white | 6.05 | secondary text |
| Blue on white | 5.25 | info, focus |
| Orange on white | 2.93 | **not used for text**: only rules, borders, icons |

## Not testable here

These depend on your live Supabase project, which was deliberately not connected:
real sign-in, user management, saving to the database, realtime sync, and email
backup. None of that code changed. Please do a quick smoke test after deploying:
sign in, open each page, create and print one test invoice, and download one report.
