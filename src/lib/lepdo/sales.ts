import { isLedgerEntry, isPosted } from "./entry";
import { formatDate, round2, todayISO } from "./format";
import type { Invoice, Party, Transaction } from "./types";

export type InvoiceStatus = "paid" | "part" | "pending" | "overdue";

export interface PaymentRow {
  id: string;
  code: string;
  partyId: string | null;
  date: string;
  account: string;
  reference: string;
  amount: number;
  allocated: number;
  advance: number;
}

export interface InvoiceView {
  invoice: Invoice;
  customer: Party | undefined;
  received: number;
  pending: number;
  status: InvoiceStatus;
  payments: { payment: PaymentRow; amount: number }[];
}

export interface CustomerView {
  party: Party;
  invoices: InvoiceView[];
  totalSales: number;
  received: number;
  advance: number;
  pending: number;
  invoiceCount: number;
  status: InvoiceStatus | "settled";
}

export interface LedgerRow {
  id: string;
  date: string;
  type: string;
  reference: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: "Paid",
  part: "Part Paid",
  pending: "Pending",
  overdue: "Overdue",
};

export const STATUS_CLASS: Record<InvoiceStatus | "settled", string> = {
  paid: "bg-sl-paid-bg text-sl-paid",
  part: "bg-sl-part-bg text-sl-part",
  pending: "bg-sl-settled-bg text-sl-settled",
  overdue: "bg-sl-pending-bg text-sl-pending",
  settled: "bg-sl-settled-bg text-sl-settled",
};

export const isSalesReceipt = (t: Transaction) =>
  isPosted(t) && !isLedgerEntry(t) && t.category === "sale_payment" && t.direction === "in";

export function paymentAccountLabel(
  t: Transaction,
  banks: { id: string; bankName: string; nickname: string }[],
  cash: { id: string; name: string }[],
): string {
  if (t.sourceType === "bank") {
    const b = banks.find((x) => x.id === t.accountId);
    return b ? `${b.bankName} — ${b.nickname}` : "Bank";
  }
  const c = cash.find((x) => x.id === t.accountId);
  return c ? `${c.name} Cash` : "Cash";
}

export interface BuildInput {
  invoices: Invoice[];
  transactions: Transaction[];
  parties: Party[];
  banks: { id: string; bankName: string; nickname: string }[];
  cash: { id: string; name: string }[];
  /** balances computed as of this date (inclusive) */
  asOf?: string | undefined;
}

export interface SalesModel {
  invoices: InvoiceView[];
  byId: Map<string, InvoiceView>;
  customers: CustomerView[];
  payments: PaymentRow[];
  totals: {
    sales: number;
    received: number;
    pending: number;
    advance: number;
    customers: number;
    paid: number;
    part: number;
    pendingCount: number;
    overdue: number;
  };
}

export function statusOf(invoice: Invoice, received: number, today = todayISO()): InvoiceStatus {
  const pending = round2(invoice.total - received);
  if (pending <= 0) return "paid";
  if (received > 0) return invoice.dueDate && invoice.dueDate < today ? "overdue" : "part";
  return invoice.dueDate && invoice.dueDate < today ? "overdue" : "pending";
}

