import { isPosted } from "@/lib/lepdo/entry";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Users, Wallet, IndianRupee, TrendingUp, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeading } from "@/components/lepdo/bits";
import { NumInput, MoneyInput } from "@/components/lepdo/numeric";
import { useShell } from "@/components/lepdo/shell-context";
import { useLepdo } from "@/lib/lepdo/store";
import type { NewEntryInput } from "@/lib/lepdo/store";
import type { TeamMember, TeamPayment, TeamPaymentType } from "@/lib/lepdo/types";
import { formatMoney, round2, todayISO, uid } from "@/lib/lepdo/format";
import { buildSalesModel } from "@/lib/lepdo/sales";
import { TEAM_PAYMENT_TYPES, teamTypeLabel, teamTotals } from "@/lib/lepdo/extras";
import type { ExportTable } from "@/lib/lepdo/exportTable";
import {
  StatCard,
  Chip,
  SectionCard,
  EmptyState,
  DownloadMenu,
  ModalShell,
  Field,
  AuditLine,
  usePaged,
  Pager,
} from "@/components/lepdo/shared";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "Seller & Team — LEPDO Accounting" },
      {
        name: "description",
        content:
          "Seller performance with incentive tracking and team salary, incentive, bonus and deduction payments for LEPDO Accounting.",
      },
      { property: "og:title", content: "Seller & Team — LEPDO Accounting" },
      {
        property: "og:description",
        content:
          "Track seller-wise sales, incentives earned vs paid, and team salary & incentive payments with source-linked bank/cash entries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamPage,
});

type Tab = "sellers" | "team";

const TABS: { id: Tab; label: string }[] = [
  { id: "sellers", label: "Seller Performance" },
  { id: "team", label: "Team Salary & Incentives" },
];

function TeamPage() {
  const [tab, setTab] = useState<Tab>("sellers");
  return (
    <div className="w-full max-w-full space-y-4 overflow-x-hidden">
      <PageHeading title="Seller & Team" breadcrumb="Team" />
      <div className="-mx-1 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 sm:mx-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "shrink-0 rounded-lg bg-navy px-3 py-2 text-sm font-medium text-navy-foreground"
                : "shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "sellers" ? <SellerPerformance /> : null}
      {tab === "team" ? <TeamSalary /> : null}
    </div>
  );
}

/* ============================== Seller Performance ============================== */

interface SellerInvoiceRow {
  id: string;
  number: string;
  date: string;
  customer: string;
  total: number;
  received: number;
  pending: number;
  incentivePercent: number | null;
  incentiveAmount: number;
}

interface SellerRow {
  name: string;
  customers: number;
  invoices: number;
  totalSales: number;
  received: number;
  pending: number;
  incentiveEarned: number;
  incentivePaid: number;
  incentivePending: number;
  rateLabel: string;
  invoiceRows: SellerInvoiceRow[];
}

