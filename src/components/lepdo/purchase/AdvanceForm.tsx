import { useEffect, useState } from "react";
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
import { round2, todayISO } from "@/lib/lepdo/format";
import { MoneyInput, toNum } from "@/components/lepdo/numeric";
import { useLepdo } from "@/lib/lepdo/store";
import { FormField, MODAL_CLASS } from "@/components/lepdo/sales/ui";

/** Advance paid to a supplier with no bill attached — stays as supplier advance
 *  until it is explicitly adjusted against a bill. */
export function AdvanceForm({
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

  const amount = round2(Number(form.amount) || 0);

  function submit() {
    if (saving) return;
    const error = !form.partyId
      ? "Select the supplier."
      : !(amount > 0)
        ? "Amount must be greater than zero."
        : !form.account
          ? "Select the payment method."
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
      direction: "out" as const,
      amount,
      category: "purchase_payment" as const,
      partyId: form.partyId,
      particulars: `Advance to ${store.parties.find((p) => p.id === form.partyId)?.name ?? "supplier"}`,
      reference: form.reference || undefined,
      notes: form.notes || undefined,
      allocations: [],
    };
    if (store.isLikelyDuplicate(entry)) {
      toast.error("A matching advance already exists for this date, account, amount and reference.");
      return;
    }
    setSaving(true);
    const result = store.addEntry(entry);
    if (!result.ok) {
      toast.error(result.message);
      setSaving(false);
      return;
    }
    toast.success("Advance saved — it stays as supplier advance until adjusted to a bill.");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={MODAL_CLASS}>
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-navy">Add advance payment</DialogTitle>
          <DialogDescription>
            The full amount is tracked as supplier advance. Adjust it to a bill later.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Supplier" required>
              <Select
                value={form.partyId}
                onValueChange={(v) => setForm({ ...form, partyId: v })}
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
            <FormField label="Amount" required>
              <MoneyInput
                value={toNum(form.amount)}
                onChange={(n) => setForm({ ...form, amount: String(n) })}
              />
            </FormField>
            <FormField label="Payment date" required>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </FormField>
            <FormField label="Payment method" required>
              <Select value={form.account} onValueChange={(v) => setForm({ ...form, account: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Bank or cash" />
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
            <FormField label="Reference (optional)">
              <Input
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
              />
            </FormField>
            <FormField label="Note (optional)">
              <Textarea
                rows={1}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </FormField>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 border-t border-border bg-card px-5 py-4">
          <Button disabled={saving} onClick={submit}>
            Save advance
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
