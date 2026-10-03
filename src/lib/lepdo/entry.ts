import type { CategoryId, Transaction } from "./types";

/**
 * Categories that belong to the Bank Ledger / Cash Book.
 * Everything else is owned by its own section (Sales, Purchase, Expense,
 * Drawings, Uchhina, Capital) and is never mirrored into the ledgers.
 */
export const LEDGER_CATEGORY_IDS: CategoryId[] = [
  "bank_transfer",
  "bank_to_cash",
  "cash_to_bank",
  "cash_transfer",
  "bank_charges",
  "customer_refund",
  "supplier_refund",
  "other",
];

export function isLedgerCategory(id: CategoryId | null): boolean {
  return !!id && LEDGER_CATEGORY_IDS.includes(id);
}

/** True when the entry was recorded as a Bank Entry / Cash Entry. */
export function isLedgerEntry(t: Transaction): boolean {
  if (typeof t.ledger === "boolean") return t.ledger;
  return isLedgerCategory(t.category);
}

/** True when the entry should affect balances, dashboards, reports and P&L. */
export function isPosted(t: Transaction): boolean {
  return !t.voided;
}