export function buildSalesModel(input: BuildInput): SalesModel {
  const asOf = input.asOf;
  const invoices = input.invoices.filter((i) => !i.voided && (!asOf || i.date <= asOf));
  const partyById = new Map(input.parties.map((p) => [p.id, p]));

  const receiptTx = input.transactions
    .filter((t) => isSalesReceipt(t) && (!asOf || t.date <= asOf))
    .sort((a, b) =>
      a.date === b.date ? a.code.localeCompare(b.code) : a.date.localeCompare(b.date),
    );

  const invoiceIds = new Set(invoices.map((i) => i.id));
  const receivedByInvoice = new Map<string, number>();
  const payments: PaymentRow[] = [];
  const paymentsByInvoice = new Map<string, { payment: PaymentRow; amount: number }[]>();
  const advanceByParty = new Map<string, number>();

  for (const t of receiptTx) {
    const allocs = (t.allocations ?? []).filter((a) => invoiceIds.has(a.invoiceId));
    const allocated = round2(allocs.reduce((s, a) => s + a.amount, 0));
    const advance = round2(Math.max(0, t.amount - allocated));
    const row: PaymentRow = {
      id: t.id,
      code: t.code,
      partyId: t.partyId,
      date: t.date,
      account: paymentAccountLabel(t, input.banks, input.cash),
      reference: t.reference ?? t.paymentMethod ?? "—",
      amount: round2(t.amount),
      allocated,
      advance,
    };
    payments.push(row);
    for (const a of allocs) {
      receivedByInvoice.set(
        a.invoiceId,
        round2((receivedByInvoice.get(a.invoiceId) ?? 0) + a.amount),
      );
      const list = paymentsByInvoice.get(a.invoiceId) ?? [];
      list.push({ payment: row, amount: round2(a.amount) });
      paymentsByInvoice.set(a.invoiceId, list);
    }
    if (advance > 0 && t.partyId)
      advanceByParty.set(t.partyId, round2((advanceByParty.get(t.partyId) ?? 0) + advance));
  }

  const today = todayISO();
  const views: InvoiceView[] = invoices
    .map((invoice) => {
      const received = round2(Math.min(invoice.total, receivedByInvoice.get(invoice.id) ?? 0));
      return {
        invoice,
        customer: partyById.get(invoice.partyId),
        received,
        pending: round2(invoice.total - received),
        status: statusOf(invoice, received, today),
        payments: paymentsByInvoice.get(invoice.id) ?? [],
      };
    })
    .sort((a, b) =>
      a.invoice.date === b.invoice.date
        ? b.invoice.number.localeCompare(a.invoice.number)
        : b.invoice.date.localeCompare(a.invoice.date),
    );

  const byParty = new Map<string, InvoiceView[]>();
  for (const v of views) {
    const list = byParty.get(v.invoice.partyId) ?? [];
    list.push(v);
    byParty.set(v.invoice.partyId, list);
  }

  const customerIds = new Set<string>([...byParty.keys(), ...advanceByParty.keys()]);
  const customers: CustomerView[] = [...customerIds]
    .map((id) => {
      const party = partyById.get(id) ?? {
        id,
        name: "Unknown customer",
        type: "customer" as const,
      };
      const list = byParty.get(id) ?? [];
      const totalSales = round2(list.reduce((s, v) => s + v.invoice.total, 0));
      const received = round2(list.reduce((s, v) => s + v.received, 0));
      const pending = round2(list.reduce((s, v) => s + v.pending, 0));
      const advance = round2(advanceByParty.get(id) ?? 0);
      const status: CustomerView["status"] = list.some((v) => v.status === "overdue")
        ? "overdue"
        : pending <= 0
          ? "settled"
          : received > 0
            ? "part"
            : "pending";
      return {
        party,
        invoices: list,
        totalSales,
        received,
        advance,
        pending,
        invoiceCount: list.length,
        status,
      };
    })
    .sort((a, b) => b.pending - a.pending || b.totalSales - a.totalSales);

  const totals = {
    sales: round2(views.reduce((s, v) => s + v.invoice.total, 0)),
    received: round2(views.reduce((s, v) => s + v.received, 0)),
    pending: round2(views.reduce((s, v) => s + v.pending, 0)),
    advance: round2([...advanceByParty.values()].reduce((s, v) => s + v, 0)),
    customers: customers.filter((c) => c.invoiceCount > 0).length,
    paid: views.filter((v) => v.status === "paid").length,
    part: views.filter((v) => v.status === "part").length,
    pendingCount: views.filter((v) => v.status === "pending").length,
    overdue: views.filter((v) => v.status === "overdue").length,
  };

  return {
    invoices: views,
    byId: new Map(views.map((v) => [v.invoice.id, v])),
    customers,
    payments,
    totals,
  };
}

