import { describe, expect, it } from "vitest";
import { bankRange } from "@/lib/lepdo/bank";
import { drawingRange } from "@/lib/lepdo/drawings";
import { rangeFor } from "@/lib/lepdo/period";

// Bank, Other Bank, Cash Book and Expense use bankRange; Drawings uses
// drawingRange; P&L uses rangeFor, the same unchanged helper as the header.
for (const [name, range] of [
  ["ledger pages", bankRange],
  ["drawings", drawingRange],
  ["P&L", rangeFor],
] as const) {
  describe(name, () => {
    const today = "2026-11-13";
    const from = "2026-09-02";
    const to = "2026-10-17";
    it("Today includes only the supplied local calendar date", () => {
      expect(range("today", today, from, to)).toEqual(["2026-11-13", "2026-11-13"]);
    });
    it("This Week starts Monday and ends Sunday", () => {
      expect(range("week", today, from, to)).toEqual(["2026-11-09", "2026-11-15"]);
    });
    it("This Month includes the complete calendar month", () => {
      expect(range("month", today, from, to)).toEqual(["2026-11-01", "2026-11-30"]);
    });
    it("This Financial Year uses April through March", () => {
      expect(range("fy", today, from, to)).toEqual(["2026-04-01", "2027-03-31"]);
      expect(range("fy", "2026-03-31", from, to)).toEqual(["2025-04-01", "2026-03-31"]);
    });
    it("All Time has no record date restriction", () => {
      expect(range("all", today, from, to)).toEqual(["0000-01-01", "9999-12-31"]);
    });
    it("Custom Date retains the selected inclusive bounds", () => {
      expect(range("custom", today, from, to)).toEqual(["2026-09-02", "2026-10-17"]);
    });
  });
}