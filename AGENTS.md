<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep dashboard presentation helpers local to its content route and consume existing store totals without changing accounting logic; visual changes must not affect other pages.
- Other Bank Ledger data lives in separate LepdoData collections (otherBankAccounts/otherBankEntries) managed via saveRecord/removeRecord; never merge them into transactions or any accounting query — the section is reference-only by design.
- Sales Reports is an additive read-only tab backed by the shared live store and existing sales allocation model; keep report filters/exports isolated from existing views and distinguish invoice-date sales from payment-date receipts so reporting never changes accounting records.
- Bank Excel import uses isolated browser parsing/mapping helpers and the existing addEntry/addParty path; confirm persisted rows through the workspace read before marking success or advancing a bulk import, so uncertain writes are never blindly retried.
- Excel preview uses manual-entry direction/amount controls over the existing credit/debit row representation; retain statement balances as import metadata for duplicate checks.
- Detect import banks from worksheet headings/account metadata or explicit bank columns, matching official bank identities to branded account names and leaving ambiguous matches editable; never infer the source bank from transaction narration.
- Infer initial import categories from same-bank/direction narration matches and existing party/category masters; preserve preview category overrides during subsequent edits, and never overwrite ledger records. Submit imports selected ready rows, or all ready rows when none are selected; invalid, duplicate and saved rows never block valid rows. Individual Add uses the same confirmed-save path.
- Preserve imported statement closing balances as transaction reference metadata, never as accounting balances; transfer counterpart entries must not inherit the source account's statement balance.
- Role-permission SELECT policies must allow only assigned-role rows or callers with server-validated users.view permission; this preserves access loading without exposing every role to arbitrary signed-in users.
- Existing eligible page-level date filters reuse period.ts presets and rangeFor through their existing helper interfaces; one source keeps header and page calendar conventions consistent without coupling their selected values.
- Search result frames use the shared SearchResults presentation wrapper to retain their measured unsearched height while searching, without stretching table rows or changing data filters.

- Keep shared printable-report branding in brandPrint and PDF font loading in brandPdfFont; this centralizes presentation without changing report content or accounting.
