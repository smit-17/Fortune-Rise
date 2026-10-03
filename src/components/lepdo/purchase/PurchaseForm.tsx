import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronsUpDown, Copy, Pencil, Plus, Trash2 } from "lucide-react";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatMoney, round2, todayISO, uid } from "@/lib/lepdo/format";
import { addDays } from "@/lib/lepdo/purchase";
import { downloadBillPdf } from "@/lib/lepdo/purchaseReport";
import { useLepdo } from "@/lib/lepdo/store";
import { masterOptions } from "@/lib/lepdo/masters";
import type {
  DiscountMode,
  Invoice,
  InvoiceLine,
  MakingLine,
  Party,
  PurchaseType,
  SupplyLocation,
} from "@/lib/lepdo/types";
import {
  CellLabel,
  ColHead,
  FormField,
  WIDE_MODAL_CLASS,
} from "@/components/lepdo/sales/ui";
import { MasterCombo } from "@/components/lepdo/shared";
import { ContactPicker } from "@/components/lepdo/ContactPicker";
import { SupplierForm } from "@/components/lepdo/purchase/SupplierForm";
import { AutoManual, ManualBadge, MoneyInput, NumInput, toNum } from "@/components/lepdo/numeric";

type BillKind = "diamond" | "jewelry_making";
type PayMode = "pending" | "paid" | "part" | "advance";

/** A calculated amount that can be manually overridden, with a required reason when manual. */
interface Override {
  manual: number | undefined;
  reason: string;
}
const emptyOverride = (): Override => ({ manual: undefined, reason: "" });

const emptyLine = (): InvoiceLine => ({
  id: uid("ln"),
  description: "",
  quantity: 1,
  pcs: 1,
  carat: 0,
  rate: 0,
  rateUsd: 0,
  total: 0,
});

const emptyMaking = (): MakingLine => ({
  id: uid("mk"),
  description: "",
  quantity: 0,
  grossWeight: 0,
  netWeight: 0,
  diamondWeight: 0,
  makingRate: 0,
  total: 0,
  sku: undefined,
  stoneWeight: undefined,
  stoneAmount: undefined,
  makingRatePerGram: undefined,
  totalMaking: undefined,
});

const n = toNum;

