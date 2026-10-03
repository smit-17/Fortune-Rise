import { useCallback, useEffect, useMemo, useState } from "react";
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
import { FormField, MODAL_CLASS } from "@/components/lepdo/sales/ui";

export function SupplierPaymentForm({
  open,
  presetSupplierId,
  onClose,
}: {
  open: boolean;
  presetSupplierId?: string | null;
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
  // While untouched, allocations follow the amount automatically (oldest bill first).
  const [allocTouched, setAllocTouched] = useState(false);
  // "yes" consumes the supplier's advance balance instead of a bank/cash account.
  const [payFromAdvance, setPayFromAdvance] = useState<"no" | "yes">("yes");

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setForm({
      date: todayISO(),
      partyId: presetSupplierId ?? "",
      amount: "",
      account: "",
      reference: "",
      notes: "",
    });
    setAlloc({});
    setAllocTouched(false);
    setPayFromAdvance("yes");
  }, [open, presetSupplierId]);

  const suppliers = store.parties.filter((p) => p.type === "supplier" || p.type === "other");
  const accounts = [
    ...store.bankAccounts
      .filter((b) => b.active)
      .map((b) => ({ value: `bank:${b.id}`, label: `${b.bankName} — ${b.nickname}` })),
    ...store.cashLocations
      .filter((c) => c.active)
      .map((c) => ({ value: `cash:${c.id}`, label: `${c.name} Cash` })),
  ];

  const openBills = useMemo(
    () => (form.partyId ? store.openInvoices("purchase", form.partyId) : []),
    [store, form.partyId],
  );

  // Supplier advance = unallocated part of their purchase payments, oldest first.
  const advanceTx = useMemo(
    () =>
      store.transactions
        .filter(
          (t) =>
            !t.voided &&
            t.category === "purchase_payment" &&
            t.direction === "out" &&
            t.partyId === form.partyId,
        )
        .map((tx) => ({
          tx,
          remaining: round2(
            tx.amount - (tx.allocations ?? []).reduce((s, a) => s + a.amount, 0),
          ),
        }))
        .filter((x) => x.remaining > 0)
        .sort((a, b) =>
          a.tx.date === b.tx.date
            ? a.tx.code.localeCompare(b.tx.code)
            : a.tx.date.localeCompare(b.tx.date),
        ),
    [store.transactions, form.partyId],
  );
  const advanceBalance = round2(advanceTx.reduce((s, x) => s + x.remaining, 0));

  const amount = round2(Number(form.amount) || 0);
  const allocated = round2(Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0));
  const unallocated = round2(Math.max(0, amount - allocated));

  // Only offer "Pay from advance" when the selected supplier has enough advance
  // balance to cover the entered amount. Otherwise fall back to a normal payment.
  const showPayFromAdvance = Boolean(form.partyId) && amount > 0 && advanceBalance >= amount;

  useEffect(() => {
    if (!showPayFromAdvance && payFromAdvance === "yes") {
      setPayFromAdvance("no");
    }
  }, [showPayFromAdvance, payFromAdvance]);

  const buildAuto = useCallback(
    (total: number, bills: typeof openBills) => {
      let left = total;
      const next: Record<string, string> = {};
      for (const bill of bills) {
        if (left <= 0) break;
        const due = round2(bill.total - bill.paid);
        const take = round2(Math.min(due, left));
        if (take > 0) next[bill.id] = String(take);
        left = round2(left - take);
      }
      return next;
    },
    [],
  );

  // Payments stay as supplier advance by default. Allocation against open bills
  // happens only when the user enters amounts or clicks "Auto allocate".

  function autoAllocate() {
    setAllocTouched(false);
    setAlloc(buildAuto(amount, openBills));
  }

  function submit() {
    if (saving) return;
    const fromAdvance = payFromAdvance === "yes";
    const error = !form.partyId
      ? "Select the supplier."
      : !(amount > 0)
        ? "Amount must be greater than zero."
        : fromAdvance && amount > advanceBalance
          ? `Advance balance is insufficient — only ${formatMoney(advanceBalance)} available.`
          : !fromAdvance && !form.account
            ? "Select the bank or cash account."
            : allocated > amount
              ? "Allocation cannot exceed the payment amount."
              : fromAdvance && allocated < amount
                ? "Allocate the full amount to open bills when paying from advance."
                : openBills.find((b) => round2(Number(alloc[b.id]) || 0) > round2(b.total - b.paid))
                  ? "An allocation exceeds that bill's pending amount."
                  : null;
    if (error) {
      toast.error(error);
      return;
    }

    // Pay from advance: no bank/cash debit — consume the supplier's advance
    // entries (oldest first) by allocating them to the selected bills.
    if (fromAdvance) {
      const needs = openBills
        .map((b) => ({ id: b.id, amount: round2(Number(alloc[b.id]) || 0) }))
        .filter((n) => n.amount > 0);
      setSaving(true);
      for (const adv of advanceTx) {
        if (needs.every((n) => n.amount <= 0)) break;
        let cap = adv.remaining;
        const merged = new Map(
          (adv.tx.allocations ?? []).map((a) => [a.invoiceId, round2(a.amount)]),
        );
        for (const n of needs) {
          if (cap <= 0) break;
          if (n.amount <= 0) continue;
          const take = round2(Math.min(cap, n.amount));
          merged.set(n.id, round2((merged.get(n.id) ?? 0) + take));
          n.amount = round2(n.amount - take);
          cap = round2(cap - take);
        }
        const result = store.updateEntry(
          adv.tx.id,
          {
            date: adv.tx.date,
            sourceType: adv.tx.sourceType,
            accountId: adv.tx.accountId,
            direction: adv.tx.direction,
            amount: round2(adv.tx.amount),
            category: adv.tx.category,
            partyId: adv.tx.partyId,
            particulars: adv.tx.particulars,
            reference: adv.tx.reference,
            paymentMethod: adv.tx.paymentMethod,
            notes: adv.tx.notes,
            allocations: [...merged.entries()].map(([invoiceId, amt]) => ({
              invoiceId,
              amount: amt,
            })),
          },
          `Advance ${formatMoney(amount)} used for supplier payment`,
        );
        if (!result.ok) {
          toast.error(result.message);
          setSaving(false);
          return;
        }
      }
      toast.success(`Payment of ${formatMoney(amount)} made from supplier advance.`);
      onClose();
      return;
    }

    const [sourceType, accountId] = form.account.split(":") as ["bank" | "cash", string];
    const entry = {
      date: form.date,
      sourceType,
      accountId,
      direction: "out" as const,
      amount,
      category: "purchase_payment" as const,
      partyId: form.partyId,
      particulars: `Purchase payment to ${store.parties.find((p) => p.id === form.partyId)?.name ?? "supplier"}`,
      reference: form.reference || undefined,
      notes: form.notes || undefined,
      allocations: openBills
        .map((b) => ({ invoiceId: b.id, amount: round2(Number(alloc[b.id]) || 0) }))
        .filter((a) => a.amount > 0),
    };
    if (store.isLikelyDuplicate(entry)) {
      toast.error(
        "A matching payment already exists for this date, account, amount and reference.",
      );
      return;
    }
    setSaving(true);
    const result = store.addEntry(entry);
    if (!result.ok) {
      toast.error(result.message);
      setSaving(false);
      return;
    }
    toast.success(
      unallocated > 0
        ? `Payment saved · ${formatMoney(unallocated)} kept as supplier advance.`
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
            One payment creates one bank or cash debit. Unallocated amount becomes supplier advance.
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
            <FormField label="Supplier" required>
              <Select
                value={form.partyId}
                onValueChange={(v) => {
                  setForm({ ...form, partyId: v });
                  setAlloc({});
                  setAllocTouched(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            {showPayFromAdvance && (
              <FormField label="Pay from advance">
                <Select
                  value={payFromAdvance}
                  onValueChange={(v) => setPayFromAdvance(v as "no" | "yes")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
                {form.partyId && (
                  <p className="num mt-1 text-[11px] text-muted-foreground">
                    Available advance: {formatMoney(advanceBalance)}
                  </p>
                )}
              </FormField>
            )}
            <FormField label="Amount" required>
              <MoneyInput value={toNum(form.amount)} onChange={(n) => setForm({ ...form, amount: String(n) })} />
            </FormField>
            <FormField
              label={payFromAdvance === "yes" ? "Bank / cash account (not used)" : "Bank / cash account"}
              required={payFromAdvance !== "yes"}
            >
              <Select
                value={form.account}
                onValueChange={(v) => setForm({ ...form, account: v })}
                disabled={payFromAdvance === "yes"}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      payFromAdvance === "yes" ? "Paid from advance balance" : "Select account"
                    }
                  />
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
              <p className="text-sm font-semibold text-navy">Bill allocation</p>
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
                Select a supplier to see open bills.
              </p>
            ) : !openBills.length ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No open bills — the full amount will be kept as supplier advance.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {openBills.map((bill) => {
                  const due = round2(bill.total - bill.paid);
                  return (
                    <div
                      key={bill.id}
                      className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-2 rounded-lg border border-border p-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-navy">{bill.number}</p>
                        <p className="num truncate text-[11px] text-muted-foreground">
                          {formatDate(bill.date)} · Pending {formatMoney(due)}
                        </p>
                      </div>
                      <MoneyInput
                        className="h-9"
                        value={toNum(alloc[bill.id])}
                        onChange={(n) => {
                          setAllocTouched(true);
                          setAlloc({ ...alloc, [bill.id]: String(n) });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <div className="num mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-pu-total-bg px-3 py-2 text-sm text-pu-total">
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
