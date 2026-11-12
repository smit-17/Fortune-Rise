# LEPDO — open tasks

## Sales Reports
- [x] Add a read-only Reports tab beside Platform-Wise using existing live data, filters, comparisons, charts, customer/platform/payment/outstanding reports and Excel/PDF export.
- [x] Verify live reports, exports, and preservation of existing Sales views: 25 active invoices total ₹60,89,535.22 matched the database; all 12 reports, platform/search filters, invoice drilldown, XLSX/PDF downloads and mobile overflow checked; no record writes.

## Dashboard update
- [x] Apply selected Balance First presentation with a header total, preserving existing calculations.
- [x] Verify the signed-in dashboard and period filter at desktop and narrow widths.

## EMI Tracker
- [x] Active plans in one responsive card grid (3 desktop / 2 tablet / 1 phone), equal size, Next EMI date inside each card, no date heading rows, Closed plans in their own section below.
- [x] Verify grid, sorting and wrapping in the signed-in preview at 1280 / 820 / 390 widths.
- [x] EMI calculation spec (Loan Start Date informational only, reminder start from today, "Remaining Instalments as of Today", End Date = Next EMI + Remaining − 1 months, recalculate existing plans) — user declined on 2026-10-06 ("no need to change anything, everything works perfectly"); current behaviour stays as is, do not re-propose.
- [x] Simplified to reminder-only (2026-10-14): no Mark as Paid / Paid / Unpaid / Overdue / Skip / payment history; only Active/Closed statuses with Close Loan and Mark as Active; Debit From Bank is a free-text field (no bank master required); form keeps EMI Title, Debit Date, Amount, Other Details; Edit/Delete kept; never touches any accounting section.
- [x] Next EMI removed (2026-10-23): no next/overdue/pending date calculation anywhere; cards show only the saved EMI Debit Date, Title, Debit From Bank, Amount, Other Details and Active/Closed chip; highlighted "Total Active EMI Amount" card at the top = sum of Active plans only, closed excluded (verified live: total equalled the sum of the active cards, and moved exactly with add / close / reopen / delete); still reminder-only.

## Other Bank Ledger
- [x] New sidebar section cloning Bank Ledger UI, fully isolated (own `otherBankAccounts`/`otherBankEntries` collections), Reference Only badges, manual-only entries, duplicate warning, filters/search/reports; verified entry never appears on Dashboard or Bank Ledger.

## Bank Ledger
- [x] Excel import row colors final (2026-11-12): already-added rows use one pale green (`--pl-import-added` #e2f6e9); remaining rows have no background tint at all. Verified 18 import tests, live computed backgrounds (green rgb(226,246,233) vs transparent) and screenshot; no records written.
- [x] Apply green added/yellow unadded Excel table rows and a centered expand/collapse arrow. Verified 18 import regression tests, actual yellow row backgrounds, individual Add controls, valid-row Submit readiness, desktop expand/collapse heights and mobile controls; existing saved/duplicate green condition preserved and no records written.
- [x] Restore individual Excel row Add, green saved/existing rows, neutral unadded rows, exclude non-transactions, allow valid partial Submit, and remove Replace File. Verified 18 regression tests and signed-in individual/bulk saves, invalid/file-duplicate skipping, re-upload prevention, persisted single records and green rows; temporary entries removed and absence confirmed after reload.
- [x] Simplify Excel import to automatic categories/mapping, no Status or individual Add, horizontal actions and one readiness-gated Submit; retain selection, duplicate prevention and confirmed saves. Import tests and signed-in desktop/mobile upload, editing, validation gating and selection checked; no live records written during verification.
- [x] Match Excel preview columns to manual entry fields (Entry type + Amount, category-specific fields) and exclude undated/non-date rows. Nine import tests passed; signed-in upload verified two dated rows only and editable category/direction/amount; no records saved.
- [x] Excel duplicates use bank/date/direction/amount/statement balance, ignoring UTR; legacy matches require review and new rows require statement balance. Eight tests and signed-in preview verified duplicate/different-balance/missing-balance states; no live records written during this verification.
- [x] Excel import: upload XLS/XLSX, detect/map columns and narration substrings, editable manual fields, row/bulk import, duplicate skipping, validation and persisted-save confirmation. Seven tests passed; signed-in upload, duplicate/invalid rows, bulk add, saved-row reload, re-upload prevention and 390px modal checked. Temporary verification transaction removed; existing records unchanged.
- [x] Category filter added beside the Bank filter (2026-10-24): options are the category labels actually present in the ledger for the selected period and bank; row list, header totals and downloaded report follow it; nothing else changed. Verified live: 237 rows all-categories → Expense 47 / Payment Received 23 / Bank Transfer 10, zero mismatched rows, clears back to 237, no horizontal scroll at 390px.

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

## Cash Book
- [x] Removed header balance text next to title; added search box beside month filter (filters table only, all columns; cards/totals/reports unchanged) — verified live
