import type { Party } from "./types";
import { PRESETS, rangeFor, type Preset } from "./period";

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

export type DrawingPreset = Preset;

export const DRAWING_PRESETS = PRESETS;

export function drawingRange(
  preset: DrawingPreset,
  today: string,
  from: string,
  to: string,
): [string, string] {
  return [...rangeFor(preset, today, from, to)];
}
