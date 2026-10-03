import { isLedgerEntry } from "@/lib/lepdo/entry";
import { EntryHistory, EntryRowMenu } from "@/components/lepdo/entry-bits";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowUpCircle, Download, MoreVertical, Plus, Wallet } from "lucide-react";
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
import type { CategoryId, Transaction } from "@/lib/lepdo/types";
import { BANK_PRESETS, bankRange, periodLabel, type BankPreset } from "@/lib/lepdo/bank";
import { CASH_BOOKS, CASH_CATEGORIES, cashCategoryLabel, fixedDirection } from "@/lib/lepdo/cash";
import { categoryTone } from "@/lib/lepdo/constants";
import { Combo } from "@/components/lepdo/sales/ui";
import {
  downloadCashExcel,
  downloadCashPdf,
  type CashReportMeta,
  type CashReportRow,
} from "@/lib/lepdo/cashReport";

export const Route = createFileRoute("/cash-book")({
  head: () => ({
    meta: [
      { title: "Cash Book — LEPDO Accounting" },
      {
        name: "description",
        content:
          "Separate IT Park and Mahidharpura cash books with running balances, pastel category badges, linked cash transfers and CA-ready reports.",
      },
      { property: "og:title", content: "Cash Book — LEPDO Accounting" },
      {
        property: "og:description",
        content:
          "Track cash in and cash out for IT Park and Mahidharpura with opening, running and closing balances.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CashBookPage,
});

function CashBookPage() {
  const store = useLepdo();
  const today = todayISO();
  const [bookId, setBookId] = useState(CASH_BOOKS[0]!.id);
  const [preset, setPreset] = useState<BankPreset>("month");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [viewing, setViewing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);

  const book = CASH_BOOKS.find((b) => b.id === bookId) ?? CASH_BOOKS[0]!;

  const [from, to] = useMemo(
    () => bankRange(preset, today, customFrom, customTo),
    [preset, today, customFrom, customTo],
  );

  const { cashLocations, saveCashLocation } = store;
  useEffect(() => {
    for (const b of CASH_BOOKS) {
      if (!cashLocations.some((c) => c.id === b.id)) {
        saveCashLocation({ id: b.id, name: b.name, openingBalance: 0, active: true });
      }
    }
  }, [cashLocations, saveCashLocation]);

  /** Running balance for this cash book across all time (handles backdated entries). */
  const balances = useMemo(() => {
    const map = new Map<string, number>();
    let bal = cashLocations.find((c) => c.id === bookId)?.openingBalance ?? 0;
    const rows = store.transactions
      .filter(
        (t) => t.accountId === bookId && t.sourceType === "cash" && !t.voided && isLedgerEntry(t),
      )
      .sort((a, b) =>
        a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date),
      );
    for (const t of rows) {
      bal += t.direction === "in" ? t.amount : -t.amount;
      map.set(t.id, bal);
    }
    return map;
  }, [store.transactions, cashLocations, bookId]);

  const rows = useMemo(
    () =>
      store.transactions
        .filter(
          (t) =>
            t.sourceType === "cash" &&
            t.accountId === bookId &&
            isLedgerEntry(t) &&
            !t.voided &&
            t.date >= from &&
            t.date <= to &&
            (categoryFilter === "all" || t.category === categoryFilter),
        )
        .sort((a, b) =>
          a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date),
        ),
    [store.transactions, bookId, from, to, categoryFilter],
  );

  const postedRows = rows;

  const openEdit = (t: Transaction) => {
    setEditing(t);
    setFormOpen(true);
  };

  const totals = useMemo(() => {
    const cashIn = postedRows.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount, 0);
    const cashOut = postedRows
      .filter((t) => t.direction === "out")
      .reduce((s, t) => s + t.amount, 0);
    const openingBalance = cashLocations.find((c) => c.id === bookId)?.openingBalance ?? 0;
    const prior = store.transactions
      .filter(
        (t) =>
          t.accountId === bookId &&
          t.sourceType === "cash" &&
          !t.voided &&
          isLedgerEntry(t) &&
          t.date < from,
      )
      .reduce((s, t) => s + (t.direction === "in" ? t.amount : -t.amount), 0);
    const opening = openingBalance + prior;
    return { cashIn, cashOut, opening, closing: opening + cashIn - cashOut };
  }, [postedRows, store.transactions, cashLocations, bookId, from]);

  const currentBalance = store.balanceOf("cash", bookId);

  const reportMeta = (): CashReportMeta => ({
    bookLabel: book.name,
    periodLabel: periodLabel(preset, from, to),
    opening: totals.opening,
    totalIn: totals.cashIn,
    totalOut: totals.cashOut,
    closing: totals.closing,
  });

  const reportRows = (): CashReportRow[] =>
    [...postedRows]
      .sort((a, b) =>
        a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date),
      )
      .map((t) => ({
        date: t.date,
        category: cashCategoryLabel(t.category),
        particulars: t.particulars,
        reference: t.reference ?? "",
        cashIn: t.direction === "in" ? t.amount : 0,
        cashOut: t.direction === "out" ? t.amount : 0,
        balance: balances.get(t.id) ?? 0,
      }));

  const doDownload = (kind: "excel" | "pdf") => {
    const data = reportRows();
    const meta = reportMeta();
    if (kind === "excel") downloadCashExcel(data, meta);
    else if (!downloadCashPdf(data, meta)) {
      toast.error("Allow pop-ups to generate the PDF report.");
      return;
    }
    toast.success(`Report ready — ${meta.bookLabel}, ${data.length} entries.`);
  };

  const cards = [
    {
      key: "balance",
      label: "Current Cash Balance",
      value: currentBalance,
      icon: Wallet,
      cls: "bg-pl-blue border-border",
      text: "text-navy",
    },
    {
      key: "in",
      label: "Total Cash In",
      value: totals.cashIn,
      icon: ArrowDownCircle,
      cls: "bg-pl-green border-border",
      text: "text-pos",
    },
    {
      key: "out",
      label: "Total Cash Out",
      value: totals.cashOut,
      icon: ArrowUpCircle,
      cls: "bg-pl-red border-border",
      text: "text-neg",
    },
  ] as const;

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="hidden text-xl font-semibold tracking-tight text-navy lg:block lg:text-2xl">
            Cash Book
          </h1>
          <span className="text-xs font-medium text-muted-foreground">{book.name} balance</span>
          <span className="num text-xl font-semibold text-navy">{formatMoney(currentBalance)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as BankPreset)}>
            <SelectTrigger aria-label="Date period filter" className="h-9 w-[168px] text-sm">
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

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger aria-label="Category filter" className="h-9 w-[170px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All Categories</SelectItem>
              {CASH_CATEGORIES.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
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
              <DropdownMenuLabel>{book.name}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => doDownload("excel")}>Excel (.xls)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doDownload("pdf")}>PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="h-9 bg-navy text-navy-foreground hover:bg-navy/90"
          >
            <Plus className="size-4" /> Add Cash Entry
          </Button>
        </div>
      </div>

      {/* Cash book tabs */}
      <div className="flex w-full gap-1 rounded-lg border border-border bg-card p-1">
        {CASH_BOOKS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBookId(b.id)}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              bookId === b.id
                ? "bg-navy text-navy-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {b.name}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.key} className={cn("rounded-xl border p-4", c.cls)}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold leading-tight text-navy">{c.label}</p>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card/70 text-navy">
                <c.icon className="size-[18px]" />
              </span>
            </div>
            <p className={cn("num mt-3 text-xl font-semibold", c.text)}>{formatMoney(c.value)}</p>
            <p className="mt-1 text-xs text-navy/60">
              {c.key === "balance" ? book.short : `${formatDate(from)} – ${formatDate(to)}`}
            </p>
          </div>
        ))}
      </div>

      {/* Ledger */}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-navy">
            {book.name} · {formatDate(from)} – {formatDate(to)}
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Opening{" "}
              <span className="num font-semibold text-navy">{formatMoney(totals.opening)}</span>
            </span>
            <span>
              Cash In{" "}
              <span className="num font-semibold text-pos">{formatMoney(totals.cashIn)}</span>
            </span>
            <span>
              Cash Out{" "}
              <span className="num font-semibold text-neg">{formatMoney(totals.cashOut)}</span>
            </span>
            <span>
              Closing{" "}
              <span className="num font-semibold text-navy">{formatMoney(totals.closing)}</span>
            </span>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">
            No cash entries for the selected period and category.
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
                    <th className="px-3 py-2 text-right font-semibold">Cash In</th>
                    <th className="px-3 py-2 text-right font-semibold">Cash Out</th>
                    <th className="px-3 py-2 text-right font-semibold">Balance</th>
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
                        <CashCategoryBadge id={t.category} />
                      </td>
                      <td className="max-w-[360px] px-3 py-2 text-muted-foreground">
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

            {/* Mobile cards */}
            <ul className="divide-y divide-border lg:hidden">
              {rows.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{formatDate(t.date)}</p>
                      <p className="mt-1 break-words text-sm font-medium text-navy">
                        {t.particulars}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <CashCategoryBadge id={t.category} />
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

      <CashEntryForm
        open={formOpen}
        bookId={bookId}
        bookName={book.name}
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
                ["Cash Book", book.name],
                ["Category", cashCategoryLabel(viewing.category)],
                ["Transfer ID", viewing.transferGroupId ?? "—"],
                ["Created by", viewing.createdBy],
                ["Type", viewing.direction === "in" ? "Cash In" : "Cash Out"],
                ["Amount", formatMoney(viewing.amount)],
                ["Balance after", formatMoney(balances.get(viewing.id) ?? 0)],
                ["Particulars", viewing.particulars],
                ["Reference", viewing.reference || "—"],
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

function CashCategoryBadge({ id }: { id: CategoryId | null }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium",
        categoryTone(id),
      )}
    >
      {cashCategoryLabel(id)}
    </span>
  );
}

