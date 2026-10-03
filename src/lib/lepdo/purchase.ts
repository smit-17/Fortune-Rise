import { isLedgerEntry, isPosted } from "./entry";
import { round2, todayISO } from "./format";
import { paymentAccountLabel, statusOf, type InvoiceStatus, type PaymentRow } from "./sales";
import type { Invoice, Party, Transaction } from "./types";

export interface BillView {
  bill: Invoice;
  supplier: Party | undefined;
  paid: number;
  pending: number;
  status: InvoiceStatus;
  payments: { payment: PaymentRow; amount: number }[];
}

export interface SupplierView {
  party: Party;
  bills: BillView[];
  totalPurchases: number;
  paid: number;
  advance: number;
  pending: number;
  billCount: number;
  status: InvoiceStatus | "settled";
}

export interface BrokerView {
  key: string;
  label: string;
  bills: BillView[];
  suppliers: number;
  count: number;
  purchases: number;
  paid: number;
  pending: number;
  average: number;
}

export interface PurchaseModel {
  bills: BillView[];
  byId: Map<string, BillView>;
  suppliers: SupplierView[];
  payments: PaymentRow[];
  totals: {
    purchases: number;
    paid: number;
    pending: number;
    advance: number;
    suppliers: number;
  };
}

export const isPurchasePayment = (t: Transaction) =>
  isPosted(t) && !isLedgerEntry(t) && t.category === "purchase_payment" && t.direction === "out";

export interface PurchaseBuildInput {
  bills: Invoice[];
  transactions: Transaction[];
  parties: Party[];
  banks: { id: string; bankName: string; nickname: string }[];
  cash: { id: string; name: string }[];
  asOf?: string | undefined;
}

export function buildPurchaseModel(input: PurchaseBuildInput): PurchaseModel {
  const asOf = input.asOf;
  const bills = input.bills.filter((b) => !b.voided && (!asOf || b.date <= asOf));
  const partyById = new Map(input.parties.map((p) => [p.id, p]));

  const paymentTx = input.transactions
    .filter((t) => isPurchasePayment(t) && (!asOf || t.date <= asOf))
    .sort((a, b) =>
      a.date === b.date ? a.code.localeCompare(b.code) : a.date.localeCompare(b.date),
    );

  const billIds = new Set(bills.map((b) => b.id));
  const paidByBill = new Map<string, number>();
  const payments: PaymentRow[] = [];
  const paymentsByBill = new Map<string, { payment: PaymentRow; amount: number }[]>();
  const advanceByParty = new Map<string, number>();

  for (const t of paymentTx) {
    const allocs = (t.allocations ?? []).filter((a) => billIds.has(a.invoiceId));
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
      paidByBill.set(a.invoiceId, round2((paidByBill.get(a.invoiceId) ?? 0) + a.amount));
      const list = paymentsByBill.get(a.invoiceId) ?? [];
      list.push({ payment: row, amount: round2(a.amount) });
      paymentsByBill.set(a.invoiceId, list);
    }
    if (advance > 0 && t.partyId)
      advanceByParty.set(t.partyId, round2((advanceByParty.get(t.partyId) ?? 0) + advance));
  }

  const today = todayISO();
  const views: BillView[] = bills
    .map((bill) => {
      const paid = round2(Math.min(bill.total, paidByBill.get(bill.id) ?? 0));
      return {
        bill,
        supplier: partyById.get(bill.partyId),
        paid,
        pending: round2(bill.total - paid),
        status: statusOf(bill, paid, today),
        payments: paymentsByBill.get(bill.id) ?? [],
      };
    })
    .sort((a, b) =>
      a.bill.date === b.bill.date
        ? b.bill.number.localeCompare(a.bill.number)
        : b.bill.date.localeCompare(a.bill.date),
    );

  const byParty = new Map<string, BillView[]>();
  for (const v of views) {
    const list = byParty.get(v.bill.partyId) ?? [];
    list.push(v);
    byParty.set(v.bill.partyId, list);
  }

  const ids = new Set<string>([...byParty.keys(), ...advanceByParty.keys()]);
  const suppliers: SupplierView[] = [...ids]
    .map((id) => {
      const party = partyById.get(id) ?? {
        id,
        name: "Unknown supplier",
        type: "supplier" as const,
      };
      const list = byParty.get(id) ?? [];
      const totalPurchases = round2(list.reduce((s, v) => s + v.bill.total, 0));
      const paid = round2(list.reduce((s, v) => s + v.paid, 0));
      const pending = round2(list.reduce((s, v) => s + v.pending, 0));
      const advance = round2(advanceByParty.get(id) ?? 0);
      const status: SupplierView["status"] = list.some((v) => v.status === "overdue")
        ? "overdue"
        : pending <= 0
          ? "settled"
          : paid > 0
            ? "part"
            : "pending";
      return {
        party,
        bills: list,
        totalPurchases,
        paid,
        advance,
        pending,
        billCount: list.length,
        status,
      };
    })
    .sort((a, b) => b.pending - a.pending || b.totalPurchases - a.totalPurchases);

  return {
    bills: views,
    byId: new Map(views.map((v) => [v.bill.id, v])),
    suppliers,
    payments,
    totals: {
      purchases: round2(views.reduce((s, v) => s + v.bill.total, 0)),
      paid: round2(views.reduce((s, v) => s + v.paid, 0)),
      pending: round2(views.reduce((s, v) => s + v.pending, 0)),
      advance: round2([...advanceByParty.values()].reduce((s, v) => s + v, 0)),
      suppliers: suppliers.filter((s) => s.billCount > 0).length,
    },
  };
}

