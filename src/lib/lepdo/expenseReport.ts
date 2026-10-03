import { formatDate, formatDateTime, formatMoney } from "./format";

export interface ExpenseReportRow {
  date: string;
  category: string;
  particulars: string;
  paymentFrom: string;
  reference: string;
  amount: number;
  paid: boolean;
}

export interface ExpenseReportMeta {
  periodLabel: string;
  categoryLabel: string;
  sourceLabel: string;
  categoryTotals: { label: string; amount: number }[];
  paidTotal: number;
  unpaidTotal: number;
  grandTotal: number;
}

const HEADERS = [
  "Date",
  "Category",
  "Particulars",
  "Payment From",
  "Reference",
  "Amount",
  "Status",
];

const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
const html = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const stamp = () => new Date().toISOString().slice(0, 10);

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

export function downloadExpenseCsv(rows: ExpenseReportRow[], meta: ExpenseReportMeta) {
  const lines: string[] = [
    esc("LEPDO — Expense Ledger Report"),
    `${esc("Period")},${esc(meta.periodLabel)}`,
    `${esc("Category filter")},${esc(meta.categoryLabel)}`,
    `${esc("Payment source filter")},${esc(meta.sourceLabel)}`,
    "",
    HEADERS.map(esc).join(","),
    ...rows.map((r) =>
      [
        esc(formatDate(r.date)),
        esc(r.category),
        esc(r.particulars),
        esc(r.paymentFrom),
        esc(r.reference),
        r.amount.toFixed(2),
        esc(r.paid ? "Paid" : "Unpaid"),
      ].join(","),
    ),
    "",
    esc("Category-wise totals"),
    ...meta.categoryTotals.map((c) => `${esc(c.label)},${c.amount.toFixed(2)}`),
    "",
    `${esc("Paid total")},${meta.paidTotal.toFixed(2)}`,
    `${esc("Unpaid total")},${meta.unpaidTotal.toFixed(2)}`,
    `${esc("Grand total")},${meta.grandTotal.toFixed(2)}`,
    `${esc("Report generated")},${esc(formatDateTime(new Date().toISOString()))}`,
  ];
  download(
    `\uFEFF${lines.join("\r\n")}`,
    `LEPDO-Expense-Ledger-${stamp()}.csv`,
    "text/csv;charset=utf-8",
  );
}

function tableHtml(rows: ExpenseReportRow[], meta: ExpenseReportMeta): string {
  return `<table border="1" cellspacing="0" cellpadding="6">
  <thead>
    <tr><th colspan="7" style="font-size:16px;text-align:left">LEPDO — Expense Ledger Report</th></tr>
    <tr><td colspan="4">Period: ${html(meta.periodLabel)}</td><td colspan="3">Category: ${html(meta.categoryLabel)}</td></tr>
    <tr><td colspan="7">Payment source: ${html(meta.sourceLabel)}</td></tr>
    <tr>${HEADERS.map((h) => `<th>${h}</th>`).join("")}</tr>
  </thead>
  <tbody>
    ${rows
      .map(
        (r) => `<tr>
      <td>${html(formatDate(r.date))}</td>
      <td>${html(r.category)}</td>
      <td>${html(r.particulars)}</td>
      <td>${html(r.paymentFrom)}</td>
      <td>${html(r.reference)}</td>
      <td align="right">${formatMoney(r.amount)}</td>
      <td>${r.paid ? "Paid" : "Unpaid"}</td>
    </tr>`,
      )
      .join("")}
    ${rows.length ? "" : `<tr><td colspan="7">No expenses for the selected filters.</td></tr>`}
  </tbody>
  <tfoot>
    <tr><th colspan="7" align="left">Category-wise totals</th></tr>
    ${meta.categoryTotals
      .map(
        (c) =>
          `<tr><td colspan="5">${html(c.label)}</td><td align="right">${formatMoney(c.amount)}</td><td></td></tr>`,
      )
      .join("")}
    <tr><th colspan="5" align="right">Paid total</th><th colspan="2" align="right">${formatMoney(meta.paidTotal)}</th></tr>
    <tr><th colspan="5" align="right">Unpaid total</th><th colspan="2" align="right">${formatMoney(meta.unpaidTotal)}</th></tr>
    <tr><th colspan="5" align="right">Grand total</th><th colspan="2" align="right">${formatMoney(meta.grandTotal)}</th></tr>
    <tr><td colspan="7">Report generated: ${html(formatDateTime(new Date().toISOString()))}</td></tr>
  </tfoot>
</table>`;
}

export function downloadExpenseExcel(rows: ExpenseReportRow[], meta: ExpenseReportMeta) {
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" /></head><body>${tableHtml(rows, meta)}</body></html>`;
  download(doc, `LEPDO-Expense-Ledger-${stamp()}.xls`, "application/vnd.ms-excel");
}

export function downloadExpensePdf(rows: ExpenseReportRow[], meta: ExpenseReportMeta) {
  const doc = `<!doctype html><html><head><meta charset="utf-8" /><title>LEPDO Expense Ledger Report</title>
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
