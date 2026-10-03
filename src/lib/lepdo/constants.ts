import type { CategoryId, Direction } from "./types";

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  tone: string;
  allows: Direction[] | "both";
  needsAllocation?: "sales" | "purchase";
  isTransfer?: boolean;
  excludeFromProfit?: boolean;
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: "sale_payment",
    label: "Sale Payment",
    tone: "sale",
    allows: ["in"],
    needsAllocation: "sales",
  },
  {
    id: "purchase_payment",
    label: "Purchase Payment",
    tone: "purchase",
    allows: ["out"],
    needsAllocation: "purchase",
  },
  { id: "expense", label: "Expense", tone: "expense", allows: ["out"] },
  {
    id: "uchhina_money_given",
    label: "Uchhina — Money Given",
    tone: "uchhina",
    allows: ["out"],
    excludeFromProfit: true,
  },
  {
    id: "uchhina_money_received_back",
    label: "Uchhina — Money Received Back",
    tone: "uchhina",
    allows: ["in"],
    excludeFromProfit: true,
  },
  {
    id: "uchhina_received",
    label: "Uchhina — Money Taken",
    tone: "uchhina",
    allows: ["in"],
    excludeFromProfit: true,
  },
  {
    id: "uchhina_given",
    label: "Uchhina — Money Returned",
    tone: "uchhina",
    allows: ["out"],
    excludeFromProfit: true,
  },
  {
    id: "owner_investment",
    label: "Owner Investment",
    tone: "investment",
    allows: ["in"],
    excludeFromProfit: true,
  },
  {
    id: "opening_balance",
    label: "Opening Balance",
    tone: "investment",
    allows: ["in"],
    excludeFromProfit: true,
  },
  {
    id: "owner_drawing",
    label: "Owner Drawing / Personal Use",
    tone: "drawing",
    allows: ["out"],
    excludeFromProfit: true,
  },
  {
    id: "bank_transfer",
    label: "Bank-to-Bank Transfer",
    tone: "transfer",
    allows: "both",
    isTransfer: true,
    excludeFromProfit: true,
  },
  {
    id: "bank_to_cash",
    label: "Bank-to-Cash Withdrawal",
    tone: "transfer",
    allows: "both",
    isTransfer: true,
    excludeFromProfit: true,
  },
  {
    id: "cash_to_bank",
    label: "Cash-to-Bank Deposit",
    tone: "transfer",
    allows: "both",
    isTransfer: true,
    excludeFromProfit: true,
  },
  {
    id: "cash_transfer",
    label: "Cash Transfer",
    tone: "transfer",
    allows: "both",
    isTransfer: true,
    excludeFromProfit: true,
  },
  { id: "customer_refund", label: "Customer Refund", tone: "refund", allows: ["out"] },
  { id: "supplier_refund", label: "Supplier Refund", tone: "refund", allows: ["in"] },
  { id: "loan_emi", label: "Loan / EMI", tone: "purchase", allows: "both" },
  { id: "bank_charges", label: "Bank Charges", tone: "expense", allows: ["out"] },
  { id: "interest", label: "Interest", tone: "sale", allows: "both" },
  { id: "other", label: "Other / Adjustment", tone: "other", allows: "both" },
];

export const categoryMap: Record<CategoryId, CategoryMeta> = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.id]: c }),
  {} as Record<CategoryId, CategoryMeta>,
);

export const toneClass: Record<string, string> = {
  sale: "bg-cat-sale-bg text-cat-sale",
  purchase: "bg-cat-purchase-bg text-cat-purchase",
  expense: "bg-cat-expense-bg text-cat-expense",
  uchhina: "bg-cat-uchhina-bg text-cat-uchhina",
  investment: "bg-cat-investment-bg text-cat-investment",
  drawing: "bg-cat-drawing-bg text-cat-drawing",
  transfer: "bg-cat-transfer-bg text-cat-transfer",
  refund: "bg-cat-refund-bg text-cat-refund",
  other: "bg-cat-other-bg text-cat-other",
};

export function categoryLabel(id: CategoryId | null): string {
  return id ? (categoryMap[id]?.label ?? "Unclassified") : "Unclassified";
}

export function categoryTone(id: CategoryId | null): string {
  const tone = id ? categoryMap[id]?.tone : undefined;
  return toneClass[tone ?? "other"] ?? "bg-cat-other-bg text-cat-other";
}

export const PAYMENT_METHODS = [
  "NEFT",
  "RTGS",
  "IMPS",
  "UPI",
  "Cheque",
  "Card",
  "Cash Deposit",
  "Other",
];
