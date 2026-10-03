export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const inr = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(n: number): string {
  return `₹${inr.format(round2(n))}`;
}

const TIME_ZONE = "Asia/Kolkata";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const kolkataDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Matches a plain "YYYY-MM-DD" string with no time component. */
const PLAIN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatDate(iso: string): string {
  if (!iso) return iso;
  if (PLAIN_DATE_RE.test(iso)) {
    const [y, m, d] = iso.split("-");
    const monthIdx = Number(m) - 1;
    if (monthIdx < 0 || monthIdx > 11) return iso;
    return `${d} ${MONTHS[monthIdx]} ${y}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = kolkataDateFormatter.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const monthIdx = Number(m) - 1;
  if (monthIdx < 0 || monthIdx > 11) return iso;
  return `${day} ${MONTHS[monthIdx]} ${y}`;
}

export function formatDateTime(iso: string): string {
  if (!iso) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dateTimeFormatter.format(d).replace(",", "");
}

export function todayISO(): string {
  return kolkataDateFormatter.format(new Date());
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
