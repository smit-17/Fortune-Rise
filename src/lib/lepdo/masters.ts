import { uid } from "./format";
import type { MasterValue } from "./types";

export interface MasterMeta {
  id: string;
  label: string;
  /** short helper shown under the master name */
  hint: string;
  defaults: string[];
}

/**
 * Reusable searchable master lists. Values feed every dropdown in the app
 * (Settings › Master Data) and are never rewritten on historical records.
 */
export const MASTERS: MasterMeta[] = [
  {
    id: "persons",
    label: "Persons",
    hint: "Uchhina / other person names",
    defaults: [],
  },
  {
    id: "platforms",
    label: "Order Platforms",
    hint: "Sales order platform dropdown",
    defaults: [
      "Pure Sale/Direct",
      "Etsy",
      "Alibaba",
      "Website",
      "IndiaMART",
      "BNI",
      "WhatsApp",
      "Instagram",
      "Referral",
      "Walk-in",
      "Other",
    ],
  },
  {
    id: "saleTypes",
    label: "Sale Types",
    hint: "UE / UI / Export / GST INR",
    defaults: ["UE", "UI", "Export", "GST INR"],
  },
  {
    id: "purchaseTypes",
    label: "Purchase Types",
    hint: "Non-GST / GST / Import",
    defaults: ["Non-GST", "GST", "Import"],
  },
  {
    id: "currencies",
    label: "Currencies",
    hint: "Invoice currency dropdown",
    defaults: ["INR", "USD", "EUR", "GBP", "CAD", "AUD", "AED"],
  },
  {
    id: "exchangeRates",
    label: "Exchange Rates",
    hint: "Default rate per currency, e.g. USD = 84.00",
    defaults: ["USD = 84.00", "EUR = 92.00", "GBP = 107.00", "AED = 23.00"],
  },
  {
    id: "paymentModes",
    label: "Payment Modes",
    hint: "Bank / cash payment mode dropdown",
    defaults: ["Bank Transfer", "NEFT", "RTGS", "IMPS", "UPI", "Cheque", "Cash", "Card", "Other"],
  },
  {
    id: "paymentStatuses",
    label: "Payment Statuses",
    hint: "Invoice payment status labels",
    defaults: ["Paid", "Part Paid", "Pending", "Overdue", "Advance"],
  },
  {
    id: "productDescriptions",
    label: "Diamond / Product Descriptions",
    hint: "Reusable invoice line descriptions",
    defaults: [
      "Lab-Grown Diamond",
      "Lab-Grown Diamond Melee",
      "CVD Lab-Grown Diamond",
      "HPHT Lab-Grown Diamond",
      "Moissanite",
      "Gemstone",
      "CZ",
      "Diamond Jewellery",
      "Custom Description",
    ],
  },
  {
    id: "hsnCodes",
    label: "HSN Codes",
    hint: "Printed on invoice lines",
    defaults: ["71049120", "71131910", "71023910"],
  },
  {
    id: "gstTypes",
    label: "GST / Tax Types",
    hint: "IGST, CGST+SGST or Non-GST",
    defaults: ["IGST", "CGST + SGST", "Non-GST", "LUT / Export (0%)"],
  },
  {
    id: "expenseCategories",
    label: "Expense Categories",
    hint: "Expense ledger heads",
    defaults: [
      "Office Expenses",
      "Salary",
      "Rent",
      "Travel",
      "Courier & Shipping",
      "Marketing",
      "Professional Fees",
      "Bank Charges",
      "Utilities",
      "Other",
    ],
  },
  {
    id: "jewelleryCategories",
    label: "Jewellery Categories",
    hint: "Ring, Bracelet, Necklace…",
    defaults: ["Ring", "Bracelet", "Necklace", "Earring", "Other"],
  },
  {
    id: "metals",
    label: "Metals",
    hint: "Metal dropdown for jewellery",
    defaults: [
      "9K Gold",
      "10K Gold",
      "14K Gold",
      "18K Gold",
      "24K Gold",
      "925 Silver",
      "Pure Platinum",
    ],
  },
  {
    id: "metalColours",
    label: "Metal Colours",
    hint: "Yellow / White / Rose",
    defaults: ["Yellow", "White", "Rose"],
  },
  {
    id: "stoneTypes",
    label: "Stone Types",
    hint: "Stone dropdown for jewellery",
    defaults: [
      "Lab-Grown Diamond",
      "Moissanite Diamond",
      "CZ Stone",
      "Gemstone",
      "Other",
    ],
  },
  {
    id: "taxSlabs",
    label: "Tax Slabs",
    hint: "GST rates offered on invoices",
    defaults: ["0", "0.25", "1.5", "3", "5", "12", "18", "28"],
  },
  {
    id: "drawingCategories",
    label: "Drawing Categories",
    hint: "Founder drawing heads",
    defaults: ["Personal Use", "Household", "Family", "Travel", "Other"],
  },
];

/**
 * Values retired from the app. They are pruned from stored master lists so old
 * saved records keep their text while the dropdowns stop offering them.
 */
export const RETIRED_MASTER_VALUES: Record<string, string[]> = {
  saleTypes: ["gst", "gst inr (gst)", "gst (inr)"],
  stoneTypes: ["natural diamond"],
  productDescriptions: ["natural diamond", "lab grown diamond"],
};

export const MASTER_IDS = MASTERS.map((m) => m.id);

export function buildDefaultMasters(): Record<string, MasterValue[]> {
  const out: Record<string, MasterValue[]> = {};
  for (const m of MASTERS) {
    out[m.id] = m.defaults.map((name) => ({ id: uid("mv"), name, active: true }));
  }
  return out;
}

/**
 * Merge stored masters with defaults: stored values (and their active flags)
 * win, and any default value missing from a stored list is appended so new
 * default options appear automatically without touching history.
 */
export function mergeMasters(
  stored: Record<string, MasterValue[]> | undefined,
): Record<string, MasterValue[]> {
  const base = buildDefaultMasters();
  if (!stored) return base;
  const out: Record<string, MasterValue[]> = { ...base };
  for (const key of Object.keys(stored)) {
    const list = stored[key];
    if (!Array.isArray(list) || !list.length) continue;
    const defaults = base[key] ?? [];
    const retired = new Set(RETIRED_MASTER_VALUES[key] ?? []);
    const seen = new Set<string>();
    const kept: MasterValue[] = [];
    for (const v of list) {
      const norm = v.name.trim().toLowerCase();
      if (!norm || retired.has(norm) || seen.has(norm)) continue;
      seen.add(norm);
      kept.push(v);
    }
    out[key] = [...kept, ...defaults.filter((d) => !seen.has(d.name.trim().toLowerCase()))];
  }
  return out;
}

/** Active values of one master, alphabetical-stable (insertion order kept). */
export function masterOptions(
  masters: Record<string, MasterValue[]>,
  id: string,
  includeInactive = false,
): string[] {
  const list = masters[id] ?? [];
  return list.filter((v) => includeInactive || v.active).map((v) => v.name);
}

export const TAX_SLABS = [0, 0.25, 1.5, 3, 5, 12, 18, 28];