interface FormState {
  date: string;
  direction: "in" | "out";
  category: CategoryId | "";
  bankId: string;
  partyName: string;
  particulars: string;
  amount: string;
  reference: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  date: todayISO(),
  direction: "in",
  category: "",
  bankId: "",
  partyName: "",
  particulars: "",
  amount: "",
  reference: "",
  notes: "",
});

function CashEntryForm({
  open,
  bookId,
  bookName,
  editing,
  onClose,
}: {
  open: boolean;
  bookId: string;
  bookName: string;
  editing: Transaction | null;
  onClose: () => void;
}) {
  const store = useLepdo();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [ack, setAck] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setAck(false);
    setForm(
      editing
        ? {
            date: editing.date,
            direction: editing.direction,
            category: editing.category ?? "",
            bankId: "",
            partyName:
              partyName(store.parties, editing.partyId) === "—"
                ? ""
                : partyName(store.parties, editing.partyId),
            particulars: editing.particulars,
            amount: String(editing.amount),
            reference: editing.reference ?? "",
            notes: editing.notes ?? "",
          }
        : emptyForm(),
    );
  }, [open, editing]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const amount = Number(form.amount) || 0;
  const needsParty = form.category === "sale_payment" || form.category === "purchase_payment";
  const isCashTransfer = form.category === "cash_transfer";
  const isBankMove = form.category === "bank_to_cash" || form.category === "cash_to_bank";
  const forced = fixedDirection(form.category);
  const direction: "in" | "out" = isCashTransfer ? "out" : (forced ?? form.direction);
  const otherBook = CASH_BOOKS.find((b) => b.id !== bookId)!;

  useEffect(() => {
    if (forced && form.direction !== forced) setForm((f) => ({ ...f, direction: forced }));
  }, [forced, form.direction]);

  const duplicate = useMemo(() => {
    if (!(amount > 0)) return null;
    return (
      store.transactions.find(
        (t) =>
          t.id !== editing?.id &&
          !t.voided &&
          t.sourceType === "cash" &&
          t.accountId === bookId &&
          t.date === form.date &&
          t.category === form.category &&
          t.direction === direction &&
          Math.abs(t.amount - amount) < 0.005 &&
          (t.particulars.trim().toLowerCase() === form.particulars.trim().toLowerCase() ||
            (!!form.reference.trim() &&
              (t.reference ?? "").trim().toLowerCase() === form.reference.trim().toLowerCase())),
      ) ?? null
    );
  }, [store.transactions, editing, form, amount, direction, bookId]);

  const projected = useMemo(() => {
    if (direction !== "out") return 0;
    return (
      store.balanceOf("cash", bookId) -
      amount +
      (editing && editing.direction === "out" ? editing.amount : 0)
    );
  }, [store, bookId, direction, amount, editing]);

  const submit = () => {
    if (saving) return;
    if (!form.category) {
      toast.error("Select a category.");
      return;
    }
    if (isBankMove && !form.bankId) {
      toast.error("Select the bank account for this cash movement.");
      return;
    }
    if (needsParty && !form.partyName.trim()) {
      toast.error("Select or enter a party.");
      return;
    }
    const negative = direction === "out" && projected < 0;
    if ((duplicate || negative) && !ack) {
      setAck(true);
      toast.warning(
        duplicate
          ? "A similar entry already exists. Press Save Entry again to confirm."
          : `This entry makes ${bookName} negative (${formatMoney(projected)}). Press Save Entry again to confirm.`,
      );
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

    let input: NewEntryInput;
    if (isCashTransfer) {
      input = {
        date: form.date,
        sourceType: "cash",
        accountId: bookId,
        direction: "out",
        amount,
        category: "cash_transfer",
        partyId: null,
        particulars: form.particulars || `Cash transfer to ${otherBook.short}`,
        reference: form.reference.trim() || undefined,
        notes: form.notes.trim() || undefined,
        destinationType: "cash",
        destinationId: otherBook.id,
        ledger: true,
      };
    } else if (form.category === "bank_to_cash") {
      input = {
        date: form.date,
        sourceType: "bank",
        accountId: form.bankId,
        direction: "out",
        amount,
        category: "bank_to_cash",
        partyId: null,
        particulars: form.particulars || "Cash withdrawn from bank",
        reference: form.reference.trim() || undefined,
        notes: form.notes.trim() || undefined,
        destinationType: "cash",
        destinationId: bookId,
        ledger: true,
      };
    } else if (form.category === "cash_to_bank") {
      input = {
        date: form.date,
        sourceType: "cash",
        accountId: bookId,
        direction: "out",
        amount,
        category: "cash_to_bank",
        partyId: null,
        particulars: form.particulars || "Cash deposited to bank",
        reference: form.reference.trim() || undefined,
        notes: form.notes.trim() || undefined,
        destinationType: "bank",
        destinationId: form.bankId,
        ledger: true,
      };
    } else {
      input = {
        date: form.date,
        sourceType: "cash",
        accountId: bookId,
        direction,
        amount,
        category: form.category,
        partyId,
        particulars: form.particulars,
        reference: form.reference.trim() || undefined,
        notes: form.notes.trim() || undefined,
        ledger: true,
      };
    }

    const res = editing ? store.updateEntry(editing.id, input) : store.addEntry(input);
    if (!res.ok) {
      toast.error(res.message);
      setSaving(false);
      return;
    }
    toast.success(res.message);
    onClose();
  };

  const categories = CASH_CATEGORIES.filter(
    (c) =>
      !(
        editing &&
        (c.id === "cash_transfer" || c.id === "bank_to_cash" || c.id === "cash_to_bank")
      ),
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92dvh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="text-navy">
            {editing ? "Edit Cash Entry" : "Add Cash Entry"} — {bookName}
          </DialogTitle>
          <DialogDescription>
            One entry is either Cash In or Cash Out, never both. It saves in this cash book.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">
              <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </Field>
            <Field label="Entry type">
              <div className="grid grid-cols-2 gap-2">
                {(["in", "out"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={!!forced || isCashTransfer}
                    onClick={() => set("direction", d)}
                    className={cn(
                      "h-9 rounded-md border text-sm font-medium transition-colors disabled:opacity-60",
                      direction === d
                        ? d === "in"
                          ? "border-pos bg-pos-bg text-pos"
                          : "border-neg bg-neg-bg text-neg"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {d === "in" ? "Cash In" : "Cash Out"}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <Select value={form.category} onValueChange={(v) => set("category", v as CategoryId)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {isBankMove ? (
              <Field label="Bank account">
                <Select value={form.bankId} onValueChange={(v) => set("bankId", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {store.bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.bankName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field label="Amount">
                <MoneyInput value={toNum(form.amount)} onChange={(n) => set("amount", String(n))} />
              </Field>
            )}
          </div>

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

          {isCashTransfer ? (
            <p className="rounded-md bg-pl-blue px-3 py-2 text-xs text-navy">
              Two linked entries will be created with the same transfer reference — Cash Out from{" "}
              {bookName} and Cash In to {otherBook.name}. Transfers are excluded from sales,
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
            {isBankMove ? (
              <Field label="Amount">
                <MoneyInput value={toNum(form.amount)} onChange={(n) => set("amount", String(n))} />
              </Field>
            ) : null}
            <Field label="Reference (optional)">
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
          ) : direction === "out" && amount > 0 && projected < 0 ? (
            <p className="rounded-md bg-pl-red px-3 py-2 text-xs font-medium text-navy">
              Warning: this entry takes {bookName} to {formatMoney(projected)}.
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
