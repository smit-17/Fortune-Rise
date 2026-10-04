import { isPosted } from "@/lib/lepdo/entry";
import { useMemo, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Banknote,
  CircleDollarSign,
  Landmark,
  ReceiptIndianRupee,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useShell } from "@/components/lepdo/shell-context";
import { periodLabel } from "@/lib/lepdo/period";
import { formatMoney, round2 } from "@/lib/lepdo/format";
import { useLepdo } from "@/lib/lepdo/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LEPDO Accounting — Bank & Cash Dashboard" },
      {
        name: "description",
        content:
          "LEPDO Accounting dashboard: sales, purchases, expenses and live bank and cash balances at a glance.",
      },
      { property: "og:title", content: "LEPDO Accounting — Bank & Cash Dashboard" },
      {
        property: "og:description",
        content: "Sales, purchases, expenses and live bank and cash balances for LEPDO.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const store = useLepdo();
  const shell = useShell();
  const from = shell.from;
  const to = shell.to;
  const label = periodLabel(shell.preset);

  const inRange = (d: string) => d >= from && d <= to;

  const live = useMemo(() => store.transactions.filter((t) => isPosted(t)), [store.transactions]);

  const sum = (rows: { amount: number }[]) => round2(rows.reduce((s, r) => s + r.amount, 0));

  const liveInvoices = store.salesInvoices.filter((i) => !i.voided);
  const liveBills = store.purchaseBills.filter((b) => !b.voided);

  const salesScope = liveInvoices.filter((i) => inRange(i.date));
  const purchaseScope = liveBills.filter((i) => inRange(i.date));

  const salesAll = round2(liveInvoices.reduce((s, i) => s + i.total, 0));
  const salesPeriod = round2(salesScope.reduce((s, i) => s + i.total, 0));
  const salesPaid = round2(salesScope.reduce((s, i) => s + Math.min(i.paid, i.total), 0));

  const purchaseAll = round2(liveBills.reduce((s, i) => s + i.total, 0));
  const purchasePeriod = round2(purchaseScope.reduce((s, i) => s + i.total, 0));
  const purchasePaid = round2(purchaseScope.reduce((s, i) => s + Math.min(i.paid, i.total), 0));

  const expenseAll = sum(live.filter((t) => t.category === "expense"));
  const expensePeriod = sum(live.filter((t) => t.category === "expense" && inRange(t.date)));

  const grossAll = round2(salesAll - purchaseAll - expenseAll);
  const grossPeriod = round2(salesPeriod - purchasePeriod - expensePeriod);

  const activeBanks = store.bankAccounts.filter((a) => a.active);
  const bankTotal = round2(activeBanks.reduce((s, a) => s + store.balanceOf("bank", a.id), 0));

  const activeCash = store.cashLocations.filter((l) => l.active);
  const cashTotal = round2(activeCash.reduce((s, l) => s + store.balanceOf("cash", l.id), 0));

  const totalBalance = round2(bankTotal + cashTotal);

  return (
    <div className="dashboard-view space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-xs font-medium text-muted-foreground">LEPDO Accounting</p>
          <h1 className="dashboard-heading mt-1 text-2xl font-semibold text-navy">Dashboard</h1>
        </div>
        <div className="flex min-w-0 items-center gap-3 border-l-2 border-gold pl-4">
          <Wallet className="size-5 shrink-0 text-navy" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Total Balance</p>
            <p className="dashboard-heading num break-words text-2xl font-semibold text-navy">{formatMoney(totalBalance)}</p>
          </div>
        </div>
      </header>

      <section aria-label="Balances" className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        <BalanceBlock
          title="Cash Balance"
          icon={<Banknote className="size-5" />}
          total={cashTotal}
          accounts={activeCash.map((l) => ({ id: l.id, name: l.name, detail: "", value: round2(store.balanceOf("cash", l.id)) }))}
          emptyLabel="No active cash books"
        />
        <BalanceBlock
          title="Bank Balance"
          icon={<Landmark className="size-5" />}
          total={bankTotal}
          accounts={activeBanks.map((a) => ({ id: a.id, name: a.nickname || a.bankName, detail: a.last4 ? `••${a.last4}` : a.bankName, value: round2(store.balanceOf("bank", a.id)) }))}
          emptyLabel="No active bank accounts"
          dark
        />
      </section>

      <section aria-label="All-time totals" className="space-y-3">
        <SectionTitle>All-time totals</SectionTitle>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
          <MetricCard title="Sales" value={salesAll} icon={<TrendingUp className="size-4" />} tone="sale" />
          <MetricCard title="Purchases" value={purchaseAll} icon={<ShoppingCart className="size-4" />} tone="purchase" />
          <MetricCard title="Expenses" value={expenseAll} icon={<ReceiptIndianRupee className="size-4" />} tone="expense" />
          <MetricCard title="Gross Profit" value={grossAll} icon={<CircleDollarSign className="size-4" />} tone="profit" note="Sales − purchases − expenses" />
        </div>
      </section>

      <section aria-label="Selected period totals" className="space-y-3">
        <SectionTitle>{label}</SectionTitle>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
          <MetricCard title="Sales" value={salesPeriod} icon={<TrendingUp className="size-4" />} tone="sale" rows={[{ label: "Paid", value: salesPaid }, { label: "Pending", value: round2(salesPeriod - salesPaid) }]} />
          <MetricCard title="Purchases" value={purchasePeriod} icon={<ShoppingCart className="size-4" />} tone="purchase" rows={[{ label: "Paid", value: purchasePaid }, { label: "Pending", value: round2(purchasePeriod - purchasePaid) }]} />
          <MetricCard title="Expenses" value={expensePeriod} icon={<ReceiptIndianRupee className="size-4" />} tone="expense" />
          <MetricCard title="Gross Profit" value={grossPeriod} icon={<CircleDollarSign className="size-4" />} tone="profit" rows={[{ label: `${label} sales`, value: salesPeriod }, { label: `${label} expenses`, value: expensePeriod }]} />
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="dashboard-heading shrink-0 text-sm font-semibold text-navy">{children}</h2>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function MetricCard({ title, value, icon, tone, rows = [], note }: {
  title: string;
  value: number;
  icon: ReactNode;
  tone: "sale" | "purchase" | "expense" | "profit";
  rows?: { label: string; value: number }[];
  note?: string;
}) {
  const accent = tone === "sale" ? "text-cat-sale" : tone === "purchase" ? "text-cat-purchase" : tone === "expense" ? "text-cat-expense" : value < 0 ? "text-neg" : "text-pos";
  return (
    <article className={cn("min-w-0 rounded-lg border bg-card p-5", tone === "profit" ? "border-gold/50 bg-gold-tint" : "border-border")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className={cn("shrink-0", accent)}>{icon}</span>
      </div>
      <p className={cn("dashboard-heading num mt-4 break-words text-2xl font-semibold", accent)}>{formatMoney(value)}</p>
      {note ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{note}</p> : null}
      {rows.length ? (
        <dl className="mt-4 space-y-2 border-t border-border pt-3">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="num break-words text-sm font-semibold text-foreground">{formatMoney(row.value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}

function BalanceBlock({ title, icon, total, accounts, emptyLabel, dark = false }: {
  title: string;
  icon: ReactNode;
  total: number;
  accounts: { id: string; name: string; detail: string; value: number }[];
  emptyLabel: string;
  dark?: boolean;
}) {
  return (
    <article className={cn("min-w-0 rounded-lg border p-6", dark ? "border-navy bg-navy text-navy-foreground" : "border-border bg-card text-navy")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="dashboard-heading text-base font-semibold">{title}</h2>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", dark ? "bg-navy-foreground/10 text-gold" : "bg-gold-tint text-navy")}>{icon}</span>
      </div>
      <p className="dashboard-heading num mt-4 break-words text-3xl font-semibold">{formatMoney(total)}</p>
      {accounts.length ? (
        <dl className={cn("mt-5 grid grid-cols-1 gap-x-6 gap-y-4 border-t pt-5 sm:grid-cols-2", dark ? "border-navy-foreground/20" : "border-border")}>
          {accounts.map((a) => (
            <div key={a.id} className="min-w-0">
              <dt className={cn("flex flex-wrap items-baseline gap-x-2 text-sm", dark ? "text-navy-foreground/80" : "text-muted-foreground")}>
                <span className="break-words">{a.name}</span>
                {a.detail && a.detail !== a.name ? <span className="text-xs">{a.detail}</span> : null}
              </dt>
              <dd className="num mt-1 break-words text-base font-semibold">{formatMoney(a.value)}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="mt-5 text-sm">{emptyLabel}</p>}
    </article>
  );
}
