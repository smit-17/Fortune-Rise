import { formatDate, formatDateTime, formatMoney } from "./format";
import { STATUS_LABEL } from "./sales";
import { printHtml } from "./salesReport";
import type { BillView, SupplierView } from "./purchase";
import type { Invoice } from "./types";

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = formatMoney;

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

function shell(title: string, periodLabel: string, inner: string): string {
  return `<h1>LEPDO</h1>
<h2>${esc(title)}</h2>
<p>Period: ${esc(periodLabel)}<br />Generated: ${esc(formatDateTime(new Date().toISOString()))}</p>
${inner}`;
}

function billTable(rows: BillView[]): string {
  return `<table border="1" cellspacing="0" cellpadding="6">
  <thead><tr><th>Date</th><th>Bill No.</th><th>Supplier</th><th>Broker</th><th align="right">Total</th><th align="right">Paid</th><th align="right">Pending</th><th>Status</th></tr></thead>
  <tbody>${
    rows
      .map(
        (v) =>
          `<tr><td>${esc(formatDate(v.bill.date))}</td><td>${esc(v.bill.number)}</td><td>${esc(v.supplier?.name ?? "—")}</td><td>${esc(v.bill.brokerName || "—")}</td><td align="right">${num(v.bill.total)}</td><td align="right">${num(v.paid)}</td><td align="right">${num(v.pending)}</td><td>${esc(STATUS_LABEL[v.status])}</td></tr>`,
      )
      .join("") || `<tr><td colspan="8">No purchase bills for the selected filters.</td></tr>`
  }</tbody>
  <tfoot><tr><th colspan="4" align="right">Totals</th><th align="right">${num(rows.reduce((s, v) => s + v.bill.total, 0))}</th><th align="right">${num(rows.reduce((s, v) => s + v.paid, 0))}</th><th align="right">${num(rows.reduce((s, v) => s + v.pending, 0))}</th><th></th></tr></tfoot>
</table>`;
}

function supplierTable(rows: SupplierView[]): string {
  return `<table border="1" cellspacing="0" cellpadding="6">
  <thead><tr><th>Supplier</th><th align="right">Bills</th><th align="right">Purchases</th><th align="right">Paid</th><th align="right">Advance</th><th align="right">Pending</th></tr></thead>
  <tbody>${
    rows
      .map(
        (s) =>
          `<tr><td>${esc(s.party.name)}</td><td align="right">${s.billCount}</td><td align="right">${num(s.totalPurchases)}</td><td align="right">${num(s.paid)}</td><td align="right">${num(s.advance)}</td><td align="right">${num(s.pending)}</td></tr>`,
      )
      .join("") || `<tr><td colspan="6">No suppliers for the selected filters.</td></tr>`
  }</tbody>
  <tfoot><tr><th align="right">Totals</th><th></th><th align="right">${num(rows.reduce((s, x) => s + x.totalPurchases, 0))}</th><th align="right">${num(rows.reduce((s, x) => s + x.paid, 0))}</th><th align="right">${num(rows.reduce((s, x) => s + x.advance, 0))}</th><th align="right">${num(rows.reduce((s, x) => s + x.pending, 0))}</th></tr></tfoot>
</table>`;
}

export type PurchaseReportKind =
  | { kind: "summary"; bills: BillView[]; suppliers: SupplierView[] }
  | { kind: "register"; bills: BillView[] }
  | { kind: "payable"; suppliers: SupplierView[] };

export function buildPurchaseReportHtml(
  report: PurchaseReportKind,
  periodLabel: string,
): { title: string; html: string } {
  if (report.kind === "summary") {
    const t = report.bills;
    const totals = `<table border="1" cellspacing="0" cellpadding="6">
      <thead><tr><th>Total Purchases</th><th>Paid</th><th>Pending</th><th>Paid Bills</th><th>Part-Paid Bills</th><th>Pending Bills</th><th>Overdue Bills</th></tr></thead>
      <tbody><tr>
        <td align="right">${num(t.reduce((s, v) => s + v.bill.total, 0))}</td>
        <td align="right">${num(t.reduce((s, v) => s + v.paid, 0))}</td>
        <td align="right">${num(t.reduce((s, v) => s + v.pending, 0))}</td>
        <td align="right">${t.filter((v) => v.status === "paid").length}</td>
        <td align="right">${t.filter((v) => v.status === "part").length}</td>
        <td align="right">${t.filter((v) => v.status === "pending").length}</td>
        <td align="right">${t.filter((v) => v.status === "overdue").length}</td>
      </tr></tbody></table>`;
    return {
      title: "Purchase Summary",
      html: shell(
        "Purchase Summary",
        periodLabel,
        `${totals}<h3>Purchase Bills</h3>${billTable(t)}<h3>Supplier Payable</h3>${supplierTable(report.suppliers)}`,
      ),
    };
  }
  if (report.kind === "register")
    return {
      title: "Purchase Register",
      html: shell("Purchase Register", periodLabel, billTable(report.bills)),
    };
  return {
    title: "Supplier Payable",
    html: shell("Supplier Payable", periodLabel, supplierTable(report.suppliers)),
  };
}

