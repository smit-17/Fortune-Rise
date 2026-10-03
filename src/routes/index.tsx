import { isPosted } from "@/lib/lepdo/entry";
import { useMemo, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Banknote,
  Landmark,
  ReceiptIndianRupee,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { PageHeading } from "@/components/lepdo/bits";
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

  const bankTotal = round2(
    store.bankAccounts
      .filter((a) => a.active)
      .reduce((s, a) => s + store.balanceOf("bank", a.id), 0),
  );
  const cashTotal = round2(
    store.cashLocations
      .filter((l) => l.active)
      .reduce((s, l) => s + store.balanceOf("cash", l.id), 0),
  );

  return (
    <div className="space-y-4">
      <div className="hidden lg:block">
        <PageHeading title="Dashboard" breadcrumb="LEPDO Accounting / Dashboard" />
      </div>
      <h1 className="text-lg font-bold text-navy lg:hidden">Dashboard</h1>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4 2xl:grid-cols-4">
        <StatGroup
          title="Sales"
          icon={<TrendingUp className="size-4" />}
          className="border-cat-sale/20 bg-cat-sale-bg"
          accent="text-cat-sale"
          rows={[
            { label: "All-time sales", value: salesAll, strong: true },
            { label: `${label} sales`, value: salesPeriod },
            { label: "Paid", value: salesPaid },
            { label: "Pending", value: round2(salesPeriod - salesPaid) },
          ]}
        />
        <StatGroup
          title="Purchases"
          icon={<ShoppingCart className="size-4" />}
          className="border-cat-purchase/20 bg-cat-purchase-bg"
          accent="text-cat-purchase"
          rows={[
            { label: "All-time purchases", value: purchaseAll, strong: true },
            { label: `${label} purchases`, value: purchasePeriod },
            { label: "Paid", value: purchasePaid },
            { label: "Pending", value: round2(purchasePeriod - purchasePaid) },
          ]}
        />
        <StatGroup
          title="Expenses"
          icon={<ReceiptIndianRupee className="size-4" />}
          className="border-cat-expense/20 bg-cat-expense-bg"
          accent="text-cat-expense"
          rows={[
            { label: "All-time expenses", value: expenseAll, strong: true },
            { label: `${label} expenses`, value: expensePeriod },
          ]}
        />
        <StatGroup
          title="Balance"
          icon={<Wallet className="size-4" />}
          className="border-navy/20 bg-gold-tint"
          accent="text-navy"
          rows={[
            { label: "Bank balance", value: bankTotal, icon: <Landmark className="size-3.5" /> },
            { label: "Cash balance", value: cashTotal, icon: <Banknote className="size-3.5" /> },
            { label: "Total balance", value: round2(bankTotal + cashTotal), strong: true },
          ]}
        />
      </div>
    </div>
  );
}

function StatGroup({
  title,
  icon,
  rows,
  className,
  accent,
}: {
  title: string;
  icon: ReactNode;
  rows: { label: string; value: number; strong?: boolean; icon?: ReactNode }[];
  className: string;
  accent: string;
}) {
  return (
    <section className={cn("rounded-xl border p-4 shadow-sm", className)}>
      <h2 className={cn("flex items-center gap-2 text-sm font-semibold", accent)}>
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-card/70">
          {icon}
        </span>
        {title}
      </h2>
      <dl className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.label}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 rounded-lg px-2 py-1.5",
              r.strong ? "bg-card/70" : "",
            )}
          >
            <dt className="flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-muted-foreground">
              {r.icon ? <span className="shrink-0">{r.icon}</span> : null}
              <span className="truncate">{r.label}</span>
            </dt>
            <dd
              className={cn(
                "num shrink-0 text-right tabular-nums",
                r.strong
                  ? cn("text-lg font-semibold", accent)
                  : "text-sm font-medium text-foreground",
              )}
            >
              {formatMoney(r.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
