import { formatDate, formatDateTime, formatMoney } from "./format";

export interface CashReportRow {
  date: string;
  category: string;
  particulars: string;
  reference: string;
  cashIn: number;
  cashOut: number;
  balance: number;
}

export interface CashReportMeta {
  bookLabel: string;
  periodLabel: string;
  opening: number;
  totalIn: number;
  totalOut: number;
  closing: number;
}

const HEADERS = ["Date", "Category", "Particulars", "Reference", "Cash In", "Cash Out", "Balance"];

const html = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function fileName(meta: CashReportMeta, ext: string): string {
  const slug = meta.bookLabel.replace(/[^a-z0-9]+/gi, "-");
  return `LEPDO-${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function download(content: BlobPart, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function tableHtml(rows: CashReportRow[], meta: CashReportMeta): string {
  return `<table border="1" cellspacing="0" cellpadding="6">
  <thead>
    <tr><th colspan="7" style="font-size:16px;text-align:left">LEPDO — ${html(meta.bookLabel)}</th></tr>
    <tr><td colspan="4">Period: ${html(meta.periodLabel)}</td><td colspan="3">Opening Balance: ${formatMoney(meta.opening)}</td></tr>
    <tr>${HEADERS.map((h) => `<th>${h}</th>`).join("")}</tr>
  </thead>
  <tbody>
    ${rows
      .map(
        (r) => `<tr>
      <td>${html(formatDate(r.date))}</td>
      <td>${html(r.category)}</td>
      <td>${html(r.particulars)}</td>
      <td>${html(r.reference)}</td>
      <td align="right">${r.cashIn ? formatMoney(r.cashIn) : ""}</td>
      <td align="right">${r.cashOut ? formatMoney(r.cashOut) : ""}</td>
      <td align="right">${formatMoney(r.balance)}</td>
    </tr>`,
      )
      .join("")}
    ${rows.length ? "" : `<tr><td colspan="7">No entries for the selected filters.</td></tr>`}
  </tbody>
  <tfoot>
    <tr><th colspan="4" align="right">Total Cash In</th><th colspan="3" align="right">${formatMoney(meta.totalIn)}</th></tr>
    <tr><th colspan="4" align="right">Total Cash Out</th><th colspan="3" align="right">${formatMoney(meta.totalOut)}</th></tr>
    <tr><th colspan="4" align="right">Closing Balance</th><th colspan="3" align="right">${formatMoney(meta.closing)}</th></tr>
    <tr><td colspan="7">Report generated: ${html(formatDateTime(new Date().toISOString()))}</td></tr>
  </tfoot>
</table>`;
}

export function downloadCashExcel(rows: CashReportRow[], meta: CashReportMeta) {
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" /></head><body>${tableHtml(rows, meta)}</body></html>`;
  download(doc, fileName(meta, "xls"), "application/vnd.ms-excel");
}

export function downloadCashPdf(rows: CashReportRow[], meta: CashReportMeta): boolean {
  const doc = `<!doctype html><html><head><meta charset="utf-8" /><title>LEPDO ${html(meta.bookLabel)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#2d2d61;padding:24px;font-size:12px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #e7e8ee;padding:6px 8px;text-align:left;vertical-align:top}
  thead th{background:#f0f1f4}
  tfoot th{background:#e8f1ff}
  td[align="right"],th[align="right"]{text-align:right}
</style></head><body>${tableHtml(rows, meta)}
<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(doc);
  w.document.close();
  return true;
}
