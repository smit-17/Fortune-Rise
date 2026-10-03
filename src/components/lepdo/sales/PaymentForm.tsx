import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatDate, formatMoney, round2, todayISO } from "@/lib/lepdo/format";
import { MoneyInput, NumInput, toNum } from "@/components/lepdo/numeric";
import { useLepdo } from "@/lib/lepdo/store";
import { FormField, MODAL_CLASS } from "./ui";

export function PaymentForm({
  open,
  presetCustomerId,
  onClose,
}: {
  open: boolean;
  presetCustomerId?: string | null;
  onClose: () => void;
}) {
  const store = useLepdo();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: todayISO(),
    partyId: "",
    amount: "",
    account: "",
    reference: "",
    notes: "",
  });
  const [alloc, setAlloc] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setForm({
      date: todayISO(),
      partyId: presetCustomerId ?? "",
      amount: "",
      account: "",
      reference: "",
      notes: "",
    });
    setAlloc({});
  }, [open, presetCustomerId]);

  const customers = store.parties.filter((p) => p.type === "customer" || p.type === "other");
  const accounts = [
    ...store.bankAccounts
      .filter((b) => b.active)
      .map((b) => ({ value: `bank:${b.id}`, label: `${b.bankName} — ${b.nickname}` })),
    ...store.cashLocations
      .filter((c) => c.active)
      .map((c) => ({ value: `cash:${c.id}`, label: `${c.name} Cash` })),
  ];

  const openInvoices = useMemo(
    () => (form.partyId ? store.openInvoices("sales", form.partyId) : []),
    [store, form.partyId],
  );

  const amount = round2(Number(form.amount) || 0);
  const allocated = round2(Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0));
  const unallocated = round2(Math.max(0, amount - allocated));

  function autoAllocate() {
    let left = amount;
    const next: Record<string, string> = {};
    for (const inv of openInvoices) {
      if (left <= 0) break;
      const due = round2(inv.total - inv.paid);
      const take = round2(Math.min(due, left));
      if (take > 0) next[inv.id] = String(take);
      left = round2(left - take);
    }
    setAlloc(next);
  }

  function submit() {
    if (saving) return;
    const error = !form.partyId
      ? "Select the customer."
      : !(amount > 0)
        ? "Amount must be greater than zero."
        : !form.account
          ? "Select the bank or cash account."
          : allocated > amount
            ? "Allocation cannot exceed the payment amount."
            : openInvoices.find(
                  (inv) => round2(Number(alloc[inv.id]) || 0) > round2(inv.total - inv.paid),
                )
              ? "An allocation exceeds that invoice's pending amount."
              : null;
    if (error) {
      toast.error(error);
      return;
    }
    const [sourceType, accountId] = form.account.split(":") as ["bank" | "cash", string];
    const entry = {
      date: form.date,
      sourceType,
      accountId,
      direction: "in" as const,
      amount,
      category: "sale_payment" as const,
      partyId: form.partyId,
      particulars: `Sales receipt from ${store.parties.find((p) => p.id === form.partyId)?.name ?? "customer"}`,
      reference: form.reference || undefined,
      notes: form.notes || undefined,
      allocations: openInvoices
        .map((inv) => ({ invoiceId: inv.id, amount: round2(Number(alloc[inv.id]) || 0) }))
        .filter((a) => a.amount > 0),
    };
    setSaving(true);
    const result = store.addEntry(entry);
    if (!result.ok) {
      toast.error(result.message);
      setSaving(false);
      return;
    }
    toast.success(
      unallocated > 0
        ? `Payment saved · ${formatMoney(unallocated)} kept as advance.`
        : "Payment saved.",
    );
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={MODAL_CLASS}>
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-navy">Add payment</DialogTitle>
          <DialogDescription>
            One receipt creates one bank or cash entry. Unallocated amount becomes customer advance.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-5 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Date" required>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </FormField>
            <FormField label="Customer" required>
              <Select
                value={form.partyId}
                onValueChange={(v) => {
                  setForm({ ...form, partyId: v });
                  setAlloc({});
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Amount" required>
              <MoneyInput value={toNum(form.amount)} onChange={(n) => setForm({ ...form, amount: String(n) })} />
            </FormField>
            <FormField label="Bank / cash account" required>
              <Select value={form.account} onValueChange={(v) => setForm({ ...form, account: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Reference / UTR">
              <Input
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
              />
            </FormField>
            <FormField label="Notes (optional)">
              <Textarea
                rows={1}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </FormField>
          </div>

          <div className="rounded-xl border border-border p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="text-sm font-semibold text-navy">Invoice allocation</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!form.partyId || !(amount > 0)}
                onClick={autoAllocate}
              >
                Auto allocate
              </Button>
            </div>
            {!form.partyId ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Select a customer to see open invoices.
              </p>
            ) : !openInvoices.length ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No open invoices — the full amount will be kept as customer advance.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {openInvoices.map((inv) => {
                  const due = round2(inv.total - inv.paid);
                  return (
                    <div
                      key={inv.id}
                      className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-2 rounded-lg border border-border p-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-navy">{inv.number}</p>
                        <p className="num truncate text-[11px] text-muted-foreground">
                          {formatDate(inv.date)} · Pending {formatMoney(due)}
                        </p>
                      </div>
                      <MoneyInput className="h-9" value={toNum(alloc[inv.id])} onChange={(n) => setAlloc({ ...alloc, [inv.id]: String(n) })} />
                    </div>
                  );
                })}
              </div>
            )}
            <div className="num mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-sl-total-bg px-3 py-2 text-sm text-sl-total">
                Payment {formatMoney(amount)}
              </div>
              <div className="rounded-lg bg-sl-paid-bg px-3 py-2 text-sm text-sl-paid">
                Allocated {formatMoney(allocated)}
              </div>
              <div className="rounded-lg bg-sl-advance-bg px-3 py-2 text-sm text-sl-advance">
                Advance {formatMoney(unallocated)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 border-t border-border bg-card px-5 py-4">
          <Button disabled={saving} onClick={submit}>
            Save payment
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
