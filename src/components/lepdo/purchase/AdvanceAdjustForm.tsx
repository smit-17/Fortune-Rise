import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatMoney, round2 } from "@/lib/lepdo/format";
import { MoneyInput, toNum } from "@/components/lepdo/numeric";
import { useLepdo } from "@/lib/lepdo/store";
import { MODAL_CLASS } from "@/components/lepdo/sales/ui";

/** Explicitly adjusts an unallocated supplier advance against that supplier's open bills. */
export function AdvanceAdjustForm({
  open,
  paymentId,
  onClose,
}: {
  open: boolean;
  paymentId: string | null;
  onClose: () => void;
}) {
  const store = useLepdo();
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const tx = paymentId ? store.transactions.find((t) => t.id === paymentId) : undefined;
  const existing = useMemo(() => tx?.allocations ?? [], [tx]);
  const alreadyAdjusted = round2(existing.reduce((s, a) => s + a.amount, 0));
  const remaining = round2(Math.max(0, (tx?.amount ?? 0) - alreadyAdjusted));

  const openBills = useMemo(
    () => (tx?.partyId ? store.openInvoices("purchase", tx.partyId) : []),
    [store, tx?.partyId],
  );

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setAlloc({});
  }, [open, paymentId]);

  const adjusting = round2(Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0));

  function submit() {
    if (!tx || saving) return;
    const error = !(adjusting > 0)
      ? "Enter the amount to adjust."
      : adjusting > remaining
        ? "Adjustment cannot exceed the remaining advance."
        : openBills.find((b) => round2(Number(alloc[b.id]) || 0) > round2(b.total - b.paid))
          ? "An adjustment exceeds that bill's pending amount."
          : null;
    if (error) {
      toast.error(error);
      return;
    }
    const merged = new Map(existing.map((a) => [a.invoiceId, round2(a.amount)]));
    for (const b of openBills) {
      const add = round2(Number(alloc[b.id]) || 0);
      if (add > 0) merged.set(b.id, round2((merged.get(b.id) ?? 0) + add));
    }
    setSaving(true);
    const result = store.updateEntry(
      tx.id,
      {
        date: tx.date,
        sourceType: tx.sourceType,
        accountId: tx.accountId,
        direction: tx.direction,
        amount: round2(tx.amount),
        category: tx.category,
        partyId: tx.partyId,
        particulars: tx.particulars,
        reference: tx.reference,
        paymentMethod: tx.paymentMethod,
        notes: tx.notes,
        allocations: [...merged.entries()].map(([invoiceId, amount]) => ({ invoiceId, amount })),
      },
      `Advance ${formatMoney(adjusting)} adjusted against purchase bills`,
    );
    if (!result.ok) {
      toast.error(result.message);
      setSaving(false);
      return;
    }
    toast.success("Advance adjusted.");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={MODAL_CLASS}>
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-navy">Adjust advance</DialogTitle>
          <DialogDescription>
            Remaining advance {formatMoney(remaining)} · adjust against open bills only.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-5 py-5">
          {!openBills.length ? (
            <p className="text-sm text-muted-foreground">
              This supplier has no open bills to adjust against.
            </p>
          ) : (
            openBills.map((bill) => {
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
                    onChange={(n) => setAlloc({ ...alloc, [bill.id]: String(n) })}
                  />
                </div>
              );
            })
          )}
          <div className="num grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-sl-advance-bg px-3 py-2 text-sm text-sl-advance">
              Remaining advance {formatMoney(round2(Math.max(0, remaining - adjusting)))}
            </div>
            <div className="rounded-lg bg-sl-paid-bg px-3 py-2 text-sm text-sl-paid">
              Adjusting now {formatMoney(adjusting)}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 border-t border-border bg-card px-5 py-4">
          <Button disabled={saving || !openBills.length} onClick={submit}>
            Adjust advance
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
