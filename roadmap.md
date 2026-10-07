# LEPDO — open tasks

## Dashboard update
- [x] Apply selected Balance First presentation with a header total, preserving existing calculations.
- [x] Verify the signed-in dashboard and period filter at desktop and narrow widths.

## EMI Tracker
- [x] Active plans in one responsive card grid (3 desktop / 2 tablet / 1 phone), equal size, Next EMI date inside each card, no date heading rows, Closed plans in their own section below.
- [x] Verify grid, sorting and wrapping in the signed-in preview at 1280 / 820 / 390 widths.
- [x] EMI calculation spec (Loan Start Date informational only, reminder start from today, "Remaining Instalments as of Today", End Date = Next EMI + Remaining − 1 months, recalculate existing plans) — user declined on 2026-10-06 ("no need to change anything, everything works perfectly"); current behaviour stays as is, do not re-propose.

## Working style (standing rule)
- Never ask for approval or mention credit usage; complete work in one shot.

## Verified complete
- SaleForm / PurchaseForm decimal-safe inputs (NumInput/MoneyInput/AutoManual) — verified in browser: "2.75" and "30.85" type correctly; integer-only fields (e.g. payment due days) intentionally reject decimals.
- Jewelry sale item format (Category/Metal/Colour, Gross/Stone/Net/24KT fine weights, metal price/g, making/g, stone lines).
- Diamond sale table (Sr/Desc/CT/Price-CT/Total), diamond purchase USD/INR + PCS column, jewelry making bill manual rows (SKU, Gross/Stone/Net/Dia WT, Making/g, Stone Amt, Total Making) with totals row and Round-off; wide modal verified desktop + mobile.
- Mobile sales/purchase cards, headers, tabs, filters; "Download Filtered Report" label.
- Sales sale-type summary cards + filter, seller incentive %, GST slabs/round-off in forms and PDF.
- Goals Week tab, Persons master, Seller & Team incentives, Settings backup/restore/auto-logout/searchable audit log.
- Decimal-safe inputs across Expense, Stock, Capital, Uchhina, Drawings, Cash Book, Bank Ledger, Goals, Settings.
