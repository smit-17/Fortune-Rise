import { isPosted } from "@/lib/lepdo/entry";
import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, formatMoney, round2, todayISO } from "@/lib/lepdo/format";
import { useLepdo } from "@/lib/lepdo/store";

export const Route = createFileRoute("/pl")({
  head: () => ({
    meta: [
      { title: "Profit & Loss — LEPDO Accounting" },
      {
        name: "description",
        content:
          "Auto-calculated profit and loss statement for LEPDO built from sales, purchase, expense and ledger entries.",
      },
      { property: "og:title", content: "Profit & Loss — LEPDO Accounting" },
      {
        property: "og:description",
        content: "Standard P&L statement with gross profit, EBITDA, EBIT and net profit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfitLoss,
});

type PLPreset = "month" | "quarter" | "fy" | "custom";

const PL_PRESETS: { id: PLPreset; label: string }[] = [
  { id: "month", label: "This Month" },
  { id: "quarter", label: "This Quarter" },
  { id: "fy", label: "This Financial Year" },
  { id: "custom", label: "Custom Date" },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

function plRange(preset: PLPreset, today: string, from: string, to: string): [string, string] {
  const d = new Date(today);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (preset === "custom") return [from, to];
  if (preset === "quarter") {
    const qStart = Math.floor(m / 3) * 3;
    return [iso(new Date(Date.UTC(y, qStart, 1))), iso(new Date(Date.UTC(y, qStart + 3, 0)))];
  }
  if (preset === "fy") {
    const fy = m >= 3 ? y : y - 1;
    return [`${fy}-04-01`, `${fy + 1}-03-31`];
  }
  return [iso(new Date(Date.UTC(y, m, 1))), iso(new Date(Date.UTC(y, m + 1, 0)))];
}

export default function ProfitLoss() {
  const store = useLepdo();
  const today = todayISO();
  const [preset, setPreset] = useState<PLPreset>("fy");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [from, to] = plRange(preset, today, customFrom, customTo);

  const inRange = (date: string) => date >= from && date <= to;

  const model = useMemo(() => {
    const sumOf = <T,>(rows: T[], amount: (r: T) => number) =>
      round2(rows.reduce((s, r) => s + (amount(r) || 0), 0));

    const salesRevenue = sumOf(
      store.salesInvoices.filter((i) => !i.voided && inRange(i.date)),
      (i) => i.total,
    );

    const cogs = sumOf(
      store.purchaseBills.filter((i) => !i.voided && inRange(i.date)),
      (i) => i.total,
    );

    const live = store.transactions.filter((t) => isPosted(t) && inRange(t.date));

    // Operating expenses: category "expense" only — excludes interest, depreciation and tax.
    const operatingExpenses = sumOf(
      live.filter((t) => t.category === "expense"),
      (t) => t.amount,
    );

    // Net interest: interest paid out less interest received, from the "interest" category.
    const interest = sumOf(live.filter((t) => t.category === "interest"), (t) =>
      t.direction === "out" ? t.amount : -t.amount,
    );

    // No depreciation / tax source in the ledger yet — shown as zero until a category exists.
    const depreciation = 0;
    const tax = 0;

    const grossProfit = round2(salesRevenue - cogs);
    const ebitda = round2(grossProfit - operatingExpenses);
    const ebit = round2(ebitda - depreciation);
    const pbt = round2(ebit - interest);
    const net = round2(pbt - tax);

    return {
      salesRevenue,
      cogs,
      grossProfit,
      operatingExpenses,
      ebitda,
      depreciation,
      ebit,
      interest,
      pbt,
      tax,
      net,
    };
  }, [store.salesInvoices, store.purchaseBills, store.transactions, from, to]);

  const lastUpdated = useMemo(() => {
    const stamps = store.transactions
      .map((t) => t.updatedAt)
      .filter(Boolean)
      .sort();
    return stamps.length ? stamps[stamps.length - 1]! : null;
  }, [store.transactions]);

  const pct = (n: number) =>
    model.salesRevenue ? `${((n / model.salesRevenue) * 100).toFixed(1)}%` : "—";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-navy sm:text-2xl">Profit &amp; Loss</h1>
          <p className="truncate text-xs text-muted-foreground">
            {formatDate(from)} – {formatDate(to)} · auto-calculated, read-only
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as PLPreset)}>
            <SelectTrigger aria-label="P&L period" className="h-9 w-[170px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {PL_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {preset === "custom" ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <Input
                type="date"
                aria-label="From date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 min-w-0 flex-1 text-xs sm:w-[140px] sm:flex-none sm:text-sm"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                aria-label="To date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 min-w-0 flex-1 text-xs sm:w-[140px] sm:flex-none sm:text-sm"
              />
            </div>
          ) : null}
        </div>
      </div>

      <TooltipProvider delayDuration={150}>
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col />
              <col className="w-[110px] sm:w-[170px]" />
              <col className="w-[64px] sm:w-[110px]" />
            </colgroup>
            <thead>
              <tr className="border-b-2 border-gold bg-muted/60 text-navy">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">
                  Particulars
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide">
                  Amount
                </th>
                <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide">
                  % Sales
                </th>
              </tr>
            </thead>
            <tbody>
              <Row label="Sales Revenue" amount={model.salesRevenue} pct={pct(model.salesRevenue)} bg="bg-pl-green" bold />

              <Row label="Cost of Goods Sold" amount={model.cogs} pct={pct(model.cogs)} bg="bg-pl-orange" bold />

              <TotalRow
                label="Gross Profit / Loss"
                amount={model.grossProfit}
                pct={pct(model.grossProfit)}
                info="Sales Revenue minus Cost of Goods Sold — profit from core trading before any overheads."
              />

              <Row
                label="Operating Expenses"
                amount={model.operatingExpenses}
                pct={pct(model.operatingExpenses)}
                bg="bg-pl-red"
                bold
              />

              <TotalRow
                label="EBITDA"
                amount={model.ebitda}
                pct={pct(model.ebitda)}
                info="Earnings Before Interest, Tax, Depreciation & Amortization — Gross Profit minus Operating Expenses. Shows core operating performance."
              />

              <Row
                label="Depreciation & Amortization"
                amount={model.depreciation}
                pct={pct(model.depreciation)}
                bg="bg-pl-purple"
                bold
                info="The gradual write-down of the value of fixed assets (depreciation) and intangible assets (amortization) over their useful life."
              />

              <TotalRow
                label="EBIT"
                amount={model.ebit}
                pct={pct(model.ebit)}
                info="Earnings Before Interest & Tax — EBITDA minus Depreciation & Amortization."
              />

              <Row label="Interest" amount={model.interest} pct={pct(model.interest)} bg="bg-pl-blue" bold />

              <TotalRow
                label="Profit Before Tax"
                amount={model.pbt}
                pct={pct(model.pbt)}
                info="EBIT minus Interest — profit earned before accounting for income tax."
              />

              <Row label="Tax" amount={model.tax} pct={pct(model.tax)} bg="bg-pl-yellow" bold />

              <TotalRow label="Net Profit / Loss" amount={model.net} pct={pct(model.net)} emphasis />
            </tbody>
          </table>
        </section>
      </TooltipProvider>

      <p className="text-xs text-muted-foreground">
        Last updated: {lastUpdated ? formatDateTime(lastUpdated) : "—"} · figures auto-fetched from
        ledger entries
      </p>
    </div>
  );
}