/** Searchable supplier dropdown with inline add / edit — mirrors ContactPicker for parties. */
function SupplierPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const store = useLepdo();
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const suppliers = store.parties.filter((p) => p.type === "supplier" || p.type === "other");
  const selected = suppliers.find((p) => p.id === value);

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              className="h-10 min-w-0 justify-between font-normal"
            >
              <span className={cn("truncate", !selected && "text-muted-foreground")}>
                {selected?.name || "Select or search supplier"}
              </span>
              <ChevronsUpDown className="ml-1 size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(320px,calc(100vw-2rem))] p-0">
            <Command>
              <CommandInput placeholder="Type to search supplier" />
              <CommandList>
                <CommandEmpty>No supplier found.</CommandEmpty>
                <CommandGroup heading="Suppliers">
                  {suppliers.map((p: Party) => (
                    <CommandItem
                      key={p.id}
                      value={p.name}
                      onSelect={() => {
                        onChange(p.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn("mr-2 size-4", p.id === value ? "opacity-100" : "opacity-0")}
                      />
                      <span className="min-w-0 truncate">{p.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup>
                  <CommandItem
                    value="__add_supplier"
                    onSelect={() => {
                      setOpen(false);
                      setEditId(null);
                      setFormOpen(true);
                    }}
                  >
                    <Plus className="mr-2 size-4" /> Add Supplier
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          size="icon"
          variant="outline"
          title="Add supplier"
          onClick={() => {
            setEditId(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          title="Edit supplier"
          disabled={!value}
          onClick={() => {
            if (!value) return;
            setEditId(value);
            setFormOpen(true);
          }}
        >
          <Pencil className="size-4" />
        </Button>
      </div>
      <SupplierForm
        open={formOpen}
        supplierId={editId}
        onClose={() => setFormOpen(false)}
        onSaved={(id) => onChange(id)}
      />
    </>
  );
}

/** Compact action buttons shown on every item row (desktop + mobile). */
function RowActions({
  expanded,
  onToggle,
  onCopy,
  onDelete,
}: {
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <Button type="button" size="icon" variant="ghost" title="Edit" className="sm:hidden" onClick={onToggle}>
        <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
      </Button>
      <Button type="button" size="icon" variant="ghost" title="Edit" className="hidden sm:inline-flex" onClick={onToggle}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button type="button" size="icon" variant="ghost" title="Copy this item" onClick={onCopy}>
        <Copy className="h-4 w-4" />
      </Button>
      <Button type="button" size="icon" variant="ghost" title="Delete item" onClick={onDelete}>
        <Trash2 className="h-4 w-4 text-neg" />
      </Button>
    </div>
  );
}

export function PurchaseForm({
  open,
  billId,
  onClose,
  onAddSupplier: _onAddSupplier,
  onEditSupplier: _onEditSupplier,
}: {
  open: boolean;
  billId: string | null;
  onClose: () => void;
  onAddSupplier: () => void;
  onEditSupplier: (id: string) => void;
}) {
  const store = useLepdo();
  const editing = billId ? store.purchaseBills.find((b) => b.id === billId) : undefined;

  const purchaseTypeOptions = masterOptions(store.masters, "purchaseTypes");
  const purchaseTypeId = (label: string): PurchaseType => {
    const l = label.toLowerCase();
    if (l.includes("non")) return "non_gst";
    if (l.includes("import")) return "import";
    return "gst";
  };
  const taxSlabOptions = masterOptions(store.masters, "taxSlabs");

  const [kind, setKind] = useState<BillKind>("diamond");
  const [head, setHead] = useState({
    number: "",
    date: todayISO(),
    dueDays: 0,
    partyId: "",
    broker: "",
    supplierInvoiceNumber: "",
    usdRate: 0,
    notes: "",
    purchaseType: "non_gst" as PurchaseType,
    supplyLocation: "inside" as SupplyLocation,
    taxSlab: "0",
    discountMode: "fixed" as DiscountMode,
    discountValue: 0,
  });
  const [lines, setLines] = useState<InvoiceLine[]>([emptyLine()]);
  const [making, setMaking] = useState<MakingLine[]>([emptyMaking()]);
  const [payMode, setPayMode] = useState<PayMode>("pending");
  const [pay, setPay] = useState({
    amount: 0,
    date: todayISO(),
    account: "",
    reference: "",
    method: "",
  });
  // "yes" consumes the supplier's advance balance instead of a bank/cash account.
  const [payFromAdvance, setPayFromAdvance] = useState<"no" | "yes">("yes");
  const [saving, setSaving] = useState(false);

  // Manual overrides — row totals + summary amounts.
  const [makingOv, setMakingOv] = useState<Record<string, Override>>({});
  const [subtotalOv, setSubtotalOv] = useState<Override>(emptyOverride());
  const [discountOv, setDiscountOv] = useState<Override>(emptyOverride());
  const [shippingOv, setShippingOv] = useState<Override>(emptyOverride());
  const [roundOffOv, setRoundOffOv] = useState<Override>(emptyOverride());
  const [grandOv, setGrandOv] = useState<Override>(emptyOverride());
  const [paidOv, setPaidOv] = useState<Override>(emptyOverride());

  // Mobile collapsible-card expand state, keyed by row id.
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const toggleRow = (id: string) => setExpandedRows((p) => ({ ...p, [id]: !p[id] }));

  const accounts = [
    ...store.bankAccounts
      .filter((b) => b.active)
      .map((b) => ({ value: `bank:${b.id}`, label: `${b.bankName} — ${b.nickname}` })),
    ...store.cashLocations
      .filter((c) => c.active)
      .map((c) => ({ value: `cash:${c.id}`, label: `${c.name} Cash` })),
  ];
  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setPayMode("pending");
    setPay({ amount: 0, date: todayISO(), account: "", reference: "", method: "" });
    setPayFromAdvance("yes");
    setMakingOv({});
    setSubtotalOv(emptyOverride());
    setDiscountOv(emptyOverride());
    setShippingOv(emptyOverride());
    setGrandOv(emptyOverride());
    setPaidOv(emptyOverride());
    setExpandedRows({});
    if (editing) {
      setKind(((editing.billKind === "jewelry_making" ? "jewelry_making" : "diamond")) as BillKind);
      setHead({
        number: editing.number,
        date: editing.date,
        dueDays: editing.dueDays ?? 0,
        partyId: editing.partyId,
        broker: editing.brokerName ?? "",
        supplierInvoiceNumber: editing.supplierInvoiceNumber ?? "",
        usdRate: editing.usdRate ?? 0,
        notes: editing.notes ?? "",
        purchaseType: editing.purchaseType ?? "non_gst",
        supplyLocation: editing.supplyLocation ?? "inside",
        taxSlab: editing.igstAmount ? "" : "0",
        discountMode: editing.discountMode ?? "fixed",
        discountValue: editing.discountValue ?? 0,
      });
      setLines(
        (editing.lines ?? []).length
          ? (editing.lines ?? []).map((l) => ({
              ...l,
              pcs: l.pcs ?? 1,
              total: l.total ?? round2(n(l.carat) * n(l.rate)),
            }))
          : [emptyLine()],
      );
      setMaking(
        (editing.makingLines ?? []).length ? [...(editing.makingLines ?? [])] : [emptyMaking()],
      );
    } else {
      setKind("diamond");
      setHead({
        number: store.nextPurchaseBillNumber(),
        date: todayISO(),
        dueDays: 0,
        partyId: "",
        broker: "",
        supplierInvoiceNumber: "",
        usdRate: 0,
        notes: "",
        purchaseType: "non_gst",
        supplyLocation: "inside",
        taxSlab: "0",
        discountMode: "fixed",
        discountValue: 0,
      });
      setLines([emptyLine()]);
      setMaking([emptyMaking()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, billId]);

  const usdRate = head.usdRate;
  const isGst = head.purchaseType === "gst";

  const diamondRows = useMemo(
    () =>
      lines.map((l) => {
        const inr = round2(n(l.rateUsd) > 0 && usdRate > 0 ? n(l.rateUsd) * usdRate : n(l.rate));
        const total = round2(n(l.total));
        return { line: l, inr, total };
      }),
    [lines, usdRate],
  );
  const makingRows = useMemo(
    () =>
      making.map((m) => {
        const perGram = n(m.makingRatePerGram) || n(m.makingRate);
        const totalMaking =
          n(m.totalMaking) > 0 ? round2(n(m.totalMaking)) : round2(n(m.netWeight) * perGram);
        const auto = round2(totalMaking + n(m.stoneAmount));
        const ov = makingOv[m.id];
        const total = ov?.manual !== undefined ? round2(ov.manual) : auto;
        return { line: m, perGram, totalMaking, auto, total };
      }),
    [making, makingOv],
  );

  const totalCt = round2(diamondRows.reduce((s, r) => s + n(r.line.carat), 0));
  const subtotalAuto = round2(
    kind === "diamond"
      ? diamondRows.reduce((s, r) => s + r.total, 0)
      : makingRows.reduce((s, r) => s + r.total, 0),
  );
  const subtotal = subtotalOv.manual !== undefined ? round2(subtotalOv.manual) : subtotalAuto;

  const discountValue = head.discountValue;
  const discountAuto = round2(
    head.discountMode === "percent" ? (subtotal * discountValue) / 100 : discountValue,
  );
  const discountAmount = discountOv.manual !== undefined ? round2(discountOv.manual) : discountAuto;
  const shippingAmount = shippingOv.manual !== undefined ? round2(shippingOv.manual) : 0;
  const roundOffAmount = roundOffOv.manual !== undefined ? round2(roundOffOv.manual) : 0;
  const taxableAmount = round2(Math.max(0, subtotal - discountAmount));
  const taxRate = n(head.taxSlab);
  const cgstAmount = isGst && head.supplyLocation === "inside" ? round2((taxableAmount * taxRate) / 200) : 0;
  const sgstAmount = cgstAmount;
  const igstAmount = isGst && head.supplyLocation === "outside" ? round2((taxableAmount * taxRate) / 100) : 0;
  const grandTotalAuto = round2(
    taxableAmount + cgstAmount + sgstAmount + igstAmount + shippingAmount + roundOffAmount,
  );
  const grandTotal = grandOv.manual !== undefined ? round2(grandOv.manual) : grandTotalAuto;

  const payAmountAuto = round2(
    payMode === "paid" ? grandTotal : payMode === "pending" ? 0 : pay.amount,
  );
  const payAmount = paidOv.manual !== undefined ? round2(paidOv.manual) : payAmountAuto;

  // Supplier advance = unallocated part of their purchase payments, oldest first.
  const advanceTx = useMemo(
    () =>
      store.transactions
        .filter(
          (t) =>
            !t.voided &&
            t.category === "purchase_payment" &&
            t.direction === "out" &&
            t.partyId === head.partyId,
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
    [store.transactions, head.partyId],
  );
  const advanceBalance = round2(advanceTx.reduce((s, x) => s + x.remaining, 0));

  // Offer "Pay from advance" for Paid / Part Paid when the balance covers the amount.
  const showPayFromAdvance =
    Boolean(head.partyId) &&
    (payMode === "paid" || payMode === "part") &&
    payAmount > 0 &&
    advanceBalance >= payAmount;
  const fromAdvance = showPayFromAdvance && payFromAdvance === "yes";

  useEffect(() => {
    if (!showPayFromAdvance && payFromAdvance === "yes") {
      setPayFromAdvance("no");
    }
  }, [showPayFromAdvance, payFromAdvance]);

  const allocatedNow = round2(Math.min(payAmount, grandTotal));
  const advanceNow = round2(Math.max(0, payAmount - grandTotal));
  const pendingNow = round2(Math.max(0, grandTotal - allocatedNow));

  const dueDaysNum = head.dueDays;
  const hasDueDays = Number.isFinite(dueDaysNum) && dueDaysNum > 0;
  const fullyPaidSameDay =
    payMode !== "pending" && allocatedNow >= grandTotal && pay.date === head.date;
  const dueDate =
    hasDueDays && !fullyPaidSameDay ? addDays(head.date, dueDaysNum) : head.date;

  function patchLine(id: string, patch: Partial<InvoiceLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function patchMaking(id: string, patch: Partial<MakingLine>) {
    setMaking((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  // Collect every active manual override so we can require a reason and log it.
  const activeOverrides = useMemo(() => {
    const list: { label: string; ov: Override; auto: number }[] = [];
    if (subtotalOv.manual !== undefined) list.push({ label: "Subtotal", ov: subtotalOv, auto: subtotalAuto });
    if (discountOv.manual !== undefined) list.push({ label: "Discount", ov: discountOv, auto: discountAuto });
    if (shippingOv.manual !== undefined) list.push({ label: "Shipping / other", ov: shippingOv, auto: 0 });
    if (roundOffOv.manual !== undefined) list.push({ label: "Round-off", ov: roundOffOv, auto: 0 });
    if (grandOv.manual !== undefined) list.push({ label: "Grand total", ov: grandOv, auto: grandTotalAuto });
    if (paidOv.manual !== undefined) list.push({ label: "Paid amount", ov: paidOv, auto: payAmountAuto });
    return list;
  }, [
    diamondRows,
    subtotalOv,
    discountOv,
    shippingOv,
    roundOffOv,
    grandOv,
    paidOv,
    subtotalAuto,
    discountAuto,
    grandTotalAuto,
    payAmountAuto,
  ]);

  function buildMakingLines(): MakingLine[] {
    return makingRows.map((r) => ({
      id: r.line.id,
      description: r.line.description,
      quantity: n(r.line.quantity),
      grossWeight: n(r.line.grossWeight),
      netWeight: n(r.line.netWeight),
      diamondWeight: n(r.line.diamondWeight),
      makingRate: r.perGram,
      total: r.total,
      sku: r.line.sku?.trim() || undefined,
      stoneWeight: r.line.stoneWeight,
      stoneAmount: r.line.stoneAmount,
      makingRatePerGram: r.perGram || undefined,
      totalMaking: r.totalMaking || undefined,
    }));
  }

  function save(andPdf: boolean) {
    if (saving) return;
    const rowsFilled =
      kind === "diamond"
        ? diamondRows.filter((r) => r.line.description.trim() || r.total > 0)
        : makingRows.filter((r) => r.line.description.trim() || r.total > 0);
    if (!rowsFilled.length) {
      toast.error("Add at least one item with a description or amount.");
      return;
    }
    if (!head.partyId) {
      toast.error("Select the supplier.");
      return;
    }
    if (isGst && !head.supplyLocation) {
      toast.error("Select the supply location for GST purchases.");
      return;
    }
    if (payMode !== "pending" && !fromAdvance && !pay.account) {
      toast.error("Select the bank or cash account for the payment.");
      return;
    }
    if (fromAdvance && payAmount > advanceBalance) {
      toast.error(
        `Advance balance is insufficient — only ${formatMoney(advanceBalance)} available.`,
      );
      return;
    }
    if ((payMode === "part" || payMode === "advance") && !(payAmount > 0)) {
      toast.error("Enter the amount paid.");
      return;
    }
    const missingReason = activeOverrides.find((o) => !o.ov.reason.trim());
    if (missingReason) {
      toast.error(`Enter a reason for the manual "${missingReason.label}" adjustment.`);
      return;
    }

    setSaving(true);
    const overrideNote = activeOverrides.length
      ? `Manual overrides — ${activeOverrides
          .map((o) => `${o.label}: ${formatMoney(round2(o.ov.manual ?? 0))} (was ${formatMoney(o.auto)}) — ${o.ov.reason.trim()}`)
          .join("; ")}`
      : "";
    const notes = [head.notes.trim(), overrideNote].filter(Boolean).join("\n");

    const result = store.savePurchaseBill({
      id: editing?.id,
      number: head.number.trim(),
      partyId: head.partyId,
      date: head.date,
      dueDate,
      paymentTermsDays: hasDueDays ? dueDaysNum : undefined,
      brokerName: head.broker.trim() || undefined,
      supplierInvoiceNumber: head.supplierInvoiceNumber.trim() || undefined,
      billKind: kind,
      usdRate: kind === "diamond" && usdRate > 0 ? usdRate : undefined,
      dueDays: hasDueDays ? dueDaysNum : undefined,
      purchaseType: head.purchaseType,
      discountMode: head.discountMode,
      discountValue: discountValue || undefined,
      supplyLocation: isGst ? head.supplyLocation : undefined,
      gstRate: isGst ? taxRate : undefined,
      cgstAmount: isGst ? cgstAmount || undefined : undefined,
      sgstAmount: isGst ? sgstAmount || undefined : undefined,
      igstAmount: isGst ? igstAmount || undefined : undefined,
      lines:
        kind === "diamond"
          ? diamondRows.map((r) => ({
              id: r.line.id,
              description: r.line.description,
              quantity: 1,
              pcs: n(r.line.pcs) || undefined,
              carat: n(r.line.carat),
              rate: r.inr,
              rateUsd: n(r.line.rateUsd) || undefined,
              total: r.total,
            }))
          : [],
      makingLines: kind === "jewelry_making" ? buildMakingLines() : [],
      subtotal,
      discount: discountAmount || undefined,
      taxableAmount,
      taxAmount: round2(cgstAmount + sgstAmount + igstAmount) || undefined,
      total: grandTotal,
      notes: notes || undefined,
    });
    if (!result.ok) {
      toast.error(result.message);
      setSaving(false);
      return;
    }

    // Pay from advance: no bank/cash debit — consume the supplier's advance
    // entries (oldest first) by allocating them to this bill.
    if (fromAdvance && allocatedNow > 0 && result.id) {
      let left = allocatedNow;
      for (const adv of advanceTx) {
        if (left <= 0) break;
        const take = round2(Math.min(adv.remaining, left));
        const merged = new Map(
          (adv.tx.allocations ?? []).map((a) => [a.invoiceId, round2(a.amount)]),
        );
        merged.set(result.id, round2((merged.get(result.id) ?? 0) + take));
        const upd = store.updateEntry(
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
          `Advance ${formatMoney(take)} used for purchase bill ${head.number.trim()}`,
        );
        if (!upd.ok) {
          toast.error(upd.message);
          break;
        }
        left = round2(left - take);
      }
    } else if (payMode !== "pending" && payAmount > 0 && result.id) {
      const [sourceType, accountId] = pay.account.split(":") as ["bank" | "cash", string];
      const entry = {
        date: pay.date,
        sourceType,
        accountId,
        direction: "out" as const,
        amount: payAmount,
        category: "purchase_payment" as const,
        partyId: head.partyId,
        particulars: `Purchase payment — ${head.number.trim()}`,
        reference: pay.reference || undefined,
        paymentMethod: pay.method || undefined,
        allocations: allocatedNow > 0 ? [{ invoiceId: result.id, amount: allocatedNow }] : [],
      };
      if (store.isLikelyDuplicate(entry)) {
        toast.error(
          "A matching payment already exists for this date, account, amount and reference.",
        );
      } else {
        const posted = store.addEntry(entry);
        if (!posted.ok) toast.error(posted.message);
      }
    }

    toast.success(
      advanceNow > 0
        ? `Bill saved · ${formatMoney(advanceNow)} kept as supplier advance.`
        : editing
          ? "Bill updated."
          : "Bill saved.",
    );

    if (andPdf) {
      const supplierName = store.parties.find((p) => p.id === head.partyId)?.name ?? "Supplier";
      const pdfBill: Invoice = {
        id: result.id ?? "tmp",
        number: head.number.trim(),
        partyId: head.partyId,
        date: head.date,
        dueDate: dueDate !== head.date ? dueDate : undefined,
        dueDays: hasDueDays ? dueDaysNum : undefined,
        total: grandTotal,
        paid: allocatedNow,
        billKind: kind,
        brokerName: head.broker.trim() || undefined,
        supplierInvoiceNumber: head.supplierInvoiceNumber.trim() || undefined,
        usdRate: usdRate || undefined,
        subtotal,
        discountMode: head.discountMode,
        discountValue: discountAmount || undefined,
        discount: discountAmount || undefined,
        purchaseType: head.purchaseType,
        supplyLocation: isGst ? head.supplyLocation : undefined,
        taxableAmount,
        cgstAmount: cgstAmount || undefined,
        sgstAmount: sgstAmount || undefined,
        igstAmount: igstAmount || undefined,
        taxAmount: round2(cgstAmount + sgstAmount + igstAmount),
        gstType: isGst ? (head.supplyLocation === "outside" ? "igst" : "cgst_sgst") : "non_gst",
        gstRate: isGst ? taxRate : undefined,
        shipping: shippingAmount || undefined,
        roundOff: roundOffAmount || undefined,
        notes: notes || undefined,
        lines: kind === "diamond" ? diamondRows.map((r) => ({ ...r.line, rate: r.inr })) : [],
        makingLines: kind === "jewelry_making" ? buildMakingLines() : [],
      };
      downloadBillPdf(pdfBill, supplierName);
    }
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={WIDE_MODAL_CLASS}>
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-navy">
            {editing ? "Edit purchase bill" : "Add purchase"}
          </DialogTitle>
          <DialogDescription>
          Enter each item total manually. This bill stays in the Purchase section only.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-5 py-5">
          {/* bill type */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "diamond", label: "Diamond Purchase Invoice" },
                { id: "jewelry_making", label: "Jewelry Making Bill" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setKind(t.id)}
                className={
                  "rounded-xl border p-3 text-left text-sm font-medium transition " +
                  (kind === t.id
                    ? "border-gold bg-pu-total-bg text-pu-total"
                    : "border-border text-muted-foreground hover:bg-muted")
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* common fields */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="Bill number" required>
              <Input
                value={head.number}
                onChange={(e) => setHead({ ...head, number: e.target.value })}
              />
            </FormField>
            <FormField label="Invoice date" required>
              <Input
                type="date"
                value={head.date}
                onChange={(e) => setHead({ ...head, date: e.target.value })}
              />
            </FormField>
            <FormField label="Payment due days">
              <NumInput
                decimals={0}
                placeholder="e.g. 30"
                value={head.dueDays}
                onChange={(v) => setHead({ ...head, dueDays: v })}
              />
            </FormField>
            <FormField label="Due date" hint="Auto-calculated: invoice date + due days">
              <Input type="date" readOnly value={dueDate} className="bg-muted" />
            </FormField>
            <FormField label="Supplier" required>
              <SupplierPicker
                value={head.partyId}
                onChange={(id) => setHead({ ...head, partyId: id })}
              />
            </FormField>
            <FormField label="Broker">
              <ContactPicker
                kind="broker"
                value={head.broker}
                onChange={(v) => setHead({ ...head, broker: v })}
              />
            </FormField>
            <FormField label="Supplier invoice number">
              <Input
                value={head.supplierInvoiceNumber}
                onChange={(e) => setHead({ ...head, supplierInvoiceNumber: e.target.value })}
              />
            </FormField>
            <FormField label="Purchase type">
              <Select
                value={head.purchaseType}
                onValueChange={(v) => setHead({ ...head, purchaseType: v as PurchaseType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(purchaseTypeOptions.length
                    ? purchaseTypeOptions
                    : ["Non-GST", "GST", "Import"]
                  ).map((o) => (
                    <SelectItem key={o} value={purchaseTypeId(o)}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            {isGst ? (
              <>
                <FormField label="Supply location" required>
                  <Select
                    value={head.supplyLocation}
                    onValueChange={(v) => setHead({ ...head, supplyLocation: v as SupplyLocation })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inside">Inside Gujarat</SelectItem>
                      <SelectItem value="outside">Outside Gujarat</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Tax slab (%)" required>
                  <Select
                    value={head.taxSlab}
                    onValueChange={(v) => setHead({ ...head, taxSlab: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {taxSlabOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </>
            ) : null}
            {kind === "diamond" ? (
              <FormField
                label="USD conversion rate"
                hint="Optional — leave blank to enter INR rates directly"
              >
                <NumInput value={head.usdRate} onChange={(v) => setHead({ ...head, usdRate: v })} />
              </FormField>
            ) : null}
            <FormField label="Notes (optional)">
              <Textarea
                rows={1}
                value={head.notes}
                onChange={(e) => setHead({ ...head, notes: e.target.value })}
              />
            </FormField>
          </div>

          {/* items */}
          <div className="rounded-xl border border-border p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="text-sm font-semibold text-navy">
                {kind === "diamond" ? "Diamond items" : "Jewelry making items"}
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    kind === "diamond"
                      ? setLines((p) => [...p, emptyLine()])
                      : setMaking((p) => [...p, emptyMaking()])
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> Add Item
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    kind === "diamond"
                      ? setLines((p) =>
                          p.length ? [...p, { ...p[p.length - 1]!, id: uid("ln") }] : [emptyLine()],
                        )
                      : setMaking((p) =>
                          p.length
                            ? [...p, { ...p[p.length - 1]!, id: uid("mk") }]
                            : [emptyMaking()],
                        )
                  }
                >
                  <Copy className="mr-1 h-4 w-4" /> Copy This Item
                </Button>
              </div>
            </div>

            {kind === "diamond" ? (
              <div className="mt-3 overflow-x-auto">
                <div className="min-w-[800px] space-y-2 sm:min-w-0">
                  <div className="hidden items-center gap-2 px-2 sm:grid sm:grid-cols-[32px_minmax(0,1fr)_60px_90px_100px_100px_110px_96px]">
                    <ColHead label="Sr." />
                    <ColHead label="Description" />
                    <ColHead label="PCS" className="text-right" />
                    <ColHead label="CT" className="text-right" />
                    <ColHead label="Price/CT USD" className="text-right" />
                    <ColHead label="Price/CT INR" className="text-right" />
                    <ColHead label="Total INR" className="text-right" />
                    <ColHead label="Actions" className="text-right" />
                  </div>
                  {diamondRows.map((r, i) => {
                    const expanded = expandedRows[r.line.id] ?? false;
                    const usdDriven = n(r.line.rateUsd) > 0 && usdRate > 0;
                    return (
                      <div
                        key={r.line.id}
                        className="rounded-lg border border-border p-2 sm:grid sm:grid-cols-[32px_minmax(0,1fr)_60px_90px_100px_100px_110px_96px] sm:items-center sm:gap-2"
                      >
                        <div className="flex items-center justify-between sm:contents">
                          <span className="num text-xs text-muted-foreground sm:text-sm">{i + 1}</span>
                          <div className="sm:hidden">
                            <RowActions
                              expanded={expanded}
                              onToggle={() => toggleRow(r.line.id)}
                              onCopy={() =>
                                setLines((p) => [...p, { ...r.line, id: uid("ln") }])
                              }
                              onDelete={() =>
                                setLines((p) => (p.length > 1 ? p.filter((l) => l.id !== r.line.id) : p))
                              }
                            />
                          </div>
                        </div>
                        <div
                          className={cn(
                            "mt-2 grid grid-cols-2 gap-2 sm:mt-0 sm:contents",
                            !expanded && "hidden sm:contents",
                          )}
                        >
                          <div className="col-span-2 min-w-0 sm:col-span-1">
                            <CellLabel label="Description" />
                            <MasterCombo
                              masterId="productDescriptions"
                              className="h-9"
                              value={r.line.description}
                              onChange={(v) => patchLine(r.line.id, { description: v })}
                              placeholder="Item description"
                            />
                          </div>
                          <div>
                            <CellLabel label="PCS" />
                            <NumInput
                              decimals={0}
                              className="h-9 text-right"
                              value={r.line.pcs}
                              onChange={(v) => patchLine(r.line.id, { pcs: v })}
                            />
                          </div>
                          <div>
                            <CellLabel label="CT" />
                            <NumInput
                              className="h-9 text-right"
                              value={r.line.carat}
                              onChange={(v) => patchLine(r.line.id, { carat: v })}
                            />
                          </div>
                          <div>
                            <CellLabel label="Price/CT USD" />
                            <NumInput
                              className="h-9 text-right"
                              value={r.line.rateUsd}
                              onChange={(v) => patchLine(r.line.id, { rateUsd: v })}
                            />
                          </div>
                          <div>
                            <CellLabel label="Price/CT INR" />
                            <NumInput
                              className="h-9 text-right"
                              value={usdDriven ? r.inr : r.line.rate}
                              onChange={(v) => patchLine(r.line.id, { rate: v, rateUsd: 0 })}
                            />
                          </div>
                          <div className="min-w-0">
                            <CellLabel label="Total INR" />
                            <MoneyInput
                              className="h-9 text-right"
                              value={r.line.total}
                              onChange={(v) => patchLine(r.line.id, { total: v })}
                            />
                          </div>
                          <div className="hidden sm:block">
                            <RowActions
                              expanded={expanded}
                              onToggle={() => toggleRow(r.line.id)}
                              onCopy={() => setLines((p) => [...p, { ...r.line, id: uid("ln") }])}
                              onDelete={() =>
                                setLines((p) => (p.length > 1 ? p.filter((l) => l.id !== r.line.id) : p))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="num flex justify-end gap-3 pt-1 text-sm font-medium text-navy">
                    <span>
                      Total PCS: {round2(diamondRows.reduce((s, r) => s + n(r.line.pcs), 0))}
                    </span>
                    <span>Total CT: {totalCt}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <div className="space-y-2 lg:min-w-[1240px]">
                  <div className="hidden items-center gap-2 px-2 lg:grid lg:grid-cols-[24px_86px_minmax(0,1fr)_54px_72px_72px_72px_72px_84px_96px_104px_88px]">
                    <ColHead label="Sr." />
                    <ColHead label="SKU" />
                    <ColHead label="Description" />
                    <ColHead label="Qty" className="text-right" />
                    <ColHead label="Gross WT" className="text-right" />
                    <ColHead label="Stone WT" className="text-right" />
                    <ColHead label="Net WT" className="text-right" />
                    <ColHead label="Dia WT" className="text-right" />
                    <ColHead label="Making / g" className="text-right" />
                    <ColHead label="Stone Amt" className="text-right" />
                    <ColHead label="Total Making" className="text-right" />
                    <ColHead label="Actions" className="text-right" />
                  </div>
                  {makingRows.map((r, i) => {
                    const expanded = expandedRows[r.line.id] ?? false;
                    const ov = makingOv[r.line.id];
                    return (
                      <div
                        key={r.line.id}
                        className="rounded-lg border border-border p-2 lg:grid lg:grid-cols-[24px_86px_minmax(0,1fr)_54px_72px_72px_72px_72px_84px_96px_104px_88px] lg:items-center lg:gap-2"
                      >
                        <div className="flex items-center justify-between lg:contents">
                          <span className="num text-xs text-muted-foreground lg:text-sm">{i + 1}</span>
                          <div className="lg:hidden">
                            <RowActions
                              expanded={expanded}
                              onToggle={() => toggleRow(r.line.id)}
                              onCopy={() => setMaking((p) => [...p, { ...r.line, id: uid("mk") }])}
                              onDelete={() =>
                                setMaking((p) => (p.length > 1 ? p.filter((m) => m.id !== r.line.id) : p))
                              }
                            />
                          </div>
                        </div>
                        <div
                          className={cn(
                            "mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:mt-0 lg:contents",
                            !expanded && "hidden lg:contents",
                          )}
                        >
                          <div className="min-w-0">
                            <CellLabel label="SKU" />
                            <Input
                              className="h-9"
                              placeholder="SKU"
                              value={r.line.sku ?? ""}
                              onChange={(e) => patchMaking(r.line.id, { sku: e.target.value })}
                            />
                          </div>
                          <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-1">
                            <CellLabel label="Description" />
                            <MasterCombo
                              masterId="productDescriptions"
                              className="h-9"
                              value={r.line.description}
                              onChange={(v) => patchMaking(r.line.id, { description: v })}
                              placeholder="Item description"
                            />
                          </div>
                          <div>
                            <CellLabel label="Qty" />
                            <NumInput
                              decimals={0}
                              className="h-9 text-right"
                              value={r.line.quantity}
                              onChange={(v) => patchMaking(r.line.id, { quantity: v })}
                            />
                          </div>
                          <div>
                            <CellLabel label="Gross WT" />
                            <NumInput
                              className="h-9 text-right"
                              value={r.line.grossWeight}
                              onChange={(v) => patchMaking(r.line.id, { grossWeight: v })}
                            />
                          </div>
                          <div>
                            <CellLabel label="Stone WT" />
                            <NumInput
                              className="h-9 text-right"
                              value={r.line.stoneWeight ?? 0}
                              onChange={(v) => patchMaking(r.line.id, { stoneWeight: v })}
                            />
                          </div>
                          <div>
                            <CellLabel label="Net WT" />
                            <NumInput
                              className="h-9 text-right"
                              value={r.line.netWeight}
                              onChange={(v) => patchMaking(r.line.id, { netWeight: v })}
                            />
                          </div>
                          <div>
                            <CellLabel label="Dia WT" />
                            <NumInput
                              className="h-9 text-right"
                              value={r.line.diamondWeight}
                              onChange={(v) => patchMaking(r.line.id, { diamondWeight: v })}
                            />
                          </div>
                          <div>
                            <CellLabel label="Making / g" />
                            <MoneyInput
                              className="h-9 text-right"
                              value={r.line.makingRatePerGram ?? r.line.makingRate}
                              onChange={(v) =>
                                patchMaking(r.line.id, { makingRatePerGram: v, makingRate: v })
                              }
                            />
                          </div>
                          <div>
                            <CellLabel label="Stone Amt" />
                            <MoneyInput
                              className="h-9 text-right"
                              value={r.line.stoneAmount ?? 0}
                              onChange={(v) => patchMaking(r.line.id, { stoneAmount: v })}
                            />
                          </div>
                          <div className="min-w-0">
                            <CellLabel label="Total Making" />
                            <div className="flex items-center justify-end gap-1">
                              <p className="num truncate text-right text-sm font-semibold text-navy">
                                {formatMoney(r.total)}
                              </p>
                              {ov?.manual !== undefined ? <ManualBadge /> : null}
                            </div>
                            <div className="mt-1">
                              <AutoManual
                                auto={r.auto}
                                manual={ov?.manual}
                                reason={ov?.reason ?? ""}
                                onManual={(v) =>
                                  setMakingOv((p) => ({ ...p, [r.line.id]: { manual: v, reason: p[r.line.id]?.reason ?? "" } }))
                                }
                                onReason={(v) =>
                                  setMakingOv((p) => ({ ...p, [r.line.id]: { manual: p[r.line.id]?.manual, reason: v } }))
                                }
                              />
                            </div>
                          </div>
                          <div className="hidden lg:block">
                            <RowActions
                              expanded={expanded}
                              onToggle={() => toggleRow(r.line.id)}
                              onCopy={() => setMaking((p) => [...p, { ...r.line, id: uid("mk") }])}
                              onDelete={() =>
                                setMaking((p) => (p.length > 1 ? p.filter((m) => m.id !== r.line.id) : p))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="num grid grid-cols-2 gap-2 rounded-lg bg-muted px-3 py-2 text-xs font-medium text-navy sm:grid-cols-4 lg:grid-cols-7">
                    <span>Qty: {round2(makingRows.reduce((s, r) => s + n(r.line.quantity), 0))}</span>
                    <span>Gross WT: {round2(makingRows.reduce((s, r) => s + n(r.line.grossWeight), 0))}</span>
                    <span>Stone WT: {round2(makingRows.reduce((s, r) => s + n(r.line.stoneWeight), 0))}</span>
                    <span>Net WT: {round2(makingRows.reduce((s, r) => s + n(r.line.netWeight), 0))}</span>
                    <span>Dia WT: {round2(makingRows.reduce((s, r) => s + n(r.line.diamondWeight), 0))}</span>
                    <span>
                      Total Making: {formatMoney(round2(makingRows.reduce((s, r) => s + r.totalMaking, 0)))}
                    </span>
                    <span>
                      Total Jewelry Value:{" "}
                      {formatMoney(round2(makingRows.reduce((s, r) => s + r.total, 0)))}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="num mt-3 flex flex-wrap items-start justify-end gap-2">
              <div className="min-w-[180px] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  Subtotal {formatMoney(subtotal)}
                  {subtotalOv.manual !== undefined ? <ManualBadge /> : null}
                </div>
                <AutoManual
                  auto={subtotalAuto}
                  manual={subtotalOv.manual}
                  reason={subtotalOv.reason}
                  className="mt-1"
                  onManual={(v) => setSubtotalOv((p) => ({ ...p, manual: v }))}
                  onReason={(v) => setSubtotalOv((p) => ({ ...p, reason: v }))}
                />
              </div>
              <div className="min-w-[180px] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  Discount −{formatMoney(discountAmount)}
                  {discountOv.manual !== undefined ? <ManualBadge /> : null}
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <Select
                    value={head.discountMode}
                    onValueChange={(v) => setHead({ ...head, discountMode: v as DiscountMode })}
                  >
                    <SelectTrigger className="h-9 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Amount</SelectItem>
                      <SelectItem value="percent">%</SelectItem>
                    </SelectContent>
                  </Select>
                  <NumInput
                    decimals={2}
                    className="h-9"
                    value={head.discountValue}
                    onChange={(v) => setHead({ ...head, discountValue: v })}
                  />
                </div>
                <AutoManual
                  auto={discountAuto}
                  manual={discountOv.manual}
                  reason={discountOv.reason}
                  className="mt-1"
                  onManual={(v) => setDiscountOv((p) => ({ ...p, manual: v }))}
                  onReason={(v) => setDiscountOv((p) => ({ ...p, reason: v }))}
                />
              </div>
              <div className="min-w-[180px] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  Shipping / other {formatMoney(shippingAmount)}
                  {shippingOv.manual !== undefined ? <ManualBadge /> : null}
                </div>
                <AutoManual
                  auto={0}
                  manual={shippingOv.manual}
                  reason={shippingOv.reason}
                  className="mt-1"
                  onManual={(v) => setShippingOv((p) => ({ ...p, manual: v }))}
                  onReason={(v) => setShippingOv((p) => ({ ...p, reason: v }))}
                />
              </div>
              {isGst ? (
                <>
                  <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    Taxable {formatMoney(taxableAmount)}
                  </div>
                  {head.supplyLocation === "inside" ? (
                    <>
                      <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                        CGST {formatMoney(cgstAmount)}
                      </div>
                      <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                        SGST {formatMoney(sgstAmount)}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                      IGST {formatMoney(igstAmount)}
                    </div>
                  )}
                </>
              ) : null}
              <div className="min-w-[180px] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  Round-off {formatMoney(roundOffAmount)}
                  {roundOffOv.manual !== undefined ? <ManualBadge /> : null}
                </div>
                <AutoManual
                  auto={0}
                  manual={roundOffOv.manual}
                  reason={roundOffOv.reason}
                  className="mt-1"
                  onManual={(v) => setRoundOffOv((p) => ({ ...p, manual: v }))}
                  onReason={(v) => setRoundOffOv((p) => ({ ...p, reason: v }))}
                />
              </div>
              <div className="min-w-[180px] rounded-lg bg-pu-total-bg px-4 py-2 text-sm font-semibold text-pu-total">
                <div className="flex items-center gap-1">
                  Grand Total {formatMoney(grandTotal)}
                  {grandOv.manual !== undefined ? <ManualBadge /> : null}
                </div>
                <AutoManual
                  auto={grandTotalAuto}
                  manual={grandOv.manual}
                  reason={grandOv.reason}
                  className="mt-1"
                  onManual={(v) => setGrandOv((p) => ({ ...p, manual: v }))}
                  onReason={(v) => setGrandOv((p) => ({ ...p, reason: v }))}
                />
              </div>
            </div>
          </div>

          {/* payment */}
          <div className="rounded-xl border border-border p-3">
            <p className="text-sm font-semibold text-navy">Payment</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  { id: "pending", label: "Pending" },
                  { id: "part", label: "Part Paid" },
                  { id: "paid", label: "Paid" },
                  { id: "advance", label: "Supplier Advance" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPayMode(m.id)}
                  className={
                    "rounded-lg border px-3 py-2 text-sm font-medium transition " +
                    (payMode === m.id
                      ? "border-gold bg-sl-paid-bg text-sl-paid"
                      : "border-border text-muted-foreground hover:bg-muted")
                  }
                >
                  {m.label}
                </button>
              ))}
            </div>

            {payMode !== "pending" ? (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <FormField label="Amount paid" required>
                  <div>
                    <MoneyInput
                      readOnly={payMode === "paid"}
                      value={payMode === "paid" ? grandTotal : (paidOv.manual !== undefined ? paidOv.manual : pay.amount)}
                      onChange={(v) =>
                        paidOv.manual !== undefined
                          ? setPaidOv((p) => ({ ...p, manual: v }))
                          : setPay({ ...pay, amount: v })
                      }
                    />
                    {payMode !== "paid" ? (
                      <AutoManual
                        auto={payAmountAuto}
                        manual={paidOv.manual}
                        reason={paidOv.reason}
                        className="mt-1"
                        onManual={(v) => setPaidOv((p) => ({ ...p, manual: v }))}
                        onReason={(v) => setPaidOv((p) => ({ ...p, reason: v }))}
                      />
                    ) : null}
                    {paidOv.manual !== undefined ? <ManualBadge /> : null}
                  </div>
                </FormField>
                <FormField label="Payment date" required>
                  <Input
                    type="date"
                    value={pay.date}
                    onChange={(e) => setPay({ ...pay, date: e.target.value })}
                  />
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
                    <p className="num mt-1 text-[11px] text-muted-foreground">
                      Available advance: {formatMoney(advanceBalance)}
                    </p>
                  </FormField>
                )}
                <FormField
                  label={fromAdvance ? "Bank / cash account (not used)" : "Bank / cash account"}
                  required={!fromAdvance}
                >
                  <Select
                    value={pay.account}
                    onValueChange={(v) => setPay({ ...pay, account: v })}
                    disabled={fromAdvance}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={fromAdvance ? "Paid from advance balance" : "Select account"}
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
                    value={pay.reference}
                    onChange={(e) => setPay({ ...pay, reference: e.target.value })}
                  />
                </FormField>
                <FormField label="Payment mode">
                  <MasterCombo
                    masterId="paymentModes"
                    value={pay.method}
                    onChange={(v) => setPay({ ...pay, method: v })}
                    placeholder="Bank Transfer, UPI…"
                  />
                </FormField>
              </div>
            ) : null}

            <div className="num mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-sl-paid-bg px-3 py-2 text-sm text-sl-paid">
                Allocated {formatMoney(allocatedNow)}
              </div>
              <div className="rounded-lg bg-sl-pending-bg px-3 py-2 text-sm text-sl-pending">
                Pending {formatMoney(pendingNow)}
              </div>
              <div className="rounded-lg bg-sl-advance-bg px-3 py-2 text-sm text-sl-advance">
                {fromAdvance
                  ? `Advance left ${formatMoney(round2(Math.max(0, advanceBalance - allocatedNow)))}`
                  : `Supplier advance ${formatMoney(advanceNow)}`}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 border-t border-border bg-card px-5 py-4">
          <Button disabled={saving} onClick={() => save(false)}>
            Save Bill
          </Button>
          <Button variant="outline" disabled={saving} onClick={() => save(true)}>
            Save &amp; Download PDF
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
