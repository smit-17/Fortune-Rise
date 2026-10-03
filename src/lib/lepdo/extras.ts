import { isLedgerEntry, isPosted } from "./entry";
import { round2, todayISO } from "./format";
import { isoWeekKey, isoWeekRange } from "./period";
import type {
  AppSettings,
  EmiPlan,
  EmiPayment,
  Goal,
  Liability,
  LiabilityEntry,
  LiabilityKind,
  StockEntry,
  TeamPayment,
  TeamPaymentType,
  Transaction,
} from "./types";

/* ---------------- Liabilities ---------------- */

export const LIABILITY_KINDS: { id: LiabilityKind; label: string; tone: Tone }[] = [
  { id: "friends_family", label: "Friends & Family", tone: "blue" },
  { id: "gold_loan", label: "Gold Loan", tone: "yellow" },
  { id: "credit_card", label: "Credit Card", tone: "purple" },
  { id: "bank_loan", label: "Bank Loan", tone: "orange" },
  { id: "business_loan", label: "Business Loan", tone: "green" },
  { id: "other", label: "Other", tone: "grey" },
];

export function liabilityKindLabel(kind: LiabilityKind): string {
  return LIABILITY_KINDS.find((k) => k.id === kind)?.label ?? "Other";
}

export const LIABILITY_ENTRY_TYPES: { id: LiabilityEntry["type"]; label: string }[] = [
  { id: "received", label: "Amount Received" },
  { id: "principal_repaid", label: "Principal Repaid" },
  { id: "interest_paid", label: "Interest Paid" },
  { id: "additional_borrowing", label: "Additional Borrowing" },
  { id: "adjustment", label: "Manual Adjustment" },
];

export function liabilityTypeLabel(type: LiabilityEntry["type"]): string {
  return LIABILITY_ENTRY_TYPES.find((t) => t.id === type)?.label ?? type;
}

export interface LiabilityRow extends LiabilityEntry {
  balance: number;
  paid: number;
}

export interface LiabilityView {
  liability: Liability;
  rows: LiabilityRow[];
  borrowed: number;
  repaid: number;
  interestPaid: number;
  outstanding: number;
  status: "Open" | "Closed";
}

/** Running principal balance ledger for one liability. */
export function buildLiabilityView(liability: Liability, entries: LiabilityEntry[]): LiabilityView {
  const rows: LiabilityRow[] = [];
  let balance = 0;
  let borrowed = 0;
  let repaid = 0;
  let interestPaid = 0;
  const sorted = entries
    .filter((e) => e.liabilityId === liability.id && !e.voided)
    .sort((a, b) =>
      a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date),
    );

  for (const e of sorted) {
    const principal = round2(e.principal ?? 0);
    const interest = round2(e.interest ?? 0);
    if (e.type === "received" || e.type === "additional_borrowing") {
      balance = round2(balance + principal);
      borrowed = round2(borrowed + principal);
    } else if (e.type === "principal_repaid") {
      balance = round2(balance - principal);
      repaid = round2(repaid + principal);
    } else if (e.type === "interest_paid") {
      interestPaid = round2(interestPaid + interest);
    } else {
      balance = round2(balance + principal);
    }
    if (e.type === "interest_paid") interestPaid = round2(interestPaid);
    rows.push({ ...e, balance, paid: round2(principal + interest) });
  }
  const outstanding = round2(Math.max(0, balance));
  return {
    liability,
    rows: rows.reverse(),
    borrowed,
    repaid,
    interestPaid,
    outstanding,
    status: liability.closed || outstanding <= 0 ? "Closed" : "Open",
  };
}

/* ---------------- Capital ---------------- */

export interface CapitalView {
  key: string;
  label: string;
  tone: Tone;
  invested: number;
  withdrawn: number;
  balance: number;
  rows: Transaction[];
}

const CAPITAL_BUCKETS: { key: string; label: string; tone: Tone; match: string[] }[] = [
  { key: "brijes", label: "Brijes Capital", tone: "blue", match: ["brijes"] },
  { key: "dixit", label: "Dixit Capital", tone: "purple", match: ["dixit"] },
];

