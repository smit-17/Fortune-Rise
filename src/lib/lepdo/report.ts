import { formatDate, formatMoney, formatDateTime } from "./format";

export interface ReportRow {
  date: string;
  bank: string;
  category: string;
  particulars: string;
  reference: string;
  credit: number;
  debit: number;
  balance: number;
}

export interface ReportMeta {
  bankLabel: string;
  periodLabel: string;
  opening: number;
  totalCredit: number;
  totalDebit: number;
  closing: number;
}

const HEADERS = [
  "Date",
  "Bank",
  "Category",
  "Particulars",
  "Reference/UTR",
  "Credit",
  "Debit",
  "Balance",
];

function fileStamp(): string {
  return new Date().toISOString().slice(0, 10);
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

const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
const html = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const n2 = (n: number) => (n ? n.toFixed(2) : "");

export function downloadCsv(rows: ReportRow[], meta: ReportMeta) {
  const lines: string[] = [
    esc("LEPDO — Bank Ledger Report"),
    `${esc("Bank")},${esc(meta.bankLabel)}`,
    `${esc("Period")},${esc(meta.periodLabel)}`,
    `${esc("Opening Balance")},${meta.opening.toFixed(2)}`,
    "",
    HEADERS.map(esc).join(","),
    ...rows.map((r) =>
      [
        esc(formatDate(r.date)),
        esc(r.bank),
        esc(r.category),
        esc(r.particulars),
        esc(r.reference),
        n2(r.credit),
        n2(r.debit),
        r.balance.toFixed(2),
      ].join(","),
    ),
    "",
    `${esc("Total Credit")},${meta.totalCredit.toFixed(2)}`,
    `${esc("Total Debit")},${meta.totalDebit.toFixed(2)}`,
    `${esc("Closing Balance")},${meta.closing.toFixed(2)}`,
    `${esc("Report generated")},${esc(formatDateTime(new Date().toISOString()))}`,
  ];
  download(
    `\uFEFF${lines.join("\r\n")}`,
    `LEPDO-Bank-Ledger-${fileStamp()}.csv`,
    "text/csv;charset=utf-8",
  );
}

function tableHtml(rows: ReportRow[], meta: ReportMeta): string {
  return `<table border="1" cellspacing="0" cellpadding="6">
  <thead>
    <tr><th colspan="8" style="font-size:16px;text-align:left">LEPDO — Bank Ledger Report</th></tr>
    <tr><td colspan="4">Bank: ${html(meta.bankLabel)}</td><td colspan="4">Period: ${html(meta.periodLabel)}</td></tr>
    <tr><td colspan="4">Opening Balance</td><td colspan="4">${formatMoney(meta.opening)}</td></tr>
    <tr>${HEADERS.map((h) => `<th>${h}</th>`).join("")}</tr>
  </thead>
  <tbody>
    ${rows
      .map(
        (r) => `<tr>
      <td>${html(formatDate(r.date))}</td>
      <td>${html(r.bank)}</td>
      <td>${html(r.category)}</td>
      <td>${html(r.particulars)}</td>
      <td>${html(r.reference)}</td>
      <td align="right">${r.credit ? formatMoney(r.credit) : ""}</td>
      <td align="right">${r.debit ? formatMoney(r.debit) : ""}</td>
      <td align="right">${formatMoney(r.balance)}</td>
    </tr>`,
      )
      .join("")}
    ${rows.length ? "" : `<tr><td colspan="8">No entries for the selected filters.</td></tr>`}
  </tbody>
  <tfoot>
    <tr><th colspan="5" align="right">Total Credit</th><th colspan="3" align="right">${formatMoney(meta.totalCredit)}</th></tr>
    <tr><th colspan="5" align="right">Total Debit</th><th colspan="3" align="right">${formatMoney(meta.totalDebit)}</th></tr>
    <tr><th colspan="5" align="right">Closing Balance</th><th colspan="3" align="right">${formatMoney(meta.closing)}</th></tr>
    <tr><td colspan="8">Report generated: ${html(formatDateTime(new Date().toISOString()))}</td></tr>
  </tfoot>
</table>`;
}

export function downloadExcel(rows: ReportRow[], meta: ReportMeta) {
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" /></head><body>${tableHtml(rows, meta)}</body></html>`;
  download(doc, `LEPDO-Bank-Ledger-${fileStamp()}.xls`, "application/vnd.ms-excel");
}

export function downloadPdf(rows: ReportRow[], meta: ReportMeta) {
  const doc = `<!doctype html><html><head><meta charset="utf-8" /><title>LEPDO Bank Ledger Report</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#2d2d61;padding:24px;font-size:12px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #d7d7e2;padding:6px 8px;text-align:left;vertical-align:top}
  thead th{background:#f4f5f7}
  tfoot th{background:#fff6d8}
  td[align="right"],th[align="right"]{text-align:right}
</style></head><body>${tableHtml(rows, meta)}
<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(doc);
  w.document.close();
  return true;
}
