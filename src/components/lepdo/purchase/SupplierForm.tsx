import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLepdo } from "@/lib/lepdo/store";
import { FormField, MODAL_CLASS } from "@/components/lepdo/sales/ui";

export function SupplierForm({
  open,
  supplierId,
  onClose,
  onSaved,
}: {
  open: boolean;
  supplierId: string | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const store = useLepdo();
  const editing = supplierId ? store.parties.find((p) => p.id === supplierId) : undefined;
  const [form, setForm] = useState({
    name: "",
    company: "",
    phone: "",
    email: "",
    billingAddress: "",
    city: "",
    country: "India",
    gstin: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: editing?.name ?? "",
      company: editing?.company ?? "",
      phone: editing?.phone ?? "",
      email: editing?.email ?? "",
      billingAddress: editing?.billingAddress ?? "",
      city: editing?.city ?? "",
      country: editing?.country ?? "India",
      gstin: editing?.gstin ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supplierId]);

  function submit() {
    if (!form.name.trim()) {
      toast.error("Supplier name is required.");
      return;
    }
    const party = store.saveCustomer({
      id: editing?.id,
      type: "supplier",
      name: form.name,
      company: form.company || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      billingAddress: form.billingAddress || undefined,
      city: form.city || undefined,
      country: form.country || undefined,
      gstin: form.gstin || undefined,
    });
    toast.success(editing ? "Supplier updated." : "Supplier added.");
    onSaved?.(party.id);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={MODAL_CLASS}>
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-navy">
            {editing ? "Edit supplier" : "Add supplier"}
          </DialogTitle>
          <DialogDescription>
            Supplier details are reused on every bill and payable report.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Supplier name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FormField>
            <FormField label="Company (optional)">
              <Input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
              />
            </FormField>
            <FormField label="Mobile (optional)">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </FormField>
            <FormField label="Email (optional)">
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </FormField>
            <FormField label="Address">
              <Input
                value={form.billingAddress}
                onChange={(e) => setForm({ ...form, billingAddress: e.target.value })}
              />
            </FormField>
            <FormField label="City / State">
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </FormField>
            <FormField label="Country">
              <Input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </FormField>
            <FormField label="GST number (optional)">
              <Input
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value })}
              />
            </FormField>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-border bg-card px-5 py-4">
          <Button onClick={submit}>{editing ? "Save changes" : "Add supplier"}</Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
