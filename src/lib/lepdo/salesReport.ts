import { formatDate, formatDateTime, formatMoney } from "./format";
import { STATUS_LABEL, type CustomerView, type InvoiceView, type LedgerRow } from "./sales";
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

function invoiceTable(rows: InvoiceView[]): string {
  const total = rows.reduce((s, v) => s + v.invoice.total, 0);
  const received = rows.reduce((s, v) => s + v.received, 0);
  const pending = rows.reduce((s, v) => s + v.pending, 0);
  return `<table border="1" cellspacing="0" cellpadding="6">
  <thead><tr><th>Date</th><th>Invoice No.</th><th>Customer</th><th align="right">Total</th><th align="right">Received</th><th align="right">Pending</th><th>Status</th></tr></thead>
  <tbody>${
    rows
      .map(
        (v) =>
          `<tr><td>${esc(formatDate(v.invoice.date))}</td><td>${esc(v.invoice.number)}</td><td>${esc(v.customer?.name ?? "—")}</td><td align="right">${num(v.invoice.total)}</td><td align="right">${num(v.received)}</td><td align="right">${num(v.pending)}</td><td>${esc(STATUS_LABEL[v.status])}</td></tr>`,
      )
      .join("") || `<tr><td colspan="7">No invoices for the selected filters.</td></tr>`
  }</tbody>
  <tfoot><tr><th colspan="3" align="right">Totals</th><th align="right">${num(total)}</th><th align="right">${num(received)}</th><th align="right">${num(pending)}</th><th></th></tr></tfoot>
</table>`;
}

function customerTable(rows: CustomerView[]): string {
  return `<table border="1" cellspacing="0" cellpadding="6">
  <thead><tr><th>Customer</th><th align="right">Total Sales</th><th align="right">Received</th><th align="right">Advance</th><th align="right">Pending</th><th align="right">Invoices</th></tr></thead>
  <tbody>${
    rows
      .map(
        (c) =>
          `<tr><td>${esc(c.party.name)}</td><td align="right">${num(c.totalSales)}</td><td align="right">${num(c.received)}</td><td align="right">${num(c.advance)}</td><td align="right">${num(c.pending)}</td><td align="right">${c.invoiceCount}</td></tr>`,
      )
      .join("") || `<tr><td colspan="6">No customers for the selected filters.</td></tr>`
  }</tbody>
  <tfoot><tr><th align="right">Totals</th><th align="right">${num(rows.reduce((s, c) => s + c.totalSales, 0))}</th><th align="right">${num(rows.reduce((s, c) => s + c.received, 0))}</th><th align="right">${num(rows.reduce((s, c) => s + c.advance, 0))}</th><th align="right">${num(rows.reduce((s, c) => s + c.pending, 0))}</th><th></th></tr></tfoot>
</table>`;
}

function ledgerTable(rows: LedgerRow[]): string {
  return `<table border="1" cellspacing="0" cellpadding="6">
  <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Particulars</th><th align="right">Debit</th><th align="right">Credit</th><th align="right">Balance</th></tr></thead>
  <tbody>${
    rows
      .map(
        (r) =>
          `<tr><td>${esc(formatDate(r.date))}</td><td>${esc(r.type)}</td><td>${esc(r.reference)}</td><td>${esc(r.particulars)}</td><td align="right">${r.debit ? num(r.debit) : "—"}</td><td align="right">${r.credit ? num(r.credit) : "—"}</td><td align="right">${num(r.balance)}</td></tr>`,
      )
      .join("") || `<tr><td colspan="7">No ledger entries.</td></tr>`
  }</tbody>
  <tfoot><tr><th colspan="6" align="right">Closing balance</th><th align="right">${num(rows.at(-1)?.balance ?? 0)}</th></tr></tfoot>
</table>`;
}

export type SalesReportKind =
  | { kind: "summary"; invoices: InvoiceView[]; customers: CustomerView[] }
  | { kind: "register"; invoices: InvoiceView[] }
  | { kind: "outstanding"; customers: CustomerView[] }
  | { kind: "ledger"; customer: CustomerView; rows: LedgerRow[] };

