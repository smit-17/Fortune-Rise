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
import { MoneyInput, toNum } from "@/components/lepdo/numeric";
import { useLepdo } from "@/lib/lepdo/store";
import type { OtherBankAccount, OtherBankEntry } from "@/lib/lepdo/types";
import { BANK_PRESETS, bankRange, periodLabel, type BankPreset } from "@/lib/lepdo/bank";
import { downloadCsv, downloadExcel, downloadPdf, type ReportRow } from "@/lib/lepdo/report";

export const Route = createFileRoute("/other-bank-ledger")({
  head: () => ({
    meta: [
      { title: "Other Bank Ledger — LEPDO Accounting" },
      {
        name: "description",
        content:
          "Reference-only bank ledgers for other entities and non-active accounts, kept fully separate from the company's accounting records.",
      },
      { property: "og:title", content: "Other Bank Ledger — LEPDO Accounting" },
      {
        property: "og:description",
        content:
          "Reference-only bank ledgers, fully isolated from active accounting, balances and reports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OtherBankLedgerPage,
});

function ReferenceBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border border-gold bg-gold-tint px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-navy",
        className,
      )}
    >
      Reference Only
    </span>
  );
}

interface EntryFormState {
  date: string;
  accountId: string;
  direction: "in" | "out";
  category: string;
  particulars: string;
  amount: string;
  reference: string;
  notes: string;
}

const emptyEntryForm = (accountId: string): EntryFormState => ({
  date: todayISO(),
  accountId,
  direction: "in",
  category: "",
  particulars: "",
  amount: "",
  reference: "",
  notes: "",
});

