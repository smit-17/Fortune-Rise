import { describe, expect, it } from "vitest";
import { convertAmount, formatCurrency, invoiceAmounts } from "@/lib/lepdo/currency";
import type { Invoice } from "@/lib/lepdo/types";

const ue35 = {
  id: "x", number: "UE-35", partyId: "p", date: "2026-10-01", paid: 0,
  currency: "USD", exchangeRate: 95.36, subtotal: 62327.3, discount: 0,
  shipping: 9536, taxableAmount: 71863.3, taxAmount: 0, foreignTotal: 753.6, total: 71863.3,
} as Invoice;

describe("invoice currency", () => {
  it("UE-35 old invoice shows shipping as $100 and grand total $753.60", () => {
    const a = invoiceAmounts(ue35);
    expect(a.shipping).toBe(100);
    expect(a.subtotal).toBe(653.6);
    expect(a.grandTotal).toBe(753.6);
    expect(a.inrTotal).toBe(71863.3);
  });
  it("converts ₹9,600 to $100 at ₹96", () => {
    expect(convertAmount(9600, 1, 96)).toBe(100);
  });
  it("uses currency symbols", () => {
    expect(formatCurrency(100, "USD")).toBe("$100.00");
    expect(formatCurrency(100, "CAD")).toBe("C$100.00");
  });
});

describe("round-off adjustment", () => {
  it("negative round-off reduces the INR payable, foreign grand total untouched", () => {
    const a = invoiceAmounts({ ...ue35, roundOff: -0.3, total: 71863 } as Invoice);
    expect(a.grandTotal).toBe(753.6);
    expect(a.convertedInr).toBe(71863.3);
    expect(a.inrTotal).toBe(71863);
  });
  it("final payable never goes below zero", async () => {
    const { finalPayable } = await import("@/lib/lepdo/currency");
    expect(finalPayable(100, 0.5)).toBe(100.5);
    expect(finalPayable(100, -150)).toBe(0);
  });
});