export function buildSalesReportHtml(
  report: SalesReportKind,
  periodLabel: string,
): { title: string; html: string } {
  if (report.kind === "summary") {
    const t = report.invoices;
    const totals = `<table border="1" cellspacing="0" cellpadding="6">
      <thead><tr><th>Total Sales</th><th>Received</th><th>Pending</th><th>Paid</th><th>Part Paid</th><th>Pending</th><th>Overdue</th></tr></thead>
      <tbody><tr>
        <td align="right">${num(t.reduce((s, v) => s + v.invoice.total, 0))}</td>
        <td align="right">${num(t.reduce((s, v) => s + v.received, 0))}</td>
        <td align="right">${num(t.reduce((s, v) => s + v.pending, 0))}</td>
        <td align="right">${t.filter((v) => v.status === "paid").length}</td>
        <td align="right">${t.filter((v) => v.status === "part").length}</td>
        <td align="right">${t.filter((v) => v.status === "pending").length}</td>
        <td align="right">${t.filter((v) => v.status === "overdue").length}</td>
      </tr></tbody></table>`;
    return {
      title: "Sales Summary",
      html: shell(
        "Sales Summary",
        periodLabel,
        `${totals}<h3>Invoices</h3>${invoiceTable(t)}<h3>Customer Outstanding</h3>${customerTable(report.customers)}`,
      ),
    };
  }
  if (report.kind === "register")
    return {
      title: "Invoice Register",
      html: shell("Invoice Register", periodLabel, invoiceTable(report.invoices)),
    };
  if (report.kind === "outstanding")
    return {
      title: "Customer Outstanding",
      html: shell("Customer Outstanding", periodLabel, customerTable(report.customers)),
    };
  const c = report.customer;
  const head = `<p>Customer: <strong>${esc(c.party.name)}</strong>${c.party.gstin ? `<br />GSTIN: ${esc(c.party.gstin)}` : ""}${c.party.country ? `<br />Country: ${esc(c.party.country)}` : ""}</p>
  <table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>Total Sales</th><th>Received</th><th>Advance</th><th>Pending</th></tr></thead>
  <tbody><tr><td align="right">${num(c.totalSales)}</td><td align="right">${num(c.received)}</td><td align="right">${num(c.advance)}</td><td align="right">${num(c.pending)}</td></tr></tbody></table>`;
  return {
    title: `Customer Statement — ${c.party.name}`,
    html: shell(
      `Customer Statement — ${c.party.name}`,
      periodLabel,
      `${head}<h3>Ledger</h3>${ledgerTable(report.rows)}<h3>Invoices</h3>${invoiceTable(c.invoices)}`,
    ),
  };
}

function fileName(title: string, ext: string) {
  const slug = title.replace(/[^a-z0-9]+/gi, "-");
  return `LEPDO-${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

export function downloadSalesExcel(report: SalesReportKind, periodLabel: string) {
  const { title, html } = buildSalesReportHtml(report, periodLabel);
  download(
    `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8" /></head><body>${html}</body></html>`,
    fileName(title, "xls"),
    "application/vnd.ms-excel",
  );
}

export function downloadSalesPdf(report: SalesReportKind, periodLabel: string): boolean {
  const { title, html } = buildSalesReportHtml(report, periodLabel);
  return printHtml(title, html);
}

