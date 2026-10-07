# Bank Ledger order, credit/debit buttons, and expense linking

Updates only the Bank Ledger page, its entry form, and the Expense Ledger view. No changes to Cash Book, Sales, Purchase, settings or permissions. All existing records stay untouched.

## 1. Correct order and running balance

- The ledger list shows the oldest entry first, like a real bank statement. Entries saved on the same date keep the order they were actually entered.
- Each bank's running balance is calculated separately and always chronologically (opening balance, then every valid entry in date/entry order), so date filters, bank filter or search never restart it from zero.
- Period Opening includes every earlier valid entry plus the account opening balance; Period Closing = Opening + Period Credit − Period Debit (already the rule, kept intact).
- Bank cards keep showing the true current balance from all valid entries, not just the filtered rows.
- Backdated entries, edits and deletes recalculate the following balances automatically, because balances are always recomputed from the full history.

## 2. Clear Credit / Debit options in Add / Edit Bank Entry

- Two large clearly-labelled buttons: "Credit — Money In" in pastel green and "Debit — Money Out" in pastel red. Only one can be active, and there is a single Amount field.
- Date, Bank Account, Category, Particulars and Reference / UTR stay clearly labelled and editable.
- Categories that can only go one way (for example Payment Received, Expense) still auto-select the correct side, and the form shows why that side is locked instead of silently hiding the choice.

## 3. Bank expenses reflect automatically in the Expense Ledger

- When Debit is selected together with the Expense category, an Expense Category dropdown appears, filled from the existing master list.
- After saving, that same bank transaction appears in the Expense Ledger with its exact date, expense category, particulars, amount, bank account and reference, marked Paid, showing "Source: Bank Entry · <Bank Name>" plus a View Source action that opens the entry in the Bank Ledger.
- The bank transaction's own id is the permanent link — no second entry is created and the amount is never counted twice. Editing or deleting the bank entry updates the Expense view immediately.
- Existing bank debits already categorised as Expense also appear. Those without an expense category are flagged "Category missing" for correction rather than guessed.
- Only Bank Debit → Expense reflects automatically. No other category is distributed, and Cash Book behaviour is unchanged.

## Technical notes

- `src/routes/bank-ledger.tsx`: display sort flipped to ascending with `createdAt` tie-break; balance map stays computed from the full unfiltered history. `BankEntryForm` gains the always-visible credit/debit pair and, for Debit + Expense, an `expenseCategory` select whose value is saved on the entry (`expenseCategory`, `expensePaid: true`) alongside the existing `ledger: true` flag.
- `src/routes/expense.tsx`: `allExpenses` extended to also include `sourceType === "bank" && isLedgerEntry(t) && direction === "out" && category === "expense"`. Linked rows render source label "Bank Entry · Bank", always Paid, a View Source action navigating to `/bank-ledger`, and a "Category missing" flag when `expenseCategory` is empty. Edit/Delete for linked rows points to the Bank Ledger so there is one source of truth.
- No store, type, or migration changes required; linking uses the existing transaction id.
