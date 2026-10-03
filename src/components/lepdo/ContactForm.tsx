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
import { useLepdo } from "@/lib/lepdo/store";
import { FormField, MODAL_CLASS } from "@/components/lepdo/sales/ui";
import type { ContactKind } from "@/lib/lepdo/types";

const COPY: Record<ContactKind, { title: string; hint: string; rate: string; second: string }> = {
  broker: {
    title: "broker",
    hint: "Brokers are reused across purchase bills, broker-wise cards and reports.",
    rate: "Commission",
    second: "Company (optional)",
  },
  seller: {
    title: "seller",
    hint: "Sellers are reused across sales invoices, seller-wise cards and reports.",
    rate: "Incentive",
    second: "Role (optional)",
  },
};

export function ContactForm({
  open,
  kind,
  contactId,
  onClose,
  onSaved,
}: {
  open: boolean;
  kind: ContactKind;
  contactId: string | null;
  onClose: () => void;
  onSaved?: (name: string) => void;
}) {
  const store = useLepdo();
  const list = kind === "broker" ? store.brokers : store.sellers;
  const editing = contactId ? list.find((c) => c.id === contactId) : undefined;
  const copy = COPY[kind];

  const [form, setForm] = useState({
    name: "",
    phone: "",
    second: "",
    rateType: "percent" as "percent" | "fixed",
    rate: "",
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: editing?.name ?? "",
      phone: editing?.phone ?? "",
      second: (kind === "broker" ? editing?.company : editing?.role) ?? "",
      rateType: editing?.rateType ?? "percent",
      rate: editing?.rate != null ? String(editing.rate) : "",
      notes: editing?.notes ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contactId, kind]);

  function submit() {
    const rate = form.rate.trim() ? Number(form.rate) : undefined;
    if (rate != null && !Number.isFinite(rate)) {
      toast.error("Enter a valid rate or amount.");
      return;
    }
    const res = store.saveContact({
      id: editing?.id,
      kind,
      name: form.name,
      phone: form.phone.trim() || undefined,
      company: kind === "broker" ? form.second.trim() || undefined : undefined,
      role: kind === "seller" ? form.second.trim() || undefined : undefined,
      rateType: form.rateType,
      rate,
      notes: form.notes.trim() || undefined,
    });
    if (!res.ok || !res.contact) {
      toast.error(res.message);
      return;
    }
    toast.success(`${editing ? "Updated" : "Added"} ${copy.title} ${res.contact.name}.`);
    onSaved?.(res.contact.name);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={MODAL_CLASS}>
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-navy capitalize">
            {editing ? `Edit ${copy.title}` : `Add ${copy.title}`}
          </DialogTitle>
          <DialogDescription>{copy.hint}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label={`${copy.title === "broker" ? "Broker" : "Seller"} name`} required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FormField>
            <FormField label="Mobile number (optional)">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </FormField>
            <FormField label={copy.second}>
              <Input
                value={form.second}
                onChange={(e) => setForm({ ...form, second: e.target.value })}
              />
            </FormField>
            <FormField label={`${copy.rate} type`}>
              <Select
                value={form.rateType}
                onValueChange={(v) => setForm({ ...form, rateType: v as "percent" | "fixed" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              label={
                form.rateType === "percent"
                  ? `${copy.rate} rate % (optional)`
                  : `${copy.rate} amount (optional)`
              }
            >
              <Input
                inputMode="decimal"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
              />
            </FormField>
            <FormField label="Notes (optional)">
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </FormField>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-border bg-card px-5 py-4">
          <Button onClick={submit}>{editing ? "Save changes" : `Add ${copy.title}`}</Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
