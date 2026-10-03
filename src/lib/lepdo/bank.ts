import type { BankAccount, CategoryId } from "./types";

export interface BankMeta {
  id: string;
  bankName: string;
  nickname: string;
  last4: string;
  /** pastel background utility */
  bg: string;
}

/** Fixed LEPDO bank accounts shown as balance cards. */
export const BANKS: BankMeta[] = [
  {
    id: "bank_hdfc",
    bankName: "LEPDO HDFC",
    nickname: "LEPDO HDFC",
    last4: "4821",
    bg: "bg-pl-blue",
  },
  {
    id: "bank_indusind",
    bankName: "LEPDO IndusInd",
    nickname: "LEPDO IndusInd",
    last4: "7714",
    bg: "bg-pl-green",
  },
  {
    id: "bank_kotak",
    bankName: "Renuka Kotak",
    nickname: "Renuka Kotak",
    last4: "3390",
    bg: "bg-pl-purple",
  },
  {
    id: "bank_sbi",
    bankName: "Brijes SBI",
    nickname: "Brijes SBI",
    last4: "9037",
    bg: "bg-pl-orange",
  },
];

export const BANK_SEED: BankAccount[] = BANKS.map((b) => ({
  id: b.id,
  bankName: b.bankName,
  nickname: b.nickname,
  last4: b.last4,
  openingBalance: 0,
  active: true,
}));

/**
 * Categories offered on the bank ledger, in display order.
 * Section-specific heads (sales, purchase, expense, drawings, uchhina, capital)
 * are recorded inside their own sections and never here.
 */
export const BANK_CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "sale_payment", label: "Payment Received" },
  { id: "purchase_payment", label: "Payment Paid" },
  { id: "expense", label: "Expense" },
  { id: "owner_drawing", label: "UPI / Personal Withdrawal" },
  { id: "uchhina_money_given", label: "Uchhina" },
  { id: "uchhina_money_received_back", label: "Uchhina" },
  { id: "owner_investment", label: "Money Added / Capital" },
  { id: "opening_balance", label: "Opening Balance" },
  { id: "bank_transfer", label: "Bank Transfer" },
  { id: "bank_to_cash", label: "Bank Transfer" },
  { id: "other", label: "Other" },
  // retired — historical rows only, no longer offered for new entries
  { id: "bank_charges", label: "Bank Charges" },
  { id: "customer_refund", label: "Customer Refund" },
  { id: "supplier_refund", label: "Supplier Refund" },
];

/** UI-level category shown on the "Add Bank Entry" form (Uchhina is one option; the
 *  actual uchhina_* CategoryId is resolved from the chosen in/out direction). */
export type BankUiCategory =
  | "sale_payment"
  | "purchase_payment"
  | "expense"
  | "owner_drawing"
  | "uchhina"
  | "owner_investment"
  | "opening_balance"
  | "bank_transfer"
  | "other";

/** Exact set of categories offered for NEW bank entries, in display order. */
export const BANK_ENTRY_OPTIONS: { id: BankUiCategory; label: string }[] = [
  { id: "sale_payment", label: "Payment Received" },
  { id: "purchase_payment", label: "Payment Paid" },
  { id: "expense", label: "Expense" },
  { id: "owner_drawing", label: "UPI / Personal Withdrawal" },
  { id: "uchhina", label: "Uchhina" },
  { id: "owner_investment", label: "Money Added / Capital" },
  { id: "opening_balance", label: "Opening Balance" },
  { id: "bank_transfer", label: "Bank Transfer" },
  { id: "other", label: "Other" },
];

/** Fixed direction for bank entry choices that can only go one way. Returns null when
 *  the user must choose (Uchhina, Bank Transfer, Other). */
export function bankFixedDirection(id: BankUiCategory | ""): "in" | "out" | null {
  if (id === "sale_payment" || id === "owner_investment" || id === "opening_balance")
    return "in";
  if (id === "purchase_payment" || id === "expense" || id === "owner_drawing") return "out";
  return null;
}

/** Resolve the Uchhina UI choice + direction into the real ledger category. */
export function resolveUchhinaCategory(direction: "in" | "out"): CategoryId {
  return direction === "in" ? "uchhina_money_received_back" : "uchhina_money_given";
}

/** Resolve the merged Bank Transfer UI choice into the real ledger category
 *  based on where the money is going. */
export function resolveTransferCategory(destinationType: "bank" | "cash"): CategoryId {
  return destinationType === "cash" ? "bank_to_cash" : "bank_transfer";
}

/** Map a stored CategoryId back onto the BankUiCategory shown on the Add/Edit Bank Entry
 *  form (used to preselect the right UI option when editing an existing entry). */
export function uiCategoryFromCategoryId(id: CategoryId | null): BankUiCategory | "" {
  switch (id) {
    case "sale_payment":
      return "sale_payment";
    case "purchase_payment":
      return "purchase_payment";
    case "expense":
      return "expense";
    case "owner_drawing":
      return "owner_drawing";
    case "uchhina_money_given":
    case "uchhina_money_received_back":
    case "uchhina_given":
    case "uchhina_received":
      return "uchhina";
    case "owner_investment":
      return "owner_investment";
    case "opening_balance":
      return "opening_balance";
    case "bank_transfer":
    case "bank_to_cash":
      return "bank_transfer";
    case null:
      return "";
    default:
      return "other";
  }
}

export type BankPreset = "month" | "prev_month" | "fy" | "custom";

export const BANK_PRESETS: { id: BankPreset; label: string }[] = [
  { id: "month", label: "This Month" },
  { id: "prev_month", label: "Previous Month" },
  { id: "fy", label: "This Financial Year" },
  { id: "custom", label: "Custom Date Range" },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function bankRange(
  preset: BankPreset,
  today: string,
  from: string,
  to: string,
): [string, string] {
  const d = new Date(today);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (preset === "custom") return [from, to];
  if (preset === "prev_month")
    return [iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 0)))];
  if (preset === "fy") {
    const fy = m >= 3 ? y : y - 1;
    return [`${fy}-04-01`, `${fy + 1}-03-31`];
  }
  return [iso(new Date(Date.UTC(y, m, 1))), iso(new Date(Date.UTC(y, m + 1, 0)))];
}

export function periodLabel(preset: BankPreset, from: string, to: string): string {
  const label = BANK_PRESETS.find((p) => p.id === preset)?.label ?? "Period";
  return preset === "custom" ? `${from} to ${to}` : `${label} (${from} to ${to})`;
}

/**
 * Stable chronological order for ledger rows: date, then creation time, then a
 * deterministic id tie-break so rows created in the same millisecond never shuffle
 * when the cloud snapshot is merged (array order alone is not stable across syncs).
 */
export function compareLedgerOrder(
  a: { date: string; createdAt: string; id: string },
  b: { date: string; createdAt: string; id: string },
): number {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
  return a.id.localeCompare(b.id);
}
