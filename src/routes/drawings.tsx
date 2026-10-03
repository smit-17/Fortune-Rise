import { isLedgerEntry, isPosted } from "@/lib/lepdo/entry";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Home, MoreVertical, Plus, User, UserRound, WalletCards } from "lucide-react";
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
import { formatDate, formatMoney, todayISO } from "@/lib/lepdo/format";
import { MoneyInput, NumInput, toNum } from "@/components/lepdo/numeric";
import { useLepdo, type NewEntryInput } from "@/lib/lepdo/store";
import type { SourceType, Transaction } from "@/lib/lepdo/types";
import {
  DRAWING_ACCOUNTS,
  DRAWING_CATEGORIES,
  DRAWING_PARTIES,
  DRAWING_PRESETS,
  drawingRange,
  type DrawingPreset,
} from "@/lib/lepdo/drawings";

export const Route = createFileRoute("/drawings")({
  head: () => ({
    meta: [
      { title: "Drawings — LEPDO Accounting" },
      {
        name: "description",
        content:
          "Founder-wise drawings register for LEPDO — Brijes, Dixit and JD Home withdrawals with linked bank and cash ledger entries.",
      },
      { property: "og:title", content: "Drawings — LEPDO Accounting" },
      {
        property: "og:description",
        content: "Track founder drawings per account with period totals and detailed entry tables.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DrawingsPage,
});

const ICONS = [User, UserRound, Home];

interface FormState {
  date: string;
  partyId: string;
  drawingCategory: string;
  particulars: string;
  amount: string;
  source: string;
  notes: string;
}

const emptyForm = (partyId: string, source: string): FormState => ({
  date: todayISO(),
  partyId,
  drawingCategory: "",
  particulars: "",
  amount: "",
  source,
  notes: "",
});

function DrawingsPage() {
  const store = useLepdo();
  const today = todayISO();
  const [preset, setPreset] = useState<DrawingPreset>("month");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [from, to] = useMemo(
    () => drawingRange(preset, today, customFrom, customTo),
    [preset, today, customFrom, customTo],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [viewing, setViewing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [focusAccount, setFocusAccount] = useState<string | null>(null);

  const { ensureParties } = store;
  useEffect(() => {
    ensureParties(DRAWING_PARTIES);
  }, [ensureParties]);

  const sources = useMemo(
    () => [
      ...store.bankAccounts
        .filter((b) => b.active)
        .map((b) => ({
          id: b.id,
          label: `${b.bankName} — ${b.nickname}`,
          type: "bank" as SourceType,
        })),
      ...store.cashLocations
        .filter((c) => c.active)
        .map((c) => ({ id: c.id, label: c.name, type: "cash" as SourceType })),
    ],
    [store.bankAccounts, store.cashLocations],
  );

  const rowsFor = (partyId: string) =>
    store.transactions
      .filter(
        (t) =>
          !t.voided &&
          !isLedgerEntry(t) &&
          t.category === "owner_drawing" &&
          t.partyId === partyId &&
          t.date >= from &&
          t.date <= to,
      )
      .sort((a, b) =>
        a.date === b.date ? a.code.localeCompare(b.code) : b.date.localeCompare(a.date),
      );

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-navy lg:text-2xl">Drawings</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as DrawingPreset)}>
            <SelectTrigger aria-label="Period" className="h-9 w-[170px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {DRAWING_PRESETS.map((p) => (
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
          <Button onClick={openAdd} className="h-9 bg-navy text-navy-foreground hover:bg-navy/90">
            <Plus className="size-4" /> Add Drawing
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DRAWING_ACCOUNTS.map((acc, i) => {
          const Icon = ICONS[i] ?? WalletCards;
          const total = rowsFor(acc.id)
            .filter(isPosted)
            .reduce((s, t) => s + t.amount, 0);
          return (
            <div key={acc.id} className={cn("rounded-xl border border-border p-4", acc.bg)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-navy">{acc.name}</p>
                  <p className="text-xs text-navy/60">Drawings this period</p>
                </div>
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card/70 text-navy">
                  <Icon className="size-[18px]" />
                </span>
              </div>
              <p className="num mt-3 text-2xl font-semibold text-navy">{formatMoney(total)}</p>
              <button
                type="button"
                onClick={() => {
                  setFocusAccount(acc.id);
                  document
                    .getElementById(`table-${acc.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="mt-2 text-xs font-semibold text-navy underline underline-offset-4"
              >
                View Entries
              </button>
            </div>
          );
        })}
      </div>

      {DRAWING_ACCOUNTS.map((acc) => {
        const rows = rowsFor(acc.id);
        return (
          <section
            key={acc.id}
            id={`table-${acc.id}`}
            className={cn(
              "scroll-mt-20 overflow-hidden rounded-xl border bg-card shadow-sm",
              focusAccount === acc.id ? "border-gold" : "border-border",
            )}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-navy">{acc.name} Drawings</h2>
              <span className="num text-sm font-semibold text-navy">
                {formatMoney(rows.filter(isPosted).reduce((s, t) => s + t.amount, 0))}
              </span>
            </div>

            {rows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No drawings recorded for {acc.name} in this period.
              </p>
            ) : (
              <>
                {/* Desktop table */}
                <table className="hidden w-full text-sm sm:table">
                  <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold">Date</th>
                      <th className="px-4 py-2 text-left font-semibold">Category</th>
                      <th className="px-4 py-2 text-left font-semibold">Particulars</th>
                      <th className="px-4 py-2 text-left font-semibold">Source &amp; Status</th>
                      <th className="px-4 py-2 text-right font-semibold">Amount</th>
                      <th className="w-10 px-2 py-2" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.id} className="border-t border-border">
                        <td className="whitespace-nowrap px-4 py-2 text-foreground">
                          {formatDate(t.date)}
                        </td>
                        <td className="px-4 py-2 text-foreground">
                          {t.drawingCategory ?? "Other"}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{t.particulars}</td>
                        <td className="max-w-[320px] px-4 py-2"></td>
                        <td className="num whitespace-nowrap px-4 py-2 text-right font-medium text-foreground">
                          {formatMoney(t.amount)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <RowMenu
                            onView={() => setViewing(t)}
                            onEdit={() => {
                              setEditing(t);
                              setFormOpen(true);
                            }}
                            onDelete={() => setDeleting(t)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile stacked */}
                <ul className="divide-y divide-border sm:hidden">
                  {rows.map((t) => (
                    <li key={t.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">{formatDate(t.date)}</p>
                          <p className="mt-0.5 text-sm font-medium text-navy">
                            {t.drawingCategory ?? "Other"}
                          </p>
                          <p className="mt-0.5 break-words text-xs text-muted-foreground">
                            {t.particulars}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="num text-sm font-semibold text-foreground">
                            {formatMoney(t.amount)}
                          </span>
                          <RowMenu
                            onView={() => setViewing(t)}
                            onEdit={() => {
                              setEditing(t);
                              setFormOpen(true);
                            }}
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
        );
      })}

      <DrawingForm
        open={formOpen}
        editing={editing}
        sources={sources}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy">Drawing details</DialogTitle>
            <DialogDescription>{viewing?.code}</DialogDescription>
          </DialogHeader>
          {viewing ? (
            <dl className="space-y-2 text-sm">
              {[
                ["Date", formatDate(viewing.date)],
                ["Account", DRAWING_ACCOUNTS.find((a) => a.id === viewing.partyId)?.name ?? "—"],
                ["Category", viewing.drawingCategory ?? "Other"],
                ["Particulars", viewing.particulars],
                ["Amount", formatMoney(viewing.amount)],
                [
                  "Payment source",
                  viewing.sourceType === "bank"
                    ? (store.bankAccounts.find((b) => b.id === viewing.accountId)?.nickname ??
                      "Bank")
                    : (store.cashLocations.find((c) => c.id === viewing.accountId)?.name ?? "Cash"),
                ],
                ["Notes", viewing.notes || "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-border pb-1.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this drawing?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `${formatMoney(deleting.amount)} on ${formatDate(deleting.date)} will be removed from totals and the linked ledger entry. It stays visible in the audit log.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) {
                  store.voidEntry(deleting.id);
                  toast.success("Drawing deleted.");
                }
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RowMenu({
  onView,
  onEdit,
  onDelete,
}: {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
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
        <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={onDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DrawingForm({
  open,
  editing,
  sources,
  onClose,
}: {
  open: boolean;
  editing: Transaction | null;
  sources: { id: string; label: string; type: SourceType }[];
  onClose: () => void;
}) {
  const store = useLepdo();
  const firstSource = sources[0]?.id ?? "";
  const [form, setForm] = useState<FormState>(emptyForm(DRAWING_ACCOUNTS[0]!.id, firstSource));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setForm({
        date: editing.date,
        partyId: editing.partyId ?? DRAWING_ACCOUNTS[0]!.id,
        drawingCategory: editing.drawingCategory ?? "",
        particulars: editing.particulars,
        amount: String(editing.amount),
        source: editing.accountId,
        notes: editing.notes ?? "",
      });
    } else {
      setForm(emptyForm(DRAWING_ACCOUNTS[0]!.id, firstSource));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const src = sources.find((s) => s.id === form.source);
    if (!src) return setError("Select a payment source.");
    if (!form.drawingCategory) return setError("Select a drawing category.");
    const input: NewEntryInput = {
      date: form.date,
      sourceType: src.type,
      accountId: src.id,
      direction: "out",
      amount: Number(form.amount) || 0,
      category: "owner_drawing",
      partyId: form.partyId,
      particulars: form.particulars,
      drawingCategory: form.drawingCategory,
      notes: form.notes || undefined,
    };
    if (store.isLikelyDuplicate(input, editing?.id)) {
      return setError("A matching entry already exists on this date, account and amount.");
    }
    const res = editing ? store.updateEntry(editing.id, input) : store.addEntry(input);
    if (!res.ok) return setError(res.message);
    toast.success(editing ? "Drawing updated." : "Drawing saved and posted to the ledger.");
    onClose();
    return undefined;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="text-navy">
            {editing ? "Edit Drawing" : "Add Drawing"}
          </DialogTitle>
          <DialogDescription>
            Posts a linked debit entry in the selected bank ledger or cash book.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="d-date">Date</Label>
              <Input
                id="d-date"
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Select value={form.partyId} onValueChange={(v) => set("partyId", v)}>
                <SelectTrigger aria-label="Account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DRAWING_ACCOUNTS.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.drawingCategory} onValueChange={(v) => set("drawingCategory", v)}>
              <SelectTrigger aria-label="Category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {DRAWING_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="d-part">Particulars</Label>
            <Input
              id="d-part"
              value={form.particulars}
              onChange={(e) => set("particulars", e.target.value)}
              placeholder="e.g. Personal use — UPI transfer"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="d-amt">Amount</Label>
              <MoneyInput id="d-amt" value={toNum(form.amount)} onChange={(n) => set("amount", String(n))} />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Source</Label>
              <Select value={form.source} onValueChange={(v) => set("source", v)}>
                <SelectTrigger aria-label="Payment source">
                  <SelectValue placeholder="Bank or cash" />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="d-notes">Notes (optional)</Label>
            <Textarea
              id="d-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          {error ? (
            <p className="rounded-md bg-neg-bg px-3 py-2 text-sm text-neg">{error}</p>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} className="bg-navy text-navy-foreground hover:bg-navy/90">
            Save Drawing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