export function matchBill(v: BillView, q: string): boolean {
  if (!q) return true;
  const hay = [
    v.bill.number,
    v.bill.supplierInvoiceNumber ?? "",
    v.supplier?.name ?? "",
    v.bill.brokerName ?? "",
    v.bill.date,
    String(v.bill.total),
    String(v.pending),
    v.status,
    v.payments.map((p) => p.payment.reference).join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function brokerGroups(rows: BillView[]): BrokerView[] {
  const map = new Map<string, BillView[]>();
  for (const v of rows) {
    const key = v.bill.brokerName?.trim() || "No Broker";
    const list = map.get(key) ?? [];
    list.push(v);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([key, list]) => {
      const purchases = round2(list.reduce((s, v) => s + v.bill.total, 0));
      return {
        key,
        label: key,
        bills: list,
        suppliers: new Set(list.map((v) => v.bill.partyId)).size,
        count: list.length,
        purchases,
        paid: round2(list.reduce((s, v) => s + v.paid, 0)),
        pending: round2(list.reduce((s, v) => s + v.pending, 0)),
        average: list.length ? round2(purchases / list.length) : 0,
      };
    })
    .sort((a, b) => b.purchases - a.purchases);
}

export function supplierLedgerRows(supplier: SupplierView, payments: PaymentRow[]) {
  const rows: {
    id: string;
    date: string;
    type: string;
    reference: string;
    particulars: string;
    debit: number;
    credit: number;
  }[] = [];
  for (const v of supplier.bills) {
    rows.push({
      id: `bill-${v.bill.id}`,
      date: v.bill.date,
      type: "Purchase Bill",
      reference: v.bill.number,
      particulars: `Purchase from ${supplier.party.name}`,
      debit: 0,
      credit: round2(v.bill.total),
    });
  }
  for (const p of payments.filter((x) => x.partyId === supplier.party.id)) {
    if (p.allocated > 0)
      rows.push({
        id: `pay-${p.id}`,
        date: p.date,
        type: "Payment Made",
        reference: p.reference,
        particulars: `Paid from ${p.account}`,
        debit: p.allocated,
        credit: 0,
      });
    if (p.advance > 0)
      rows.push({
        id: `adv-${p.id}`,
        date: p.date,
        type: "Supplier Advance",
        reference: p.reference,
        particulars: `Unallocated amount from ${p.account}`,
        debit: p.advance,
        credit: 0,
      });
  }
  rows.sort((a, b) =>
    a.date === b.date ? a.type.localeCompare(b.type) : a.date.localeCompare(b.date),
  );
  let balance = 0;
  return rows.map((r) => {
    balance = round2(balance + r.credit - r.debit);
    return { ...r, balance };
  });
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + (Number.isFinite(days) ? days : 0));
  return d.toISOString().slice(0, 10);
}
