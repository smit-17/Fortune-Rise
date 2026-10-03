export type Preset = "today" | "week" | "month" | "fy" | "all" | "custom";

export const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "fy", label: "This Financial Year" },
  { id: "all", label: "All Time" },
  { id: "custom", label: "Custom Date" },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function rangeFor(
  preset: Preset,
  today: string,
  customFrom: string,
  customTo: string,
): readonly [string, string] {
  const d = new Date(today);
  if (preset === "today") return [today, today];
  if (preset === "week") {
    const day = (d.getUTCDay() + 6) % 7;
    const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
    const to = new Date(from);
    to.setUTCDate(from.getUTCDate() + 6);
    return [iso(from), iso(to)];
  }
  if (preset === "fy") {
    const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return [`${y}-04-01`, `${y + 1}-03-31`];
  }
  if (preset === "all") return ["0000-01-01", "9999-12-31"];
  if (preset === "custom") return [customFrom, customTo];
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return [iso(from), iso(to)];
}

export function periodLabel(preset: Preset): string {
  return PRESETS.find((p) => p.id === preset)?.label ?? "This Month";
}

/* ---------------- ISO week (Monday start), Asia/Kolkata calendar dates ---------------- */

/** ISO-8601 week key "YYYY-Www" for a "YYYY-MM-DD" date string. */
export function isoWeekKey(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // move to Thursday of this week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** [Monday, Sunday] date range ("YYYY-MM-DD") for an ISO week key "YYYY-Www". */
export function isoWeekRange(key: string): readonly [string, string] {
  const [yStr, wStr] = key.split("-W");
  const y = Number(yStr);
  const w = Number(wStr) || 1;
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (w - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const iso = (dd: Date) => dd.toISOString().slice(0, 10);
  return [iso(monday), iso(sunday)];
}
