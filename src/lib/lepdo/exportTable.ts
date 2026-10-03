import { toast } from "sonner";
import { formatDate, formatMoney } from "./format";

export interface ExportColumn {
  key: string;
  label: string;
  money?: boolean;
  date?: boolean;
  align?: "left" | "right";
}

export type ExportRow = Record<string, string | number | null | undefined>;

export interface ExportTable {
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  /** optional label/value pairs shown above the table */
  summary?: { label: string; value: string }[];
  /** optional totals row keyed by column key */
  totals?: ExportRow;
}

const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
const enc = (v: string) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function cell(col: ExportColumn, row: ExportRow, raw = false): string {
  const v = row[col.key];
  if (v === null || v === undefined || v === "") return "";
  if (col.money) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isNaN(n)) return String(v);
    return raw ? n.toFixed(2) : formatMoney(n);
  }
  if (col.date) return raw ? String(v) : formatDate(String(v));
  return String(v);
}

function download(content: BlobPart, filename: string, mime: string): boolean {
  if (typeof document === "undefined") return false;
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function tableHtml(t: ExportTable): string {
  const head = t.columns
    .map((c) => `<th class="${c.align === "right" || c.money ? "r" : ""}">${enc(c.label)}</th>`)
    .join("");
  const body = t.rows
    .map(
      (r) =>
        `<tr>${t.columns
          .map(
            (c) =>
              `<td class="${c.align === "right" || c.money ? "r num" : ""}">${enc(cell(c, r))}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  const totals = t.totals
    ? `<tr class="tot">${t.columns
        .map(
          (c, i) =>
            `<td class="${c.align === "right" || c.money ? "r num" : ""}">${
              i === 0 && t.totals?.[c.key] === undefined ? "Total" : enc(cell(c, t.totals ?? {}))
            }</td>`,
        )
        .join("")}</tr>`
    : "";
  const summary = t.summary?.length
    ? `<div class="sum">${t.summary
        .map((s) => `<span><b>${enc(s.label)}:</b> ${enc(s.value)}</span>`)
        .join("")}</div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${enc(t.title)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#1b1b1f;padding:22px}
h1{font-size:18px;margin:0;color:#2d2d61}
p.sub{margin:4px 0 14px;font-size:12px;color:#666}
.sum{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:14px;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #dcdce3;padding:6px 8px;text-align:left}
th{background:#f4f5f7;color:#2d2d61}
td.r,th.r{text-align:right}
tr.tot td{background:#fff6d8;font-weight:700}
.num{font-variant-numeric:tabular-nums}
@media print{body{padding:0}}
</style></head><body>
<h1>LEPDO — ${enc(t.title)}</h1>
<p class="sub">${enc(t.subtitle ?? "")}</p>
${summary}
<table><thead><tr>${head}</tr></thead><tbody>${body}${totals}</tbody></table>
</body></html>`;
}

export function downloadTableExcel(t: ExportTable): boolean {
  if (typeof document === "undefined") return false;
  if (!t.rows.length) {
    toast.error("Nothing to export — no rows match the current filters.");
    return false;
  }
  return download(tableHtml(t), `lepdo-${slug(t.title)}.xls`, "application/vnd.ms-excel");
}

export function downloadTableCsv(t: ExportTable): boolean {
  if (typeof document === "undefined") return false;
  if (!t.rows.length) {
    toast.error("Nothing to export — no rows match the current filters.");
    return false;
  }
  const lines = [
    esc(`LEPDO — ${t.title}`),
    ...(t.subtitle ? [esc(t.subtitle)] : []),
    ...(t.summary ?? []).map((s) => `${esc(s.label)},${esc(s.value)}`),
    "",
    t.columns.map((c) => esc(c.label)).join(","),
    ...t.rows.map((r) => t.columns.map((c) => esc(cell(c, r, true))).join(",")),
    ...(t.totals ? [t.columns.map((c) => esc(cell(c, t.totals ?? {}, true))).join(",")] : []),
  ];
  return download(lines.join("\n"), `lepdo-${slug(t.title)}.csv`, "text/csv;charset=utf-8");
}

export function downloadTablePdf(t: ExportTable): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  if (!t.rows.length) {
    toast.error("Nothing to export — no rows match the current filters.");
    return false;
  }
  const w = window.open("", "_blank", "width=980,height=760");
  if (!w) return false;
  w.document.write(tableHtml(t));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
  return true;
}