function SellerPerformance() {
  const store = useLepdo();
  const [viewSeller, setViewSeller] = useState<SellerRow | null>(null);

  if (!store.ready) return <EmptyState title="Loading seller performance…" />;

  const model = buildSalesModel({
    invoices: store.salesInvoices,
    transactions: store.transactions,
    parties: store.parties,
    banks: store.bankAccounts,
    cash: store.cashLocations,
  });

  const groups = new Map<
    string,
    {
      customers: Set<string>;
      invoices: number;
      totalSales: number;
      received: number;
      pending: number;
      incentiveEarned: number;
      invoiceRows: SellerInvoiceRow[];
    }
  >();
  for (const v of model.invoices) {
    if (v.invoice.voided) continue;
    const name = v.invoice.sellerName?.trim() || "Unassigned";
    const seller = store.sellers.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
    const g = groups.get(name) ?? {
      customers: new Set<string>(),
      invoices: 0,
      totalSales: 0,
      received: 0,
      pending: 0,
      incentiveEarned: 0,
      invoiceRows: [],
    };
    let incentivePercent: number | null = null;
    let incentiveAmount = 0;
    if (v.invoice.sellerIncentivePercent != null) {
      incentivePercent = v.invoice.sellerIncentivePercent;
      incentiveAmount = round2((v.invoice.total * incentivePercent) / 100);
    } else if (seller?.rateType === "percent" && seller.rate) {
      incentivePercent = seller.rate;
      incentiveAmount = round2((v.invoice.total * incentivePercent) / 100);
    } else if (seller?.rateType === "fixed" && seller.rate) {
      incentiveAmount = round2(seller.rate);
    }
    g.customers.add(v.invoice.partyId);
    g.invoices += 1;
    g.totalSales += v.invoice.total;
    g.received += v.received;
    g.pending += v.pending;
    g.incentiveEarned = round2(g.incentiveEarned + incentiveAmount);
    g.invoiceRows.push({
      id: v.invoice.id,
      number: v.invoice.number,
      date: v.invoice.date,
      customer: store.parties.find((p) => p.id === v.invoice.partyId)?.name ?? "—",
      total: v.invoice.total,
      received: v.received,
      pending: v.pending,
      incentivePercent,
      incentiveAmount,
    });
    groups.set(name, g);
  }

  const payments = store.teamPayments.filter((p) => !p.voided && p.type === "incentive" && p.paid);

  const rows: SellerRow[] = [...groups.entries()]
    .map(([name, g]) => {
      const seller = store.sellers.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
      const paid = round2(
        payments
          .filter((p) => {
            const member = store.teamMembers.find((m) => m.id === p.memberId);
            return member && member.name.trim().toLowerCase() === name.toLowerCase();
          })
          .reduce((s, p) => s + p.amount, 0),
      );
      const rateLabel = seller?.rate
        ? seller.rateType === "percent"
          ? `${seller.rate}%`
          : `${formatMoney(seller.rate)}/invoice`
        : "—";
      return {
        name,
        customers: g.customers.size,
        invoices: g.invoices,
        totalSales: round2(g.totalSales),
        received: round2(g.received),
        pending: round2(g.pending),
        incentiveEarned: g.incentiveEarned,
        incentivePaid: paid,
        incentivePending: round2(Math.max(g.incentiveEarned - paid, 0)),
        rateLabel,
        invoiceRows: g.invoiceRows.sort((a, b) => (a.date < b.date ? 1 : -1)),
      };
    })
    .sort((a, b) => b.totalSales - a.totalSales);

  const totals = rows.reduce(
    (acc, r) => ({
      customers: acc.customers + r.customers,
      invoices: acc.invoices + r.invoices,
      totalSales: round2(acc.totalSales + r.totalSales),
      received: round2(acc.received + r.received),
      pending: round2(acc.pending + r.pending),
      earned: round2(acc.earned + r.incentiveEarned),
      paid: round2(acc.paid + r.incentivePaid),
      pendingIncentive: round2(acc.pendingIncentive + r.incentivePending),
    }),
    {
      customers: 0,
      invoices: 0,
      totalSales: 0,
      received: 0,
      pending: 0,
      earned: 0,
      paid: 0,
      pendingIncentive: 0,
    },
  );

  function buildExport(): ExportTable {
    return {
      title: "Seller Performance",
      subtitle: "All-time",
      columns: [
        { key: "name", label: "Seller" },
        { key: "customers", label: "Customers", align: "right" },
        { key: "invoices", label: "Invoices", align: "right" },
        { key: "totalSales", label: "Total Sales", money: true },
        { key: "received", label: "Received", money: true },
        { key: "pending", label: "Pending", money: true },
        { key: "incentiveEarned", label: "Incentive Earned", money: true },
        { key: "incentivePaid", label: "Incentive Paid", money: true },
        { key: "incentivePending", label: "Incentive Pending", money: true },
      ],
      rows: rows.map(({ invoiceRows: _ignored, ...r }) => ({ ...r })),
      summary: [
        { label: "Total Sales", value: formatMoney(totals.totalSales) },
        { label: "Total Incentive Earned", value: formatMoney(totals.earned) },
        { label: "Total Incentive Pending", value: formatMoney(totals.pendingIncentive) },
      ],
    };
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <EmptyState
          title="No seller-tagged invoices yet"
          hint="Add a sale with a seller name to see performance here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <SectionCard
              key={r.name}
              title={r.name}
              actions={
                <Button variant="outline" size="sm" onClick={() => setViewSeller(r)}>
                  View Seller Sales
                </Button>
              }
            >
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Row label="Customers" value={String(r.customers)} />
                <Row label="Invoices" value={String(r.invoices)} />
                <Row label="Total Sales" value={formatMoney(r.totalSales)} />
                <Row label="Received" value={formatMoney(r.received)} />
                <Row label="Pending" value={formatMoney(r.pending)} />
                <Row label="Incentive %" value={r.rateLabel} />
                <Row label="Incentive Earned" value={formatMoney(r.incentiveEarned)} />
                <Row label="Incentive Paid" value={formatMoney(r.incentivePaid)} />
                <Row label="Incentive Pending" value={formatMoney(r.incentivePending)} />
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      <SectionCard
        title="Seller Summary"
        actions={<DownloadMenu build={buildExport} label="Download" />}
      >
        <div className="overflow-x-auto">
          <table className="hidden w-full min-w-[900px] text-sm sm:table">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-2">Seller</th>
                <th className="py-2 pr-2 text-right">Customers</th>
                <th className="py-2 pr-2 text-right">Invoices</th>
                <th className="py-2 pr-2 text-right">Total Sales</th>
                <th className="py-2 pr-2 text-right">Received</th>
                <th className="py-2 pr-2 text-right">Pending</th>
                <th className="py-2 pr-2 text-right">Incentive Earned</th>
                <th className="py-2 pr-2 text-right">Incentive Paid</th>
                <th className="py-2 pr-2 text-right">Incentive Pending</th>
                <th className="py-2 pr-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-border/60">
                  <td className="py-2 pr-2 font-medium">{r.name}</td>
                  <td className="py-2 pr-2 text-right">{r.customers}</td>
                  <td className="py-2 pr-2 text-right">{r.invoices}</td>
                  <td className="num py-2 pr-2 text-right">{formatMoney(r.totalSales)}</td>
                  <td className="num py-2 pr-2 text-right">{formatMoney(r.received)}</td>
                  <td className="num py-2 pr-2 text-right">{formatMoney(r.pending)}</td>
                  <td className="num py-2 pr-2 text-right">{formatMoney(r.incentiveEarned)}</td>
                  <td className="num py-2 pr-2 text-right">{formatMoney(r.incentivePaid)}</td>
                  <td className="num py-2 pr-2 text-right">{formatMoney(r.incentivePending)}</td>
                  <td className="py-2 pr-2 text-right">
                    <Button variant="outline" size="sm" onClick={() => setViewSeller(r)}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-2 sm:hidden">
            {rows.map((r) => (
              <div key={r.name} className="rounded-lg border border-border p-3 text-xs">
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-semibold">{r.name}</p>
                  <Button variant="outline" size="sm" onClick={() => setViewSeller(r)}>
                    View
                  </Button>
                </div>
                <Row label="Customers" value={String(r.customers)} />
                <Row label="Invoices" value={String(r.invoices)} />
                <Row label="Total Sales" value={formatMoney(r.totalSales)} />
                <Row label="Received" value={formatMoney(r.received)} />
                <Row label="Pending" value={formatMoney(r.pending)} />
                <Row label="Incentive Earned" value={formatMoney(r.incentiveEarned)} />
                <Row label="Incentive Paid" value={formatMoney(r.incentivePaid)} />
                <Row label="Incentive Pending" value={formatMoney(r.incentivePending)} />
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {viewSeller ? (
        <ModalShell
          open
          onClose={() => setViewSeller(null)}
          title={`${viewSeller.name} — Invoices`}
          subtitle={`${viewSeller.invoices} invoice(s) · Total sales ${formatMoney(viewSeller.totalSales)}`}
          width="max-w-[860px]"
          footer={
            <Button variant="outline" onClick={() => setViewSeller(null)}>
              Close
            </Button>
          }
        >
          {viewSeller.invoiceRows.length === 0 ? (
            <EmptyState title="No invoices for this seller" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-2">Invoice #</th>
                    <th className="py-2 pr-2">Customer</th>
                    <th className="py-2 pr-2 text-right">Total</th>
                    <th className="py-2 pr-2 text-right">Received</th>
                    <th className="py-2 pr-2 text-right">Pending</th>
                    <th className="py-2 pr-2 text-right">Incentive %</th>
                    <th className="py-2 pr-2 text-right">Incentive Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {viewSeller.invoiceRows.map((inv) => (
                    <tr key={inv.id} className="border-b border-border/60">
                      <td className="py-2 pr-2">{inv.date}</td>
                      <td className="py-2 pr-2 font-medium">{inv.number}</td>
                      <td className="py-2 pr-2">{inv.customer}</td>
                      <td className="num py-2 pr-2 text-right">{formatMoney(inv.total)}</td>
                      <td className="num py-2 pr-2 text-right">{formatMoney(inv.received)}</td>
                      <td className="num py-2 pr-2 text-right">{formatMoney(inv.pending)}</td>
                      <td className="num py-2 pr-2 text-right">
                        {inv.incentivePercent != null ? `${inv.incentivePercent}%` : "—"}
                      </td>
                      <td className="num py-2 pr-2 text-right">
                        {formatMoney(inv.incentiveAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ModalShell>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="num font-medium">{value}</span>
    </div>
  );
}

/* ============================== Team Salary & Incentives ============================== */

function TeamSalary() {
  const store = useLepdo();
  const shell = useShell();
  const [memberOpen, setMemberOpen] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<TeamPayment | null>(null);
  const [voidTarget, setVoidTarget] = useState<TeamPayment | null>(null);

  if (!store.ready) return <EmptyState title="Loading team data…" />;

  const members = store.teamMembers;
  // Deleted payments are excluded everywhere — they never appear or count.
  const periodPayments = store.teamPayments.filter(
    (p) => !p.voided && p.date >= shell.from && p.date <= shell.to,
  );

  function memberName(id: string) {
    return members.find((m) => m.id === id)?.name ?? "Unknown";
  }

  function resolveTx(reference: string) {
    return store.transactions.find((t) => t.reference === reference && isPosted(t));
  }

  function buildExport(): ExportTable {
    const rows = periodPayments
      .filter((p) => !p.voided)
      .map((p) => ({
        date: p.date,
        member: memberName(p.memberId),
        type: teamTypeLabel(p.type),
        month: p.month,
        particulars: p.particulars,
        amount: p.amount,
        paidFrom: p.paidFrom ?? "",
        status: p.paid ? "Paid" : "Pending",
      }));
    return {
      title: "Team Salary & Incentive Payments",
      subtitle: `${shell.from} to ${shell.to}`,
      columns: [
        { key: "date", label: "Date", date: true },
        { key: "member", label: "Team Member" },
        { key: "type", label: "Type" },
        { key: "month", label: "Month" },
        { key: "particulars", label: "Particulars" },
        { key: "amount", label: "Amount", money: true },
        { key: "paidFrom", label: "Paid From" },
        { key: "status", label: "Status" },
      ],
      rows,
    };
  }

  const paged = usePaged(
    [...periodPayments].sort((a, b) => (a.date < b.date ? 1 : -1)),
    20,
  );

  function confirmVoid() {
    if (!voidTarget) return;
    store.setRecordVoided("teamPayments", voidTarget.id, true);
    if (voidTarget.paidFrom) {
      const tx = resolveTx(voidTarget.paidFrom);
      if (tx) store.voidEntry(tx.id);
    }
    toast.success("Payment deleted.");
    setVoidTarget(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          className="h-9"
          onClick={() => {
            setEditMember(null);
            setMemberOpen(true);
          }}
        >
          <Plus className="size-4" /> Add Member
        </Button>
        <Button
          className="h-9"
          variant="outline"
          onClick={() => {
            setEditPayment(null);
            setPaymentOpen(true);
          }}
        >
          <Plus className="size-4" /> Add Payment
        </Button>
      </div>

      {members.length === 0 ? (
        <EmptyState
          title="No team members yet"
          hint="Add a member to start tracking salary & incentives."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => {
            const t = teamTotals(store.teamPayments.filter((p) => p.memberId === m.id));
            return (
              <SectionCard
                key={m.id}
                title={m.name}
                actions={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditMember(m);
                      setMemberOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                }
              >
                <p className="mb-2 text-xs text-muted-foreground">{m.role}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Row label="Monthly Salary" value={formatMoney(m.monthlySalary)} />
                  <Row label="Incentive" value={formatMoney(t.incentive)} />
                  <Row label="Bonus" value={formatMoney(t.bonus)} />
                  <Row label="Deduction" value={formatMoney(t.deduction)} />
                  <Row label="Paid" value={formatMoney(t.paid)} />
                  <Row label="Pending" value={formatMoney(t.pending)} />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Chip tone={m.active ? "green" : "grey"}>{m.active ? "Active" : "Inactive"}</Chip>
                  <Chip tone={t.pending > 0 ? "red" : "green"}>
                    {t.pending > 0 ? "Payment Pending" : "Settled"}
                  </Chip>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}

      <SectionCard title="Payments" actions={<DownloadMenu build={buildExport} label="Download" />}>
        {periodPayments.length === 0 ? (
          <EmptyState title="No payments in this period" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="hidden w-full min-w-[960px] text-sm sm:table">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-2">Team Member</th>
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2 pr-2">Month</th>
                    <th className="py-2 pr-2">Particulars</th>
                    <th className="py-2 pr-2 text-right">Amount</th>
                    <th className="py-2 pr-2">Paid From</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2" />
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map((p) => (
                    <tr
                      key={p.id}
                      className={`border-b border-border/60 align-top ${p.voided ? "opacity-50 line-through" : ""}`}
                    >
                      <td className="py-2 pr-2">{p.date}</td>
                      <td className="py-2 pr-2">{memberName(p.memberId)}</td>
                      <td className="py-2 pr-2">{teamTypeLabel(p.type)}</td>
                      <td className="py-2 pr-2">{p.month}</td>
                      <td className="py-2 pr-2">
                        <p>{p.particulars}</p>
                        <AuditLine
                          record={p}
                          sourceModule={p.sourceModule}
                          onViewSource={
                            p.paidFrom && resolveTx(p.paidFrom)
                              ? () => {
                                  const tx = resolveTx(p.paidFrom!)!;
                                  shell.openEntry({
                                    sourceType: tx.sourceType,
                                    accountId: tx.accountId,
                                    editing: tx,
                                  });
                                }
                              : undefined
                          }
                        />
                      </td>
                      <td className="num py-2 pr-2 text-right">{formatMoney(p.amount)}</td>
                      <td className="py-2 pr-2">{p.paidFrom ?? "—"}</td>
                      <td className="py-2 pr-2">
                        <Chip tone={p.voided ? "grey" : p.paid ? "green" : "red"}>
                          {p.voided ? "Deleted" : p.paid ? "Paid" : "Pending"}
                        </Chip>
                      </td>
                      <td className="py-2 pr-2">
                        {!p.voided ? (
                          <Button variant="outline" size="sm" onClick={() => setVoidTarget(p)}>
                            Delete
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="space-y-2 sm:hidden">
                {paged.slice.map((p) => (
                  <div
                    key={p.id}
                    className={`rounded-lg border border-border p-3 text-xs ${p.voided ? "opacity-50 line-through" : ""}`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <p className="font-semibold">{memberName(p.memberId)}</p>
                      <Chip tone={p.voided ? "grey" : p.paid ? "green" : "red"}>
                        {p.voided ? "Deleted" : p.paid ? "Paid" : "Pending"}
                      </Chip>
                    </div>
                    <Row label="Date" value={p.date} />
                    <Row label="Type" value={teamTypeLabel(p.type)} />
                    <Row label="Month" value={p.month} />
                    <Row label="Amount" value={formatMoney(p.amount)} />
                    <Row label="Paid From" value={p.paidFrom ?? "—"} />
                    <p className="mt-1 text-muted-foreground">{p.particulars}</p>
                    <AuditLine record={p} sourceModule={p.sourceModule} />
                    {!p.voided ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => setVoidTarget(p)}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <Pager {...paged} />
          </>
        )}
      </SectionCard>

      {memberOpen ? <MemberModal member={editMember} onClose={() => setMemberOpen(false)} /> : null}
      {paymentOpen ? (
        <PaymentModal payment={editPayment} onClose={() => setPaymentOpen(false)} />
      ) : null}
      {voidTarget ? (
        <ModalShell
          open
          onClose={() => setVoidTarget(null)}
          title="Delete payment?"
          footer={
            <>
              <Button variant="outline" onClick={() => setVoidTarget(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmVoid}>
                Delete payment
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">
            This will delete the payment
            {voidTarget.paidFrom ? " and its linked bank/cash entry" : ""}. This action can be
            reviewed later but excludes it from totals.
          </p>
        </ModalShell>
      ) : null}
    </div>
  );
}

/* ---------------------------- Add / Edit Member modal ---------------------------- */

function MemberModal({ member, onClose }: { member: TeamMember | null; onClose: () => void }) {
  const store = useLepdo();
  const [name, setName] = useState(member?.name ?? "");
  const [role, setRole] = useState(member?.role ?? "");
  const [salary, setSalary] = useState(member?.monthlySalary ?? 0);
  const [incentiveType, setIncentiveType] = useState<"percent" | "fixed">(
    member?.incentiveType ?? "percent",
  );
  const [incentiveRate, setIncentiveRate] = useState(member?.incentiveRate ?? 0);
  const [active, setActive] = useState(member?.active ?? true);
  const [saving, setSaving] = useState(false);

  function save() {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required.");
      return;
    }
    const dup = store.teamMembers.some(
      (m) => m.id !== member?.id && m.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (dup) {
      toast.error("A team member with this name already exists.");
      return;
    }
    setSaving(true);
    try {
      const record = store.stamp("tm", {
        id: member?.id,
        name: trimmed,
        role: role.trim(),
        monthlySalary: round2(salary || 0),
        incentiveType,
        incentiveRate: round2(incentiveRate || 0),
        active,
      } as Omit<TeamMember, "createdAt" | "createdBy" | "updatedAt" | "updatedBy">);
      store.saveRecord("teamMembers", record as TeamMember);
      toast.success(member ? "Member updated." : "Member added.");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      title={member ? "Edit Member" : "Add Member"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Role">
          <Input className="h-9" value={role} onChange={(e) => setRole(e.target.value)} />
        </Field>
        <Field label="Monthly Salary">
          <MoneyInput className="h-9" value={salary} onChange={setSalary} />
        </Field>
        <Field label="Incentive Type">
          <Select
            value={incentiveType}
            onValueChange={(v) => setIncentiveType(v as "percent" | "fixed")}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Percent of sales</SelectItem>
              <SelectItem value="fixed">Fixed per invoice</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Incentive Rate">
          <NumInput
            className="h-9"
            decimals={4}
            value={incentiveRate}
            onChange={setIncentiveRate}
          />
        </Field>
        <Field label="Active">
          <div className="flex h-9 items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <span className="text-sm">{active ? "Active" : "Inactive"}</span>
          </div>
        </Field>
      </div>
    </ModalShell>
  );
}

/* ---------------------------- Add / Edit Payment modal ---------------------------- */

function PaymentModal({ payment, onClose }: { payment: TeamPayment | null; onClose: () => void }) {
  const store = useLepdo();
  const [memberId, setMemberId] = useState(payment?.memberId ?? store.teamMembers[0]?.id ?? "");
  const [date, setDate] = useState(payment?.date ?? todayISO());
  const [type, setType] = useState<TeamPaymentType>(payment?.type ?? "salary");
  const [month, setMonth] = useState(payment?.month ?? todayISO().slice(0, 7));
  const [particulars, setParticulars] = useState(payment?.particulars ?? "");
  const [amount, setAmount] = useState(payment?.amount ?? 0);
  const [paid, setPaid] = useState(payment?.paid ?? true);
  const [sourceType, setSourceType] = useState<"bank" | "cash">("bank");
  const [sourceId, setSourceId] = useState(store.bankAccounts[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const memberName = store.teamMembers.find((m) => m.id === memberId)?.name ?? "";

  function save() {
    if (saving) return;
    if (!memberId) {
      toast.error("Select a team member.");
      return;
    }
    const amt = round2(amount || 0);
    if (amt <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    const accountId = sourceType === "bank" ? sourceId : sourceId;
    if (paid && !accountId) {
      toast.error("Select a paid-from source.");
      return;
    }
    setSaving(true);
    try {
      let paidFromRef: string | undefined;
      let sourceModule: string | undefined;
      if (paid) {
        const ref = reference.trim() || `SAL-${uid("SAL")}`;
        const entryInput: NewEntryInput = {
          date,
          sourceType,
          accountId,
          direction: "out",
          amount: amt,
          category: "expense",
          partyId: null,
          particulars: `${teamTypeLabel(type)} — ${memberName} (${month})`,
          reference: ref,
          expenseCategory: "Salary & Wages",
          expensePaid: true,
        };
        if (store.isLikelyDuplicate(entryInput)) {
          toast.error("A similar entry already exists. Avoiding duplicate posting.");
          setSaving(false);
          return;
        }
        const res = store.addEntry(entryInput);
        if (!res.ok) {
          toast.error(res.message);
          setSaving(false);
          return;
        }
        paidFromRef = ref;
        sourceModule = sourceType === "bank" ? "Bank Entry" : "Cash Entry";
      }
      const record = store.stamp("tp", {
        id: payment?.id,
        memberId,
        date,
        type,
        month,
        particulars: particulars.trim() || teamTypeLabel(type),
        amount: amt,
        paid,
        paidFrom: paidFromRef ?? payment?.paidFrom,
        sourceModule: sourceModule ?? payment?.sourceModule ?? "Team Payment",
        voided: payment?.voided ?? false,
      } as Omit<TeamPayment, "createdAt" | "createdBy" | "updatedAt" | "updatedBy">);
      store.saveRecord("teamPayments", record as TeamPayment);
      toast.success(payment ? "Payment updated." : "Payment added.");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      title={payment ? "Edit Payment" : "Add Payment"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Team Member">
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select member" />
            </SelectTrigger>
            <SelectContent>
              {store.teamMembers.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date">
          <Input
            className="h-9"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Type">
          <Select value={type} onValueChange={(v) => setType(v as TeamPaymentType)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEAM_PAYMENT_TYPES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Month">
          <Input
            className="h-9"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </Field>
        <Field label="Particulars" className="sm:col-span-2">
          <Input
            className="h-9"
            value={particulars}
            onChange={(e) => setParticulars(e.target.value)}
          />
        </Field>
        <Field label="Amount">
          <MoneyInput className="h-9" value={amount} onChange={setAmount} />
        </Field>
        <Field label="Paid">
          <div className="flex h-9 items-center gap-2">
            <Switch checked={paid} onCheckedChange={setPaid} />
            <span className="text-sm">{paid ? "Paid now" : "Not paid yet"}</span>
          </div>
        </Field>
        {paid ? (
          <>
            <Field label="Source Type">
              <Select
                value={sourceType}
                onValueChange={(v) => {
                  setSourceType(v as "bank" | "cash");
                  setSourceId(
                    v === "bank"
                      ? (store.bankAccounts[0]?.id ?? "")
                      : (store.cashLocations[0]?.id ?? ""),
                  );
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank Account</SelectItem>
                  <SelectItem value="cash">Cash Location</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={sourceType === "bank" ? "Bank Account" : "Cash Location"}>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {(sourceType === "bank" ? store.bankAccounts : store.cashLocations).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {"bankName" in a ? `${a.bankName} — ${a.nickname}` : a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Reference">
              <Input
                className="h-9"
                placeholder="Auto-generated if left blank"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
          </>
        ) : null}
      </div>
    </ModalShell>
  );
}
