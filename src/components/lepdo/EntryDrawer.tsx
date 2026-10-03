import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES, categoryMap, PAYMENT_METHODS } from "@/lib/lepdo/constants";
import { isLedgerCategory } from "@/lib/lepdo/entry";
import { isUchhina } from "@/lib/lepdo/uchhina";
import { formatMoney, round2, todayISO } from "@/lib/lepdo/format";
import { MoneyInput, NumInput, toNum } from "@/components/lepdo/numeric";
import { useLepdo, type NewEntryInput } from "@/lib/lepdo/store";
import type { CategoryId, SourceType, Transaction } from "@/lib/lepdo/types";
import { cn } from "@/lib/utils";

export interface DrawerConfig {
  sourceType: SourceType;
  category?: CategoryId;
  accountId?: string;
  editing?: Transaction;
}

interface FormState {
  date: string;
  accountId: string;
  direction: "in" | "out";
  amount: string;
  category: CategoryId | "";
  partyId: string;
  particulars: string;
  reference: string;
  paymentMethod: string;
  notes: string;
  attachmentName: string;
  destinationId: string;
  uchhinaReturnDate: string;
}

const emptyForm = (sourceType: SourceType): FormState => ({
  date: todayISO(),
  accountId: "",
  direction: sourceType === "bank" ? "in" : "in",
  amount: "",
  category: "",
  partyId: "",
  particulars: "",
  reference: "",
  paymentMethod: "",
  notes: "",
  attachmentName: "",
  destinationId: "",
  uchhinaReturnDate: "",
});