function Amount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("num tabular-nums", className)}>
      {value < 0 ? `(${formatMoney(Math.abs(value))})` : formatMoney(value)}
    </span>
  );
}

function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="More info"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-navy"
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[220px] text-left">{text}</TooltipContent>
    </Tooltip>
  );
}

function Row({
  label,
  amount,
  pct,
  bg,
  bold,
  indent,
  info,
}: {
  label: string;
  amount: number;
  pct: string;
  bg?: string;
  bold?: boolean;
  indent?: boolean;
  info?: string;
}) {
  return (
    <tr className={cn("border-b border-border/70", bg ?? (indent ? "bg-pl-grey" : "bg-card"))}>
      <td className={cn("px-3 py-2 text-navy", indent && "pl-6 sm:pl-8", bold && "font-semibold")}>
        <span className="flex items-center gap-1.5">
          <span className="truncate">{label}</span>
          {info ? <InfoTip text={info} /> : null}
        </span>
      </td>
      <td className={cn("px-3 py-2 text-right text-navy", bold && "font-semibold")}>
        <Amount value={amount} {...(amount < 0 ? { className: "text-neg" } : {})} />
      </td>
      <td className="px-2 py-2 text-right text-xs text-muted-foreground">{pct}</td>
    </tr>
  );
}

function TotalRow({
  label,
  amount,
  pct,
  emphasis,
  info,
}: {
  label: string;
  amount: number;
  pct: string;
  emphasis?: boolean;
  info?: string;
}) {
  const loss = amount < 0;
  const name = label.replace(" / Loss", loss ? " — Loss" : "");
  return (
    <tr
      className={cn(
        "border-y-2 border-gold",
        loss ? "bg-pl-loss" : "bg-pl-profit",
        emphasis && "border-y-[3px]",
      )}
    >
      <td className={cn("px-3 py-2.5 font-bold text-navy", emphasis && "text-[15px]")}>
        <span className="flex items-center gap-1.5">
          <span className="truncate">{name}</span>
          {info ? <InfoTip text={info} /> : null}
        </span>
      </td>
      <td
        className={cn(
          "px-3 py-2.5 text-right font-bold",
          loss ? "text-neg" : "text-pos",
          emphasis && "text-[15px]",
        )}
      >
        <Amount value={amount} />
      </td>
      <td className="px-2 py-2.5 text-right text-xs font-medium text-muted-foreground">{pct}</td>
    </tr>
  );
}
