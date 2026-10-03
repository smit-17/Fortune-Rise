import type { CategoryId } from "./types";

export interface CashBookMeta {
  id: string;
  name: string;
  short: string;
}

/** The two fixed LEPDO cash books. */
export const CASH_BOOKS: CashBookMeta[] = [
  { id: "cash_itpark", name: "IT Park Cash Book", short: "IT Park" },
  { id: "cash_mahidharpura", name: "Mahidharpura Cash Book", short: "Mahidharpura" },
];

/** Categories offered on the cash book, in display order. */
export const CASH_CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "sale_payment", label: "Sales Payment" },
  { id: "purchase_payment", label: "Supplier Payment" },
  { id: "expense", label: "Expense" },
  { id: "other", label: "Other" },
  { id: "bank_to_cash", label: "Bank Withdrawal (Bank → Cash)" },
  { id: "cash_to_bank", label: "Bank Deposit (Cash → Bank)" },
  { id: "cash_transfer", label: "Cash Transfer (Book → Book)" },
];

export function cashCategoryLabel(id: CategoryId | null): string {
  if (!id) return "Unclassified";
  return CASH_CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
}

/** Fixed direction for categories that can only go one way in a cash book. */
export function fixedDirection(id: CategoryId | ""): "in" | "out" | null {
  if (id === "sale_payment" || id === "bank_to_cash") return "in";
  if (id === "purchase_payment" || id === "expense" || id === "cash_to_bank") return "out";
  return null;
}
