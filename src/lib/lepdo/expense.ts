/** Expense heads used across the Expense Ledger and entry forms. */
export interface ExpenseCategoryMeta {
  label: string;
  /** pastel badge utility classes */
  badge: string;
}

export const EXPENSE_CATEGORIES: ExpenseCategoryMeta[] = [
  { label: "Office Expenses", badge: "bg-pl-blue text-navy" },
  { label: "Employee Salaries", badge: "bg-pl-green text-navy" },
  { label: "Courier & Shipping", badge: "bg-pl-orange text-navy" },
  { label: "Bank Charges", badge: "bg-pl-purple text-navy" },
  { label: "Rent & Property Expenses", badge: "bg-pl-pink text-navy" },
  { label: "Travel & Conveyance", badge: "bg-pl-yellow text-navy" },
  { label: "Professional Fees", badge: "bg-pl-blue text-navy" },
  { label: "EMI & Interest", badge: "bg-pl-red text-navy" },
  { label: "Bad Debts", badge: "bg-pl-loss text-navy" },
  { label: "Marketing & Advertising", badge: "bg-pl-orange text-navy" },
  { label: "Software & Subscriptions", badge: "bg-pl-purple text-navy" },
  { label: "Utilities", badge: "bg-pl-green text-navy" },
  { label: "Repairs & Maintenance", badge: "bg-pl-yellow text-navy" },
  { label: "Miscellaneous", badge: "bg-pl-grey text-navy" },
];

export const DEFAULT_EXPENSE_CATEGORY = "Miscellaneous";

export function expenseBadge(label: string | undefined): string {
  return EXPENSE_CATEGORIES.find((c) => c.label === label)?.badge ?? "bg-pl-grey text-navy";
}

export function expenseHead(label: string | undefined | null): string {
  return label && label.trim() ? label : DEFAULT_EXPENSE_CATEGORY;
}

/**
 * Expense category choices from the shared Settings master list. The record's
 * current value is kept in the list even if it was renamed or removed, so
 * historical entries still show and save their original category.
 */
export function expenseCategoryOptions(
  masters: Record<string, { name: string; active: boolean }[]>,
  current?: string | null,
  includeInactive = false,
): string[] {
  const list = (masters["expenseCategories"] ?? [])
    .filter((v) => includeInactive || v.active)
    .map((v) => v.name);
  if (current && current.trim() && !list.includes(current)) list.push(current);
  return list;
}