/** Splits owner investment / drawing transactions into founder capital buckets. */
export function buildCapitalViews(
  transactions: Transaction[],
  partyNameOf: (id: string | null) => string,
): CapitalView[] {
  const rows = transactions.filter(
    (t) =>
      isPosted(t) &&
      !isLedgerEntry(t) &&
      (t.category === "owner_investment" || t.category === "owner_drawing"),
  );

  const buckets: CapitalView[] = [
    ...CAPITAL_BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      tone: b.tone,
      invested: 0,
      withdrawn: 0,
      balance: 0,
      rows: [] as Transaction[],
    })),
    {
      key: "other",
      label: "Other Investment",
      tone: "orange",
      invested: 0,
      withdrawn: 0,
      balance: 0,
      rows: [],
    },
  ];
  for (const t of rows) {
    const name = `${partyNameOf(t.partyId)} ${t.particulars}`.toLowerCase();
    const idx = CAPITAL_BUCKETS.findIndex((b) => b.match.some((m) => name.includes(m)));
    const bucket = buckets[idx >= 0 ? idx : buckets.length - 1];
    if (!bucket) continue;
    if (t.category === "owner_investment") bucket.invested = round2(bucket.invested + t.amount);
    else bucket.withdrawn = round2(bucket.withdrawn + t.amount);
    bucket.rows.push(t);
  }
  for (const b of buckets) b.balance = round2(b.invested - b.withdrawn);
  return buckets;
}

/* ---------------- Stock ---------------- */

export interface StockRow extends StockEntry {
  balance: number;
  value: number;
}

export interface StockView {
  rows: StockRow[];
  totalQty: number;
  avgRate: number;
  totalValue: number;
}

export function buildStockView(entries: StockEntry[], stock: StockEntry["stock"]): StockView {
  const sorted = entries
    .filter((e) => e.stock === stock && !e.voided)
    .sort((a, b) =>
      a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date),
    );
  const rows: StockRow[] = [];
  let balance = 0;
  let valueIn = 0;
  let qtyIn = 0;
  for (const e of sorted) {
    balance = round2(balance + (e.qtyIn ?? 0) - (e.qtyOut ?? 0));
    if (e.qtyIn) {
      qtyIn = round2(qtyIn + e.qtyIn);
      valueIn = round2(valueIn + e.qtyIn * (e.rate ?? 0));
    }
    rows.push({ ...e, balance, value: round2(balance * (e.rate ?? 0)) });
  }
  const avgRate = qtyIn > 0 ? round2(valueIn / qtyIn) : 0;
  return {
    rows: rows.reverse(),
    totalQty: balance,
    avgRate,
    totalValue: round2(balance * avgRate),
  };
}

/* ---------------- Team ---------------- */

export const TEAM_PAYMENT_TYPES: { id: TeamPaymentType; label: string; sign: 1 | -1 }[] = [
  { id: "salary", label: "Salary", sign: 1 },
  { id: "incentive", label: "Incentive", sign: 1 },
  { id: "bonus", label: "Bonus", sign: 1 },
  { id: "reimbursement", label: "Reimbursement", sign: 1 },
  { id: "deduction", label: "Deduction", sign: -1 },
  { id: "advance", label: "Salary Advance", sign: 1 },
];

export function teamTypeLabel(type: TeamPaymentType): string {
  return TEAM_PAYMENT_TYPES.find((t) => t.id === type)?.label ?? type;
}

export interface TeamTotals {
  salary: number;
  incentive: number;
  bonus: number;
  deduction: number;
  paid: number;
  pending: number;
}

export function teamTotals(payments: TeamPayment[]): TeamTotals {
  const live = payments.filter((p) => !p.voided);
  const sum = (fn: (p: TeamPayment) => boolean) =>
    round2(live.filter(fn).reduce((s, p) => s + p.amount, 0));
  const salary = sum((p) => p.type === "salary");
  const incentive = sum((p) => p.type === "incentive");
  const bonus = sum((p) => p.type === "bonus");
  const deduction = sum((p) => p.type === "deduction");
  const gross = round2(
    live.filter((p) => p.type !== "deduction").reduce((s, p) => s + p.amount, 0) - deduction,
  );
  const paid = round2(
    live.filter((p) => p.paid && p.type !== "deduction").reduce((s, p) => s + p.amount, 0),
  );
  return { salary, incentive, bonus, deduction, paid, pending: round2(Math.max(0, gross - paid)) };
}

/* ---------------- Goals ---------------- */

export type GoalPeriod = Goal["period"];