export function customerLedger(customer: CustomerView, payments: PaymentRow[]): LedgerRow[] {
  const rows: Omit<LedgerRow, "balance">[] = [];
  for (const v of customer.invoices) {
    rows.push({
      id: `inv-${v.invoice.id}`,
      date: v.invoice.date,
      type: "Sales Invoice",
      reference: v.invoice.number,
      particulars: `Sale to ${customer.party.name}`,
      debit: round2(v.invoice.total),
      credit: 0,
    });
  }
  const mine = payments.filter((p) => p.partyId === customer.party.id);
  for (const p of mine) {
    if (p.allocated > 0)
      rows.push({
        id: `pay-${p.id}`,
        date: p.date,
        type: "Payment Received",
        reference: p.reference,
        particulars: `Received in ${p.account}`,
        debit: 0,
        credit: p.allocated,
      });
    if (p.advance > 0)
      rows.push({
        id: `adv-${p.id}`,
        date: p.date,
        type: "Advance Received",
        reference: p.reference,
        particulars: `Unallocated amount in ${p.account}`,
        debit: 0,
        credit: p.advance,
      });
  }
  rows.sort((a, b) =>
    a.date === b.date ? a.type.localeCompare(b.type) : a.date.localeCompare(b.date),
  );
  let balance = 0;
  return rows.map((r) => {
    balance = round2(balance + r.debit - r.credit);
    return { ...r, balance };
  });
}

/* ------------------------------------------------------------------ */
/* Seller-wise & platform-wise groups + universal search              */
/* ------------------------------------------------------------------ */

export const PLATFORMS = [
  "Pure Sale/Direct",
  "Etsy",
  "Alibaba",
  "Website",
  "IndiaMART",
  "BNI",
  "WhatsApp",
  "Instagram",
  "Referral",
  "Walk-in",
  "Other",
] as const;

export interface GroupView {
  key: string;
  label: string;
  invoices: InvoiceView[];
  customers: number;
  count: number;
  sales: number;
  received: number;
  pending: number;
  /** received / sales, 0-100 */
  collection: number;
  average: number;
}

function groupBy(rows: InvoiceView[], pick: (v: InvoiceView) => string): GroupView[] {
  const map = new Map<string, InvoiceView[]>();
  for (const v of rows) {
    const key = pick(v) || "Unassigned";
    const list = map.get(key) ?? [];
    list.push(v);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([key, list]) => {
      const sales = round2(list.reduce((s, v) => s + v.invoice.total, 0));
      const received = round2(list.reduce((s, v) => s + v.received, 0));
      return {
        key,
        label: key,
        invoices: list,
        customers: new Set(list.map((v) => v.invoice.partyId)).size,
        count: list.length,
        sales,
        received,
        pending: round2(list.reduce((s, v) => s + v.pending, 0)),
        collection: sales > 0 ? round2((received / sales) * 100) : 0,
        average: list.length ? round2(sales / list.length) : 0,
      };
    })
    .sort((a, b) => b.sales - a.sales);
}

export const sellerGroups = (rows: InvoiceView[]) =>
  groupBy(rows, (v) => v.invoice.sellerName?.trim() ?? "");

export function platformGroups(rows: InvoiceView[]): GroupView[] {
  const found = groupBy(rows, (v) => v.invoice.platform?.trim() ?? "Pure Sale/Direct");
  const byKey = new Map(found.map((g) => [g.key, g]));
  const base: GroupView[] = PLATFORMS.map(
    (label) =>
      byKey.get(label) ?? {
        key: label,
        label,
        invoices: [],
        customers: 0,
        count: 0,
        sales: 0,
        received: 0,
        pending: 0,
        collection: 0,
        average: 0,
      },
  );
  const extra = found.filter((g) => !PLATFORMS.includes(g.key as (typeof PLATFORMS)[number]));
  return [...base, ...extra];
}

/** universal search across date, number, customer, seller, platform, amount, status, reference */
export function matchInvoice(v: InvoiceView, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const parts = [
    v.invoice.date,
    formatDate(v.invoice.date),
    v.invoice.number,
    v.customer?.name ?? "",
    v.invoice.sellerName ?? "",
    v.invoice.platform ?? "",
    String(v.invoice.total),
    String(v.received),
    String(v.pending),
    STATUS_LABEL[v.status],
    ...v.payments.map((p) => `${p.payment.reference} ${p.payment.account} ${p.amount}`),
  ];
  return parts.join(" ").toLowerCase().includes(needle);
}
