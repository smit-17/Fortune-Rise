import type { Party } from "./types";

export interface FounderAccount {
  id: string;
  name: string;
  /** pastel background utility */
  bg: string;
}

export const DRAWING_ACCOUNTS: FounderAccount[] = [
  { id: "p_brijes", name: "Brijes", bg: "bg-pl-blue" },
  { id: "p_dixit", name: "Dixit", bg: "bg-pl-purple" },
  { id: "p_jdhome", name: "JD Home", bg: "bg-pl-pink" },
];

export const DRAWING_PARTIES: Party[] = DRAWING_ACCOUNTS.map((a) => ({
  id: a.id,
  name: a.name,
  type: "founder" as const,
}));

export const DRAWING_CATEGORIES = [
  "Personal Use",
  "Founder Salary/Remuneration",
  "Home/Family Expense",
  "Travel",
  "Food",
  "Shopping",
  "Medical",
  "EMI/Loan Payment",
  "Personal Investment Paid by Business",
  "Cash Withdrawal",
  "Transfer to JD Home",
  "Other",
] as const;

export type DrawingPreset = "month" | "quarter" | "fy" | "custom";

export const DRAWING_PRESETS: { id: DrawingPreset; label: string }[] = [
  { id: "month", label: "This Month" },
  { id: "quarter", label: "This Quarter" },
  { id: "fy", label: "This Financial Year" },
  { id: "custom", label: "Custom Date" },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function drawingRange(
  preset: DrawingPreset,
  today: string,
  from: string,
  to: string,
): [string, string] {
  const d = new Date(today);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (preset === "custom") return [from, to];
  if (preset === "quarter") {
    const q = Math.floor(m / 3) * 3;
    return [iso(new Date(Date.UTC(y, q, 1))), iso(new Date(Date.UTC(y, q + 3, 0)))];
  }
  if (preset === "fy") {
    const fy = m >= 3 ? y : y - 1;
    return [`${fy}-04-01`, `${fy + 1}-03-31`];
  }
  return [iso(new Date(Date.UTC(y, m, 1))), iso(new Date(Date.UTC(y, m + 1, 0)))];
}