export function fyOf(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String(y + 1).slice(2)}`;
}

export function fyRange(fy: string): readonly [string, string] {
  const y = Number(fy.slice(0, 4));
  return [`${y}-04-01`, `${y + 1}-03-31`];
}

export function periodKeyFor(period: GoalPeriod, iso = todayISO()): string {
  if (period === "yearly") return fyOf(iso);
  if (period === "monthly") return iso.slice(0, 7);
  if (period === "weekly") return isoWeekKey(iso);
  return iso;
}

export function goalRange(period: GoalPeriod, key: string): readonly [string, string] {
  if (period === "yearly") return fyRange(key);
  if (period === "monthly") {
    const [y, m] = key.split("-").map(Number);
    const last = new Date(Date.UTC(y ?? 2026, m ?? 1, 0)).toISOString().slice(0, 10);
    return [`${key}-01`, last];
  }
  if (period === "weekly") return isoWeekRange(key);
  return [key, key];
}

export function goalPercent(goal: number, achieved: number): number {
  if (goal <= 0) return 0;
  return round2((achieved / goal) * 100);
}

/* ---------------- Settings ---------------- */

export const DEFAULT_SETTINGS: AppSettings = {
  business: {
    name: "LEPDO",
    legalName: "LEPDO Diamonds & Jewellery",
    gstin: "24NACPS0875L1Z2",
    phone: "+91 9638551535",
    email: "",
    address: "B-902 Pragati IT Park, Surat, India",
    city: "Surat",
    state: "Gujarat",
    financialYearStart: "04-01",
    currency: "INR",
    iec: "NACPS0875L",
    usaAddress: "Elmwood Park, New Jersey, USA",
  },
  branding: {
    primary: "#2D2D61",
    accent: "#E2AE40",
    font: "System / Inter",
    invoiceHeader: "LEPDO — Diamonds & Jewellery",
    invoiceFooter: "Thank you for your business.",
    pastel: "#F3F4FB",
    logoDataUrl: "",
  },
  invoice: {
    salesPrefix: "LEP/S/",
    salesStart: 1,
    purchasePrefix: "LEP/P/",
    purchaseStart: 1,
    diamondFormat: "Carat × Price/CT",
    jewelryFormat: "Metal + Making + Stones",
    defaultDueDays: 15,
    defaultTaxRate: 0,
    defaultDiscount: 0,
    shipping: 0,
    roundOff: true,
    terms: "Payment due within the agreed credit period.",
    bankDetails: "",
    signature: "For LEPDO",
    title: "Proforma Invoice",
  },
  rules: {
    duplicateProtection: true,
    autoAllocateOldest: true,
    allowEditAfterPayment: false,
    voidInsteadOfDelete: true,
    monthlyLockDate: "",
  },
  security: {
    role: "Owner",
    twoPersonVoid: false,
    users: [],
    idleTimeoutMinutes: 30,
  },
};

export type Tone = "blue" | "green" | "red" | "purple" | "orange" | "yellow" | "grey" | "navy";

/* ---------------- EMI Tracker ---------------- */

export interface EmiScheduleRow {
  month: string; // YYYY-MM
  dueDate: string; // YYYY-MM-DD
  amount: number;
  paid: boolean;
  payment?: EmiPayment | undefined;
  status: "Paid" | "Unpaid" | "Overdue";
}

export interface EmiPlanView {
  plan: EmiPlan;
  schedule: EmiScheduleRow[];
  paidCount: number;
  remainingCount: number;
  overdueCount: number;
}

function addMonthsClampDay(startDate: string, months: number, day: number): string {
  const [y, m] = startDate.split("-").map(Number);
  const base = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1 + months, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  const d = Math.min(day, lastDay);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), d)).toISOString().slice(0, 10);
}

/** Builds the month-wise EMI schedule and merges with recorded payments. */
export function buildEmiSchedule(
  plan: EmiPlan,
  payments: EmiPayment[],
  today = todayISO(),
): EmiPlanView {
  const paymentsByMonth = new Map(
    payments.filter((p) => p.planId === plan.id && !p.voided).map((p) => [p.month, p]),
  );

  let count = plan.installments ?? 0;
  if (!count && plan.endDate) {
    const [sy, sm] = plan.startDate.split("-").map(Number);
    const [ey, em] = plan.endDate.split("-").map(Number);
    count = ((ey ?? 0) - (sy ?? 0)) * 12 + ((em ?? 0) - (sm ?? 0)) + 1;
  }
  if (!count || count < 1) count = 1;

  const schedule: EmiScheduleRow[] = [];
  for (let i = 0; i < count; i++) {
    const dueDate = addMonthsClampDay(plan.startDate, i, plan.dueDay);
    const month = dueDate.slice(0, 7);
    const payment = paymentsByMonth.get(month);
    const paid = !!payment;
    const status: EmiScheduleRow["status"] = paid
      ? "Paid"
      : dueDate < today
        ? "Overdue"
        : "Unpaid";
    schedule.push({ month, dueDate, amount: plan.amount, paid, payment, status });
  }
  const paidCount = schedule.filter((r) => r.paid).length;
  const overdueCount = schedule.filter((r) => r.status === "Overdue").length;
  return { plan, schedule, paidCount, remainingCount: schedule.length - paidCount, overdueCount };
}
