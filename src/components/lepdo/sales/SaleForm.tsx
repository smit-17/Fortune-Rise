import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Copy, Plus } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { formatMoney, round2, todayISO, uid } from "@/lib/lepdo/format";
import {
  convertAmount,
  currencySymbol,
  finalPayable,
  formatCurrency,
  invoiceAmounts,
} from "@/lib/lepdo/currency";
import { useLepdo, type SalesInvoiceInput } from "@/lib/lepdo/store";
import { PLATFORMS } from "@/lib/lepdo/sales";
import { masterOptions } from "@/lib/lepdo/masters";
import {
  DEFAULT_HSN,
  buildInvoiceDocHtml,
  printInvoiceDoc,
  validateInvoice,
} from "@/lib/lepdo/invoiceDoc";

import type {
  DiscountMode,
  InvoiceKind,
  JewelryItem,
  SaleType,
  StoneLine,
  SupplyLocation,
} from "@/lib/lepdo/types";
import { CustomerForm } from "./CustomerForm";
import { ContactPicker } from "@/components/lepdo/ContactPicker";
import { CellLabel, ColHead, Combo, FormField, Row, WIDE_MODAL_CLASS } from "./ui";
import { MasterCombo } from "@/components/lepdo/shared";
import { MoneyInput, NumInput, toNum } from "@/components/lepdo/numeric";

/** Sale-type master label -> internal SaleType id. */
const SALE_TYPE_ID: Record<string, SaleType> = {
  UE: "ue",
  UI: "ui",
  "GST INR": "gst_inr",
  EXPORT: "export",
};
const SALE_TYPE_LABEL: Record<string, string> = {
  ue: "UE",
  ui: "UI",
  gst_inr: "GST INR",
  export: "Export",
};

const MM_SIZES = [
  "1.0 mm",
  "1.2 mm",
  "1.5 mm",
  "1.8 mm",
  "2.0 mm",
  "2.5 mm",
  "3.0 mm",
  "4.0 mm",
  "5.0 mm",
];

interface DiamondRow {
  id: string;
  description: string;
  hsnCode: string;
  pcs: number;
  carat: number;
  rate: number;
  manualAmount?: number | undefined;
  manualReason: string;
}

const emptyDiamond = (): DiamondRow => ({
  id: uid("ln"),
  description: "",
  hsnCode: DEFAULT_HSN,
  pcs: 1,
  carat: 0,
  rate: 0,
  manualAmount: undefined,
  manualReason: "",
});

const emptyStone = (): StoneLine => ({
  id: uid("st"),
  stoneType: "Lab-Grown Diamond",
  size: "",
  sizeMm: "",
  carat: 0,
  rate: 0,
  value: 0,
  totalAmount: undefined,
});

const emptyJewelry = (): JewelryItem => ({
  id: uid("jw"),
  description: "",
  karat: "14K Gold",
  metalColour: "Yellow",
  netWeight: 0,
  finePercent: 0,
  fineGram: 0,
  metalRate: 0,
  metalValue: 0,
  makingRate: 0,
  makingValue: 0,
  stones: [emptyStone()],
  stoneValue: 0,
  total: 0,
  metal: "14K Gold",
  category: "Ring",
  grossWeight: 0,
  stoneWeight: 0,
  fineWeight24k: 0,
  metalRatePerGram: 0,
  makingRatePerGram: 0,
});

/**
 * Gross/stone/net/24KT-fine weight and both charge rates are always typed
 * manually — nothing here derives finePercent or fineWeight24k automatically.
 * `manualTotal`/`manualTotalReason` (kept only in local component state, not
 * on the persisted JewelryItem type) allow overriding the item total.
 */
function computeJewelry(item: JewelryItem): JewelryItem {
  const netWeight = Number(item.netWeight) || 0;
  const fineWeight24k = Number(item.fineWeight24k) || 0;
  const metalRatePerGram = Number(item.metalRatePerGram) || 0;
  const makingRatePerGram = Number(item.makingRatePerGram) || 0;
  const metalValue = round2(fineWeight24k * metalRatePerGram);
  const makingValue = round2(netWeight * makingRatePerGram);
  const stones = item.stones.map((s) => {
    const manual = s.totalAmount !== undefined && s.totalAmount !== null && s.totalAmount !== 0;
    const value = manual
      ? round2(Number(s.totalAmount) || 0)
      : round2((Number(s.carat) || 0) * (Number(s.rate) || 0));
    return { ...s, value };
  });
  const stoneValue = round2(stones.reduce((s, x) => s + x.value, 0));
  return {
    ...item,
    metal: item.metal ?? item.karat,
    karat: item.metal ?? item.karat,
    netWeight,
    fineWeight24k,
    metalRatePerGram,
    makingRatePerGram,
    // legacy mirrors so old reports / PDFs keep reading sensible numbers
    fineGram: fineWeight24k,
    metalRate: metalRatePerGram,
    makingRate: makingRatePerGram,
    metalValue,
    makingValue,
    stones,
    stoneValue,
    total: round2(metalValue + makingValue + stoneValue),
  };
}

type PayMode = "pending" | "part" | "full" | "paid";

/** Local-only manual override state per item, keyed by item id (not persisted directly). */
interface ItemManual {
  metal?: number | undefined;
  metalReason: string;
  making?: number | undefined;
  makingReason: string;
  total?: number | undefined;
  totalReason: string;
}

const emptyItemManual = (): ItemManual => ({
  metal: undefined,
  metalReason: "",
  making: undefined,
  makingReason: "",
  total: undefined,
  totalReason: "",
});