export function EntryDrawer({
  config,
  onClose,
}: {
  config: DrawerConfig | null;
  onClose: () => void;
}) {
  const store = useLepdo();
  const [form, setForm] = useState<FormState>(emptyForm("bank"));
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceType = config?.sourceType ?? "bank";
  const accounts = store.bankAccounts.filter((b) => b.active);
  const locations = store.cashLocations.filter((c) => c.active);

  useEffect(() => {
    if (!config) return;
    setError(null);
    setSaving(false);
    if (config.editing) {
      const t = config.editing;
      setForm({
        date: t.date,
        accountId: t.accountId,
        direction: t.direction,
        amount: String(t.amount),
        category: t.category ?? "",
        partyId: t.partyId ?? "",
        particulars: t.particulars,
        reference: t.reference ?? "",
        paymentMethod: t.paymentMethod ?? "",
        notes: t.notes ?? "",
        attachmentName: t.attachmentName ?? "",
        destinationId: "",
        uchhinaReturnDate: t.uchhinaReturnDate ?? "",
      });
      setAllocations(
        Object.fromEntries((t.allocations ?? []).map((a) => [a.invoiceId, String(a.amount)])),
      );
      return;
    }
    const defaultAccount =
      config.accountId ??
      (config.sourceType === "bank" ? (accounts[0]?.id ?? "") : (locations[0]?.id ?? ""));
    const cat = config.category;
    const dir = cat
      ? categoryMap[cat].allows === "both"
        ? "out"
        : categoryMap[cat].allows[0]!
      : "in";
    setForm({
      ...emptyForm(config.sourceType),
      accountId: defaultAccount,
      category: cat ?? "",
      direction: dir,
    });
    setAllocations({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const meta = form.category ? categoryMap[form.category] : undefined;
  const amount = round2(Number(form.amount) || 0);
  const allocationKind = meta?.needsAllocation ?? null;
  const invoices = useMemo(
    () => (allocationKind ? store.openInvoices(allocationKind, form.partyId || null) : []),
    [allocationKind, form.partyId, store],
  );
  const allocationList = Object.entries(allocations)
    .map(([invoiceId, v]) => ({ invoiceId, amount: round2(Number(v) || 0) }))
    .filter((a) => a.amount > 0);
  const allocated = round2(allocationList.reduce((s, a) => s + a.amount, 0));
  const unallocated = round2(amount - allocated);

  const categoryOptions = CATEGORIES.filter((c) => {
    if (!isLedgerCategory(c.id)) return false;
    if (sourceType === "cash" && c.id === "bank_transfer") return false;
    if (sourceType === "bank" && c.id === "cash_to_bank") return false;
    if (sourceType === "bank" && c.id === "cash_transfer") return false;
    if (sourceType === "cash" && c.id === "bank_to_cash") return false;
    if (sourceType === "cash" && c.id === "bank_charges") return false;
    return true;
  });

  const transferTargets = useMemo(() => {
    if (!meta?.isTransfer) return [];
    if (meta.id === "bank_transfer")
      return accounts
        .filter((a) => a.id !== form.accountId)
        .map((a) => ({
          id: a.id,
          label: `${a.bankName} — ${a.nickname}`,
          type: "bank" as SourceType,
        }));
    if (meta.id === "bank_to_cash")
      return locations.map((l) => ({ id: l.id, label: l.name, type: "cash" as SourceType }));
    return accounts.map((a) => ({
      id: a.id,
      label: `${a.bankName} — ${a.nickname}`,
      type: "bank" as SourceType,
    }));
  }, [meta, accounts, locations, form.accountId]);

  function buildInput(): NewEntryInput {
    const dest = transferTargets.find((t) => t.id === form.destinationId);
    return {
      date: form.date,
      sourceType,
      accountId: form.accountId,
      direction: meta?.isTransfer ? "out" : form.direction,
      amount,
      category: (form.category || null) as CategoryId | null,
      partyId: form.partyId || null,
      particulars: form.particulars,
      reference: form.reference || undefined,
      paymentMethod: form.paymentMethod || undefined,
      notes: form.notes || undefined,
      attachmentName: form.attachmentName || undefined,
      allocations: allocationKind ? allocationList : undefined,
      uchhinaReturnDate: form.uchhinaReturnDate || undefined,
      destinationType: dest?.type,
      destinationId: dest?.id,
    };
  }

  function submit(again: boolean) {
    if (saving) return;
    setSaving(true);
    const input = buildInput();

    if (
      sourceType === "cash" &&
      input.direction === "out" &&
      store.balanceOf("cash", input.accountId) - input.amount < 0
    ) {
      toast.warning("This entry makes the cash location balance negative.");
    }

    if (!config?.editing && store.isLikelyDuplicate(input)) {
      const ok = window.confirm(
        "A very similar entry already exists (same date, amount, account, type and reference). Save anyway?",
      );
      if (!ok) {
        setSaving(false);
        return;
      }
    }

    const result = config?.editing
      ? store.updateEntry(config.editing.id, input)
      : store.addEntry(input);

    if (!result.ok) {
      setError(result.message);
      setSaving(false);
      return;
    }
    setError(null);
    toast.success(result.message);
    if (again && !config?.editing) {
      setForm((f) => ({ ...f, amount: "", particulars: "", reference: "", notes: "" }));
      setAllocations({});
      setSaving(false);
      return;
    }
    onClose();
  }

  const accountLabel = sourceType === "bank" ? "Bank account" : "Cash location";
  const inLabel = sourceType === "bank" ? "Money In" : "Cash In";
  const outLabel = sourceType === "bank" ? "Money Out" : "Cash Out";

  return (
    <Dialog open={!!config} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-xl p-0 sm:w-full">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="text-navy">
            {config?.editing
              ? "Edit entry"
              : sourceType === "bank"
                ? "Add bank entry"
                : "Add cash entry"}
          </DialogTitle>
          <DialogDescription>
            All amounts are recorded in ₹ with two-decimal accuracy.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Date" required>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field label={accountLabel} required>
              <Select
                value={form.accountId}
                onValueChange={(v) => setForm({ ...form, accountId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${accountLabel.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {sourceType === "bank"
                    ? accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.bankName} — {a.nickname} ••{a.last4}
                        </SelectItem>
                      ))
                    : locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {!meta?.isTransfer ? (
            <Field label="Entry type" required>
              <div className="grid grid-cols-2 gap-2">
                {(["in", "out"] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setForm({ ...form, direction: dir })}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      form.direction === dir
                        ? dir === "in"
                          ? "border-pos bg-pos-bg text-pos"
                          : "border-neg bg-neg-bg text-neg"
                        : "border-border bg-card text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {dir === "in" ? inLabel : outLabel}
                  </button>
                ))}
              </div>
            </Field>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Amount (₹)" required>
              <MoneyInput value={toNum(form.amount)} onChange={(n) => setForm({ ...form, amount: String(n) })} />
            </Field>
            <Field label="Transaction category" required>
              <Select
                value={form.category}
                onValueChange={(v) => {
                  const c = categoryMap[v as CategoryId];
                  setForm({
                    ...form,
                    category: v as CategoryId,
                    direction: c.allows === "both" ? form.direction : c.allows[0]!,
                    destinationId: "",
                  });
                  setAllocations({});
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {meta?.isTransfer ? (
            <Field label="Transfer to" required>
              <Select
                value={form.destinationId}
                onValueChange={(v) => setForm({ ...form, destinationId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select destination" />
                </SelectTrigger>
                <SelectContent>
                  {transferTargets.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Two linked entries are created: money out of the source and into the destination.
              </p>
            </Field>
          ) : (
            <Field label="Party / person" required>
              <Select value={form.partyId} onValueChange={(v) => setForm({ ...form, partyId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select party" />
                </SelectTrigger>
                <SelectContent>
                  {store.parties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field label="Particulars" required>
            <Input
              placeholder="Clear description of this transaction"
              value={form.particulars}
              onChange={(e) => setForm({ ...form, particulars: e.target.value })}
            />
          </Field>

          {allocationKind ? (
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-sm font-semibold text-navy">
                {allocationKind === "sales"
                  ? "Allocate to sales invoices"
                  : "Allocate to supplier bills"}
              </p>
              {!form.partyId ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Select a party to see open {allocationKind === "sales" ? "invoices" : "bills"}.
                </p>
              ) : invoices.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  No open {allocationKind === "sales" ? "invoices" : "bills"}. The full amount will
                  be stored as {allocationKind === "sales" ? "customer" : "supplier"} advance.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {invoices.map((inv) => {
                    const due = round2(inv.total - inv.paid);
                    return (
                      <div
                        key={inv.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
                      >
                        <div className="text-sm">
                          <p className="font-medium text-foreground">{inv.number}</p>
                          <p className="num text-xs text-muted-foreground">
                            Due {formatMoney(due)} of {formatMoney(inv.total)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <MoneyInput className="h-9 w-28" value={toNum(allocations[inv.id])} onChange={(n) => setAllocations({ ...allocations, [inv.id]: String(n) })} />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setAllocations({
                                ...allocations,
                                [inv.id]: String(
                                  Math.min(
                                    due,
                                    Math.max(
                                      0,
                                      unallocated + round2(Number(allocations[inv.id] ?? 0)),
                                    ),
                                  ),
                                ),
                              })
                            }
                          >
                            Full
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="num mt-3 grid grid-cols-3 gap-2 text-sm">
                <Stat label="Payment" value={formatMoney(amount)} />
                <Stat label="Allocated" value={formatMoney(allocated)} />
                <Stat
                  label={allocationKind === "sales" ? "Advance" : "Supplier advance"}
                  value={formatMoney(Math.max(0, unallocated))}
                  tone={unallocated < 0 ? "neg" : undefined}
                />
              </div>
              {unallocated < 0 ? (
                <p className="mt-2 text-sm font-medium text-neg">
                  Allocated amount cannot exceed the payment amount.
                </p>
              ) : null}
            </div>
          ) : null}

          {meta && isUchhina(meta.id) ? (
            <Field label="Expected return date (optional)">
              <Input
                type="date"
                value={form.uchhinaReturnDate}
                onChange={(e) => setForm({ ...form, uchhinaReturnDate: e.target.value })}
              />
            </Field>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {sourceType === "bank" ? (
              <Field label="Payment method (optional)">
                <Select
                  value={form.paymentMethod}
                  onValueChange={(v) => setForm({ ...form, paymentMethod: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field
              label={sourceType === "bank" ? "UTR / reference (optional)" : "Reference (optional)"}
            >
              <Input
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Attachment (optional)">
            <Input
              type="file"
              onChange={(e) =>
                setForm({ ...form, attachmentName: e.target.files?.[0]?.name ?? "" })
              }
            />
            {form.attachmentName ? (
              <p className="mt-1 text-xs text-muted-foreground">Attached: {form.attachmentName}</p>
            ) : null}
          </Field>

          <Field label="Notes (optional)">
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>

          {error ? (
            <p className="rounded-lg bg-neg-bg px-3 py-2 text-sm font-medium text-neg">{error}</p>
          ) : null}
        </div>

        <div className="shrink-0 flex flex-wrap gap-2 border-t border-border bg-card px-5 py-4 sm:px-6">
          <Button disabled={saving} onClick={() => submit(false)}>
            {config?.editing ? "Save changes" : "Save Entry"}
          </Button>
          {!config?.editing ? (
            <Button variant="outline" disabled={saving} onClick={() => submit(true)}>
              Save &amp; Add Another
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-neg"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "neg" | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 font-semibold", tone === "neg" ? "text-neg" : "text-foreground")}>
        {value}
      </p>
    </div>
  );
}