function OtherBankLedgerPage() {
  const store = useLepdo();
  const today = todayISO();
  const [preset, setPreset] = useState<BankPreset>("month");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [bankFilter, setBankFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OtherBankEntry | null>(null);
  const [viewing, setViewing] = useState<OtherBankEntry | null>(null);
  const [deleting, setDeleting] = useState<OtherBankEntry | null>(null);
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<OtherBankAccount | null>(null);

  const accounts = store.otherBankAccounts;
  const entries = store.otherBankEntries;

  const [from, to] = useMemo(
    () => bankRange(preset, today, customFrom, customTo),
    [preset, today, customFrom, customTo],
  );

  const bankName = (id: string) =>
    accounts.find((b) => b.id === id)?.nickname ??
    accounts.find((b) => b.id === id)?.bankName ??
    "Bank";

  /** running balance per account across all time, keyed by entry id */
  const balances = useMemo(() => {
    const map = new Map<string, number>();
    for (const acc of accounts) {
      let bal = acc.openingBalance;
      const rows = entries
        .filter((t) => t.accountId === acc.id && !t.voided)
        .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
      for (const t of rows) {
        bal += t.direction === "in" ? t.amount : -t.amount;
        map.set(t.id, bal);
      }
    }
    return map;
  }, [accounts, entries]);

  const balanceOf = (accountId: string) => {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return 0;
    return (
      acc.openingBalance +
      entries
        .filter((t) => t.accountId === accountId && !t.voided)
        .reduce((s, t) => s + (t.direction === "in" ? t.amount : -t.amount), 0)
    );
  };

  const lastUpdatedOf = (accountId: string) => {
    const rows = entries.filter((t) => t.accountId === accountId && !t.voided);
    if (rows.length === 0) return null;
    return rows.reduce((latest, t) => (t.updatedAt > latest ? t.updatedAt : latest), rows[0]!.updatedAt);
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter(
        (t) =>
          !t.voided &&
          t.date >= from &&
          t.date <= to &&
          (bankFilter === "all" || t.accountId === bankFilter) &&
          (!q ||
            t.particulars.toLowerCase().includes(q) ||
            (t.reference ?? "").toLowerCase().includes(q) ||
            t.category.toLowerCase().includes(q) ||
            bankName(t.accountId).toLowerCase().includes(q)),
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, from, to, bankFilter, search, accounts]);

  const totals = useMemo(() => {
    const credit = rows.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount, 0);
    const debit = rows.filter((t) => t.direction === "out").reduce((s, t) => s + t.amount, 0);
    const scope = bankFilter === "all" ? accounts : accounts.filter((b) => b.id === bankFilter);
    const opening = scope.reduce((sum, b) => {
      const prior = entries
        .filter((t) => t.accountId === b.id && !t.voided && t.date < from)
        .reduce((s, t) => s + (t.direction === "in" ? t.amount : -t.amount), 0);
      return sum + b.openingBalance + prior;
    }, 0);
    return { credit, debit, opening, closing: opening + credit - debit };
  }, [rows, accounts, entries, from, bankFilter]);

  const totalBalance = accounts.reduce((s, b) => s + balanceOf(b.id), 0);

  const reportRows = (): ReportRow[] =>
    rows.map((t) => ({
      date: t.date,
      bank: bankName(t.accountId),
      category: t.category || "Unclassified",
      particulars: t.particulars,
      reference: t.reference ?? "",
      credit: t.direction === "in" ? t.amount : 0,
      debit: t.direction === "out" ? t.amount : 0,
      balance: balances.get(t.id) ?? 0,
    }));

  const reportMeta = () => ({
    bankLabel: `Other Bank (Reference Only) — ${bankFilter === "all" ? "All Banks" : bankName(bankFilter)}`,
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

  const openEdit = (t: OtherBankEntry) => {
    setEditing(t);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="hidden text-xl font-semibold tracking-tight text-navy lg:block lg:text-2xl">
            Other Bank Ledger
          </h1>
          <ReferenceBadge />
        </div>
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
              {accounts.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.nickname || b.bankName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search particulars, reference…"
            aria-label="Search entries"
            className="h-9 w-[200px] text-sm"
          />

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
            variant="outline"
            onClick={() => {
              setEditingAccount(null);
              setAccountFormOpen(true);
            }}
            className="h-9 border-gold text-navy"
          >
            <Plus className="size-4" /> Add Bank Account
          </Button>

          <Button
            onClick={() => {
              if (accounts.length === 0) {
                toast.error("Add a bank account first.");
                return;
              }
              setEditing(null);
              setFormOpen(true);
            }}
            className="h-9 bg-navy text-navy-foreground hover:bg-navy/90"
          >
            <Plus className="size-4" /> Add Entry
          </Button>
        </div>
      </div>

      <p className="rounded-md bg-pl-blue px-3 py-2 text-xs text-navy">
        This section is <span className="font-semibold">reference only</span>. Accounts and entries
        here belong to other entities or non-active banks and are never included in your Bank
        Ledger, Cash Book, Dashboard, reports, balances or any other accounting totals.
      </p>

      {/* Balance cards */}
      {accounts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No reference bank accounts yet. Use “Add Bank Account” to create one.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {accounts.map((b) => {
            const updated = lastUpdatedOf(b.id);
            return (
              <div key={b.id} className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="min-w-0 break-words text-sm font-semibold leading-tight text-navy">
                      {b.nickname || b.bankName}
                    </p>
                    <ReferenceBadge className="mt-1" />
                  </div>
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card/70 text-navy">
                    <Landmark className="size-[18px]" />
                  </span>
                </div>
                <p className="num mt-3 text-xl font-semibold text-navy">
                  {formatMoney(balanceOf(b.id))}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-xs text-navy/60">
                    {updated ? `Updated ${formatDateTime(updated)}` : "No entries yet"}
                  </p>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7" aria-label="Account actions">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingAccount(b);
                          setAccountFormOpen(true);
                        }}
                      >
                        Edit account
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
          <div className="rounded-xl border border-gold bg-gold-tint p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-navy">Total (Reference Only)</p>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card/70 text-navy">
                <Wallet className="size-[18px]" />
              </span>
            </div>
            <p className="num mt-3 text-xl font-semibold text-navy">{formatMoney(totalBalance)}</p>
            <p className="mt-1 text-xs text-navy/60">{accounts.length} reference accounts</p>
          </div>
        </div>
      )}

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
            No entries for the selected period and bank.
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
                        <span className="inline-flex whitespace-nowrap rounded-md bg-muted px-2 py-1 text-xs font-medium text-navy">
                          {t.category || "Unclassified"}
                        </span>
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
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8" aria-label="Entry actions">
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setViewing(t)}>View</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(t)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-neg"
                              onClick={() => setDeleting(t)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                        <span className="inline-flex whitespace-nowrap rounded-md bg-muted px-2 py-1 text-xs font-medium text-navy">
                          {t.category || "Unclassified"}
                        </span>
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8" aria-label="Entry actions">
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewing(t)}>View</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(t)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem className="text-neg" onClick={() => setDeleting(t)}>
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <OtherBankEntryForm
        open={formOpen}
        editing={editing}
        accounts={accounts}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <OtherBankAccountForm
        open={accountFormOpen}
        editing={editingAccount}
        onClose={() => {
          setAccountFormOpen(false);
          setEditingAccount(null);
        }}
      />

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-navy">
              Entry details <ReferenceBadge />
            </DialogTitle>
            <DialogDescription>{viewing?.id}</DialogDescription>
          </DialogHeader>
          {viewing ? (
            <dl className="space-y-2 text-sm">
              {[
                ["Date", formatDate(viewing.date)],
                ["Bank", bankName(viewing.accountId)],
                ["Category", viewing.category || "Unclassified"],
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
                ? `${formatMoney(deleting.amount)} on ${formatDate(deleting.date)} will be removed from this reference ledger only. Your active accounting records are not affected.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-neg text-white hover:bg-neg/90"
              onClick={() => {
                if (deleting) store.removeRecord("otherBankEntries", deleting.id);
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

function OtherBankEntryForm({
  open,
  editing,
  accounts,
  onClose,
}: {
  open: boolean;
  editing: OtherBankEntry | null;
  accounts: OtherBankAccount[];
  onClose: () => void;
}) {
  const store = useLepdo();
  const [form, setForm] = useState<EntryFormState>(emptyEntryForm(accounts[0]?.id ?? ""));
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
            direction: editing.direction,
            category: editing.category,
            particulars: editing.particulars,
            amount: String(editing.amount),
            reference: editing.reference ?? "",
            notes: editing.notes ?? "",
          }
        : emptyEntryForm(accounts[0]?.id ?? ""),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = <K extends keyof EntryFormState>(k: K, v: EntryFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const amount = Number(form.amount) || 0;

  const categoryOptions = useMemo(() => {
    const names = (store.masters["bankEntryCategories"] ?? [])
      .filter((v) => v.active)
      .map((v) => v.name);
    if (form.category && !names.includes(form.category)) names.push(form.category);
    return names;
  }, [store.masters, form.category]);

  const duplicate = useMemo(
    () =>
      store.otherBankEntries.find(
        (t) =>
          t.id !== editing?.id &&
          !t.voided &&
          t.date === form.date &&
          t.accountId === form.accountId &&
          Math.abs(t.amount - amount) < 0.005 &&
          t.direction === form.direction &&
          (t.particulars.trim().toLowerCase() === form.particulars.trim().toLowerCase() ||
            (!!form.reference.trim() &&
              (t.reference ?? "").trim().toLowerCase() === form.reference.trim().toLowerCase())),
      ) ?? null,
    [store.otherBankEntries, editing, form, amount],
  );

  const submit = () => {
    if (saving) return;
    if (!form.accountId) {
      toast.error("Select a bank account.");
      return;
    }
    if (!form.category) {
      toast.error("Select a category.");
      return;
    }
    if (amount <= 0) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    if (duplicate && !dupAck) {
      setDupAck(true);
      toast.warning("A similar entry already exists. Press Save Entry again to confirm.");
      return;
    }
    setSaving(true);
    const record = store.stamp("obank", {
      id: editing?.id,
      date: form.date,
      accountId: form.accountId,
      direction: form.direction,
      amount,
      category: form.category,
      particulars: form.particulars.trim(),
      reference: form.reference.trim() || undefined,
      notes: form.notes.trim() || undefined,
      voided: false,
      ...(editing
        ? {
            createdAt: editing.createdAt,
            createdBy: editing.createdBy,
          }
        : {}),
    });
    store.saveRecord("otherBankEntries", record);
    toast.success(editing ? "Entry updated." : "Entry added.");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92dvh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-navy">
            {editing ? "Edit Entry" : "Add Entry"} <ReferenceBadge />
          </DialogTitle>
          <DialogDescription>
            Reference only — this entry stays inside Other Bank Ledger and never affects your active
            accounting. Credit means money received, debit means money paid.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">
              <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </Field>
            <Field label="Bank">
              <Select value={form.accountId} onValueChange={(v) => set("accountId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.nickname || b.bankName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                For reference and filtering only — no linked entry is created anywhere.
              </p>
            </Field>
            <Field label="Entry type">
              <div className="grid grid-cols-2 gap-2">
                {(["in", "out"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={form.direction === d}
                    onClick={() => set("direction", d)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors",
                      form.direction === d
                        ? d === "in"
                          ? "border-pos bg-pl-green text-navy"
                          : "border-neg bg-pl-red text-navy"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {d === "in" ? "Credit — Money In" : "Debit — Money Out"}
                  </button>
                ))}
              </div>
            </Field>
          </div>

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
              Possible duplicate: {formatMoney(duplicate.amount)} on {formatDate(duplicate.date)}.
              Save again only if this is a genuinely separate entry.
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

function OtherBankAccountForm({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: OtherBankAccount | null;
  onClose: () => void;
}) {
  const store = useLepdo();
  const [bankName, setBankName] = useState("");
  const [nickname, setNickname] = useState("");
  const [last4, setLast4] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");

  useEffect(() => {
    if (!open) return;
    setBankName(editing?.bankName ?? "");
    setNickname(editing?.nickname ?? "");
    setLast4(editing?.last4 ?? "");
    setOpeningBalance(String(editing?.openingBalance ?? 0));
  }, [open, editing]);

  const submit = () => {
    if (!bankName.trim()) {
      toast.error("Enter the bank name.");
      return;
    }
    store.saveRecord("otherBankAccounts", {
      id: editing?.id ?? `obank_acc_${Date.now().toString(36)}`,
      bankName: bankName.trim(),
      nickname: nickname.trim() || bankName.trim(),
      last4: last4.trim(),
      openingBalance: Number(openingBalance) || 0,
      active: true,
    });
    toast.success(editing ? "Account updated." : "Account added.");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-navy">
            {editing ? "Edit Bank Account" : "Add Bank Account"} <ReferenceBadge />
          </DialogTitle>
          <DialogDescription>
            A reference-only account for another entity or a non-active bank. It never appears in
            your active Bank Ledger or balances.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Bank name">
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. MEIR COHEN HDFC" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nickname (optional)">
              <Input value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </Field>
            <Field label="Last 4 digits (optional)">
              <Input value={last4} maxLength={4} onChange={(e) => setLast4(e.target.value)} />
            </Field>
          </div>
          <Field label="Opening balance">
            <MoneyInput value={toNum(openingBalance)} onChange={(n) => setOpeningBalance(String(n))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} className="bg-navy text-navy-foreground hover:bg-navy/90">
            Save Account
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
