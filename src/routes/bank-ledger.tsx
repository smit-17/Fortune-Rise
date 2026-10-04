import { isLedgerEntry } from "@/lib/lepdo/entry";
import { EntryHistory, EntryRowMenu } from "@/components/lepdo/entry-bits";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, Landmark, MoreVertical, Plus, Wallet } from "lucide-react";
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
import { MoneyInput, NumInput, toNum } from "@/components/lepdo/numeric";
import { useLepdo, partyName, type NewEntryInput } from "@/lib/lepdo/store";
import { ledgerCategoryName, ledgerCategoryOptions } from "@/lib/lepdo/masters";
import type { MasterValue } from "@/lib/lepdo/types";
import type { CategoryId, Transaction } from "@/lib/lepdo/types";
import {
  BANKS,
  BANK_CATEGORIES,
  BANK_ENTRY_OPTIONS,
  BANK_PRESETS,
  BANK_SEED,
  bankFixedDirection,
  bankRange,
  periodLabel,
  resolveTransferCategory,
  resolveUchhinaCategory,
  uiCategoryFromCategoryId,
  type BankPreset,
  type BankUiCategory,
  compareLedgerOrder,
} from "@/lib/lepdo/bank";
import { categoryLabel, categoryTone } from "@/lib/lepdo/constants";
import { expenseCategoryOptions } from "@/lib/lepdo/expense";
import { Combo } from "@/components/lepdo/sales/ui";
import { downloadCsv, downloadExcel, downloadPdf, type ReportRow } from "@/lib/lepdo/report";

