import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Gem, MoreVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PageHeading } from "@/components/lepdo/bits";
import {
  StatCard,
  Chip,
  SectionCard,
  EmptyState,
  DownloadMenu,
  ModalShell,
  Field,
  TextField,
  AuditLine,
  usePaged,
  Pager,
} from "@/components/lepdo/shared";
import { useLepdo } from "@/lib/lepdo/store";
import { useShell } from "@/components/lepdo/shell-context";
import { round2 } from "@/lib/lepdo/format";
import { MoneyInput, NumInput, toNum } from "@/components/lepdo/numeric";
import { formatDate, formatMoney, todayISO } from "@/lib/lepdo/format";
import type { StockEntry } from "@/lib/lepdo/types";
import type { ExportTable } from "@/lib/lepdo/exportTable";

export const Route = createFileRoute("/stock")({
  head: () => ({
    meta: [
      { title: "Stock — LEPDO Accounting" },
      {
        name: "description",
        content:
          "Diamond and gold stock ledgers with running balances, auto-derived movements from sales and purchases, and audited manual adjustments.",
      },
      { property: "og:title", content: "Stock — LEPDO Accounting" },
      {
        property: "og:description",
        content: "Track diamond carat and gold gram stock positions with full audit trail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StockPage,
});

type StockKind = "diamond" | "gold";

/** A merged ledger row: either a stored StockEntry or a derived (auto) movement. */
interface LedgerRow {
  id: string;
  stock: StockKind;
  date: string;
  description: string;
  category?: string | undefined;
  karat?: string | undefined;
  colour?: string | undefined;
  qtyIn: number;
  qtyOut: number;
  rate: number;
  auto: boolean;
  sourceModule: string;
  manual?: StockEntry | undefined;
}

interface LedgerRowWithBalance extends LedgerRow {
  balance: number;
  value: number;
}

function deriveAutoRows(
  purchaseBills: ReturnType<typeof useLepdo>["purchaseBills"],
  salesInvoices: ReturnType<typeof useLepdo>["salesInvoices"],
): LedgerRow[] {
  const rows: LedgerRow[] = [];

  for (const bill of purchaseBills) {
    if (bill.voided) continue;
    if (bill.billKind === "diamond" && bill.lines) {
      for (const line of bill.lines) {
        if (!line.carat) continue;
        rows.push({
          id: `auto-pb-${bill.id}-${line.id}`,
          stock: "diamond",
          date: bill.date,
          description: line.description || "Diamond purchase",
          category: "Purchase",
          qtyIn: line.carat,
          qtyOut: 0,
          rate: line.rate ?? 0,
          auto: true,
          sourceModule: `Purchase Bill ${bill.number}`,
        });
      }
    }
    if (bill.billKind === "jewelry_making" && bill.makingLines) {
      for (const line of bill.makingLines) {
        if (line.netWeight) {
          rows.push({
            id: `auto-pb-gold-${bill.id}-${line.id}`,
            stock: "gold",
            date: bill.date,
            description: line.description || "Jewelry making",
            karat: "",
            colour: "",
            qtyIn: line.netWeight,
            qtyOut: 0,
            rate: line.makingRate ?? 0,
            auto: true,
            sourceModule: `Purchase Bill ${bill.number}`,
          });
        }
        if (line.diamondWeight) {
          rows.push({
            id: `auto-pb-diamond-${bill.id}-${line.id}`,
            stock: "diamond",
            date: bill.date,
            description: line.description || "Jewelry making — diamond",
            category: "Purchase",
            qtyIn: line.diamondWeight,
            qtyOut: 0,
            rate: 0,
            auto: true,
            sourceModule: `Purchase Bill ${bill.number}`,
          });
        }
      }
    }
  }

  for (const inv of salesInvoices) {
    if (inv.voided) continue;
    if (inv.invoiceKind !== "jewelry" && inv.lines) {
      for (const line of inv.lines) {
        if (!line.carat) continue;
        rows.push({
          id: `auto-si-${inv.id}-${line.id}`,
          stock: "diamond",
          date: inv.date,
          description: line.description || "Diamond sale",
          category: "Sale",
          qtyIn: 0,
          qtyOut: line.carat,
          rate: line.rate ?? 0,
          auto: true,
          sourceModule: `Sales Invoice ${inv.number}`,
        });
      }
    }
    if (inv.invoiceKind === "jewelry" && inv.jewelryItems) {
      for (const item of inv.jewelryItems) {
        if (item.netWeight) {
          rows.push({
            id: `auto-si-gold-${inv.id}-${item.id}`,
            stock: "gold",
            date: inv.date,
            description: item.description || "Jewelry sale",
            karat: item.karat,
            colour: item.metalColour,
            qtyIn: 0,
            qtyOut: item.netWeight,
            rate: item.metalRate ?? 0,
            auto: true,
            sourceModule: `Sales Invoice ${inv.number}`,
          });
        }
        for (const stone of item.stones ?? []) {
          if (!stone.carat) continue;
          rows.push({
            id: `auto-si-stone-${inv.id}-${item.id}-${stone.id}`,
            stock: "diamond",
            date: inv.date,
            description: `${item.description || "Jewelry sale"} — ${stone.stoneType || "stone"}`,
            category: "Sale",
            qtyIn: 0,
            qtyOut: stone.carat,
            rate: stone.rate ?? 0,
            auto: true,
            sourceModule: `Sales Invoice ${inv.number}`,
          });
        }
      }
    }
  }

  return rows;
}

/** Merge manual + auto rows for one stock kind, sort by date and compute running balances. */
function buildMergedLedger(
  manual: StockEntry[],
  auto: LedgerRow[],
  stock: StockKind,
): LedgerRowWithBalance[] {
  const manualRows: LedgerRow[] = manual
    .filter((e) => e.stock === stock && !e.voided)
    .map((e) => ({
      id: e.id,
      stock: e.stock,
      date: e.date,
      description: e.description,
      category: e.category,
      karat: e.karat,
      colour: e.colour,
      qtyIn: e.qtyIn ?? 0,
      qtyOut: e.qtyOut ?? 0,
      rate: e.rate ?? 0,
      auto: false,
      sourceModule: e.sourceModule || "Manual Adjustment",
      manual: e,
    }));
  const merged = [...manualRows, ...auto.filter((r) => r.stock === stock)].sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date),
  );
  let balance = 0;
  const out: LedgerRowWithBalance[] = [];
  for (const r of merged) {
    balance = round2(balance + r.qtyIn - r.qtyOut);
    out.push({ ...r, balance, value: round2(balance * r.rate) });
  }
  return out.reverse();
}

/** Balance immediately before a given manual entry (excluding it), for edit/adjustment audit. */
function balanceBeforeEntry(
  manual: StockEntry[],
  auto: LedgerRow[],
  stock: StockKind,
  excludeId: string,
): number {
  const rows = buildMergedLedger(
    manual.filter((e) => e.id !== excludeId),
    auto,
    stock,
  );
  // rows are reversed (latest first); find where excluded entry would sit by date order not needed —
  // we approximate "before" as the current all-time balance excluding this entry's own effect only
  // when the entry is voided/removed. Since ledger keeps chronological order, the balance just before
  // the entry in time is what we need; compute chronologically.
  const target = manual.find((e) => e.id === excludeId);
  if (!target) return rows[0]?.balance ?? 0;
  const withoutTarget = manual.filter((e) => e.id !== excludeId);
  const chronological = [...withoutTarget.filter((e) => e.stock === stock && !e.voided), ...[]];
  let balance = 0;
  const merged = [
    ...chronological.map((e) => ({ date: e.date, id: e.id, qtyIn: e.qtyIn ?? 0, qtyOut: e.qtyOut ?? 0 })),
    ...auto
      .filter((r) => r.stock === stock)
      .map((r) => ({ date: r.date, id: r.id, qtyIn: r.qtyIn, qtyOut: r.qtyOut })),
  ].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
  for (const r of merged) {
    if (r.date > target.date || (r.date === target.date && r.id.localeCompare(target.id) >= 0)) break;
    balance = round2(balance + r.qtyIn - r.qtyOut);
  }
  return balance;
}

function avgRateOf(rows: LedgerRowWithBalance[]): {
  avgRate: number;
  totalQty: number;
  totalValue: number;
} {
  let qtyIn = 0;
  let valueIn = 0;
  const totalQty = rows[0]?.balance ?? 0;
  for (const r of rows) {
    if (r.qtyIn) {
      qtyIn = round2(qtyIn + r.qtyIn);
      valueIn = round2(valueIn + r.qtyIn * r.rate);
    }
  }
  const avgRate = qtyIn > 0 ? round2(valueIn / qtyIn) : 0;
  return { avgRate, totalQty, totalValue: round2(totalQty * avgRate) };
}

function StockPage() {
  const store = useLepdo();
  const { from, to } = useShell();
  const [tab, setTab] = useState<StockKind>("diamond");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [viewing, setViewing] = useState<StockEntry | null>(null);
  const [editing, setEditing] = useState<StockEntry | null>(null);

  if (!store.ready) {
    return (
      <div className="space-y-4 pb-8">
        <PageHeading title="Stock" breadcrumb="LEPDO / Stock" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-border bg-muted/40"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <PageHeading title="Stock" breadcrumb="LEPDO / Stock">
        <Button
          onClick={() => setAdjustOpen(true)}
          className="h-9 bg-navy text-navy-foreground hover:bg-navy/90"
        >
          <Plus className="size-4" /> Manual Adjustment
        </Button>
      </PageHeading>

      <Tabs value={tab} onValueChange={(v) => setTab(v as StockKind)}>
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="diamond" className="text-xs sm:text-sm">
            Diamond Stock
          </TabsTrigger>
          <TabsTrigger value="gold" className="text-xs sm:text-sm">
            Gold Stock
          </TabsTrigger>
        </TabsList>

        <TabsContent value="diamond" className="mt-4 space-y-4">
          {tab === "diamond" ? (
            <StockPanel
              kind="diamond"
              from={from}
              to={to}
              onView={setViewing}
              onEdit={setEditing}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="gold" className="mt-4 space-y-4">
          {tab === "gold" ? (
            <StockPanel kind="gold" from={from} to={to} onView={setViewing} onEdit={setEditing} />
          ) : null}
        </TabsContent>
      </Tabs>

      <AdjustmentModal open={adjustOpen} onClose={() => setAdjustOpen(false)} />

      <EditStockModal open={!!editing} entry={editing} onClose={() => setEditing(null)} />

      {viewing ? (
        <ModalShell
          open={!!viewing}
          onClose={() => setViewing(null)}
          title={viewing.adjustment ? "Manual Adjustment" : "Stock Entry"}
          subtitle={formatDate(viewing.date)}
        >
          <div className="space-y-2 p-4 text-sm">
            <p className="text-foreground">{viewing.description}</p>
            <p className="text-muted-foreground">
              Qty In {viewing.qtyIn} · Qty Out {viewing.qtyOut} · Rate {formatMoney(viewing.rate)}
            </p>
            {viewing.prevQty != null && viewing.newQty != null ? (
              <p className="text-muted-foreground">
                Balance changed from {viewing.prevQty} to {viewing.newQty}
              </p>
            ) : null}
            {viewing.reason ? (
              <p className="text-muted-foreground">Reason: {viewing.reason}</p>
            ) : null}
            <AuditLine record={viewing} sourceModule={viewing.sourceModule} />
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

function StockPanel({
  kind,
  from,
  to,
  onView,
  onEdit,
}: {
  kind: StockKind;
  from: string;
  to: string;
  onView: (e: StockEntry) => void;
  onEdit: (e: StockEntry) => void;
}) {
  const store = useLepdo();

  const allRows = useMemo(() => {
    const auto = deriveAutoRows(store.purchaseBills, store.salesInvoices);
    return buildMergedLedger(store.stockEntries, auto, kind);
  }, [store.stockEntries, store.purchaseBills, store.salesInvoices, kind]);

  const { avgRate, totalQty, totalValue } = useMemo(() => avgRateOf(allRows), [allRows]);

  const periodRows = useMemo(
    () => allRows.filter((r) => r.date >= from && r.date <= to),
    [allRows, from, to],
  );

  const paged = usePaged(periodRows, 25);

  const buildReport = (): ExportTable => {
    const columns =
      kind === "diamond"
        ? [
            { key: "date", label: "Date", date: true },
            { key: "description", label: "Description" },
            { key: "category", label: "Category" },
            { key: "qtyIn", label: "CT In", money: false, align: "right" as const },
            { key: "qtyOut", label: "CT Out", money: false, align: "right" as const },
            { key: "balance", label: "Balance CT", align: "right" as const },
            { key: "rate", label: "Rate/CT", money: true, align: "right" as const },
            { key: "value", label: "Value", money: true, align: "right" as const },
          ]
        : [
            { key: "date", label: "Date", date: true },
            { key: "description", label: "Description" },
            { key: "karat", label: "KT" },
            { key: "colour", label: "Colour" },
            { key: "qtyIn", label: "Gram In", align: "right" as const },
            { key: "qtyOut", label: "Gram Out", align: "right" as const },
            { key: "balance", label: "Balance Gram", align: "right" as const },
            { key: "rate", label: "Rate/Gram", money: true, align: "right" as const },
            { key: "value", label: "Value", money: true, align: "right" as const },
          ];
    return {
      title: kind === "diamond" ? "Diamond Stock" : "Gold Stock",
      subtitle: `${formatDate(from)} – ${formatDate(to)}`,
      columns,
      rows: periodRows.map((r) => ({
        date: r.date,
        description: r.description + (r.auto ? ` (${r.sourceModule})` : ""),
        category: r.category ?? "",
        karat: r.karat ?? "",
        colour: r.colour ?? "",
        qtyIn: r.qtyIn,
        qtyOut: r.qtyOut,
        balance: r.balance,
        rate: r.rate,
        value: r.value,
      })),
      summary: [
        { label: kind === "diamond" ? "Total CT" : "Total Gram", value: String(totalQty) },
        {
          label: kind === "diamond" ? "Average Rate/CT" : "Average Rate/Gram",
          value: formatMoney(avgRate),
        },
        { label: "Total Value", value: formatMoney(totalValue) },
      ],
    };
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={kind === "diamond" ? "Total CT" : "Total Gram"}
          value={String(totalQty)}
          hint="All-time position"
          tone="blue"
          icon={<Gem className="size-[18px]" />}
        />
        <StatCard
          label={kind === "diamond" ? "Average Rate/CT" : "Average Rate/Gram"}
          value={formatMoney(avgRate)}
          hint="All-time weighted average"
          tone="yellow"
        />
        <StatCard
          label="Total Value"
          value={formatMoney(totalValue)}
          hint="Balance × average rate"
          tone="green"
        />
      </div>

      <SectionCard
        title={`${kind === "diamond" ? "Diamond" : "Gold"} Stock Ledger`}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Showing period {formatDate(from)} – {formatDate(to)}
            </span>
            <DownloadMenu build={buildReport} />
          </div>
        }
      >
        {periodRows.length === 0 ? (
          <EmptyState
            title="No stock movements in this period"
            hint="Adjust the header date range or add a manual adjustment."
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Date</th>
                    <th className="px-3 py-2 text-left font-semibold">Description</th>
                    {kind === "diamond" ? (
                      <th className="px-3 py-2 text-left font-semibold">Category</th>
                    ) : (
                      <>
                        <th className="px-3 py-2 text-left font-semibold">KT</th>
                        <th className="px-3 py-2 text-left font-semibold">Colour</th>
                      </>
                    )}
                    <th className="px-3 py-2 text-right font-semibold">
                      {kind === "diamond" ? "CT In" : "Gram In"}
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      {kind === "diamond" ? "CT Out" : "Gram Out"}
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      {kind === "diamond" ? "Balance CT" : "Balance Gram"}
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      {kind === "diamond" ? "Rate/CT" : "Rate/Gram"}
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">Value</th>
                    <th className="w-8 px-2 py-2" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map((r) => (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-foreground">
                        {formatDate(r.date)}
                      </td>
                      <td className="max-w-[280px] px-3 py-2 text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => r.manual && onView(r.manual)}
                          className={cn(
                            "block break-words text-left",
                            r.manual ? "underline decoration-dotted" : "",
                          )}
                        >
                          {r.description}
                        </button>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                          {r.auto ? `Source: ${r.sourceModule}` : "Manual Adjustment"}
                        </span>
                      </td>
                      {kind === "diamond" ? (
                        <td className="px-3 py-2">
                          <Chip tone="grey">{r.category || "—"}</Chip>
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-foreground">{r.karat || "—"}</td>
                          <td className="px-3 py-2 text-foreground">{r.colour || "—"}</td>
                        </>
                      )}
                      <td className="num whitespace-nowrap px-3 py-2 text-right font-medium text-pos">
                        {r.qtyIn ? r.qtyIn : "—"}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right font-medium text-neg">
                        {r.qtyOut ? r.qtyOut : "—"}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right font-semibold text-navy">
                        {r.balance}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right text-foreground">
                        {formatMoney(r.rate)}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right font-semibold text-navy">
                        {formatMoney(r.value)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {r.manual ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label="Row actions"
                              >
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onEdit(r.manual as StockEntry)}>
                                Edit Stock
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-border lg:hidden">
              {paged.slice.map((r) => (
                <li key={r.id} className="px-1 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{formatDate(r.date)}</p>
                      <button
                        type="button"
                        onClick={() => r.manual && onView(r.manual)}
                        className="mt-1 block break-words text-left text-sm font-medium text-navy"
                      >
                        {r.description}
                      </button>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {r.auto ? `Source: ${r.sourceModule}` : "Manual Adjustment"}
                      </p>
                      {kind === "diamond" ? (
                        <div className="mt-1.5">
                          <Chip tone="grey">{r.category || "—"}</Chip>
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {r.karat || "—"} · {r.colour || "—"}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                      <span className="num text-sm font-semibold text-pos">
                        {r.qtyIn ? `+${r.qtyIn}` : "—"}
                      </span>
                      <span className="num text-sm font-semibold text-neg">
                        {r.qtyOut ? `−${r.qtyOut}` : "—"}
                      </span>
                      <span className="num text-xs text-muted-foreground">Bal {r.balance}</span>
                      <span className="num text-xs font-semibold text-navy">
                        {formatMoney(r.value)}
                      </span>
                      {r.manual ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1 text-xs text-navy"
                          onClick={() => onEdit(r.manual as StockEntry)}
                        >
                          Edit
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-1">
              <Pager {...paged} />
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

function AdjustmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useLepdo();
  const today = todayISO();
  const [stock, setStock] = useState<StockKind>("diamond");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [karat, setKarat] = useState("");
  const [colour, setColour] = useState("");
  const [qtyIn, setQtyIn] = useState("0");
  const [qtyOut, setQtyOut] = useState("0");
  const [rate, setRate] = useState("0");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStock("diamond");
    setDate(today);
    setDescription("");
    setCategory("");
    setKarat("");
    setColour("");
    setQtyIn("0");
    setQtyOut("0");
    setRate("0");
    setReason("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = () => {
    if (saving) return;
    if (!description.trim()) {
      toast.error("Description is required.");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required for manual adjustments.");
      return;
    }
    const inQty = Number(qtyIn) || 0;
    const outQty = Number(qtyOut) || 0;
    if (inQty <= 0 && outQty <= 0) {
      toast.error("Enter a quantity in or out.");
      return;
    }

    // Check resulting balance across the merged ledger for this stock kind.
    const auto = deriveAutoRows(store.purchaseBills, store.salesInvoices);
    const currentRows = buildMergedLedger(store.stockEntries, auto, stock);
    const currentBalance = currentRows[0]?.balance ?? 0;
    const newBalance = round2(currentBalance + inQty - outQty);
    if (newBalance < 0) {
      toast.error(
        `This adjustment would make the running ${stock} balance negative (${newBalance}). Adjust the quantities before saving.`,
      );
      return;
    }

    setSaving(true);
    try {
      const record = store.stamp("stk", {
        stock,
        date,
        description: description.trim(),
        category: stock === "diamond" ? category || undefined : undefined,
        karat: stock === "gold" ? karat || undefined : undefined,
        colour: stock === "gold" ? colour || undefined : undefined,
        qtyIn: inQty,
        qtyOut: outQty,
        rate: Number(rate) || 0,
        reason: reason.trim(),
        adjustment: true,
        prevQty: currentBalance,
        newQty: newBalance,
        sourceModule: "Manual Adjustment",
        voided: false,
      } as Omit<StockEntry, "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy">);
      store.saveRecord("stockEntries", record as StockEntry);
      toast.success("Stock adjustment saved.");
      handleClose();
    } catch {
      toast.error("Could not save the adjustment. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      title="Manual Stock Adjustment"
      subtitle="Adjustments are audited and never overwrite auto-derived sales/purchase movements."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-navy text-navy-foreground hover:bg-navy/90"
          >
            {saving ? "Saving…" : "Save Adjustment"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Stock Type">
          <Select value={stock} onValueChange={(v) => setStock(v as StockKind)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="diamond">Diamond</SelectItem>
              <SelectItem value="gold">Gold</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <TextField label="Date" type="date" value={date} onChange={setDate} />
        <TextField
          label="Description"
          value={description}
          onChange={setDescription}
          className="sm:col-span-2"
        />
        {stock === "diamond" ? (
          <TextField
            label="Category"
            value={category}
            onChange={setCategory}
            placeholder="e.g. Adjustment"
          />
        ) : (
          <>
            <TextField label="KT" value={karat} onChange={setKarat} placeholder="e.g. 18KT" />
            <TextField
              label="Colour"
              value={colour}
              onChange={setColour}
              placeholder="e.g. Yellow"
            />
          </>
        )}
        <Field label={stock === "diamond" ? "CT In" : "Gram In"}><NumInput decimals={4} value={toNum(qtyIn)} onChange={(n) => setQtyIn(String(n))} /></Field>
        <Field label={stock === "diamond" ? "CT Out" : "Gram Out"}><NumInput decimals={4} value={toNum(qtyOut)} onChange={(n) => setQtyOut(String(n))} /></Field>
        <Field label={stock === "diamond" ? "Rate/CT" : "Rate/Gram"}><NumInput decimals={4} value={toNum(rate)} onChange={(n) => setRate(String(n))} /></Field>
        <Field label="Reason (required)" className="sm:col-span-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Explain why this manual adjustment is needed"
          />
        </Field>
      </div>
    </ModalShell>
  );
}

function EditStockModal({
  open,
  entry,
  onClose,
}: {
  open: boolean;
  entry: StockEntry | null;
  onClose: () => void;
}) {
  const store = useLepdo();
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [karat, setKarat] = useState("");
  const [colour, setColour] = useState("");
  const [qtyIn, setQtyIn] = useState("0");
  const [qtyOut, setQtyOut] = useState("0");
  const [rate, setRate] = useState("0");
  const [reason, setReason] = useState("");
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (entry && loadedId !== entry.id) {
    setDescription(entry.description);
    setCategory(entry.category ?? "");
    setKarat(entry.karat ?? "");
    setColour(entry.colour ?? "");
    setQtyIn(String(entry.qtyIn ?? 0));
    setQtyOut(String(entry.qtyOut ?? 0));
    setRate(String(entry.rate ?? 0));
    setReason("");
    setLoadedId(entry.id);
  }

  if (!open || !entry) return null;

  const handleClose = () => {
    setLoadedId(null);
    onClose();
  };

  const handleSave = () => {
    if (saving) return;
    if (!description.trim()) {
      toast.error("Description is required.");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required for stock edits.");
      return;
    }
    const inQty = Number(qtyIn) || 0;
    const outQty = Number(qtyOut) || 0;
    const auto = deriveAutoRows(store.purchaseBills, store.salesInvoices);
    const prevQty = balanceBeforeEntry(store.stockEntries, auto, entry.stock, entry.id);
    const newQty = round2(prevQty + inQty - outQty);
    if (newQty < 0) {
      toast.error(
        `This change would make the running ${entry.stock} balance negative (${newQty}). Adjust the quantities before saving.`,
      );
      return;
    }
    setSaving(true);
    try {
      const record = store.stamp("stk", {
        ...entry,
        description: description.trim(),
        category: entry.stock === "diamond" ? category || undefined : undefined,
        karat: entry.stock === "gold" ? karat || undefined : undefined,
        colour: entry.stock === "gold" ? colour || undefined : undefined,
        qtyIn: inQty,
        qtyOut: outQty,
        rate: Number(rate) || 0,
        reason: reason.trim(),
        adjustment: true,
        prevQty,
        newQty,
      });
      store.saveRecord("stockEntries", record as StockEntry);
      toast.success("Stock entry updated.");
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      title="Edit Stock Entry"
      subtitle="Edits are audited with the previous and new balance."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-navy text-navy-foreground hover:bg-navy/90"
          >
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <TextField
          label="Description"
          value={description}
          onChange={setDescription}
          className="sm:col-span-2"
        />
        {entry.stock === "diamond" ? (
          <TextField label="Category" value={category} onChange={setCategory} />
        ) : (
          <>
            <TextField label="KT" value={karat} onChange={setKarat} />
            <TextField label="Colour" value={colour} onChange={setColour} />
          </>
        )}
        <Field label={entry.stock === "diamond" ? "CT In" : "Gram In"}><NumInput decimals={4} value={toNum(qtyIn)} onChange={(n) => setQtyIn(String(n))} /></Field>
        <Field label={entry.stock === "diamond" ? "CT Out" : "Gram Out"}><NumInput decimals={4} value={toNum(qtyOut)} onChange={(n) => setQtyOut(String(n))} /></Field>
        <Field label={entry.stock === "diamond" ? "Rate/CT" : "Rate/Gram"}><NumInput decimals={4} value={toNum(rate)} onChange={(n) => setRate(String(n))} /></Field>
        <Field label="Reason for change (required)" className="sm:col-span-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Explain why this stock entry is being edited"
          />
        </Field>
      </div>
    </ModalShell>
  );
}