export function printHtml(title: string, html: string): boolean {
  const doc = `<!doctype html><html><head><meta charset="utf-8" /><title>${esc(title)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#2D2D61;padding:24px;font-size:12px}
  h1{font-size:18px;margin:0 0 2px}
  h2{font-size:14px;margin:0 0 8px;font-weight:600}
  h3{font-size:13px;margin:18px 0 6px}
  table{width:100%;border-collapse:collapse;margin-bottom:10px}
  th,td{border:1px solid #E7E8EE;padding:6px 8px;text-align:left;vertical-align:top}
  thead th{background:#E8F1FF}
  tfoot th{background:#FFF3DD}
  td[align="right"],th[align="right"]{text-align:right}
</style></head><body>${html}
<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(doc);
  w.document.close();
  return true;
}

/* ---------------- single invoice copy (diamond / jewelry) ---------------- */

function jewelryTable(items: NonNullable<Invoice["jewelryItems"]>): string {
  return `<table border="1" cellspacing="0" cellpadding="6">
  <thead><tr><th>Sr</th><th>Description</th><th>Karat</th><th>Colour</th><th align="right">Net Wt (g)</th><th align="right">Fine %</th><th align="right">Fine 999 g</th><th align="right">Metal ₹/g</th><th align="right">Metal Value</th><th align="right">Making ₹/g</th><th align="right">Making Charges</th><th>Stones</th><th align="right">Stone Value</th><th align="right">Item Total</th></tr></thead>
  <tbody>${items
    .map(
      (it, i) =>
        `<tr><td>${i + 1}</td><td>${esc(it.description)}</td><td>${esc(it.karat)}</td><td>${esc(it.metalColour)}</td><td align="right">${it.netWeight}</td><td align="right">${it.finePercent}</td><td align="right">${it.fineGram}</td><td align="right">${num(it.metalRate)}</td><td align="right">${num(it.metalValue)}</td><td align="right">${num(it.makingRate)}</td><td align="right">${num(it.makingValue)}</td><td>${esc(
          it.stones.map((s) => `${s.stoneType} ${s.size} ${s.carat}ct @ ${s.rate}`).join("; ") ||
            "—",
        )}</td><td align="right">${num(it.stoneValue)}</td><td align="right">${num(it.total)}</td></tr>`,
    )
    .join("")}</tbody>
</table>`;
}

function diamondTable(lines: NonNullable<Invoice["lines"]>): string {
  return `<table border="1" cellspacing="0" cellpadding="6">
  <thead><tr><th>Sr</th><th>Description</th><th align="right">Carat</th><th align="right">Price/CT</th><th align="right">Total</th></tr></thead>
  <tbody>${lines
    .map(
      (l, i) =>
        `<tr><td>${i + 1}</td><td>${esc(l.description)}</td><td align="right">${l.carat}</td><td align="right">${num(l.rate)}</td><td align="right">${num(l.carat * l.rate)}</td></tr>`,
    )
    .join("")}</tbody>
</table>`;
}

export function invoiceCopyHtml(
  invoice: Invoice,
  customerName: string,
): { title: string; html: string } {
  const items =
    invoice.invoiceKind === "jewelry"
      ? jewelryTable(invoice.jewelryItems ?? [])
      : diamondTable(invoice.lines ?? []);
  const cur = invoice.currency ?? "INR";
  const totals = `<table border="1" cellspacing="0" cellpadding="6">
    <tbody>
      <tr><th align="right">Subtotal</th><td align="right">${num(invoice.subtotal ?? invoice.total)}</td></tr>
      <tr><th align="right">Discount</th><td align="right">${num(invoice.discount ?? 0)}</td></tr>
      <tr><th align="right">Shipping / Other</th><td align="right">${num(invoice.shipping ?? 0)}</td></tr>
      <tr><th align="right">Grand Total${cur !== "INR" ? ` (${esc(cur)})` : ""}</th><td align="right">${cur !== "INR" ? `${esc(cur)} ${num(invoice.foreignTotal ?? invoice.total)}` : num(invoice.total)}</td></tr>
      ${cur !== "INR" ? `<tr><th align="right">Exchange rate</th><td align="right">${invoice.exchangeRate ?? 1}</td></tr><tr><th align="right">INR Total</th><td align="right">${num(invoice.total)}</td></tr>` : ""}
    </tbody></table>`;
  const head = `<p>Invoice: <strong>${esc(invoice.number)}</strong><br />Customer: ${esc(customerName)}<br />Date: ${esc(formatDate(invoice.date))}${invoice.dueDate ? ` · Due: ${esc(formatDate(invoice.dueDate))}` : ""}${invoice.sellerName ? `<br />Seller: ${esc(invoice.sellerName)}` : ""}${invoice.platform ? `<br />Platform: ${esc(invoice.platform)}` : ""}</p>`;
  return {
    title: `Invoice ${invoice.number}`,
    html: shell(
      `Invoice ${invoice.number}`,
      formatDate(invoice.date),
      `${head}${items}${totals}${invoice.notes ? `<p>Notes: ${esc(invoice.notes)}</p>` : ""}`,
    ),
  };
}

export function downloadInvoicePdf(invoice: Invoice, customerName: string): boolean {
  const { title, html } = invoiceCopyHtml(invoice, customerName);
  return printHtml(title, html);
}