export const Route = createFileRoute("/bank-ledger")({
  head: () => ({
    meta: [
      { title: "Bank Ledger — LEPDO Accounting" },
      {
        name: "description",
        content:
          "Bank-wise balance cards and a clean credit/debit ledger with running balances, category badges and CA-ready Excel, PDF and CSV reports.",
      },
      { property: "og:title", content: "Bank Ledger — LEPDO Accounting" },
      {
        property: "og:description",
        content:
          "Track every bank receipt and payment across LEPDO bank accounts with running balances and downloadable reports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BankLedgerPage,
});

interface FormState {
  date: string;
  accountId: string;
  direction: "in" | "out";
  category: BankUiCategory | "";
  destinationKind: "bank" | "cash" | "";
  destinationId: string;
  partyName: string;
  particulars: string;
  amount: string;
  reference: string;
  notes: string;
  expenseCategory: string;
  customCategory: string;
}

const emptyForm = (): FormState => ({
  date: todayISO(),
  accountId: BANKS[0]!.id,
  direction: "in",
  category: "",
  destinationKind: "",
  destinationId: "",
  partyName: "",
  particulars: "",
  amount: "",
  reference: "",
  notes: "",
  expenseCategory: "",
  customCategory: "",
});

function bankCategoryLabel(
  id: CategoryId | null,
  masters?: Record<string, MasterValue[]>,
  custom?: string | undefined,
): string {
  if (!id) return "Unclassified";
  if (custom) return custom;
  const base = BANK_CATEGORIES.find((c) => c.id === id)?.label ?? categoryLabel(id);
  const ui = uiCategoryFromCategoryId(id);
  if (!masters || (ui === "other" && id !== "other")) return base;
  return ui ? ledgerCategoryName(masters, "bankEntryCategories", ui, base) : base;
}

function BankCategoryBadge({ id, custom }: { id: CategoryId | null; custom?: string | undefined }) {
  const { masters } = useLepdo();
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium",
        categoryTone(id),
      )}
    >
      {bankCategoryLabel(id, masters, custom)}
    </span>
  );
}

function BankLedgerPage() {
  const store = useLepdo();
  const today = todayISO();
  const [preset, setPreset] = useState<BankPreset>("month");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [bankFilter, setBankFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [viewing, setViewing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);

  const [from, to] = useMemo(
    () => bankRange(preset, today, customFrom, customTo),
    [preset, today, customFrom, customTo],
  );

  const { ensureBankAccounts } = store;
  useEffect(() => {
    ensureBankAccounts(BANK_SEED);
  }, [ensureBankAccounts]);

  const bankName = (id: string) =>
    BANKS.find((b) => b.id === id)?.bankName ??
    store.bankAccounts.find((b) => b.id === id)?.nickname ??
    "Bank";

  /** running balance per bank across all time, keyed by transaction id */
  const balances = useMemo(() => {
    const map = new Map<string, number>();
    for (const bank of store.bankAccounts) {
      let bal = bank.openingBalance;
      const rows = store.transactions
        .filter(
          (t) =>
            t.accountId === bank.id && t.sourceType === "bank" && !t.voided && isLedgerEntry(t),
        )
        .sort(compareLedgerOrder);
      for (const t of rows) {
        bal += t.direction === "in" ? t.amount : -t.amount;
        map.set(t.id, bal);
      }
    }
    return map;
  }, [store.bankAccounts, store.transactions]);

  const rows = useMemo(
    () =>
      store.transactions
        .filter(
          (t) =>
            t.sourceType === "bank" &&
            isLedgerEntry(t) &&
            !t.voided &&
            t.date >= from &&
            t.date <= to &&
            (bankFilter === "all" || t.accountId === bankFilter),
        )
        .sort(compareLedgerOrder),
    [store.transactions, from, to, bankFilter],
  );

  const postedRows = rows;

  const openEdit = (t: Transaction) => {
    setEditing(t);
    setFormOpen(true);
  };

  const totals = useMemo(() => {
    const credit = postedRows.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount, 0);
    const debit = postedRows.filter((t) => t.direction === "out").reduce((s, t) => s + t.amount, 0);
    const scope =
      bankFilter === "all"
        ? store.bankAccounts
        : store.bankAccounts.filter((b) => b.id === bankFilter);
    const opening = scope.reduce((sum, b) => {
      const prior = store.transactions
        .filter(
          (t) =>
            t.accountId === b.id &&
            t.sourceType === "bank" &&
            !t.voided &&
            isLedgerEntry(t) &&
            t.date < from,
        )
        .reduce((s, t) => s + (t.direction === "in" ? t.amount : -t.amount), 0);
      return sum + b.openingBalance + prior;
    }, 0);
    return { credit, debit, opening, closing: opening + credit - debit };
  }, [postedRows, store.bankAccounts, store.transactions, from, bankFilter]);

  const bankBalance = (id: string) => store.balanceOf("bank", id);
  const totalBalance = BANKS.reduce((s, b) => s + bankBalance(b.id), 0);

  const reportRows = (): ReportRow[] =>
    [...postedRows]
      .sort(compareLedgerOrder)
      .map((t) => ({
        date: t.date,
        bank: bankName(t.accountId),
        category: bankCategoryLabel(t.category, store.masters, t.customCategory),
        particulars: t.particulars,
        reference: t.reference ?? "",
        credit: t.direction === "in" ? t.amount : 0,
        debit: t.direction === "out" ? t.amount : 0,
        balance: balances.get(t.id) ?? 0,
      }));

  const reportMeta = () => ({
    bankLabel: bankFilter === "all" ? "All Banks" : bankName(bankFilter),
    periodLabel: periodLabel(preset, from, to),
    opening: totals.opening,
    totalCredit: totals.credit,
    totalDebit: totals.debit,
    closing: totals.closing,
  });

  const doDownload = (kind: "excel" | "pdf" | "csv") => {
    const data = reportRows();
    const meta = reportMeta();
    if (kind === "csv") downloadCsv(data, meta);
    else if (kind === "excel") downloadExcel(data, meta);
    else if (!downloadPdf(data, meta)) {
      toast.error("Allow pop-ups to generate the PDF report.");
      return;
    }
    toast.success(`Report ready — ${meta.bankLabel}, ${data.length} entries.`);
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="hidden text-xl font-semibold tracking-tight text-navy lg:block lg:text-2xl">
          Bank Ledger
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as BankPreset)}>
            <SelectTrigger aria-label="Date filter" className="h-9 w-[168px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {BANK_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {preset === "custom" ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                aria-label="From date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 w-[140px] text-sm"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                aria-label="To date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 w-[140px] text-sm"
              />
            </div>
          ) : null}

          <Select value={bankFilter} onValueChange={setBankFilter}>
            <SelectTrigger aria-label="Bank filter" className="h-9 w-[160px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All Banks</SelectItem>
              {BANKS.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.bankName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 border-gold text-navy">
                <Download className="size-4" /> Download Report
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filtered ledger</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => doDownload("excel")}>Excel (.xls)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doDownload("pdf")}>PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doDownload("csv")}>CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="h-9 bg-navy text-navy-foreground hover:bg-navy/90"
          >
            <Plus className="size-4" /> Add Bank Entry
          </Button>
        </div>
      </div>

      {/* Balance cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {BANKS.map((b) => {
          const updated = store.lastUpdatedOf(b.id);
          return (
            <div key={b.id} className={cn("rounded-xl border border-border p-4", b.bg)}>
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm font-semibold leading-tight text-navy">
                  {b.bankName}
                </p>
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card/70 text-navy">
                  <Landmark className="size-[18px]" />
                </span>
              </div>
              <p className="num mt-3 text-xl font-semibold text-navy">
                {formatMoney(bankBalance(b.id))}
              </p>
              <p className="mt-1 text-xs text-navy/60">
                {updated ? `Updated ${formatDateTime(updated)}` : "No entries yet"}
              </p>
            </div>
          );
        })}
        <div className="rounded-xl border border-gold bg-gold-tint p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-navy">Total Bank Balance</p>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card/70 text-navy">
              <Wallet className="size-[18px]" />
            </span>
          </div>
          <p className="num mt-3 text-xl font-semibold text-navy">{formatMoney(totalBalance)}</p>
          <p className="mt-1 text-xs text-navy/60">{BANKS.length} bank accounts</p>
        </div>
      </div>

      {/* Ledger */}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-navy">
            {bankFilter === "all" ? "All Banks" : bankName(bankFilter)} · {formatDate(from)} –{" "}
            {formatDate(to)}
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Opening{" "}
              <span className="num font-semibold text-navy">{formatMoney(totals.opening)}</span>
            </span>
            <span>
              Credit{" "}
              <span className="num font-semibold text-pos">{formatMoney(totals.credit)}</span>
            </span>
            <span>
              Debit <span className="num font-semibold text-neg">{formatMoney(totals.debit)}</span>
            </span>
            <span>
              Closing{" "}
              <span className="num font-semibold text-navy">{formatMoney(totals.closing)}</span>
            </span>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">
            No bank entries for the selected period and bank.
          </p>
        ) : (
          <>
            <div className="hidden lg:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Date</th>
                    <th className="px-3 py-2 text-left font-semibold">Bank</th>
                    <th className="px-3 py-2 text-left font-semibold">Category</th>
                    <th className="px-3 py-2 text-left font-semibold">Particulars</th>
                    <th className="px-3 py-2 text-right font-semibold">Credit</th>
                    <th className="px-3 py-2 text-right font-semibold">Debit</th>
                    <th className="px-3 py-2 text-right font-semibold">Balance</th>
                    <th className="w-10 px-2 py-2" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-foreground">
                        {formatDate(t.date)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-foreground">
                        {bankName(t.accountId)}
                      </td>
                      <td className="px-3 py-2">
                        <BankCategoryBadge id={t.category} custom={t.customCategory} />
                      </td>
                      <td className="max-w-[320px] px-3 py-2 text-muted-foreground">
                        <span className="block break-words">{t.particulars}</span>
                        {t.reference ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground/80">
                            Ref: {t.reference}
                          </span>
                        ) : null}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right font-medium text-pos">
                        {t.direction === "in" ? formatMoney(t.amount) : "—"}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right font-medium text-neg">
                        {t.direction === "out" ? formatMoney(t.amount) : "—"}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right font-semibold text-navy">
                        {formatMoney(balances.get(t.id) ?? 0)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <EntryRowMenu
                          onView={() => setViewing(t)}
                          onEdit={() => openEdit(t)}
                          onDelete={() => setDeleting(t)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile / tablet stacked */}
            <ul className="divide-y divide-border lg:hidden">
              {rows.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {formatDate(t.date)} · {bankName(t.accountId)}
                      </p>
                      <p className="mt-1 break-words text-sm font-medium text-navy">
                        {t.particulars}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <BankCategoryBadge id={t.category} custom={t.customCategory} />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={cn(
                          "num text-sm font-semibold",
                          t.direction === "in" ? "text-pos" : "text-neg",
                        )}
                      >
                        {t.direction === "in" ? "+" : "−"}
                        {formatMoney(t.amount)}
                      </span>
                      <span className="num text-xs text-muted-foreground">
                        Bal {formatMoney(balances.get(t.id) ?? 0)}
                      </span>
                      <EntryRowMenu
                        onView={() => setViewing(t)}
                        onEdit={() => openEdit(t)}
                        onDelete={() => setDeleting(t)}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <BankEntryForm
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
            <DialogTitle className="text-navy">Entry details</DialogTitle>
            <DialogDescription>{viewing?.code}</DialogDescription>
          </DialogHeader>
          {viewing ? (
            <dl className="space-y-2 text-sm">
              {[
                ["Date", formatDate(viewing.date)],
                ["Bank", bankName(viewing.accountId)],
                ["Category", bankCategoryLabel(viewing.category, store.masters, viewing.customCategory)],
                ["Transfer ID", viewing.transferGroupId ?? "—"],
                ["Created by", viewing.createdBy],
                ["Type", viewing.direction === "in" ? "Credit (received)" : "Debit (paid)"],
                ["Amount", formatMoney(viewing.amount)],
                ["Balance after", formatMoney(balances.get(viewing.id) ?? 0)],
                ["Particulars", viewing.particulars],
                ["Reference / UTR", viewing.reference || "—"],
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
              <EntryHistory t={viewing} />
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `${formatMoney(deleting.amount)} on ${formatDate(deleting.date)}${deleting.transferGroupId ? " and its matching transfer entry" : ""} will be removed from the books.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-neg text-white hover:bg-neg/90"
              onClick={() => {
                if (deleting) store.voidEntry(deleting.id);
                setDeleting(null);
                toast.success("Entry deleted.");
              }}
            >
              Delete entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BankEntryForm({
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

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setDupAck(false);
    setForm(
      editing
        ? {
            date: editing.date,
            accountId: editing.accountId,
            direction:
              uiCategoryFromCategoryId(editing.category) === "uchhina"
                ? editing.direction
                : editing.direction,
            category: uiCategoryFromCategoryId(editing.category),
            destinationKind: "",
            destinationId: "",
            partyName:
              partyName(store.parties, editing.partyId) === "—"
                ? ""
                : partyName(store.parties, editing.partyId),
            particulars: editing.particulars,
            amount: String(editing.amount),
            reference: editing.reference ?? "",
            notes: editing.notes ?? "",
            expenseCategory: editing.expenseCategory ?? "",
            customCategory: editing.customCategory ?? "",
          }
        : emptyForm(),
    );
  }, [open, editing]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const isTransfer = form.category === "bank_transfer";
  const isUchhina = form.category === "uchhina";
  const needsParty = form.category === "sale_payment" || form.category === "purchase_payment";
  const fixed = bankFixedDirection(form.category);
  const direction: "in" | "out" = fixed ?? form.direction;
  const amount = Number(form.amount) || 0;
  const isBankExpense = form.category === "expense" && direction === "out";

  useEffect(() => {
    if (fixed && form.direction !== fixed) setForm((f) => ({ ...f, direction: fixed }));
  }, [fixed, form.direction]);

  const destinationOptions = useMemo(
    () => [
      ...BANKS.filter((b) => b.id !== form.accountId).map((b) => ({
        kind: "bank" as const,
        id: b.id,
        name: b.bankName,
      })),
      ...store.cashLocations
        .filter((c) => c.active)
        .map((c) => ({ kind: "cash" as const, id: c.id, name: c.name })),
    ],
    [form.accountId, store.cashLocations],
  );

  const duplicate = useMemo(() => {
    // Duplicate checks disabled: identical entries are allowed.
    if (amount === amount) return null;
    return (
      store.transactions.find(
        (t) =>
          t.id !== editing?.id &&
          !t.voided &&
          t.sourceType === "bank" &&
          t.date === form.date &&
          t.accountId === form.accountId &&
          Math.abs(t.amount - amount) < 0.005 &&
          t.direction === direction &&
          (t.particulars.trim().toLowerCase() === form.particulars.trim().toLowerCase() ||
            (!!form.reference.trim() &&
              (t.reference ?? "").trim().toLowerCase() === form.reference.trim().toLowerCase())),
      ) ?? null
    );
  }, [store.transactions, editing, form, amount, direction]);

  const submit = () => {
    if (saving) return;
    if (!form.category) {
      toast.error("Select a category.");
      return;
    }
    if (isTransfer && !form.destinationId) {
      toast.error("Select the transfer destination.");
      return;
    }
    if (isTransfer && form.destinationKind === "bank" && form.destinationId === form.accountId) {
      toast.error("Transfer destination must be different from the source account.");
      return;
    }
    if (needsParty && !form.partyName.trim()) {
      toast.error("Select or enter a party.");
      return;
    }
    if (isBankExpense && !form.expenseCategory) {
      toast.error("Select the expense category for this bank expense.");
      return;
    }
    if (duplicate && !dupAck) {
      setDupAck(true);
      toast.warning("A similar entry already exists. Press Save Entry again to confirm.");
      return;
    }
    setSaving(true);

    let partyId: string | null = null;
    if (needsParty) {
      const name = form.partyName.trim();
      const existing = store.parties.find((p) => p.name.toLowerCase() === name.toLowerCase());
      partyId = existing
        ? existing.id
        : store.addParty(name, form.category === "sale_payment" ? "customer" : "supplier").id;
    }

    const category: CategoryId = isUchhina
      ? resolveUchhinaCategory(direction)
      : isTransfer
        ? resolveTransferCategory(form.destinationKind as "bank" | "cash")
        : (form.category as CategoryId);

    const input: NewEntryInput = {
      date: form.date,
      sourceType: "bank",
      accountId: form.accountId,
      direction,
      amount,
      category,
      partyId,
      particulars: form.particulars,
      reference: form.reference.trim() || undefined,
      notes: form.notes.trim() || undefined,
      ledger: true,
      customCategory:
        form.category === "other" && form.customCategory ? form.customCategory : undefined,
      ...(isBankExpense
        ? { expenseCategory: form.expenseCategory, expensePaid: true }
        : {}),
      ...(isTransfer
        ? {
            destinationType: form.destinationKind as "bank" | "cash",
            destinationId: form.destinationId,
          }
        : {}),
    };
    const res = editing ? store.updateEntry(editing.id, input) : store.addEntry(input);
    if (!res.ok) {
      toast.error(res.message);
      setSaving(false);
      return;
    }
    toast.success(res.message);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92dvh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="text-navy">
            {editing ? "Edit Bank Entry" : "Add Bank Entry"}
          </DialogTitle>
          <DialogDescription>
            Credit means money received, debit means money paid. One entry can be only one of them.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">
              <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </Field>
            <Field label={isTransfer ? "Source bank" : "Bank"}>
              <Select value={form.accountId} onValueChange={(v) => set("accountId", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BANKS.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.bankName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <Select
                value={form.customCategory ? `custom:${form.customCategory}` : form.category}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    category: v.startsWith("custom:") ? "other" : (v as BankUiCategory),
                    customCategory: v.startsWith("custom:") ? v.slice(7) : "",
                    destinationKind: "",
                    destinationId: "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {ledgerCategoryOptions(store.masters, "bankEntryCategories", {
                    category: form.category,
                    custom: form.customCategory,
                  })
                    .filter((c) => !(editing && c.value === "bank_transfer"))
                    .map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>

            {isTransfer ? (
              <Field label="Destination">
                <Select
                  value={
                    form.destinationKind && form.destinationId
                      ? `${form.destinationKind}:${form.destinationId}`
                      : ""
                  }
                  onValueChange={(v) => {
                    const [kind, id] = v.split(":");
                    setForm((f) => ({
                      ...f,
                      destinationKind: kind as "bank" | "cash",
                      destinationId: id ?? "",
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank or cash book" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinationOptions.map((o) => (
                      <SelectItem key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </div>

          {!isTransfer ? (
            <Field label="Entry type">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(["in", "out"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={direction === d}
                    onClick={() => {
                      if (fixed) return;
                      set("direction", d);
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors",
                      direction === d
                        ? d === "in"
                          ? "border-pos bg-pl-green text-navy"
                          : "border-neg bg-pl-red text-navy"
                        : "border-border text-muted-foreground hover:bg-muted",
                      fixed && direction !== d ? "cursor-not-allowed opacity-50" : "",
                    )}
                  >
                    {isUchhina
                      ? d === "in"
                        ? "Credit — Received back"
                        : "Debit — Given"
                      : d === "in"
                        ? "Credit — Money In"
                        : "Debit — Money Out"}
                  </button>
                ))}
              </div>
              {fixed ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  This category is always {fixed === "in" ? "a credit (money in)" : "a debit (money out)"}.
                </p>
              ) : null}
            </Field>
          ) : null}

          {isBankExpense ? (
            <Field label="Expense category">
              <Select
                value={form.expenseCategory}
                onValueChange={(v) => set("expenseCategory", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select expense category" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategoryOptions(store.masters, form.expenseCategory).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                This entry will also appear in the Expense Ledger as Paid, linked to this bank
                entry.
              </p>
            </Field>
          ) : null}


          {needsParty ? (
            <Field label={form.category === "sale_payment" ? "Customer" : "Supplier"}>
              <Combo
                value={form.partyName}
                onChange={(v) => set("partyName", v)}
                options={store.parties
                  .filter(
                    (p) => p.type === (form.category === "sale_payment" ? "customer" : "supplier"),
                  )
                  .map((p) => p.name)}
                placeholder="Select or type a party"
              />
            </Field>
          ) : null}

          {isTransfer ? (
            <p className="rounded-md bg-pl-blue px-3 py-2 text-xs text-navy">
              Two matching entries will be created with the same transfer reference — debit from the
              source bank and credit to the destination account. Transfers are excluded from sales,
              purchases, income and expenses.
            </p>
          ) : null}

          <Field label="Particulars">
            <Input
              value={form.particulars}
              placeholder="What was this entry for?"
              onChange={(e) => set("particulars", e.target.value)}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount">
              <MoneyInput value={toNum(form.amount)} onChange={(n) => set("amount", String(n))} />
            </Field>
            <Field label="Reference / UTR (optional)">
              <Input value={form.reference} onChange={(e) => set("reference", e.target.value)} />
            </Field>
          </div>

          <Field label="Notes (optional)">
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>

          {duplicate ? (
            <p className="rounded-md bg-pl-loss px-3 py-2 text-xs font-medium text-navy">
              Possible duplicate: {duplicate.code} — {formatMoney(duplicate.amount)} on{" "}
              {formatDate(duplicate.date)}. Save again only if this is a genuinely separate entry.
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
            {saving ? "Saving…" : "Save Entry"}
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