export function SaleForm({
  open,
  editId,
  onClose,
}: {
  open: boolean;
  editId: string | null;
  onClose: () => void;
}) {
  const store = useLepdo();
  const editing = editId ? store.salesInvoices.find((i) => i.id === editId) : undefined;
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<InvoiceKind | null>(null);
  const [numberLocked, setNumberLocked] = useState(true);
  const [customerFormId, setCustomerFormId] = useState<string | null>(null);
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");

  const [form, setForm] = useState({
    number: "",
    date: todayISO(),
    dueDays: 15 as number | undefined,
    partyId: "",
    sellerName: "",
    sellerIncentivePercent: undefined as number | undefined,
    platform: PLATFORMS[0] as string,
    currency: "INR",
    exchangeRate: 1 as number | undefined,
    saleType: "ue" as SaleType,
    discountMode: "fixed" as DiscountMode,
    discountValue: undefined as number | undefined,
    supplyLocation: "inside" as SupplyLocation,
    taxSlab: "0",
    shipping: undefined as number | undefined,
    notes: "",
  });
  const [diamondRows, setDiamondRows] = useState<DiamondRow[]>([emptyDiamond()]);
  const [jewelry, setJewelry] = useState<JewelryItem[]>([emptyJewelry()]);
  const [itemManuals, setItemManuals] = useState<Record<string, ItemManual>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  const [payMode, setPayMode] = useState<PayMode>("pending");
  const [pay, setPay] = useState({
    amount: undefined as number | undefined,
    date: todayISO(),
    account: "",
    reference: "",
  });

  // summary-level manual overrides
  const [manualSubtotal, setManualSubtotal] = useState<number | undefined>(undefined);
  const [manualSubtotalReason, setManualSubtotalReason] = useState("");
  const [manualDiscount, setManualDiscount] = useState<number | undefined>(undefined);
  const [manualDiscountReason, setManualDiscountReason] = useState("");
  const [roundOffAdj, setRoundOffAdj] = useState(0);
  const [manualShipping, setManualShipping] = useState<number | undefined>(undefined);
  const [manualShippingReason, setManualShippingReason] = useState("");
  const [manualGrandTotal, setManualGrandTotal] = useState<number | undefined>(undefined);
  const [manualGrandTotalReason, setManualGrandTotalReason] = useState("");
  const [manualReceived, setManualReceived] = useState<number | undefined>(undefined);
  const [manualReceivedReason, setManualReceivedReason] = useState("");

  const getItemManual = (id: string): ItemManual => itemManuals[id] ?? emptyItemManual();
  const setItemManual = (id: string, patch: Partial<ItemManual>) =>
    setItemManuals((m) => ({ ...m, [id]: { ...getItemManual(id), ...patch } }));

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setNumberLocked(true);
    setCustomerQuery("");
    setPayMode("pending");
    setPay({ amount: undefined, date: todayISO(), account: "", reference: "" });
    setManualSubtotal(undefined);
    setManualSubtotalReason("");
    setManualDiscount(undefined);
    setManualDiscountReason("");
    setManualShipping(undefined);
    setManualShippingReason("");
    setRoundOffAdj(editing?.roundOff ?? 0);
    setManualGrandTotal(undefined);
    setManualGrandTotalReason("");
    setManualReceived(undefined);
    setManualReceivedReason("");
    setItemManuals({});
    if (editing) {
      setKind(editing.invoiceKind ?? "diamond");
      setForm({
        number: editing.number,
        date: editing.date,
        dueDays: editing.dueDays,
        partyId: editing.partyId,
        sellerName: editing.sellerName ?? "",
        sellerIncentivePercent: editing.sellerIncentivePercent,
        platform: editing.platform ?? PLATFORMS[0],
        currency: editing.currency ?? "INR",
        exchangeRate: editing.exchangeRate ?? 1,
        saleType: editing.saleType ?? "ue",
        discountMode: editing.discountMode ?? "fixed",
        discountValue: editing.discountValue ?? (invoiceAmounts(editing).discount || undefined),
        supplyLocation: editing.supplyLocation ?? "inside",
        taxSlab: editing.gstRate != null ? String(editing.gstRate) : "0",
        // original-currency shipping (INR invoices: same value; foreign: never the INR figure)
        shipping: invoiceAmounts(editing).shipping || undefined,
        notes: editing.notes ?? "",
      });
      setDiamondRows(
        editing.lines?.length
          ? editing.lines.map((l) => ({
              id: l.id,
              description: l.description,
              hsnCode: l.hsnCode || DEFAULT_HSN,
              pcs: l.quantity || 1,
              carat: l.carat,
              rate: l.rate,
              manualAmount: undefined,
              manualReason: "",
            }))
          : [emptyDiamond()],
      );

      setJewelry(
        editing.jewelryItems?.length
          ? editing.jewelryItems.map((i) => ({ ...i }))
          : [emptyJewelry()],
      );
      return;
    }
    setKind(null);
    const today = todayISO();
    setForm({
      number: store.nextInvoiceNumber(),
      date: today,
      dueDays: 15,
      partyId: "",
      sellerName: "",
      sellerIncentivePercent: undefined,
      platform: PLATFORMS[0],
      currency: "INR",
      exchangeRate: 1,
      saleType: "ue",
      discountMode: "fixed",
      discountValue: undefined,
      supplyLocation: "inside",
      taxSlab: "0",
      shipping: undefined,
      notes: "",
    });
    setDiamondRows([emptyDiamond()]);
    setJewelry([emptyJewelry()]);
    setExpanded(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId]);

  const computedJewelry = useMemo(
    () =>
      jewelry.map((j) => {
        const auto = computeJewelry(j);
        const m = getItemManual(j.id);
        const metalValue = m.metal !== undefined ? round2(m.metal) : auto.metalValue;
        const makingValue = m.making !== undefined ? round2(m.making) : auto.makingValue;
        const autoTotal = round2(metalValue + makingValue + auto.stoneValue);
        const total = m.total !== undefined ? round2(m.total) : autoTotal;
        return { ...auto, metalValue, makingValue, total };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jewelry, itemManuals],
  );
  const diamondTotals = useMemo(() => {
    const rows = diamondRows.map((r) => {
      const auto = round2((Number(r.carat) || 0) * (Number(r.rate) || 0));
      const amount = r.manualAmount !== undefined ? round2(r.manualAmount) : auto;
      return { ...r, autoAmount: auto, amount };
    });
    return {
      rows,
      carat: round2(rows.reduce((s, r) => s + (Number(r.carat) || 0), 0)),
      subtotal: round2(rows.reduce((s, r) => s + r.amount, 0)),
    };
  }, [diamondRows]);

  const jewelryTotals = useMemo(
    () => ({
      weight: round2(computedJewelry.reduce((s, i) => s + (Number(i.netWeight) || 0), 0)),
      carat: round2(
        computedJewelry.reduce(
          (s, i) => s + i.stones.reduce((a, x) => a + (Number(x.carat) || 0), 0),
          0,
        ),
      ),
      metal: round2(computedJewelry.reduce((s, i) => s + i.metalValue, 0)),
      making: round2(computedJewelry.reduce((s, i) => s + i.makingValue, 0)),
      stone: round2(computedJewelry.reduce((s, i) => s + i.stoneValue, 0)),
      subtotal: round2(computedJewelry.reduce((s, i) => s + i.total, 0)),
    }),
    [computedJewelry],
  );

  const autoSubtotal = kind === "jewelry" ? jewelryTotals.subtotal : diamondTotals.subtotal;
  const subtotal = manualSubtotal !== undefined ? round2(manualSubtotal) : autoSubtotal;
  const autoDiscount =
    form.discountMode === "percent"
      ? round2((subtotal * (toNum(form.discountValue) || 0)) / 100)
      : round2(toNum(form.discountValue) || 0);
  const discount = manualDiscount !== undefined ? round2(manualDiscount) : autoDiscount;
  const autoShipping = round2(toNum(form.shipping) || 0);
  const shipping = manualShipping !== undefined ? round2(manualShipping) : autoShipping;
  const isGst = form.saleType === "gst_inr";
  const taxableAmount = round2(Math.max(0, subtotal - discount + shipping));
  const gstRate = isGst ? Number(form.taxSlab) || 0 : 0;
  const taxAmount = isGst ? round2((taxableAmount * gstRate) / 100) : 0;
  const cgstAmount =
    isGst && form.supplyLocation === "inside" ? round2(taxAmount / 2) : 0;
  const sgstAmount = cgstAmount;
  const igstAmount = isGst && form.supplyLocation === "outside" ? taxAmount : 0;
  const autoGrandTotal = round2(taxableAmount + taxAmount);
  const grandTotal = manualGrandTotal !== undefined ? round2(manualGrandTotal) : autoGrandTotal;
  const rate = toNum(form.exchangeRate) || 0;
  const isForeign = form.currency !== "INR";
  const inrTotal = isForeign ? round2(grandTotal * rate) : grandTotal;
  const roundOff = round2(roundOffAdj || 0);
  const payableTotal = finalPayable(inrTotal, roundOff);
  const dueDays = Math.max(0, Math.floor(toNum(form.dueDays) || 0));
  const computedDueDate = useMemo(() => {
    if (!(dueDays > 0)) return undefined;
    const d = new Date(form.date);
    d.setUTCDate(d.getUTCDate() + dueDays);
    return d.toISOString().slice(0, 10);
  }, [form.date, dueDays]);

  const customers = store.parties.filter(
    (p) =>
      (p.type === "customer" || p.type === "other") &&
      (!customerQuery || p.name.toLowerCase().includes(customerQuery.toLowerCase())),
  );

  const accounts = [
    ...store.bankAccounts
      .filter((b) => b.active)
      .map((b) => ({ value: `bank:${b.id}`, label: `${b.bankName} — ${b.nickname}` })),
    ...store.cashLocations
      .filter((c) => c.active)
      .map((c) => ({ value: `cash:${c.id}`, label: `${c.name} Cash` })),
  ];

  const uniq = (list: (string | undefined)[]) =>
    [...new Set(list.map((x) => (x ?? "").trim()).filter(Boolean))].sort();
  const platformOptions = uniq([
    ...PLATFORMS,
    ...masterOptions(store.masters, "platforms"),
    ...store.salesInvoices.map((i) => i.platform),
  ]);
  const descriptionOptions = uniq([
    ...masterOptions(store.masters, "productDescriptions"),
    ...store.salesInvoices.flatMap((i) => (i.lines ?? []).map((l) => l.description)),
    ...store.salesInvoices.flatMap((i) => (i.jewelryItems ?? []).map((j) => j.description)),
  ]);
  const saleTypeOptions = masterOptions(store.masters, "saleTypes");
  const sizeOptions = uniq([
    ...MM_SIZES,
    ...store.salesInvoices.flatMap((i) =>
      (i.jewelryItems ?? []).flatMap((j) => j.stones.map((s) => s.size)),
    ),
  ]);
  const referenceOptions = uniq(store.transactions.map((t) => t.reference));

  const autoReceived =
    payMode === "full"
      ? payableTotal
      : payMode === "part" || payMode === "paid"
        ? round2(toNum(pay.amount) || 0)
        : 0;
  const receivedNow = manualReceived !== undefined ? round2(manualReceived) : autoReceived;

  function manualNotes(): string {
    const parts: string[] = [];
    if (manualSubtotal !== undefined && manualSubtotalReason.trim())
      parts.push(
        `Subtotal manually adjusted from ${formatCurrency(autoSubtotal, form.currency)} to ${formatCurrency(manualSubtotal, form.currency)} — ${manualSubtotalReason}`,
      );
    if (manualDiscount !== undefined && manualDiscountReason.trim())
      parts.push(
        `Discount manually adjusted from ${formatCurrency(autoDiscount, form.currency)} to ${formatCurrency(manualDiscount, form.currency)} — ${manualDiscountReason}`,
      );
    if (manualShipping !== undefined && manualShippingReason.trim())
      parts.push(
        `Shipping manually adjusted from ${formatCurrency(autoShipping, form.currency)} to ${formatCurrency(manualShipping, form.currency)} — ${manualShippingReason}`,
      );
    if (manualGrandTotal !== undefined && manualGrandTotalReason.trim())
      parts.push(
        `Grand total manually adjusted from ${formatCurrency(autoGrandTotal, form.currency)} to ${formatCurrency(manualGrandTotal, form.currency)} — ${manualGrandTotalReason}`,
      );
    if (manualReceived !== undefined && manualReceivedReason.trim())
      parts.push(
        `Received amount manually adjusted from ${formatMoney(autoReceived)} to ${formatMoney(manualReceived)} — ${manualReceivedReason}`,
      );
    return parts.join("\n");
  }

  function findMissingManualReason(): string | null {
    // amounts are typed manually now — no adjustment reasons are collected
    return null;
  }

  function buildPayload() {
    const lines =
      kind === "jewelry"
        ? []
        : diamondTotals.rows
            .filter((r) => r.description.trim() && r.amount > 0)
            .map((r) => ({
              id: r.id,
              description: r.description.trim(),
              hsnCode: r.hsnCode?.trim() || DEFAULT_HSN,
              quantity: Number(r.pcs) || 1,
              carat: Number(r.carat) || 0,
              rate: r.manualAmount !== undefined && (Number(r.carat) || 0) > 0
                ? round2(r.amount / (Number(r.carat) || 1))
                : Number(r.rate) || 0,
            }));

    const notesParts = [form.notes || "", manualNotes()].filter(Boolean);

    return {
      id: editing?.id,
      number: form.number,
      partyId: form.partyId,
      date: form.date,
      dueDate:
        computedDueDate && computedDueDate !== form.date && payableTotal - receivedNow > 0.005
          ? computedDueDate
          : form.date,
      dueDays: dueDays || undefined,
      discountMode: form.discountMode,
      discountValue: round2(toNum(form.discountValue) || 0),
      supplyLocation: isGst ? form.supplyLocation : undefined,
      cgstAmount: isGst ? cgstAmount : undefined,
      sgstAmount: isGst ? sgstAmount : undefined,
      igstAmount: isGst ? igstAmount : undefined,
      sellerIncentivePercent: form.sellerIncentivePercent
        ? round2(toNum(form.sellerIncentivePercent) || 0)
        : undefined,
      sellerName: form.sellerName || undefined,
      platform: form.platform,
      invoiceKind: kind ?? "diamond",
      jewelryItems:
        kind === "jewelry"
          ? computedJewelry.filter((i) => i.description.trim() && i.total > 0)
          : [],
      foreignTotal: isForeign ? grandTotal : undefined,
      saleType: form.saleType,
      currency: form.currency,
      exchangeRate: isForeign ? rate : 1,
      gstType: isGst
        ? form.supplyLocation === "outside"
          ? "igst"
          : "cgst_sgst"
        : "non_gst",
      gstRate,
      lines,
      subtotal: isForeign ? round2(subtotal * rate) : subtotal,
      discount: isForeign ? round2(discount * rate) : discount,
      taxableAmount: isForeign ? round2(taxableAmount * rate) : taxableAmount,
      taxAmount: isForeign ? round2(taxAmount * rate) : taxAmount,
      shipping: isForeign ? round2(shipping * rate) : shipping,
      foreignSubtotal: isForeign ? subtotal : undefined,
      foreignDiscount: isForeign ? discount : undefined,
      foreignShipping: isForeign ? shipping : undefined,
      foreignTaxableAmount: isForeign ? taxableAmount : undefined,
      foreignTaxAmount: isForeign ? taxAmount : undefined,
      roundOff,
      total: payableTotal,
      notes: notesParts.join("\n\n") || undefined,
    } satisfies Record<string, unknown> as unknown as SalesInvoiceInput;
  }

  function validatePayment(): string | null {
    if (payMode === "pending") return null;
    if (!pay.account) return "Select the bank or cash account that received the payment.";
    if (!pay.date) return "Payment date is required.";
    if (payMode === "part") {
      const amt = round2(toNum(pay.amount) || 0);
      if (!(amt > 0)) return "Part received amount must be above ₹0.";
      if (amt >= payableTotal) return "Part received amount must be below the grand total.";
    }
    if (payMode === "paid") {
      const amt = round2(toNum(pay.amount) || 0);
      if (!(amt > 0)) return "Paid amount must be above ₹0.";
    }
    return null;
  }

  function submit(downloadPdf: boolean) {
    if (saving) return;
    if (isForeign && !(rate > 0)) {
      toast.error("Enter the exchange rate for a non-INR invoice.");
      return;
    }
    if (inrTotal + roundOff < -0.005) {
      toast.error("Round-off adjustment cannot make the final payable amount negative.");
      return;
    }
    const missingReason = findMissingManualReason();
    if (missingReason) {
      toast.error(missingReason);
      return;
    }
    const payError = validatePayment();
    if (payError) {
      toast.error(payError);
      return;
    }
    setSaving(true);
    const payload = buildPayload();
    const result = store.saveSalesInvoice(payload);
    if (!result.ok || !result.id) {
      toast.error(result.message);
      setSaving(false);
      return;
    }

    if (receivedNow > 0 && pay.account && !editing) {
      const [sourceType, accountId] = pay.account.split(":") as ["bank" | "cash", string];
      const entry = {
        date: pay.date,
        sourceType,
        accountId,
        direction: "in" as const,
        amount: receivedNow,
        category: "sale_payment" as const,
        partyId: payload.partyId,
        particulars: `Sales receipt against ${payload.number}`,
        reference: pay.reference || undefined,
        allocations: [{ invoiceId: result.id, amount: receivedNow }],
      };
      const rec = store.addEntry(entry);
      if (!rec.ok) toast.error(rec.message);
    }

    toast.success(result.message);
    if (downloadPdf) {
      const invoice = {
        ...payload,
        id: result.id,
        paid: receivedNow,
        currency: payload.currency ?? "INR",
      } as never as import("@/lib/lepdo/types").Invoice;
      const customer = store.parties.find((p) => p.id === payload.partyId);
      const errors = validateInvoice(invoice, receivedNow);
      if (errors.length) {
        toast.error(`PDF not generated — ${errors[0]}`);
      } else {
        const ok = printInvoiceDoc(
          buildInvoiceDocHtml({
            invoice,
            customer,
            settings: store.settings,
            received: receivedNow,
          }),
        );
        if (!ok) toast.error("Allow pop-ups to download the invoice PDF.");
      }
    }

    onClose();
  }

  /** Switch invoice currency, converting every entered amount once (old rate → INR → new rate). */
  function changeCurrency(raw: string) {
    const code = raw.trim().toUpperCase();
    if (!code || code === form.currency) return;
    const hasAmounts =
      diamondRows.some((r) => (Number(r.rate) || 0) > 0 || r.manualAmount !== undefined) ||
      jewelry.some((j) => computeJewelry(j).total > 0) ||
      (toNum(form.shipping) || 0) > 0 ||
      (form.discountMode === "fixed" && (toNum(form.discountValue) || 0) > 0) ||
      [manualSubtotal, manualDiscount, manualShipping, manualGrandTotal].some(
        (m) => m !== undefined,
      );
    if (!hasAmounts) {
      setForm({ ...form, currency: code, exchangeRate: code === "INR" ? 1 : undefined });
      return;
    }
    const oldRate = form.currency === "INR" ? 1 : toNum(form.exchangeRate) || 0;
    if (!(oldRate > 0)) {
      toast.error(`Enter the ${form.currency} exchange rate first so amounts can be converted.`);
      return;
    }
    let newRate = 1;
    if (code !== "INR") {
      const typed = window.prompt(`Exchange rate for ${code} (1 ${code} → ₹):`, "");
      if (typed === null) return;
      newRate = toNum(typed.replace(/[^\d.]/g, "")) || 0;
      if (!(newRate > 0)) {
        toast.error("Enter a valid exchange rate to convert the amounts.");
        return;
      }
    }
    const ok = window.confirm(
      `Convert all entered amounts from ${form.currency} to ${code}?\n\n` +
        `Each amount will be converted once (1 ${form.currency} = ₹${oldRate}` +
        (code === "INR" ? "" : `, 1 ${code} = ₹${newRate}`) +
        `). Example: ${formatCurrency(100, form.currency)} → ${formatCurrency(convertAmount(100, oldRate, newRate), code)}.`,
    );
    if (!ok) return;
    const cv = (n: number | undefined) =>
      n === undefined || n === null ? n : convertAmount(Number(n) || 0, oldRate, newRate);
    const cvReq = (n: number) => convertAmount(Number(n) || 0, oldRate, newRate);
    setDiamondRows((rows) =>
      rows.map((r) => ({ ...r, rate: cvReq(r.rate), manualAmount: cv(r.manualAmount) })),
    );
    setJewelry((list) =>
      list.map((j) => ({
        ...j,
        metalRatePerGram: cv(j.metalRatePerGram),
        makingRatePerGram: cv(j.makingRatePerGram),
        metalRate: cvReq(j.metalRate),
        makingRate: cvReq(j.makingRate),
        stones: j.stones.map((st) => ({
          ...st,
          rate: cvReq(st.rate),
          totalAmount: cv(st.totalAmount),
        })),
      })),
    );
    setItemManuals((m) => {
      const next: typeof m = {};
      for (const [k, v] of Object.entries(m))
        next[k] = {
          ...v,
          metal: cv(v.metal),
          making: cv(v.making),
          total: cv(v.total),
        };
      return next;
    });
    if (manualSubtotal !== undefined) setManualSubtotal(cvReq(manualSubtotal));
    if (manualDiscount !== undefined) setManualDiscount(cvReq(manualDiscount));
    if (manualShipping !== undefined) setManualShipping(cvReq(manualShipping));
    if (manualGrandTotal !== undefined) setManualGrandTotal(cvReq(manualGrandTotal));
    setForm({
      ...form,
      currency: code,
      exchangeRate: newRate,
      shipping: cv(form.shipping),
      discountValue: form.discountMode === "fixed" ? cv(form.discountValue) : form.discountValue,
    });
    toast.success(`Amounts converted from ${form.currency} to ${code}.`);
  }

  const cur = form.currency;
  const sym = currencySymbol(cur);

  const setJw = (id: string, patch: Partial<JewelryItem>) =>
    setJewelry((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className={WIDE_MODAL_CLASS}>
          <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
            <DialogTitle className="text-navy">
              {editing ? `Edit ${editing.number}` : "Add sale"}
            </DialogTitle>
            <DialogDescription>
              {kind
                ? `${kind === "jewelry" ? "Jewelry" : "Diamond"} invoice · totals are calculated automatically.`
                : "Choose the invoice format to continue."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-5 py-5">
            {!kind ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {(["diamond", "jewelry"] as InvoiceKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className="rounded-xl border border-border bg-sl-total-bg p-5 text-left transition-shadow hover:shadow-sm"
                  >
                    <p className="text-base font-semibold text-navy">
                      {k === "diamond" ? "Diamond Invoice" : "Jewelry Invoice"}
                    </p>
                    <p className="mt-1 text-xs text-sl-total">
                      {k === "diamond"
                        ? "Carat × Price/CT line items."
                        : "Metal, making charges and stone lines per item."}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField label="Invoice date" required>
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                    />
                  </FormField>
                  <FormField
                    label="Payment due days"
                    hint={
                      computedDueDate
                        ? `Due date: ${computedDueDate}`
                        : "Leave blank / 0 for no due date."
                    }
                  >
                    <NumInput
                      decimals={0}
                      value={form.dueDays}
                      onChange={(n) => setForm({ ...form, dueDays: n })}
                    />
                  </FormField>
                  <FormField label="Invoice number" required>
                    <div className="flex gap-2">
                      <Input
                        value={form.number}
                        disabled={numberLocked}
                        onChange={(e) => setForm({ ...form, number: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setNumberLocked((v) => !v)}
                      >
                        {numberLocked ? "Edit" : "Lock"}
                      </Button>
                    </div>
                  </FormField>

                  <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                    <FormField label="Customer" required>
                      <Select
                        value={form.partyId}
                        onValueChange={(v) => setForm({ ...form, partyId: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="p-2">
                            <Input
                              placeholder="Search customer"
                              value={customerQuery}
                              onChange={(e) => setCustomerQuery(e.target.value)}
                              onKeyDown={(e) => e.stopPropagation()}
                            />
                          </div>
                          {customers.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCustomerFormId(null);
                          setCustomerFormOpen(true);
                        }}
                      >
                        <Plus className="size-4" /> Add Customer
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!form.partyId}
                        onClick={() => {
                          setCustomerFormId(form.partyId);
                          setCustomerFormOpen(true);
                        }}
                      >
                        Edit Customer
                      </Button>
                    </div>
                  </div>

                  <FormField label="Seller" hint="Search a saved seller, or add a new one.">
                    <ContactPicker
                      kind="seller"
                      value={form.sellerName}
                      onChange={(v) => setForm({ ...form, sellerName: v })}
                    />
                  </FormField>
                  <FormField label="Order platform" hint="Select or type a new platform.">
                    <MasterCombo
                      masterId="platforms"
                      value={form.platform}
                      onChange={(v) => setForm({ ...form, platform: v })}
                    />
                  </FormField>
                  <FormField label="Sale type" hint="UE, UI, Export or GST INR.">
                    <Combo
                      value={SALE_TYPE_LABEL[form.saleType] ?? String(form.saleType)}
                      options={saleTypeOptions}
                      onChange={(v) => {
                        const hit = SALE_TYPE_ID[v.trim().toUpperCase()];
                        setForm({ ...form, saleType: hit ?? (v as SaleType) });
                      }}
                    />
                  </FormField>
                  <FormField label="Currency" hint="Select or type a currency code.">
                    <MasterCombo
                      masterId="currencies"
                      value={form.currency}
                      onChange={(v) => changeCurrency(v)}
                    />
                  </FormField>

                  {isForeign ? (
                    <FormField label={`Exchange rate (1 ${form.currency} → ₹)`} required>
                      <NumInput
                        value={form.exchangeRate}
                        onChange={(n) => setForm({ ...form, exchangeRate: n })}
                      />
                    </FormField>
                  ) : null}
                </div>

                {/* items */}
                {kind === "diamond" ? (
                  <div className="rounded-xl border border-border bg-muted/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-navy">Diamond items</p>
                    </div>

                    {/* permanent column titles (desktop) */}
                    <div className="mt-3 hidden gap-2 px-2 sm:grid sm:[grid-template-columns:repeat(14,minmax(0,1fr))]">
                      <ColHead label="Sr. No." className="sm:col-span-1" />
                      <ColHead label="Description" className="sm:col-span-4" />
                      <ColHead label="CT" className="sm:col-span-2" />
                      <ColHead label="Price/CT" className="sm:col-span-2" />
                      <ColHead label="Total Amount" className="sm:col-span-3" />
                      <ColHead label="Actions" className="sm:col-span-2" />
                    </div>

                    <div className="mt-2 space-y-2">
                      {diamondTotals.rows.map((r, idx) => (
                        <div
                          key={r.id}
                          onFocus={() => setSelectedRow(r.id)}
                          className={cn(
                            "grid grid-cols-1 gap-2 rounded-lg border bg-card p-2 sm:items-center sm:[grid-template-columns:repeat(14,minmax(0,1fr))]",
                            selectedRow === r.id
                              ? "border-navy ring-1 ring-navy/30"
                              : "border-border",
                          )}
                        >
                          <div className="sm:col-span-1">
                            <CellLabel label="Sr. No." />
                            <span className="num text-sm font-medium text-muted-foreground">
                              {idx + 1}
                            </span>
                          </div>
                          <div className="min-w-0 sm:col-span-4">
                            <CellLabel label="Description" />
                            <MasterCombo
                              masterId="productDescriptions"
                              className="h-9"
                              value={r.description}
                              placeholder="Select or type description"
                              onChange={(v) =>
                                setDiamondRows(
                                  diamondRows.map((x, i) =>
                                    i === idx ? { ...x, description: v } : x,
                                  ),
                                )
                              }
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <CellLabel label="CT" />
                            <NumInput
                              className="h-9"
                              value={r.carat}
                              onChange={(n) =>
                                setDiamondRows(
                                  diamondRows.map((x, i) => (i === idx ? { ...x, carat: n } : x)),
                                )
                              }
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <CellLabel label="Price/CT" />
                            <MoneyInput
                              className="h-9"
                              value={r.rate}
                              onChange={(n) =>
                                setDiamondRows(
                                  diamondRows.map((x, i) => (i === idx ? { ...x, rate: n } : x)),
                                )
                              }
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <CellLabel label="Total Amount" />
                            <MoneyInput
                              className="h-9"
                              value={
                                r.manualAmount !== undefined
                                  ? r.manualAmount
                                  : round2((Number(r.carat) || 0) * (Number(r.rate) || 0))
                              }
                              onChange={(n) =>
                                setDiamondRows(
                                  diamondRows.map((x, i) =>
                                    i === idx ? { ...x, manualAmount: n } : x,
                                  ),
                                )
                              }
                            />
                          </div>
                          <div className="flex flex-wrap gap-1 sm:col-span-2">
                            <CellLabel label="Actions" />
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              title="Duplicate this row"
                              onClick={() => {
                                const copy = { ...r, id: uid("ln") };
                                setDiamondRows([
                                  ...diamondRows.slice(0, idx + 1),
                                  copy,
                                  ...diamondRows.slice(idx + 1),
                                ]);
                                setSelectedRow(copy.id);
                              }}
                            >
                              <Copy className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs text-neg"
                              title="Delete this row"
                              disabled={diamondRows.length === 1}
                              onClick={() =>
                                setDiamondRows(diamondRows.filter((_, i) => i !== idx))
                              }
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const row = emptyDiamond();
                          setDiamondRows([...diamondRows, row]);
                          setSelectedRow(row.id);
                        }}
                      >
                        <Plus className="size-4" /> Add Item
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        title="Duplicate the selected row so you can edit the copy"
                        onClick={() => {
                          const idx = diamondRows.findIndex((x) => x.id === selectedRow);
                          const at = idx >= 0 ? idx : diamondRows.length - 1;
                          const src = diamondRows[at];
                          if (!src) return;
                          const copy = { ...src, id: uid("ln") };
                          setDiamondRows([
                            ...diamondRows.slice(0, at + 1),
                            copy,
                            ...diamondRows.slice(at + 1),
                          ]);
                          setSelectedRow(copy.id);
                        }}
                      >
                        <Copy className="size-4" /> Copy This Item
                      </Button>
                    </div>
                    <p className="num mt-3 text-xs text-muted-foreground">
                      Total carat {diamondTotals.carat} · Subtotal{" "}
                      {formatCurrency(diamondTotals.subtotal, cur)}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-muted/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-navy">Jewelry items</p>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <div className="min-w-[880px] space-y-2 sm:min-w-0">
                        {/* desktop column titles */}
                        <div className="hidden gap-2 px-2 sm:grid sm:grid-cols-12">
                          <ColHead label="Description" className="sm:col-span-3" />
                          <ColHead label="Category" className="sm:col-span-1" />
                          <ColHead label="Metal" className="sm:col-span-1" />
                          <ColHead label="Colour" className="sm:col-span-1" />
                          <ColHead label="Weights" className="sm:col-span-3" />
                          <ColHead label="Total Value" className="sm:col-span-2" />
                          <ColHead label="Actions" className="sm:col-span-1" />
                        </div>

                        {computedJewelry.map((it, idx) => {
                          const isOpen = expanded === it.id;
                          const m = getItemManual(it.id);
                          return (
                            <div
                              key={it.id}
                              onFocus={() => setSelectedItem(it.id)}
                              className={cn(
                                "rounded-lg border bg-card",
                                (selectedItem ?? expanded) === it.id
                                  ? "border-navy ring-1 ring-navy/30"
                                  : "border-border",
                              )}
                            >
                              {/* desktop compact row */}
                              <div className="hidden items-center gap-2 p-2 sm:grid sm:grid-cols-12">
                                <div className="min-w-0 sm:col-span-3">
                                  <span className="block truncate text-sm font-medium text-navy">
                                    {idx + 1}. {it.description || `Item ${idx + 1}`}
                                  </span>
                                </div>
                                <div className="min-w-0 truncate text-xs sm:col-span-1">
                                  {it.category || "—"}
                                </div>
                                <div className="min-w-0 truncate text-xs sm:col-span-1">
                                  {it.metal || it.karat}
                                </div>
                                <div className="min-w-0 truncate text-xs sm:col-span-1">
                                  {it.metalColour}
                                </div>
                                <div className="num truncate text-xs text-muted-foreground sm:col-span-3">
                                  G {it.grossWeight ?? 0} · S {it.stoneWeight ?? 0} · N{" "}
                                  {it.netWeight} · 24K {it.fineWeight24k ?? 0}
                                </div>
                                <div className="num truncate text-sm font-semibold text-navy sm:col-span-2">
                                  {formatCurrency(it.total, cur)}
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-1 sm:col-span-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 px-2 text-xs"
                                    title="Open this item for editing"
                                    onClick={() => {
                                      setExpanded(isOpen ? null : it.id);
                                      setSelectedItem(it.id);
                                    }}
                                  >
                                    {isOpen ? (
                                      <ChevronDown className="size-4" />
                                    ) : (
                                      <ChevronRight className="size-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>

                              {/* mobile collapsible card header */}
                              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-2 sm:hidden">
                                <button
                                  type="button"
                                  className="flex min-w-0 items-center gap-2 text-left"
                                  onClick={() => {
                                    setExpanded(isOpen ? null : it.id);
                                    setSelectedItem(it.id);
                                  }}
                                >
                                  {isOpen ? (
                                    <ChevronDown className="size-4 shrink-0 text-navy" />
                                  ) : (
                                    <ChevronRight className="size-4 shrink-0 text-navy" />
                                  )}
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium text-navy">
                                      {idx + 1}. {it.description || `Item ${idx + 1}`}
                                    </span>
                                    <span className="num block truncate text-[11px] text-muted-foreground">
                                      {it.metal || it.karat} · {it.netWeight}g ·{" "}
                                      {formatCurrency(it.total, cur)}
                                    </span>
                                  </span>
                                </button>
                              </div>

                              <div className="flex flex-wrap gap-1 px-2 pb-2 sm:hidden">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => {
                                    setExpanded(it.id);
                                    setSelectedItem(it.id);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => {
                                    const copy: JewelryItem = {
                                      ...it,
                                      id: uid("jw"),
                                      stones: it.stones.map((s) => ({ ...s, id: uid("st") })),
                                    };
                                    setJewelry([
                                      ...jewelry.slice(0, idx + 1),
                                      copy,
                                      ...jewelry.slice(idx + 1),
                                    ]);
                                    setExpanded(copy.id);
                                    setSelectedItem(copy.id);
                                  }}
                                >
                                  Copy
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-xs text-neg"
                                  disabled={jewelry.length === 1}
                                  onClick={() => setJewelry(jewelry.filter((_, i) => i !== idx))}
                                >
                                  Delete
                                </Button>
                              </div>

                              {/* desktop-only row actions (copy / delete) shown when open */}
                              {isOpen ? (
                                <div className="hidden flex-wrap gap-1 px-2 pb-2 sm:flex">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 px-2 text-xs"
                                    onClick={() => {
                                      const copy: JewelryItem = {
                                        ...it,
                                        id: uid("jw"),
                                        stones: it.stones.map((s) => ({ ...s, id: uid("st") })),
                                      };
                                      setJewelry([
                                        ...jewelry.slice(0, idx + 1),
                                        copy,
                                        ...jewelry.slice(idx + 1),
                                      ]);
                                      setExpanded(copy.id);
                                      setSelectedItem(copy.id);
                                    }}
                                  >
                                    <Copy className="size-4" /> Copy
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 px-2 text-xs text-neg"
                                    disabled={jewelry.length === 1}
                                    onClick={() => setJewelry(jewelry.filter((_, i) => i !== idx))}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              ) : null}

                              {isOpen ? (
                                <div className="space-y-3 border-t border-border p-3">
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    <FormField label="Sr. No.">
                                      <Input readOnly value={String(idx + 1)} className="bg-muted" />
                                    </FormField>
                                    <FormField label="Description">
                                      <MasterCombo
                                        masterId="productDescriptions"
                                        value={it.description}
                                        onChange={(v) => setJw(it.id, { description: v })}
                                      />
                                    </FormField>
                                    <FormField label="Jewellery Category">
                                      <MasterCombo
                                        masterId="jewelleryCategories"
                                        value={it.category ?? ""}
                                        onChange={(v) => setJw(it.id, { category: v })}
                                      />
                                    </FormField>
                                    <FormField label="Metal">
                                      <MasterCombo
                                        masterId="metals"
                                        value={it.metal ?? it.karat}
                                        onChange={(v) => setJw(it.id, { metal: v, karat: v })}
                                      />
                                    </FormField>
                                    <FormField label="Metal Colour">
                                      <MasterCombo
                                        masterId="metalColours"
                                        value={it.metalColour}
                                        onChange={(v) => setJw(it.id, { metalColour: v })}
                                      />
                                    </FormField>
                                    <FormField label="Gross Weight (g)">
                                      <NumInput
                                        value={it.grossWeight}
                                        onChange={(n) => setJw(it.id, { grossWeight: n })}
                                      />
                                    </FormField>
                                    <FormField label="Stone Weight (g)">
                                      <NumInput
                                        value={it.stoneWeight}
                                        onChange={(n) => setJw(it.id, { stoneWeight: n })}
                                      />
                                    </FormField>
                                    <FormField label="Net Weight (g)">
                                      <NumInput
                                        value={it.netWeight}
                                        onChange={(n) => setJw(it.id, { netWeight: n })}
                                      />
                                    </FormField>
                                    <FormField label="24KT Fine Weight (g)">
                                      <NumInput
                                        value={it.fineWeight24k}
                                        onChange={(n) => setJw(it.id, { fineWeight24k: n })}
                                      />
                                    </FormField>
                                    <FormField label="Metal Price / Gram">
                                      <MoneyInput
                                        value={it.metalRatePerGram}
                                        onChange={(n) => setJw(it.id, { metalRatePerGram: n })}
                                      />
                                    </FormField>
                                    <FormField label="Total Metal Value">
                                      <MoneyInput
                                        value={m.metal !== undefined ? m.metal : it.metalValue}
                                        onChange={(n) => setItemManual(it.id, { metal: n })}
                                      />
                                    </FormField>
                                    <FormField label="Making Charge / Gram">
                                      <MoneyInput
                                        value={it.makingRatePerGram}
                                        onChange={(n) => setJw(it.id, { makingRatePerGram: n })}
                                      />
                                    </FormField>
                                    <FormField label="Total Making Charges">
                                      <MoneyInput
                                        value={m.making !== undefined ? m.making : it.makingValue}
                                        onChange={(n) => setItemManual(it.id, { making: n })}
                                      />
                                    </FormField>
                                  </div>

                                  <div>
                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-sl-advance">
                                        Stone lines
                                      </p>
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            setJw(it.id, { stones: [...it.stones, emptyStone()] })
                                          }
                                        >
                                          <Plus className="size-4" /> Add Stone
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          title="Duplicate the last stone line"
                                          onClick={() => {
                                            const last = it.stones[it.stones.length - 1];
                                            if (!last) return;
                                            setJw(it.id, {
                                              stones: [...it.stones, { ...last, id: uid("st") }],
                                            });
                                          }}
                                        >
                                          <Copy className="size-4" /> Copy Stone
                                        </Button>
                                      </div>
                                    </div>
                                    <div className="hidden gap-2 px-2 sm:grid sm:grid-cols-12">
                                      <ColHead label="Stone Type" className="sm:col-span-3" />
                                      <ColHead label="Size / MM" className="sm:col-span-2" />
                                      <ColHead label="Carat" className="sm:col-span-2" />
                                      <ColHead label="Price / CT" className="sm:col-span-2" />
                                      <ColHead label="Stone Value" className="sm:col-span-3" />
                                    </div>
                                    <div className="mt-1 space-y-2">
                                      {it.stones.map((s, si) => (
                                        <div
                                          key={s.id}
                                          className="grid grid-cols-1 gap-2 rounded-lg border border-border p-2 sm:grid-cols-12 sm:items-center"
                                        >
                                          <div className="min-w-0 sm:col-span-3">
                                            <CellLabel label="Stone Type" />
                                            <MasterCombo
                                              masterId="stoneTypes"
                                              className="h-9"
                                              value={s.stoneType}
                                              onChange={(v) =>
                                                setJw(it.id, {
                                                  stones: it.stones.map((x, i) =>
                                                    i === si ? { ...x, stoneType: v } : x,
                                                  ),
                                                })
                                              }
                                            />
                                          </div>
                                          <div className="min-w-0 sm:col-span-2">
                                            <CellLabel label="Size / MM" />
                                            <Combo
                                              className="h-9"
                                              value={s.size}
                                              options={sizeOptions}
                                              placeholder="Optional"
                                              onChange={(v) =>
                                                setJw(it.id, {
                                                  stones: it.stones.map((x, i) =>
                                                    i === si ? { ...x, size: v } : x,
                                                  ),
                                                })
                                              }
                                            />
                                          </div>
                                          <div className="sm:col-span-2">
                                            <CellLabel label="Carat" />
                                            <NumInput
                                              className="h-9"
                                              value={s.carat}
                                              onChange={(n) =>
                                                setJw(it.id, {
                                                  stones: it.stones.map((x, i) =>
                                                    i === si ? { ...x, carat: n } : x,
                                                  ),
                                                })
                                              }
                                            />
                                          </div>
                                          <div className="sm:col-span-2">
                                            <CellLabel label="Price / CT" />
                                            <MoneyInput
                                              className="h-9"
                                              value={s.rate}
                                              onChange={(n) =>
                                                setJw(it.id, {
                                                  stones: it.stones.map((x, i) =>
                                                    i === si ? { ...x, rate: n } : x,
                                                  ),
                                                })
                                              }
                                            />
                                          </div>
                                          <div className="flex items-center justify-between gap-1 sm:col-span-3">
                                            <div className="min-w-0 flex-1">
                                              <CellLabel label="Total Stone Amount" />
                                              <MoneyInput
                                                className="h-9"
                                                value={s.totalAmount ?? s.value}
                                                onChange={(n) =>
                                                  setJw(it.id, {
                                                    stones: it.stones.map((x, i) =>
                                                      i === si ? { ...x, totalAmount: n } : x,
                                                    ),
                                                  })
                                                }
                                              />
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 px-2 text-xs"
                                                title="Duplicate this stone line"
                                                onClick={() =>
                                                  setJw(it.id, {
                                                    stones: [
                                                      ...it.stones.slice(0, si + 1),
                                                      { ...s, id: uid("st") },
                                                      ...it.stones.slice(si + 1),
                                                    ],
                                                  })
                                                }
                                              >
                                                <Copy className="size-4" />
                                              </Button>
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 px-2 text-xs text-neg"
                                                title="Delete this stone line"
                                                disabled={it.stones.length === 1}
                                                onClick={() =>
                                                  setJw(it.id, {
                                                    stones: it.stones.filter((_, i) => i !== si),
                                                  })
                                                }
                                              >
                                                Delete
                                              </Button>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div>
                                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                                      Total Jewelry Value
                                    </p>
                                    <MoneyInput
                                      className="h-9 max-w-sm"
                                      value={
                                        m.total !== undefined
                                          ? m.total
                                          : round2(it.metalValue + it.makingValue + it.stoneValue)
                                      }
                                      onChange={(n) => setItemManual(it.id, { total: n })}
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const item = emptyJewelry();
                          setJewelry([...jewelry, item]);
                          setExpanded(item.id);
                          setSelectedItem(item.id);
                        }}
                      >
                        <Plus className="size-4" /> Add Item
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        title="Duplicate the selected item so you can edit the copy"
                        onClick={() => {
                          const target = selectedItem ?? expanded;
                          const idx = computedJewelry.findIndex((x) => x.id === target);
                          const at = idx >= 0 ? idx : computedJewelry.length - 1;
                          const src = computedJewelry[at];
                          if (!src) return;
                          const copy: JewelryItem = {
                            ...src,
                            id: uid("jw"),
                            stones: src.stones.map((s) => ({ ...s, id: uid("st") })),
                          };
                          setJewelry([...jewelry.slice(0, at + 1), copy, ...jewelry.slice(at + 1)]);
                          setExpanded(copy.id);
                          setSelectedItem(copy.id);
                        }}
                      >
                        <Copy className="size-4" /> Copy This Item
                      </Button>
                    </div>
                    <div className="num mt-3 grid grid-cols-2 gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                      <span>Total metal weight: {jewelryTotals.weight} g</span>
                      <span>Total carat: {jewelryTotals.carat}</span>
                      <span>Total metal: {formatCurrency(jewelryTotals.metal, cur)}</span>
                      <span>Total making: {formatCurrency(jewelryTotals.making, cur)}</span>
                      <span>Total stone: {formatCurrency(jewelryTotals.stone, cur)}</span>
                      <span>Subtotal: {formatCurrency(jewelryTotals.subtotal, cur)}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <FormField label="Discount mode">
                    <Select
                      value={form.discountMode}
                      onValueChange={(v) => setForm({ ...form, discountMode: v as DiscountMode })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed amount</SelectItem>
                        <SelectItem value="percent">Percentage</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField
                    label={
                      form.discountMode === "percent"
                        ? "Discount %"
                        : `Discount (${sym.trim()})`
                    }
                  >
                    <NumInput
                      value={form.discountValue}
                      onChange={(n) => setForm({ ...form, discountValue: n })}
                    />
                  </FormField>
                  <FormField label={`Shipping / other (${sym.trim()})`}>
                    <MoneyInput
                      value={form.shipping}
                      onChange={(n) => setForm({ ...form, shipping: n })}
                    />
                  </FormField>
                  {isGst ? (
                    <FormField label="Supply location">
                      <Select
                        value={form.supplyLocation}
                        onValueChange={(v) =>
                          setForm({ ...form, supplyLocation: v as SupplyLocation })
                        }
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
                  ) : null}
                  {isGst ? (
                    <FormField label="Tax slab %">
                      <Select
                        value={form.taxSlab}
                        onValueChange={(v) => setForm({ ...form, taxSlab: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {masterOptions(store.masters, "taxSlabs").map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}%
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                  ) : null}
                </div>

                <div className="space-y-2 rounded-xl border border-border bg-sl-total-bg p-3 text-sm text-sl-total">
                  <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto]">
                    <span>Subtotal ({sym.trim()})</span>
                    <MoneyInput
                      className="h-9 sm:w-56"
                      value={manualSubtotal !== undefined ? manualSubtotal : autoSubtotal}
                      onChange={setManualSubtotal}
                    />
                  </div>
                  <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto]">
                    <span>Discount ({sym.trim()})</span>
                    <MoneyInput
                      className="h-9 sm:w-56"
                      value={manualDiscount !== undefined ? manualDiscount : autoDiscount}
                      onChange={setManualDiscount}
                    />
                  </div>
                  <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto]">
                    <span>Shipping / other ({sym.trim()})</span>
                    <MoneyInput
                      className="h-9 sm:w-56"
                      value={manualShipping !== undefined ? manualShipping : autoShipping}
                      onChange={setManualShipping}
                    />
                  </div>
                  <div className="mt-1 grid grid-cols-1 items-center gap-2 border-t border-sl-total/20 pt-2 text-base font-semibold sm:grid-cols-[1fr_auto]">
                    <span>Grand total ({sym.trim()}{isForeign ? ` ${form.currency}` : ""})</span>
                    <MoneyInput
                      className="h-9 sm:w-56"
                      value={manualGrandTotal !== undefined ? manualGrandTotal : autoGrandTotal}
                      onChange={setManualGrandTotal}
                    />
                  </div>
                  {isForeign ? (
                    <div className="flex items-center justify-between pt-1 text-sm font-semibold">
                      <span>Converted INR total (₹)</span>
                      <span>{formatMoney(inrTotal)}</span>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto]">
                    <span>
                      Round-off adjustment (₹)
                      <span className="block text-[11px] opacity-70">
                        Use minus to reduce, e.g. -0.71
                      </span>
                    </span>
                    <SignedMoneyInput
                      className="h-9 sm:w-56"
                      value={roundOffAdj}
                      onChange={setRoundOffAdj}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between rounded-lg bg-navy px-3 py-2.5 text-base font-bold text-navy-foreground">
                    <span>Final payable amount (₹)</span>
                    <span>{formatMoney(payableTotal)}</span>
                  </div>
                  {inrTotal + roundOff < -0.005 ? (
                    <p className="text-xs text-destructive">
                      Round-off cannot make the payable amount negative.
                    </p>
                  ) : null}
                </div>

                {/* payment at creation */}
                <div className="rounded-xl border border-border p-3">
                  <p className="text-sm font-semibold text-navy">Payment</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(
                      [
                        { id: "full", label: "Full Advance" },
                        { id: "part", label: "Part Received" },
                        { id: "paid", label: "Paid" },
                        { id: "pending", label: "Pending" },
                      ] as { id: PayMode; label: string }[]
                    ).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        disabled={!!editing}
                        onClick={() => setPayMode(o.id)}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-sm font-medium",
                          payMode === o.id
                            ? "border-navy bg-navy text-navy-foreground"
                            : "border-border text-muted-foreground",
                          editing && "opacity-60",
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {editing ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Edit payments and allocations from Add Payment so no receipt is duplicated.
                    </p>
                  ) : payMode !== "pending" ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <FormField label="Amount received" required>
                        {payMode === "full" ? (
                          <MoneyInput
                            value={manualReceived !== undefined ? manualReceived : payableTotal}
                            onChange={setManualReceived}
                          />
                        ) : (
                          <MoneyInput
                            value={pay.amount}
                            onChange={(n) => setPay({ ...pay, amount: n })}
                          />
                        )}
                      </FormField>
                      <FormField label="Payment date" required>
                        <Input
                          type="date"
                          value={pay.date}
                          onChange={(e) => setPay({ ...pay, date: e.target.value })}
                        />
                      </FormField>
                      <FormField label="Bank / cash account" required>
                        <Select
                          value={pay.account}
                          onValueChange={(v) => setPay({ ...pay, account: v })}
                        >
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
                      <FormField
                        label="Reference / UTR"
                        hint="Select a past reference or type a new one."
                      >
                        <Combo
                          value={pay.reference}
                          options={referenceOptions}
                          onChange={(v) => setPay({ ...pay, reference: v })}
                        />
                      </FormField>
                    </div>
                  ) : null}
                  <p className="num mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    Pending after saving:{" "}
                    {formatMoney(round2(Math.max(0, payableTotal - receivedNow)))}
                  </p>
                </div>

                <FormField label="Notes (optional)">
                  <Textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </FormField>
              </>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 border-t border-border bg-card px-5 py-4">
            {kind ? (
              <>
                <Button disabled={saving} onClick={() => submit(false)}>
                  {editing ? "Save changes" : "Save Invoice"}
                </Button>
                <Button variant="outline" disabled={saving} onClick={() => submit(true)}>
                  Save &amp; Download PDF
                </Button>
              </>
            ) : null}
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CustomerForm
        open={customerFormOpen}
        customerId={customerFormId}
        onClose={() => setCustomerFormOpen(false)}
        onSaved={(id) => setForm((f) => ({ ...f, partyId: id }))}
      />
    </>
  );
}

/** ₹ input accepting a leading minus and decimals (round-off adjustment). */
function SignedMoneyInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  const [text, setText] = useState(value ? String(value) : "");
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value ? String(value) : "");
  }, [value, focused]);
  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder="0.00"
      aria-label="Round-off adjustment"
      className={cn("num", className)}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value.trim();
        const neg = raw.startsWith("-");
        let body = raw.replace(/[^\d.]/g, "");
        const dot = body.indexOf(".");
        if (dot !== -1) body = body.slice(0, dot + 1) + body.slice(dot + 1).replace(/\./g, "").slice(0, 2);
        const next = (neg ? "-" : "") + body;
        setText(next);
        const n = Number(body);
        onChange(Number.isFinite(n) ? round2(neg ? -n : n) : 0);
      }}
    />
  );
}