function fileName(title: string, ext: string) {
  return `LEPDO-${title.replace(/[^a-z0-9]+/gi, "-")}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

export function downloadPurchaseExcel(report: PurchaseReportKind, periodLabel: string) {
  const { title, html } = buildPurchaseReportHtml(report, periodLabel);
  download(
    `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8" /></head><body>${html}</body></html>`,
    fileName(title, "xls"),
    "application/vnd.ms-excel",
  );
}

export function downloadPurchasePdf(report: PurchaseReportKind, periodLabel: string): boolean {
  const { title, html } = buildPurchaseReportHtml(report, periodLabel);
  return printHtml(title, html);
}

/* ------------------------- single bill copy (PDF) ------------------------- */

function diamondRows(bill: Invoice): string {
  return `<table border="1" cellspacing="0" cellpadding="6">
  <thead><tr><th>Sr. No.</th><th>Description</th><th align="right">CT</th><th align="right">Price/CT USD</th><th align="right">Price/CT INR</th><th align="right">Total INR</th></tr></thead>
  <tbody>${(bill.lines ?? [])
    .map(
      (l, i) =>
        `<tr><td>${i + 1}</td><td>${esc(l.description)}</td><td align="right">${l.carat}</td><td align="right">${l.rateUsd ? l.rateUsd : "—"}</td><td align="right">${num(l.rate)}</td><td align="right">${num(l.carat * l.rate)}</td></tr>`,
    )
    .join("")}</tbody>
</table>`;
}

function makingRows(bill: Invoice): string {
  return `<table border="1" cellspacing="0" cellpadding="6">
  <thead><tr><th>Sr. No.</th><th>Description</th><th align="right">Qty</th><th align="right">Gross WT</th><th align="right">Net WT</th><th align="right">Diamond WT</th><th align="right">Making Rate</th><th align="right">Total</th></tr></thead>
  <tbody>${(bill.makingLines ?? [])
    .map(
      (l, i) =>
        `<tr><td>${i + 1}</td><td>${esc(l.description)}</td><td align="right">${l.quantity}</td><td align="right">${l.grossWeight}</td><td align="right">${l.netWeight}</td><td align="right">${l.diamondWeight}</td><td align="right">${num(l.makingRate)}</td><td align="right">${num(l.total)}</td></tr>`,
    )
    .join("")}</tbody>
</table>`;
}

export function downloadBillPdf(bill: Invoice, supplierName: string): boolean {
  const items = bill.billKind === "jewelry_making" ? makingRows(bill) : diamondRows(bill);
  const head = `<p>Bill: <strong>${esc(bill.number)}</strong><br />Supplier: ${esc(supplierName)}<br />Date: ${esc(formatDate(bill.date))}${bill.dueDate ? ` · Due: ${esc(formatDate(bill.dueDate))}` : ""}${bill.brokerName ? `<br />Broker: ${esc(bill.brokerName)}` : ""}${bill.supplierInvoiceNumber ? `<br />Supplier Invoice No.: ${esc(bill.supplierInvoiceNumber)}` : ""}${bill.usdRate ? `<br />USD rate: ${bill.usdRate}` : ""}</p>`;
  const totals = `<table border="1" cellspacing="0" cellpadding="6"><tbody>
    <tr><th align="right">Subtotal</th><td align="right">${num(bill.subtotal ?? bill.total)}</td></tr>
    <tr><th align="right">Grand Total</th><td align="right">${num(bill.total)}</td></tr>
    <tr><th align="right">Paid</th><td align="right">${num(bill.paid)}</td></tr>
    <tr><th align="right">Pending</th><td align="right">${num(Math.max(0, bill.total - bill.paid))}</td></tr>
  </tbody></table>`;
  return printHtml(
    `Purchase Bill ${bill.number}`,
    shell(
      `Purchase Bill ${bill.number}`,
      formatDate(bill.date),
      `${head}${items}${totals}${bill.notes ? `<p>Notes: ${esc(bill.notes)}</p>` : ""}`,
    ),
  );
}
