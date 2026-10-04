import { isLedgerEntry, isPosted } from "@/lib/lepdo/entry";
import { useEffect, useMemo, useState } from "react";
import {
  FilterBar,
  inAmountRange,
  sortRows,
  type SelectFilterDef,
  type SortId,
} from "@/components/lepdo/FilterBar";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, MoreVertical, PieChart, Plus, Receipt, TrendingDown, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { formatDate, formatDateTime, formatMoney, todayISO } from "@/lib/lepdo/format";
import { useLepdo, type NewEntryInput } from "@/lib/lepdo/store";
import type { Transaction } from "@/lib/lepdo/types";
import {
  BANKS,
  BANK_PRESETS,
  BANK_SEED,
  bankRange,
  periodLabel,
  type BankPreset,
} from "@/lib/lepdo/bank";
import {
  DEFAULT_EXPENSE_CATEGORY,
  expenseCategoryOptions,
  expenseBadge,
  expenseHead,
} from "@/lib/lepdo/expense";
import { CASH_BOOKS } from "@/lib/lepdo/cash";
import {
  downloadExpenseCsv,
  downloadExpenseExcel,
  downloadExpensePdf,
  type ExpenseReportRow,
} from "@/lib/lepdo/expenseReport";

export const Route = createFileRoute("/expense")({
  head: () => ({
    meta: [
      { title: "Expense Ledger — LEPDO Accounting" },
      {
        name: "description",
        content:
          "Every LEPDO expense in one clean ledger — pastel summary cards, expense heads, paid and unpaid tracking, payment source and CA-ready Excel, PDF and CSV reports.",
      },
      { property: "og:title", content: "Expense Ledger — LEPDO Accounting" },
      {
        property: "og:description",
        content:
          "Track office, salary, rent, travel and other business expenses with linked bank and cash entries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExpensePage,
});

const UNPAID = "unpaid";

interface FormState {
  date: string;
  category: string;
  particulars: string;
  amount: string;
  paid: boolean;
  source: string;
  reference: string;
  attachmentName: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  date: todayISO(),
  category: "",
  particulars: "",
  amount: "",
  paid: true,
  source: BANKS[0]!.id,
  reference: "",
  attachmentName: "",
  notes: "",
});

function ExpensePage() {
  const store = useLepdo();
  const navigate = useNavigate();
  const today = todayISO();
  const [preset, setPreset] = useState<BankPreset>("month");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expSort, setExpSort] = useState<SortId>("date_desc");
  const [expMin, setExpMin] = useState("");
  const [expMax, setExpMax] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [viewing, setViewing] = useState<Transaction | null>(null);
  const [voiding, setVoiding] = useState<Transaction | null>(null);

  const { ensureBankAccounts } = store;
  useEffect(() => {
    ensureBankAccounts(BANK_SEED);
  }, [ensureBankAccounts]);

  const [from, to] = useMemo(
    () => bankRange(preset, today, customFrom, customTo),
    [preset, today, customFrom, customTo],
  );

  const sources = useMemo(
    () => [
      ...store.bankAccounts.map((b) => ({ id: b.id, label: b.nickname || b.bankName })),
      ...store.cashLocations.map((c) => ({ id: c.id, label: c.name })),
    ],
    [store.bankAccounts, store.cashLocations],
  );

  const sourceLabel = (t: Transaction) =>
    t.expensePaid === false || !t.accountId
      ? "Unpaid"
      : (sources.find((s) => s.id === t.accountId)?.label ?? "—");

  const goToSource = (t: Transaction) => {
    void navigate({ to: t.sourceType === "cash" ? "/cash-book" : "/bank-ledger" });
  };

  /** true when this expense row is a Bank Entry debit categorised as Expense */
  const isBankLinked = (t: Transaction) => isLedgerEntry(t) && t.sourceType === "bank";

  /** true when this expense row is a Cash Book entry categorised as Expense */
  const isCashLinked = (t: Transaction) => isLedgerEntry(t) && t.sourceType === "cash";

  /** true when this expense row is linked to a Bank Entry or Cash Book entry */
  const isSourceLinked = (t: Transaction) => isBankLinked(t) || isCashLinked(t);

  const bankLabel = (t: Transaction) =>
    BANKS.find((b) => b.id === t.accountId)?.bankName ??
    store.bankAccounts.find((b) => b.id === t.accountId)?.nickname ??
    "Bank";

  const cashLabel = (t: Transaction) =>
    CASH_BOOKS.find((c) => c.id === t.accountId)?.name ??
    store.cashLocations.find((c) => c.id === t.accountId)?.name ??
    "Cash";

  const sourceEntryLabel = (t: Transaction) =>
    isCashLinked(t) ? `Cash Entry · ${cashLabel(t)}` : `Bank Entry · ${bankLabel(t)}`;

  /**
   * Every non-deleted expense: entries recorded in the Expense section, plus
   * Bank Entry debits and Cash Book entries categorised as Expense (linked by
   * their own transaction id, never duplicated).
   */
  const allExpenses = useMemo(
    () =>
      store.transactions.filter(
        (t) =>
          t.category === "expense" &&
          !t.voided &&
          (!isLedgerEntry(t) ||
            ((t.sourceType === "bank" || t.sourceType === "cash") && t.direction === "out")),
      ),
    [store.transactions],
  );

  /** only confirmed (approved) entries move totals, dashboards and P&L */
  const postedExpenses = useMemo(() => allExpenses.filter(isPosted), [allExpenses]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = allExpenses
      .filter((t) => t.date >= from && t.date <= to)
      .filter((t) => categoryFilter === "all" || expenseHead(t.expenseCategory) === categoryFilter)
      .filter((t) =>
        sourceFilter === "all"
          ? true
          : sourceFilter === UNPAID
            ? t.expensePaid === false || !t.accountId
            : t.accountId === sourceFilter && t.expensePaid !== false,
      )
      .filter((t) => {
        const paid = t.expensePaid !== false && !!t.accountId;
        return statusFilter === "all" ? true : statusFilter === "paid" ? paid : !paid;
      })
      .filter((t) => inAmountRange(t.amount, expMin, expMax))
      .filter(
        (t) =>
          !q ||
          t.particulars.toLowerCase().includes(q) ||
          (t.reference ?? "").toLowerCase().includes(q) ||
          expenseHead(t.expenseCategory).toLowerCase().includes(q),
      );
    return sortRows(list, expSort, {
      date: (t) => t.date,
      number: (t) => t.code,
      amount: (t) => t.amount,
      updated: (t) => t.updatedAt,
    });
  }, [
    allExpenses,
    from,
    to,
    categoryFilter,
    sourceFilter,
    statusFilter,
    expMin,
    expMax,
    search,
    expSort,
  ]);

  const expFilterDefs: SelectFilterDef[] = useMemo(
    () => [
      {
        id: "category",
        label: "Expense category",
        options: [
          { value: "all", label: "All Categories" },
          ...expenseCategoryOptions(store.masters, null, true).map((c) => ({ value: c, label: c })),
        ],
      },
      {
        id: "source",
        label: "Payment source",
        options: [
          { value: "all", label: "All Sources" },
          ...sources.map((x) => ({ value: x.id, label: x.label })),
          { value: UNPAID, label: "Unpaid" },
        ],
      },
      {
        id: "status",
        label: "Status",
        options: [
          { value: "all", label: "Paid & Unpaid" },
          { value: "paid", label: "Paid" },
          { value: "unpaid", label: "Unpaid" },
        ],
      },
    ],
    [sources, store.masters],
  );

  function clearExpFilters() {
    setCategoryFilter("all");
    setSourceFilter("all");
    setStatusFilter("all");
    setExpMin("");
    setExpMax("");
    setSearch("");
  }

  const cards = useMemo(() => {
    const monthStart = `${today.slice(0, 7)}-01`;
    const paidOnly = postedExpenses.filter((t) => t.expensePaid !== false && !!t.accountId);
    const total = paidOnly.reduce((s, t) => s + t.amount, 0);
    const monthly = paidOnly
      .filter((t) => t.date >= monthStart && t.date <= today)
      .reduce((s, t) => s + t.amount, 0);
    const byHead = new Map<string, number>();
    for (const t of paidOnly) {
      const head = expenseHead(t.expenseCategory);
      byHead.set(head, (byHead.get(head) ?? 0) + t.amount);
    }
    const top = [...byHead.entries()].sort((a, b) => b[1] - a[1])[0];
    const unpaid = postedExpenses.filter((t) => t.expensePaid === false || !t.accountId);
    return {
      total,
      monthly,
      topHead: top?.[0] ?? "—",
      topAmount: top?.[1] ?? 0,
      unpaidTotal: unpaid.reduce((s, t) => s + t.amount, 0),
      unpaidCount: unpaid.length,
    };
  }, [postedExpenses, today]);

  const periodTotals = useMemo(() => {
    const posted = rows.filter(isPosted);
    const paid = posted.filter((t) => t.expensePaid !== false && !!t.accountId);
    const unpaid = posted.filter((t) => t.expensePaid === false || !t.accountId);
    const byHead = new Map<string, number>();
    for (const t of posted) {
      const head = expenseHead(t.expenseCategory);
      byHead.set(head, (byHead.get(head) ?? 0) + t.amount);
    }
    return {
      paid: paid.reduce((s, t) => s + t.amount, 0),
      unpaid: unpaid.reduce((s, t) => s + t.amount, 0),
      grand: posted.reduce((s, t) => s + t.amount, 0),
      byHead: [...byHead.entries()]
        .map(([label, amount]) => ({ label, amount }))
        .sort((a, b) => b.amount - a.amount),
    };
  }, [rows]);

  const doDownload = (kind: "excel" | "pdf" | "csv") => {
    const data: ExpenseReportRow[] = [...rows]
      .sort((a, b) =>
        a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date),
      )
      .map((t) => ({
        date: t.date,
        category: expenseHead(t.expenseCategory),
        particulars: t.particulars,
        paymentFrom: sourceLabel(t),
        reference: t.reference ?? "",
        amount: t.amount,
        paid: t.expensePaid !== false && !!t.accountId,
      }));
    const meta = {
      periodLabel: periodLabel(preset, from, to),
      categoryLabel: categoryFilter === "all" ? "All Categories" : categoryFilter,
      sourceLabel:
        sourceFilter === "all"
          ? "All Sources"
          : sourceFilter === UNPAID
            ? "Unpaid"
            : (sources.find((s) => s.id === sourceFilter)?.label ?? "—"),
      categoryTotals: periodTotals.byHead,
      paidTotal: periodTotals.paid,
      unpaidTotal: periodTotals.unpaid,
      grandTotal: periodTotals.grand,
    };
    if (kind === "csv") downloadExpenseCsv(data, meta);
    else if (kind === "excel") downloadExpenseExcel(data, meta);
    else if (!downloadExpensePdf(data, meta)) {
      toast.error("Allow pop-ups to generate the PDF report.");
      return;
    }
    toast.success(`Report ready — ${data.length} expense entries.`);
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <header className="space-y-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-navy sm:text-xl lg:text-2xl">
            Expense Ledger
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {formatDate(from)} – {formatDate(to)} · {rows.length}{" "}
            {rows.length === 1 ? "entry" : "entries"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="h-9 bg-navy text-navy-foreground hover:bg-navy/90"
          >
            <Plus className="size-4" /> Add Expense
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="col-span-2 h-9 border-gold text-navy sm:col-span-1"
              >
                <Download className="size-4" /> Download Filtered Report
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filtered expenses</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => doDownload("excel")}>Excel (.xls)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doDownload("pdf")}>PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doDownload("csv")}>CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          bg="bg-pl-red"
          icon={<TrendingDown className="size-[18px]" />}
          label="Total Expenses"
          value={formatMoney(cards.total)}
          note="All-time paid expenses"
        />
        <SummaryCard
          bg="bg-pl-orange"
          icon={<Receipt className="size-[18px]" />}
          label="This Month's Expenses"
          value={formatMoney(cards.monthly)}
          note={formatDate(`${today.slice(0, 7)}-01`).slice(3)}
        />
        <SummaryCard
          bg="bg-pl-purple"
          icon={<PieChart className="size-[18px]" />}
          label="Highest Expense Category"
          value={cards.topHead}
          note={cards.topAmount ? formatMoney(cards.topAmount) : "No expenses yet"}
          compact
        />
        <SummaryCard
          bg="bg-pl-yellow"
          icon={<Clock className="size-[18px]" />}
          label="Pending / Unpaid"
          value={formatMoney(cards.unpaidTotal)}
          note={`${cards.unpaidCount} unpaid ${cards.unpaidCount === 1 ? "entry" : "entries"}`}
        />
      </div>

      <FilterBar
        datePreset={preset}
        dateOptions={BANK_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
        onDatePreset={(v) => setPreset(v as BankPreset)}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFrom={setCustomFrom}
        onCustomTo={setCustomTo}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search particulars, reference or head"
        sort={expSort}
        onSort={setExpSort}
        filters={expFilterDefs}
        values={{ category: categoryFilter, source: sourceFilter, status: statusFilter }}
        onFilterChange={(id, value) => {
          if (id === "category") setCategoryFilter(value);
          else if (id === "source") setSourceFilter(value);
          else setStatusFilter(value);
        }}
        amountMin={expMin}
        amountMax={expMax}
        onAmountMin={setExpMin}
        onAmountMax={setExpMax}
        onClearAll={clearExpFilters}
      />

      {/* Ledger */}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-navy">
            {formatDate(from)} – {formatDate(to)} · {rows.length}{" "}
            {rows.length === 1 ? "entry" : "entries"}
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Paid{" "}
              <span className="num font-semibold text-neg">{formatMoney(periodTotals.paid)}</span>
            </span>
            <span>
              Unpaid{" "}
              <span className="num font-semibold text-navy">
                {formatMoney(periodTotals.unpaid)}
              </span>
            </span>
            <span>
              Total{" "}
              <span className="num font-semibold text-navy">{formatMoney(periodTotals.grand)}</span>
            </span>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">
            No expenses for the selected filters.
          </p>
        ) : (
          <>
            <div className="hidden lg:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Date</th>
                    <th className="px-3 py-2 text-left font-semibold">Category</th>
                    <th className="px-3 py-2 text-left font-semibold">Particulars</th>
                    <th className="px-3 py-2 text-left font-semibold">Payment From</th>
                    <th className="px-3 py-2 text-left font-semibold">Source &amp; Status</th>
                    <th className="px-3 py-2 text-right font-semibold">Amount</th>
                    <th className="w-10 px-2 py-2" aria-label="Action" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-foreground">
                        {formatDate(t.date)}
                      </td>
                      <td className="px-3 py-2">
                        {isSourceLinked(t) && !t.expenseCategory ? (
                          <span className="inline-flex whitespace-nowrap rounded-md bg-pl-loss px-2 py-1 text-xs font-medium text-navy">
                            Category missing
                          </span>
                        ) : (
                          <CategoryChip head={expenseHead(t.expenseCategory)} />
                        )}
                      </td>
                      <td className="max-w-[340px] px-3 py-2 text-muted-foreground">
                        <span className="block break-words">{t.particulars}</span>
                        {t.reference ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground/80">
                            Ref: {t.reference}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span
                          className={cn(
                            "text-sm",
                            sourceLabel(t) === "Unpaid"
                              ? "font-medium text-gold"
                              : "text-foreground",
                          )}
                        >
                          {sourceLabel(t)}
                        </span>
                      </td>
                      <td className="max-w-[320px] px-3 py-2">
                        {isSourceLinked(t) ? (
                          <div className="space-y-1">
                            <span className="inline-flex whitespace-nowrap rounded-md bg-pl-blue px-2 py-1 text-xs font-medium text-navy">
                              {sourceEntryLabel(t)}
                            </span>
                            <button
                              type="button"
                              onClick={() => goToSource(t)}
                              className="block text-xs font-medium text-navy underline underline-offset-2"
                            >
                              View Source
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {sourceLabel(t) === "Unpaid" ? "Expense entry · Unpaid" : "Expense entry · Paid"}
                          </span>
                        )}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right font-semibold text-navy">
                        {formatMoney(t.amount)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <RowMenu
                          onView={() => setViewing(t)}
                          linked={isSourceLinked(t)}
                          linkedLabel={
                            isCashLinked(t) ? "Edit in Cash Book" : "Edit in Bank Ledger"
                          }
                          onSource={() => goToSource(t)}
                          onEdit={() => {
                            setEditing(t);
                            setFormOpen(true);
                          }}
                          onVoid={() => setVoiding(t)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-border lg:hidden">
              {rows.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {formatDate(t.date)} · {sourceLabel(t)}
                      </p>
                      <p className="mt-1 break-words text-sm font-medium text-navy">
                        {t.particulars}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {isSourceLinked(t) && !t.expenseCategory ? (
                          <span className="inline-flex whitespace-nowrap rounded-md bg-pl-loss px-2 py-1 text-xs font-medium text-navy">
                            Category missing
                          </span>
                        ) : (
                          <CategoryChip head={expenseHead(t.expenseCategory)} />
                        )}
                        {isSourceLinked(t) ? (
                          <span className="inline-flex whitespace-nowrap rounded-md bg-pl-blue px-2 py-1 text-xs font-medium text-navy">
                            {sourceEntryLabel(t)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="num text-sm font-semibold text-navy">
                        {formatMoney(t.amount)}
                      </span>
                      <RowMenu
                        onView={() => setViewing(t)}
                        linked={isSourceLinked(t)}
                        linkedLabel={isCashLinked(t) ? "Edit in Cash Book" : "Edit in Bank Ledger"}
                        onSource={() => goToSource(t)}
                        onEdit={() => {
                          setEditing(t);
                          setFormOpen(true);
                        }}
                        onVoid={() => setVoiding(t)}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <ExpenseForm
        open={formOpen}
        editing={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy">Expense details</DialogTitle>
            <DialogDescription>{viewing?.code}</DialogDescription>
          </DialogHeader>
          {viewing ? (
            <dl className="space-y-2 text-sm">
              {[
                ["Date", formatDate(viewing.date)],
                ["Category", expenseHead(viewing.expenseCategory)],
                ["Particulars", viewing.particulars],
                ["Amount", formatMoney(viewing.amount)],
                ["Status", sourceLabel(viewing) === "Unpaid" ? "Unpaid" : "Paid"],
                ["Payment From", sourceLabel(viewing)],
                ["Reference", viewing.reference || "—"],
                ["Attachment", viewing.attachmentName || "—"],
                ["Notes", viewing.notes || "—"],
                ["Last updated", formatDateTime(viewing.updatedAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-border pb-1.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="max-w-[60%] break-words text-right font-medium text-foreground">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {voiding
                ? `${formatMoney(voiding.amount)} on ${formatDate(voiding.date)} will be removed from expense totals. It stays in the audit log.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-neg text-white hover:bg-neg/90"
              onClick={() => {
                if (voiding) {
                  store.voidEntry(voiding.id);
                  toast.success("Expense deleted.");
                }
                setVoiding(null);
              }}
            >
              Delete expense
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryCard({
  bg,
  icon,
  label,
  value,
  note,
  compact,
}: {
  bg: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border border-border p-4", bg)}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold leading-tight text-navy">{label}</p>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card/70 text-navy">
          {icon}
        </span>
      </div>
      <p
        className={cn(
          "mt-3 font-semibold leading-tight text-navy",
          compact ? "text-base" : "num text-xl",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-navy/60">{note}</p>
    </div>
  );
}

function CategoryChip({ head }: { head: string }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium",
        expenseBadge(head),
      )}
    >
      {head}
    </span>
  );
}

function RowMenu({
  onView,
  onEdit,
  onVoid,
  linked,
  linkedLabel,
  onSource,
}: {
  onView: () => void;
  onEdit: () => void;
  onVoid: () => void;
  linked?: boolean;
  linkedLabel?: string;
  onSource?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Row actions">
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onView}>View</DropdownMenuItem>
        {linked ? (
          <DropdownMenuItem onClick={onSource}>{linkedLabel ?? "Edit in Bank Ledger"}</DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuItem className="text-neg" onClick={onVoid}>
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ExpenseForm({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: Transaction | null;
  onClose: () => void;
}) {
  const store = useLepdo();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [dupAck, setDupAck] = useState(false);

  const sources = useMemo(
    () => [
      ...store.bankAccounts.map((b) => ({
        id: b.id,
        label: b.nickname || b.bankName,
        type: "bank" as const,
      })),
      ...store.cashLocations.map((c) => ({ id: c.id, label: c.name, type: "cash" as const })),
    ],
    [store.bankAccounts, store.cashLocations],
  );

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setDupAck(false);
    setForm(
      editing
        ? {
            date: editing.date,
            category: expenseHead(editing.expenseCategory),
            particulars: editing.particulars,
            amount: String(editing.amount),
            paid: editing.expensePaid !== false && !!editing.accountId,
            source: editing.accountId || BANKS[0]!.id,
            reference: editing.reference ?? "",
            attachmentName: editing.attachmentName ?? "",
            notes: editing.notes ?? "",
          }
        : emptyForm(),
    );
  }, [open, editing]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const amount = Number(form.amount) || 0;

  const duplicate = useMemo(() => {
    // Duplicate checks disabled: identical entries are allowed.
    if (amount === amount) return null;
    const head = form.category || DEFAULT_EXPENSE_CATEGORY;
    return (
      store.transactions.find(
        (t) =>
          t.id !== editing?.id &&
          isPosted(t) &&
          t.category === "expense" &&
          t.date === form.date &&
          Math.abs(t.amount - amount) < 0.005 &&
          expenseHead(t.expenseCategory) === head &&
          (form.paid ? t.accountId === form.source : t.expensePaid === false) &&
          (t.particulars.trim().toLowerCase() === form.particulars.trim().toLowerCase() ||
            (!!form.reference.trim() &&
              (t.reference ?? "").trim().toLowerCase() === form.reference.trim().toLowerCase())),
      ) ?? null
    );
  }, [store.transactions, editing, form, amount]);

  const submit = () => {
    if (saving) return;
    if (!form.category) {
      toast.error("Select an expense category.");
      return;
    }
    if (form.paid && !form.source) {
      toast.error("Select the bank account or cash location the expense was paid from.");
      return;
    }
    if (duplicate && !dupAck) {
      setDupAck(true);
      toast.warning("A similar expense already exists. Press Save Expense again to confirm.");
      return;
    }
    setSaving(true);
    const src = sources.find((s) => s.id === form.source);
    const input: NewEntryInput = {
      date: form.date,
      sourceType: form.paid ? (src?.type ?? "bank") : "bank",
      accountId: form.paid ? form.source : "",
      direction: "out",
      amount,
      category: "expense",
      partyId: null,
      particulars: form.particulars,
      reference: form.reference.trim() || undefined,
      attachmentName: form.attachmentName.trim() || undefined,
      notes: form.notes.trim() || undefined,
      expenseCategory: form.category,
      expensePaid: form.paid,
    };
    const res = editing ? store.updateEntry(editing.id, input) : store.addEntry(input);
    if (!res.ok) {
      toast.error(res.message);
      setSaving(false);
      return;
    }
    toast.success(
      form.paid
        ? `Expense saved and posted to ${src?.label ?? "the selected account"}.`
        : "Unpaid expense recorded — no bank or cash entry created.",
    );
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92dvh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="text-navy">
            {editing ? "Edit Expense" : "Add Expense"}
          </DialogTitle>
          <DialogDescription>
            Paid expenses post one linked debit to the chosen bank or cash account. Founder personal
            use belongs in Drawings and saleable goods in Purchases.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">
              <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </Field>
            <Field label="Category">
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategoryOptions(store.masters, form.category).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Particulars">
            <Input
              value={form.particulars}
              placeholder="What was this expense for?"
              onChange={(e) => set("particulars", e.target.value)}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount">
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.amount}
                placeholder="0.00"
                onChange={(e) => set("amount", e.target.value)}
              />
            </Field>
            <Field label="Payment status">
              <div className="grid grid-cols-2 gap-2">
                {[true, false].map((paid) => (
                  <button
                    key={String(paid)}
                    type="button"
                    onClick={() => set("paid", paid)}
                    className={cn(
                      "h-9 rounded-md border text-sm font-medium transition-colors",
                      form.paid === paid
                        ? paid
                          ? "border-neg bg-neg-bg text-neg"
                          : "border-gold bg-gold-tint text-navy"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {paid ? "Paid" : "Unpaid"}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {form.paid ? (
            <Field label="Payment from (bank account or cash location)">
              <Select value={form.source} onValueChange={(v) => set("source", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <p className="rounded-md bg-gold-tint px-3 py-2 text-xs text-navy">
              Unpaid expenses appear in this ledger and in Pending totals only. No bank or cash
              entry is created until you edit it and mark it Paid.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Reference number (optional)">
              <Input value={form.reference} onChange={(e) => set("reference", e.target.value)} />
            </Field>
            <Field label="Attachment / bill (optional)">
              <Input
                type="file"
                className="file:mr-2 file:text-xs"
                onChange={(e) => set("attachmentName", e.target.files?.[0]?.name ?? "")}
              />
            </Field>
          </div>
          {form.attachmentName ? (
            <p className="text-xs text-muted-foreground">Attached: {form.attachmentName}</p>
          ) : null}

          <Field label="Notes (optional)">
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>

          {duplicate ? (
            <p className="rounded-md bg-pl-loss px-3 py-2 text-xs font-medium text-navy">
              Possible duplicate: {duplicate.code} — {formatMoney(duplicate.amount)} on{" "}
              {formatDate(duplicate.date)}. Save again only if this is a genuinely separate expense.
            </p>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="bg-navy text-navy-foreground hover:bg-navy/90"
          >
            {saving ? "Saving…" : "Save Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
