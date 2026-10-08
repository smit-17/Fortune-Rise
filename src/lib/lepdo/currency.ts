import { round2 } from "./format";
import type { Invoice } from "./types";

/** Single source of truth for invoice currency symbols and amounts. */
const SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "C$",
  AUD: "A$",
  AED: "AED ",
};

export function normCurrency(code: string | undefined | null): string {
  const c = (code ?? "").trim().toUpperCase();
  return c || "INR";
}

export function currencySymbol(code: string | undefined | null): string {
  const c = normCurrency(code);
  return SYMBOLS[c] ?? `${c} `;
}

const fmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtIntl = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(n: number, code: string | undefined | null): string {
  const c = normCurrency(code);
  const body = (c === "INR" ? fmt : fmtIntl).format(round2(n || 0));
  return `${currencySymbol(c)}${body}`;
}

export function isForeignInvoice(inv: Pick<Invoice, "currency">): boolean {
  return normCurrency(inv.currency) !== "INR";
}

export interface InvoiceCurrencyAmounts {
  currency: string;
  rate: number;
  subtotal: number;
  discount: number;
  shipping: number;
  taxableAmount: number;
  taxAmount: number;
  /** grand total in invoice currency, before any INR round-off */
  grandTotal: number;
  /** INR grand total (INR invoice) or converted INR total, before round-off */
  convertedInr: number;
  /** manual INR round-off adjustment (+/-) */
  roundOff: number;
  /** final INR payable = convertedInr + roundOff (the stored invoice total) */
  inrTotal: number;
}

/**
 * Amounts in the invoice's own currency. Foreign invoices use the stored
 * original-currency fields; older invoices (saved before those fields existed)
 * derive them once from the stored INR values ÷ exchange rate.
 */
export function invoiceAmounts(inv: Invoice): InvoiceCurrencyAmounts {
  const currency = normCurrency(inv.currency);
  const roundOff = round2(inv.roundOff ?? 0);
  const convertedInr = round2(inv.total - roundOff);
  if (currency === "INR") {
    const subtotal = round2(inv.subtotal ?? inv.total);
    return {
      currency,
      rate: 1,
      subtotal,
      discount: round2(inv.discount ?? 0),
      shipping: round2(inv.shipping ?? 0),
      taxableAmount: round2(inv.taxableAmount ?? inv.total),
      taxAmount: round2(inv.taxAmount ?? 0),
      grandTotal: convertedInr,
      convertedInr,
      roundOff,
      inrTotal: round2(inv.total),
    };
  }
  const rate = inv.exchangeRate && inv.exchangeRate > 0 ? inv.exchangeRate : 1;
  const back = (n: number | undefined) => round2((n ?? 0) / rate);
  const grandTotal = round2(inv.foreignTotal ?? convertedInr / rate);
  return {
    currency,
    rate,
    subtotal: inv.foreignSubtotal ?? back(inv.subtotal ?? inv.total),
    discount: inv.foreignDiscount ?? back(inv.discount),
    shipping: inv.foreignShipping ?? back(inv.shipping),
    taxableAmount: inv.foreignTaxableAmount ?? back(inv.taxableAmount ?? inv.total),
    taxAmount: inv.foreignTaxAmount ?? back(inv.taxAmount),
    grandTotal,
    convertedInr,
    roundOff,
    inrTotal: round2(inv.total),
  };
}

/** Convert a money value between currencies via INR, using the given rates (1 unit → ₹). */
export function convertAmount(n: number, fromRate: number, toRate: number): number {
  if (!(fromRate > 0) || !(toRate > 0)) return n;
  return round2((n * fromRate) / toRate);
}

/** Final INR payable after a manual round-off; never below zero. */
export function finalPayable(convertedInr: number, roundOff: number): number {
  return round2(Math.max(0, convertedInr + (roundOff || 0)));
}
